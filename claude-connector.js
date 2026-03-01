/**
 * Claude Code Connector
 *
 * 独立的 Node.js 模块，用于与 Claude Code CLI 交互
 *
 * 主要功能：
 * 1. connect() - 连接并验证 Claude Code 环境
 * 2. startSession() - 启动新的聊天会话
 * 3. continueSession() - 继续已有会话
 *
 * @example
 * ```js
 * const connector = new ClaudeConnector({
 *   claudeCmdPath: 'C:\\Users\\...\\AppData\\Roaming\\npm\\claude.cmd',
 *   workDir: 'D:\\MyProject',
 *   gitBinPath: 'C:\\Program Files\\Git\\bin\\bash.exe'
 * });
 *
 * // 连接
 * await connector.connect();
 *
 * // 开启会话
 * const session = await connector.startSession('Hello, Claude!', {
 *   systemPrompt: 'You are a helpful assistant',
 *   onEvent: (event) => console.log(event)
 * });
 *
 * // 继续会话
 * await connector.continueSession(session.sessionId, 'Tell me more', {
 *   onEvent: (event) => console.log(event)
 * });
 * ```
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;

/**
 * 配置选项
 * @typedef {Object} ConnectorOptions
 * @property {string} claudeCmdPath - claude.cmd 路径 (Windows) 或 claude 命令路径 (Unix)
 * @property {string} [workDir] - 工作目录
 * @property {string} [gitBinPath] - Git Bash 路径 (Windows 需要)
 * @property {string} [configPath] - 自定义配置文件路径
 */

/**
 * 会话选项
 * @typedef {Object} SessionOptions
 * @property {string} [systemPrompt] - 系统提示词
 * @property {Function} [onEvent] - 事件回调函数
 * @property {Function} [onError] - 错误回调函数
 * @property {Function} [onComplete] - 完成回调函数
 */

/**
 * Claude Code 连接器类
 */
class ClaudeConnector {
  /**
   * 创建连接器实例
   * @param {ConnectorOptions} options
   */
  constructor(options = {}) {
    this.claudeCmdPath = options.claudeCmdPath;
    this.workDir = options.workDir || process.cwd();
    this.gitBinPath = options.gitBinPath;
    this.configPath = options.configPath;
    this.connected = false;
    this.nodeExe = null;
    this.cliJs = null;
    this.activeProcesses = new Map(); // sessionId -> child process
  }

