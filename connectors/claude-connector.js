/**
 * Claude Code Connector
 *
 * 独立的 Node.js 模块，用于与 Claude Code CLI 交互
 *
 * @example
 * ```js
 * const connector = new ClaudeConnector({
 *   claudeCmdPath: 'C:\\Users\\...\\claude.cmd',
 *   workDir: 'D:\\MyProject',
 *   gitBinPath: 'C:\\Program Files\\Git\\bin\\bash.exe'
 * });
 *
 * await connector.connect();
 * const session = await connector.startSession('Hello, Claude!', {
 *   onEvent: (event) => console.log(event)
 * });
 * ```
 */

const BaseConnector = require('./base-connector');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const Logger = require('../integrations/logger');

class ClaudeConnector extends BaseConnector {
  constructor(options = {}) {
    super(options);
    this.claudeCmdPath = options.claudeCmdPath;
    this.gitBinPath = options.gitBinPath;
    this.systemPrompt = options.systemPrompt || null;
    this.nodeExe = null;
    this.cliJs = null;

    // 初始化 Logger（如果没有提供）
    if (!this.logger) {
      this.logger = new Logger('ClaudeConnector');
    }
  }

  // ==================== 内部实现 ====================

  async _connectInternal(options) {
    // 1. 验证路径
    const validation = this._validatePaths();
    if (!validation.success) {
      return validation;
    }

    // 2. 解析 node.exe 和 cli.js（Windows）
    if (process.platform === 'win32') {
      const resolved = this._resolveNodeAndCli(this.claudeCmdPath);
      if (!resolved) {
        return {
          success: false,
          error: '无法解析 node.exe 和 cli.js 路径'
        };
      }
      this.nodeExe = resolved.nodeExe;
      this.cliJs = resolved.cliJs;
      this.logger.log(`[ClaudeConnector] node.exe: ${this.nodeExe}`);
      this.logger.log(`[ClaudeConnector] cli.js: ${this.cliJs}`);
    }

    // 3. 测试命令
    const version = await this._testCommand();
    if (!version) {
      return {
        success: false,
        error: 'Claude 命令不可用'
      };
    }

    return { success: true, version };
  }

  _validatePaths() {
    if (!this.claudeCmdPath) {
      return { success: false, error: 'claudeCmdPath is required' };
    }
    if (!this.workDir) {
      return { success: false, error: 'workDir is required' };
    }
    return { success: true };
  }

  async _testCommand() {
    let cmd, args
    if (process.platform === 'win32') {
      cmd = this.nodeExe
      args = [this.cliJs, '--version']
    } else {
      cmd = this.claudeCmdPath
      args = ['--version']
    }
    return this._testCommandGeneric(cmd, args)
  }

  async _startSessionInternal(message, options) {
    const tempId = this._generateTempId();
    this.logger.log(`[ClaudeConnector] 启动会话: ${tempId}`);
    this.logger.log(`[ClaudeConnector] 消息长度: ${message.length} 字符`);

    const args = this._buildCommandArgs(message, this.systemPrompt, false);
    const child = this._spawnProcess(args);

    // 保存临时 sessionId
    this._registerSession(tempId, { process: child });

    let sessionId = tempId;
    this._setupEventHandlers(child, tempId, options, (realSessionId) => {
      if (realSessionId && realSessionId !== tempId) {
        // 更新 sessionId 映射
        const session = this._getSession(tempId);
        if (session) {
          this._unregisterSession(tempId);
          this._registerSession(realSessionId, session);
          sessionId = realSessionId;
          this.logger.log(`[ClaudeConnector] 会话 ID 更新: ${tempId} -> ${realSessionId}`);
        }
      }
    });

    return { sessionId };
  }

  async _continueSessionInternal(sessionId, message, options) {
    this.logger.log(`[ClaudeConnector] 继续会话: ${sessionId}`);
    this.logger.log(`[ClaudeConnector] 消息长度: ${message.length} 字符`);

    // 终止旧进程
    const session = this._getSession(sessionId);
    if (session?.process && !session.process.killed) {
      this.logger.log(`[ClaudeConnector] 终止旧进程: ${session.process.pid}`);
      this._terminateProcess(session.process);
    }

    const args = this._buildCommandArgs(message, this.systemPrompt, true, sessionId);
    const child = this._spawnProcess(args);

    this._registerSession(sessionId, { process: child });
    this._setupEventHandlers(child, sessionId, options);
  }

  _interruptSessionInternal(sessionId) {
    const session = this._getSession(sessionId);
    if (!session?.process) return false;

    this._terminateProcess(session.process);
    return true;
  }

  // ==================== 辅助方法 ====================

