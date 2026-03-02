/**
 * IFlow Connector
 *
 * 独立的 Node.js 模块，用于与 IFlow CLI 交互
 *
 * @example
 * ```js
 * const connector = new IFlowConnector({
 *   iflowPath: 'iflow',
 *   workDir: 'D:\\MyProject',
 *   includeDirectories: ['D:\\tmp']
 * });
 *
 * await connector.connect();
 * const session = await connector.startSession('你好，请帮我分析项目', {
 *   onEvent: (event) => console.log(event)
 * });
 * ```
 */

const BaseConnector = require('./base-connector');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class IFlowConnector extends BaseConnector {
  constructor(options = {}) {
    super(options);
    this.iflowPath = options.iflowPath || 'iflow';
    this.includeDirectories = options.includeDirectories || [];
    this.jsonlMonitors = new Map(); // sessionId -> interval
    this.currentSessionId = null;
  }

  // ==================== 内部实现 ====================

  async _connectInternal(options) {
    const version = await this._testCommand();
    if (!version) {
      return {
        success: false,
        error: 'IFlow 命令不可用，请确保 iflow 已安装并在 PATH 中'
      };
    }
    return { success: true, version };
  }

  async _testCommand() {
    return new Promise((resolve) => {
      const child = spawn(this.iflowPath, ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        shell: this._isWindows()
      });

      let output = '';
      child.stdout.on('data', (data) => { output += data.toString(); });
      child.stderr.on('data', (data) => { output += data.toString(); });

      child.on('close', (code) => {
        if (code === 0 || output.trim()) {
          const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
          resolve(versionMatch ? versionMatch[1] : output.trim() || 'unknown');
        } else {
          resolve(null);
        }
      });

      child.on('error', () => {
        resolve(null);
      });
    });
  }

  async _startSessionInternal(message, options) {
    const tempSessionId = this._generateTempId();
    console.log(`[IFlowConnector] 启动会话: ${tempSessionId}`);
    console.log(`[IFlowConnector] 消息长度: ${message.length} 字符`);

    const args = this._buildCommandArgs(message, false);
    const child = this._spawnProcess(args);

    this._registerSession(tempSessionId, { process: child });

    this._setupEventHandlers(child, tempSessionId, options);

    await new Promise(resolve => setTimeout(resolve, 100));

    return { sessionId: this.currentSessionId || tempSessionId };
  }

  async _continueSessionInternal(sessionId, message, options) {
    console.log(`[IFlowConnector] 继续会话: ${sessionId}`);
    console.log(`[IFlowConnector] 消息长度: ${message.length} 字符`);

    const session = this._getSession(sessionId);
    if (session?.process && !session.process.killed) {
      console.log(`[IFlowConnector] 终止旧进程: ${session.process.pid}`);
      this._terminateProcess(session.process);
    }

    const oldMonitor = this.jsonlMonitors.get(sessionId);
    if (oldMonitor) {
      clearInterval(oldMonitor);
      this.jsonlMonitors.delete(sessionId);
    }

    const args = this._buildCommandArgs(message, true, sessionId);
    const child = this._spawnProcess(args);

    this._registerSession(sessionId, { process: child });
    this.currentSessionId = sessionId;

    this._setupEventHandlers(child, sessionId, options);
  }

  _interruptSessionInternal(sessionId) {
    const session = this._getSession(sessionId);
    if (!session?.process) return false;

    this._terminateProcess(session.process);

    const monitor = this.jsonlMonitors.get(sessionId);
    if (monitor) {
      clearInterval(monitor);
      this.jsonlMonitors.delete(sessionId);
    }

    return true;
  }

  // ==================== 辅助方法 ====================

  _buildCommandArgs(message, isResume, sessionId = null) {
    const args = ['--yolo'];

    if (this.includeDirectories.length > 0) {
      for (const dir of this.includeDirectories) {
        args.push('--include-directories', dir);
      }
    }

    if (isResume && sessionId) {
      args.push('--resume', sessionId);
    }

    args.push('--prompt', message);

    return args;
  }

  _spawnProcess(args) {
    const spawnOptions = {
      cwd: this.workDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: this._isWindows()
    };

    console.log(`[IFlowConnector] 执行命令: ${this.iflowPath} ${args.join(' ')}`);
    return spawn(this.iflowPath, args, spawnOptions);
  }

  _setupEventHandlers(child, sessionId, options) {
    const { onEvent, onError, onComplete } = options;

    let stdoutBuffer = '';
    let hasJsonlEvents = false;
    let realSessionId = null;

    child.stdout.on('data', (data) => {
      const text = data.toString();
      console.log('[IFlowConnector] stdout:', text);
      stdoutBuffer += text;
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      console.log('[IFlowConnector] stderr:', text);

      if (!realSessionId) {
        const jsonMatch = text.match(/"session-id":\s*"([^"]+)"/i);
        if (jsonMatch) {
          realSessionId = jsonMatch[1];
          console.log('[IFlowConnector] 检测到 session_id:', realSessionId);

          if (realSessionId !== sessionId) {
            const proc = this._getSession(sessionId);
            if (proc) {
              this._unregisterSession(sessionId);
              this._registerSession(realSessionId, proc);
              this.currentSessionId = realSessionId;
              console.log(`[IFlowConnector] 会话 ID 更新: ${sessionId} -> ${realSessionId}`);
            }

            const monitor = this.jsonlMonitors.get(sessionId);
            if (monitor) {
              this.jsonlMonitors.set(realSessionId, monitor);
              this.jsonlMonitors.delete(sessionId);
            }
          }

          // ⭐ 通知 server.js 保存 sessionId
          if (this.sessionIdUpdateCallback) {
            console.log('[IFlowConnector] 触发 sessionId 更新回调');
            this.sessionIdUpdateCallback(realSessionId);
          }
        }
      }
    });

    child.on('close', (code) => {
      const finalSessionId = realSessionId || sessionId;
      console.log(`[IFlowConnector] 进程结束: ${finalSessionId}, code: ${code}`);

      if (!hasJsonlEvents && stdoutBuffer.trim() && onEvent) {
        console.log('[IFlowConnector] 使用 stdout 文本作为输出');
        onEvent({
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: stdoutBuffer.trim() }]
          }
        });
      }

      if (onEvent) {
        onEvent({ type: 'session_end' });
      }

      this._unregisterSession(finalSessionId);

      const monitor = this.jsonlMonitors.get(finalSessionId);
      if (monitor) {
        clearInterval(monitor);
        this.jsonlMonitors.delete(finalSessionId);
      }

      if (onComplete) {
        onComplete(code);
      }
    });

    child.on('error', (err) => {
      console.error(`[IFlowConnector] 进程错误: ${err.message}`);
      if (onError) {
        onError(err);
      }
    });

    this._startJsonlMonitor(sessionId, options, () => {
      hasJsonlEvents = true;
    });
  }

  _startJsonlMonitor(sessionId, options, onEventReceived = null) {
    const { onEvent } = options;
    const sessionDir = this._getProjectSessionDir();
    let jsonlPath = null;
    let lineCount = 0;
    let attempts = 0;
    const maxAttempts = 100;

    const findAndMonitor = () => {
      if (!jsonlPath) {
        try {
          jsonlPath = this._findSessionJsonl(sessionDir, sessionId);
          if (!jsonlPath) {
            jsonlPath = this._findLatestJsonl(sessionDir);
          }

          if (jsonlPath) {
            console.log('[IFlowConnector] 找到 JSONL 文件:', jsonlPath);
            try {
              const content = fs.readFileSync(jsonlPath, 'utf-8');
              lineCount = content.split('\n').filter(l => l.trim()).length;
              console.log('[IFlowConnector] JSONL 当前行数:', lineCount);
            } catch (e) {}
          }
        } catch (e) {}
      }

      if (jsonlPath && fs.existsSync(jsonlPath)) {
        try {
          const content = fs.readFileSync(jsonlPath, 'utf-8');
          const lines = content.split('\n').filter(l => l.trim());

          if (lines.length > lineCount) {
            console.log(`[IFlowConnector] 检测到新内容: ${lines.length - lineCount} 行`);

            for (let i = lineCount; i < lines.length; i++) {
              const line = lines[i];
              const event = this._parseJsonlLine(line);

              if (event) {
                console.log('[IFlowConnector] 解析到 JSONL 事件:', event.type);

                if (onEventReceived) {
                  onEventReceived();
                }

                const streamEvents = this._toStreamEvents(event);

                for (const streamEvent of streamEvents) {
                  if (onEvent) {
                    onEvent(streamEvent);
                  }

                  if (streamEvent.type === 'session_end') {
                    console.log('[IFlowConnector] 会话结束');
                    const monitor = this.jsonlMonitors.get(sessionId);
                    if (monitor) {
                      clearInterval(monitor);
                      this.jsonlMonitors.delete(sessionId);
                    }
                    return;
                  }
                }
              }
            }

            lineCount = lines.length;
          }
        } catch (e) {}
      }

      attempts++;
      if (attempts % 50 === 0 && !jsonlPath) {
        console.log('[IFlowConnector] 等待 JSONL 文件...', `尝试 ${attempts}/${maxAttempts}`);
      }

      if (attempts > maxAttempts && !jsonlPath) {
        console.log('[IFlowConnector] JSONL 监控超时，将使用 stdout 输出');
        const monitor = this.jsonlMonitors.get(sessionId);
        if (monitor) {
          clearInterval(monitor);
          this.jsonlMonitors.delete(sessionId);
        }
      }
    };

    const monitor = setInterval(findAndMonitor, 100);
    this.jsonlMonitors.set(sessionId, monitor);
  }

  _findLatestJsonl(sessionDir) {
    if (!fs.existsSync(sessionDir)) {
      return null;
    }

    const files = fs.readdirSync(sessionDir)
      .filter(f => f.startsWith('session-') && f.endsWith('.jsonl'))
      .map(f => ({
        name: f,
        path: path.join(sessionDir, f),
        time: fs.statSync(path.join(sessionDir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);

    return files.length > 0 ? files[0].path : null;
  }

  _getIflowConfigDir() {
    const home = process.env.USERPROFILE || process.env.HOME;
    if (!home) {
      throw new Error('无法获取用户目录');
    }
    return path.join(home, '.iflow');
  }

  _encodeProjectPath(projectPath) {
    const normalized = projectPath
      .replace(/:/g, '')
      .replace(/\\/g, '-')
      .replace(/\//g, '-');
    return `-${normalized}`;
  }

  _getProjectSessionDir() {
    const configDir = this._getIflowConfigDir();
    const encodedPath = this._encodeProjectPath(this.workDir);
    return path.join(configDir, 'projects', encodedPath);
  }

  _findSessionJsonl(sessionDir, sessionId) {
    if (!fs.existsSync(sessionDir)) {
      throw new Error(`会话目录不存在: ${sessionDir}`);
    }

    const files = fs.readdirSync(sessionDir)
      .filter(f => f.startsWith('session-') && f.endsWith('.jsonl'));

    for (const file of files) {
      const filePath = path.join(sessionDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').slice(0, 10);

        for (const line of lines) {
          const event = this._parseJsonlLine(line);
          if (event && event.sessionId === sessionId) {
            return filePath;
          }
        }
      } catch (err) {}
    }

    return null;
  }

  _parseJsonlLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  _toStreamEvents(event) {
    const events = [];

    switch (event.type) {
      case 'user':
        if (event.message) {
          const toolResults = this._extractToolResults(event.message);
          events.push(...toolResults);
        }
        break;

      case 'assistant':
        if (event.message) {
          const assistantEvent = this._toAssistantEvent(event.message);
          if (assistantEvent) {
            events.push(assistantEvent);
          }
          if (event.message.stop_reason) {
            events.push({ type: 'session_end' });
          }
        }
        break;

      default:
        break;
    }

    return events;
  }

  _toAssistantEvent(message) {
    const contentBlocks = this._parseContent(message.content);

    if (contentBlocks.length === 0) {
      return null;
    }

    return {
      type: 'assistant',
      message: {
        content: contentBlocks,
        model: message.model,
        id: message.id,
        stop_reason: message.stop_reason
      }
    };
  }

  _parseContent(content) {
    if (typeof content === 'string') {
      return [{ type: 'text', text: content }];
    }

    if (Array.isArray(content)) {
      const blocks = [];
      for (const item of content) {
        if (item && typeof item === 'object') {
          const blockType = item.type || 'text';
          switch (blockType) {
            case 'text':
              if (item.text) {
                blocks.push({ type: 'text', text: item.text });
              }
              break;
            case 'tool_use':
              blocks.push({
                type: 'tool_use',
                id: item.id,
                name: item.name,
                input: item.input
              });
              break;
            default:
              break;
          }
        }
      }
      return blocks;
    }

    return [];
  }

  _extractToolResults(message) {
    const events = [];

    if (!Array.isArray(message.content)) {
      return events;
    }

    for (const item of message.content) {
      if (item && typeof item === 'object' && item.type === 'tool_result') {
        const toolUseId = item.tool_use_id || '';
        const output = this._extractToolOutput(item);

        events.push({
          type: 'tool_end',
          tool_use_id: toolUseId,
          tool_name: null,
          output: output
        });
      }
    }

    return events;
  }

  _extractToolOutput(obj) {
    if (obj.resultDisplay) {
      return obj.resultDisplay;
    }

    if (obj.content?.functionResponse?.response?.output) {
      const output = obj.content.functionResponse.response.output;
      return typeof output === 'string' ? output : JSON.stringify(output);
    }

    if (obj.content?.functionResponse?.response) {
      return JSON.stringify(obj.content.functionResponse.response);
    }

    return '';
  }

  _terminateProcess(child) {
    if (this._isWindows()) {
      spawn('taskkill', ['/F', '/T', '/PID', child.pid.toString()], {
        stdio: 'ignore'
      });
    } else {
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 500).unref();
    }
  }

  _isWindows() {
    return process.platform === 'win32';
  }

  _generateTempId() {
    return `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = IFlowConnector;