  /**
   * 1. 连接到 Claude Code
   *
   * 执行步骤：
   * - 读取配置文件（如果有）
   * - 验证 claude.cmd 路径
   * - 解析 node.exe 和 cli.js 路径（Windows）
   * - 测试命令是否可用
   *
   * @returns {Promise<{success: boolean, version?: string, error?: string}>}
   */
  async connect() {
    try {
      // 1. 尝试从配置文件读取
      if (this.configPath) {
        await this._loadConfig(this.configPath);
      } else {
        // 尝试默认配置文件路径
        const defaultConfigPath = path.join(process.cwd(), '.claude-connector.json');
        try {
          await this._loadConfig(defaultConfigPath);
        } catch (e) {
          // 配置文件不存在，使用构造函数传入的配置
        }
      }

      // 2. 验证 claude.cmd 路径
      if (!this.claudeCmdPath) {
        // 尝试自动查找
        this.claudeCmdPath = await this._findClaudeCmd();
        if (!this.claudeCmdPath) {
          return {
            success: false,
            error: '未找到 claude 命令，请手动指定路径'
          };
        }
      }

      // 3. 解析 node.exe 和 cli.js（Windows）
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
        console.log(`[ClaudeConnector] node.exe: ${this.nodeExe}`);
        console.log(`[ClaudeConnector] cli.js: ${this.cliJs}`);
      }

      // 4. 测试命令
      const version = await this._testCommand();
      if (!version) {
        return {
          success: false,
          error: 'Claude 命令不可用'
        };
      }

      this.connected = true;
      return {
        success: true,
        version
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 2. 开启新会话
   *
   * @param {string} message - 用户消息
   * @param {SessionOptions} [options] - 会话选项
   * @returns {Promise<{sessionId: string, process: ChildProcess}>}
   */
  async startSession(message, options = {}) {
    if (!this.connected) {
      throw new Error('未连接，请先调用 connect()');
    }

    const sessionId = this._generateTempId();
    console.log(`[ClaudeConnector] 启动会话: ${sessionId}`);
    console.log(`[ClaudeConnector] 消息长度: ${message.length} 字符`);

    // 构建命令参数
    const args = this._buildCommandArgs(message, options.systemPrompt, false);

    // 启动进程
    const child = this._spawnProcess(args);

    // 保存进程引用
    this.activeProcesses.set(sessionId, child);

    // 处理输出
    this._handleProcessOutput(child, sessionId, options, (realSessionId) => {
      // 更新 sessionId 映射（如果收到真实的 session_id）
      if (realSessionId && realSessionId !== sessionId) {
        const process = this.activeProcesses.get(sessionId);
        if (process) {
          this.activeProcesses.set(realSessionId, process);
          this.activeProcesses.delete(sessionId);
          console.log(`[ClaudeConnector] 会话 ID 更新: ${sessionId} -> ${realSessionId}`);
        }
      }
    });

    return {
      sessionId,
      process: child
    };
  }

  /**
   * 3. 继续会话
   *
   * @param {string} sessionId - 会话 ID
   * @param {string} message - 用户消息
   * @param {SessionOptions} [options] - 会话选项
   * @returns {Promise<{process: ChildProcess}>}
   */
  async continueSession(sessionId, message, options = {}) {
    if (!this.connected) {
      throw new Error('未连接，请先调用 connect()');
    }

    console.log(`[ClaudeConnector] 继续会话: ${sessionId}`);
    console.log(`[ClaudeConnector] 消息长度: ${message.length} 字符`);

    // 终止旧进程（如果有）
    const oldProcess = this.activeProcesses.get(sessionId);
    if (oldProcess && !oldProcess.killed) {
      console.log(`[ClaudeConnector] 终止旧进程: ${oldProcess.pid}`);
      this._terminateProcess(oldProcess);
    }

    // 构建命令参数（带 --resume）
    const args = this._buildCommandArgs(message, options.systemPrompt, true, sessionId);

    // 启动新进程
    const child = this._spawnProcess(args);

    // 更新进程引用
    this.activeProcesses.set(sessionId, child);

    // 处理输出
    this._handleProcessOutput(child, sessionId, options);

    return {
      process: child
    };
  }

  /**
   * 中断会话
   * @param {string} sessionId
   */
  interruptSession(sessionId) {
    const process = this.activeProcesses.get(sessionId);
    if (process) {
      this._terminateProcess(process);
      this.activeProcesses.delete(sessionId);
      return true;
    }
    return false;
  }

  /**
   * 获取活动会话列表
   * @returns {string[]}
   */
  getActiveSessions() {
    return Array.from(this.activeProcesses.keys());
  }

  // ========================================================================
  // 私有方法
  // ========================================================================

  /**
   * 从配置文件加载配置
   * @private
   */
  async _loadConfig(configPath) {
    const content = await fsPromises.readFile(configPath, 'utf-8');
    const config = JSON.parse(content);

    if (config.claudeCmdPath) this.claudeCmdPath = config.claudeCmdPath;
    if (config.workDir) this.workDir = config.workDir;
    if (config.gitBinPath) this.gitBinPath = config.gitBinPath;

    console.log(`[ClaudeConnector] 已加载配置: ${configPath}`);
  }

  /**
   * 查找 claude 命令路径
   * @private
   */
  async _findClaudeCmd() {
    // Windows: 查找 claude.cmd
    if (process.platform === 'win32') {
      const npmPath = path.join(process.env.APPDATA || '', 'npm', 'claude.cmd');
      try {
        await fsPromises.access(npmPath);
        return npmPath;
      } catch (e) {
        return null;
      }
    }

    // Unix/Mac: 使用 which 查找 claude
    return new Promise((resolve) => {
      const which = spawn('which', ['claude']);
      let output = '';
      which.stdout.on('data', (data) => { output += data.toString(); });
      which.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * 解析 node.exe 和 cli.js 路径（Windows）
   * @private
   */
  _resolveNodeAndCli(claudeCmdPath) {
    // 标准化路径：将反斜杠转换为正斜杠，避免转义问题
    const normalizedPath = claudeCmdPath.replace(/\\/g, '/');
    const npmDir = path.dirname(normalizedPath);

    // 查找 node.exe
    let nodeExe = null;

    // 方法 1: npm 目录下的 node.exe（npm 全局安装时可能存在）
    const npmNodeExe = path.join(npmDir, 'node.exe');
    try {
      fs.accessSync(npmNodeExe);
      nodeExe = npmNodeExe;
    } catch (e) {
      // 方法 2: 常见安装路径
      const commonPaths = [
        'C:\\Program Files\\nodejs\\node.exe',
        'C:\\Program Files (x86)\\nodejs\\node.exe',
        'D:\\install\\nodejs\\node.exe',
        process.env.ProgramFiles + '\\nodejs\\node.exe',
        process.env['ProgramFiles(x86)'] + '\\nodejs\\node.exe'
      ].filter(Boolean);

      for (const p of commonPaths) {
        try {
          fs.accessSync(p);
          nodeExe = p;
          console.log(`[ClaudeConnector] 找到 node.exe: ${p}`);
          break;
        } catch (e2) {
          // 继续尝试
        }
      }
    }

    // 查找 cli.js（注意：npmDir 已经是正斜杠格式）
    const cliJs = path.normalize(path.join(
      npmDir,
      'node_modules',
      '@anthropic-ai',
      'claude-code',
      'cli.js'
    ));

    try {
      fs.accessSync(cliJs);
      return { nodeExe, cliJs };
    } catch (e) {
      console.error(`[ClaudeConnector] cli.js 不存在: ${cliJs}`);
      return null;
    }
  }

  /**
   * 测试命令是否可用
   * @private
   */
  async _testCommand() {
    return new Promise((resolve) => {
      let cmd, args;

      if (process.platform === 'win32') {
        cmd = this.nodeExe;
        args = [this.cliJs, '--version'];
      } else {
        cmd = this.claudeCmdPath;
        args = ['--version'];
      }

      const child = spawn(cmd, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });

      let output = '';
      child.stdout.on('data', (data) => { output += data.toString(); });
      child.stderr.on('data', (data) => {}); // 忽略 stderr

      child.on('close', (code) => {
        if (code === 0 && output.trim()) {
          resolve(output.trim());
        } else {
          resolve(null);
        }
      });

      child.on('error', () => {
        resolve(null);
      });
    });
  }

  /**
   * 构建命令参数
   * @private
   */
  _buildCommandArgs(message, systemPrompt, isResume, sessionId = null) {
    const args = [];

    // 基础参数
    if (process.platform === 'win32') {
      args.push(this.cliJs);
    }

    // --resume 参数（继续会话时）
    if (isResume && sessionId) {
      args.push('--resume', sessionId);
    }

    // --system-prompt 参数
    if (systemPrompt && systemPrompt.trim()) {
      args.push('--system-prompt', systemPrompt);
    }

    // 固定参数
    args.push(
      '--print',
      '--verbose',
      '--output-format', 'stream-json',
      '--permission-mode', 'bypassPermissions'
    );

    // 消息内容
    args.push(message);

    return args;
  }

  /**
   * 启动子进程
   * @private
   */
  _spawnProcess(args) {
    let cmd, spawnOptions;

    if (process.platform === 'win32') {
      cmd = this.nodeExe;
      spawnOptions = {
        cwd: this.workDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true, // 不显示窗口
        env: {
          ...process.env,
          ...(this.gitBinPath && { CLAUDE_CODE_GIT_BASH_PATH: this.gitBinPath })
        }
      };
    } else {
      cmd = this.claudeCmdPath;
      spawnOptions = {
        cwd: this.workDir,
        stdio: ['ignore', 'pipe', 'pipe']
      };
    }

    console.log(`[ClaudeConnector] 执行命令: ${cmd} ${args.slice(0, 3).join(' ')}...`);

    return spawn(cmd, args, spawnOptions);
  }

  /**
   * 处理进程输出
   * @private
   */
  _handleProcessOutput(child, sessionId, options, onSessionIdUpdate = null) {
    const { onEvent, onError, onComplete } = options;

    // 处理 stdout
    child.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // 解析 JSON 事件
        try {
          const event = JSON.parse(trimmed);

          // 检查是否是 session_id
          if (event.type === 'system' && event.extra?.session_id) {
            console.log(`[ClaudeConnector] 收到真实 session_id: ${event.extra.session_id}`);
            if (onSessionIdUpdate) {
              onSessionIdUpdate(event.extra.session_id);
            }
          }

          if (onEvent) {
            onEvent(event);
          }
        } catch (e) {
          console.log(`[ClaudeConnector stdout] ${trimmed.substring(0, 100)}...`);
        }
      }
    });

    // 处理 stderr
    child.stderr.on('data', (data) => {
      console.error(`[ClaudeConnector stderr] ${data.toString()}`);
    });

    // 进程结束
    child.on('close', (code) => {
      console.log(`[ClaudeConnector] 进程结束: ${sessionId}, code: ${code}`);

      // 发送 session_end 事件
      if (onEvent) {
        onEvent({ type: 'session_end' });
      }

      // 清理进程引用
      this.activeProcesses.delete(sessionId);

      if (onComplete) {
        onComplete(code);
      }
    });

    // 进程错误
    child.on('error', (err) => {
      console.error(`[ClaudeConnector] 进程错误: ${err.message}`);
      if (onError) {
        onError(err);
      }
    });
  }

  /**
   * 终止进程
   * @private
   */
  _terminateProcess(child) {
    if (process.platform === 'win32') {
      // Windows: 使用 taskkill /F /T 终止进程树
      spawn('taskkill', ['/F', '/T', '/PID', child.pid.toString()], {
        stdio: 'ignore'
      });
    } else {
      // Unix: 先 SIGTERM，再 SIGKILL
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 500).unref();
    }
  }

  /**
   * 生成临时 ID
   * @private
   */
  _generateTempId() {
    return `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = ClaudeConnector;