  _resolveNodeAndCli(claudeCmdPath) {
    const normalizedPath = claudeCmdPath.replace(/\\/g, '/');
    const npmDir = path.dirname(normalizedPath);

    // 查找 node.exe
    let nodeExe = null;

    // 方法 1: 使用 'where node' 查找系统 node（增强验证）
    try {
      const { spawnSync } = require('child_process');
      const result = spawnSync('where', ['node'], { encoding: 'utf8', timeout: 5000 });
      if (result.status === 0 && result.stdout) {
        const candidate = result.stdout.trim().split('\n')[0];
        // 验证文件是否真的存在
        if (candidate && fs.existsSync(candidate)) {
          nodeExe = candidate;
          this.logger.log(`[ClaudeConnector] 找到 node.exe: ${nodeExe}`);
        }
      }
    } catch (e) {
      this.logger.log('[ClaudeConnector] where node 失败:', e.message);
    }

    // 方法 2: npm 目录下的 node.exe
    if (!nodeExe) {
      const npmNodeExe = path.join(npmDir, 'node.exe');
      if (fs.existsSync(npmNodeExe)) {
        nodeExe = npmNodeExe;
        this.logger.log(`[ClaudeConnector] 找到 node.exe: ${nodeExe}`);
      }
    }

    // 方法 3: 常见安装路径（带验证）
    if (!nodeExe) {
      const commonPaths = [
        'C:\\Program Files\\nodejs\\node.exe',
        'C:\\Program Files (x86)\\nodejs\\node.exe',
        process.env.ProgramFiles + '\\nodejs\\node.exe',
        process.env['ProgramFiles(x86)'] + '\\nodejs\\node.exe'
      ].filter(Boolean);

      for (const p of commonPaths) {
        if (fs.existsSync(p)) {
          nodeExe = p;
          this.logger.log(`[ClaudeConnector] 找到 node.exe: ${p}`);
          break;
        }
      }
    }

    // 🔥 方法 4: 使用当前运行的 Node.js（最后降级方案）
    if (!nodeExe) {
      nodeExe = process.execPath;
      this.logger.log(`[ClaudeConnector] 使用当前 Node.js: ${nodeExe}`);
    }

    // 查找 cli.js
    const cliJs = path.normalize(path.join(
      npmDir,
      'node_modules',
      '@anthropic-ai',
      'claude-code',
      'cli.js'
    ));

    if (!fs.existsSync(cliJs)) {
      this.logger.error(`[ClaudeConnector] cli.js 不存在: ${cliJs}`);
      return null;
    }

    return { nodeExe, cliJs };
  }

  _buildCommandArgs(message, systemPrompt, isResume, sessionId = null) {
    const args = [];

    if (process.platform === 'win32') {
      args.push(this.cliJs);
    }

    if (isResume && sessionId) {
      args.push('--resume', sessionId);
    }

    if (systemPrompt?.trim()) {
      args.push('--system-prompt', systemPrompt);
    }

    args.push(
      '--print',
      '--verbose',
      '--output-format', 'stream-json',
      '--permission-mode', 'bypassPermissions'
    );

    args.push(message);

    return args;
  }

  _spawnProcess(args) {
    let cmd, spawnOptions;

    if (process.platform === 'win32') {
      cmd = this.nodeExe;

      // 🔥 验证 nodeExe 是否存在（防止 ENOENT）
      if (!fs.existsSync(cmd)) {
        throw new Error(`node.exe 不存在: ${cmd}`);
      }

      const env = { ...process.env };
      delete env.CLAUDECODE;

      spawnOptions = {
        cwd: this.workDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env: {
          ...env,
          ...(this.gitBinPath && { CLAUDE_CODE_GIT_BASH_PATH: this.gitBinPath.replace(/\//g, '\\') })
        }
      };
    } else {
      cmd = this.claudeCmdPath;
      spawnOptions = {
        cwd: this.workDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ...(this.gitBinPath && { CLAUDE_CODE_GIT_BASH_PATH: this.gitBinPath.replace(/\//g, '\\') })
        }
      };
    }

    this.logger.log(`[ClaudeConnector] 执行命令: ${cmd} ${args.slice(0, 3).join(' ')}...`);
    return spawn(cmd, args, spawnOptions);
  }

  _setupEventHandlers(child, sessionId, options, onSessionIdUpdate = null) {
    const { onEvent, onError, onComplete } = options;

    child.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const event = JSON.parse(trimmed);

          // 🔍 详细日志：所有 system 事件
          if (event.type === 'system') {
            this.logger.log(`[ClaudeConnector] 收到 system 事件:`, {
              hasSessionIdField: !!event.session_id,
              sessionId: event.session_id || 'none',
              subtype: event.subtype
            });
          }

          // ⭐ 关键修复：检查 event.session_id（不是 event.extra.session_id）
          if (event.type === 'system' && event.session_id) {
            this.logger.log(`[ClaudeConnector] ✅ 收到真实 session_id: ${event.session_id}`);
            if (this.sessionIdUpdateCallback) {
              this.logger.log(`[ClaudeConnector] 触发 sessionId 更新回调`);
              this.sessionIdUpdateCallback(event.session_id);
            } else {
              this.logger.log(`[ClaudeConnector] ⚠️ 没有设置 sessionIdUpdateCallback`);
            }
          }

          if (onEvent) {
            onEvent(event);
          }
        } catch (e) {
          this.logger.log(`[ClaudeConnector stdout] ${trimmed.substring(0, 100)}...`);
        }
      }
    });

    child.stderr.on('data', (data) => {
      this.logger.error(`[ClaudeConnector stderr] ${data.toString()}`);
    });

    child.on('close', (code) => {
      this.logger.log(`[ClaudeConnector] 进程结束: ${sessionId}, code: ${code}`);

      if (onEvent) {
        onEvent({ type: 'session_end' });
      }

      this._unregisterSession(sessionId);

      if (onComplete) {
        onComplete(code);
      }
    });

    child.on('error', (err) => {
      this.logger.error(`[ClaudeConnector] 进程错误: ${err.message}`);
      if (onError) {
        onError(err);
      }
    });
  }
}

module.exports = ClaudeConnector;
