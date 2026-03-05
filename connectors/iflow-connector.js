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
    this.systemPrompt = options.systemPrompt || null;
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
    const args = ['--version']
    const options = this._isWindows() ? { shell: true } : {}
    return this._testCommandGeneric(this.iflowPath, args, options)
  }

  async _startSessionInternal(message, options) {
    const tempSessionId = this._generateTempId();
    console.log(`[IFlowConnector] 启动会话: ${tempSessionId}`);
    console.log(`[IFlowConnector] 消息长度: ${message.length} 字符`);

    const fullMessage = this._buildFullMessage(message, false);
    const args = this._buildCommandArgs(message, false);
    const child = this._spawnProcess(args, fullMessage);

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

    const fullMessage = this._buildFullMessage(message, true);
    const args = this._buildCommandArgs(message, true, sessionId);
    const child = this._spawnProcess(args, fullMessage);

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
    // 构建命令字符串（用于 shell 模式）
    let cmdStr = '--yolo';

    if (this.includeDirectories.length > 0) {
      for (const dir of this.includeDirectories) {
        cmdStr += ` --include-directories "${dir}"`;
      }
    }

    if (isResume && sessionId) {
      cmdStr += ` --resume ${sessionId}`;
    }

    // 🔧 修复：不再通过命令行参数传递消息，改用 stdin
    // 原因：命令行参数在处理换行符、引号、特殊字符时容易截断
    // iflow 支持 stdin 输入，通过 -p 参数附加到 stdin

    return cmdStr;
  }

  /**
   * 构建完整的消息内容（包含系统提示词）
   */
  _buildFullMessage(message, isResume) {
    let finalMessage = message;
    if (!isResume && this.systemPrompt && this.systemPrompt.trim()) {
      finalMessage = `${this.systemPrompt}\n\n${message}`;
      console.log('[IFlowConnector] 已添加系统提示词到 prompt（首次会话）');
    }
    return finalMessage;
  }

  _spawnProcess(cmdStr, stdinMessage = null) {
    const spawnOptions = {
      cwd: this.workDir,
      // 🔧 修复：使用 pipe 作为 stdin，支持传递长消息
      stdio: stdinMessage ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: this._isWindows()
    };

    // 构建完整的命令
    const fullCommand = `"${this.iflowPath}" ${cmdStr}`;
    console.log(`[IFlowConnector] 执行命令: ${fullCommand}`);
    if (stdinMessage) {
      console.log(`[IFlowConnector] 通过 stdin 传递消息: ${stdinMessage.length} 字符`);
    }

    // 使用命令字符串而不是数组，让 shell 正确解析带引号的参数
    const child = spawn(fullCommand, [], spawnOptions);

    // 🔧 通过 stdin 传递消息，避免命令行参数截断
    if (stdinMessage && child.stdin) {
      child.stdin.write(stdinMessage);
      child.stdin.end();
      console.log('[IFlowConnector] 消息已写入 stdin');
    }

    return child;
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
    let lastPosition = 0; // 使用文件位置跟踪而不是行数
    let lastSize = 0;
    let attempts = 0;
    const maxAttempts = 100;

    // 🔥 性能优化：指数退避策略
    // 从 100ms 开始，逐步增加到最大 5000ms，减少 CPU 占用
    let pollInterval = 100;
    const maxPollInterval = 5000;
    let currentMonitor = null;

    const findAndMonitor = async () => {
      if (!jsonlPath) {
        try {
          jsonlPath = await this._findSessionJsonl(sessionDir, sessionId);
          if (!jsonlPath) {
            jsonlPath = await this._findLatestJsonl(sessionDir);
          }

          if (jsonlPath) {
            console.log('[IFlowConnector] 找到 JSONL 文件:', jsonlPath);
            try {
              const stats = await fs.promises.stat(jsonlPath);
              lastSize = stats.size;
              lastPosition = 0;
              console.log('[IFlowConnector] JSONL 文件大小:', lastSize);
            } catch (e) {}
          }
        } catch (e) {}
      }

      // 使用增量读取代替完整文件重读
      if (jsonlPath) {
        try {
          const stats = await fs.promises.stat(jsonlPath);
          const currentSize = stats.size;

          // 文件有新内容
          if (currentSize > lastSize) {
            console.log(`[IFlowConnector] 检测到新内容: ${currentSize - lastSize} 字节`);

            // 🔥 性能优化：使用异步文件操作，不阻塞事件循环
            const fd = await fs.promises.open(jsonlPath, 'r');
            const buffer = Buffer.alloc(currentSize - lastSize);
            await fd.read(buffer, 0, buffer.length, lastPosition);
            await fd.close();

            const newContent = buffer.toString('utf-8');
            const lines = newContent.split('\n').filter(l => l.trim());

            console.log(`[IFlowConnector] 新增行数: ${lines.length}`);

            for (const line of lines) {
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

            // 更新位置
            lastSize = currentSize;
            lastPosition = currentSize;
          }
        } catch (e) {
          // 文件可能被删除或正在写入，忽略错误
          if (e.code !== 'ENOENT') {
            console.error('[IFlowConnector] 读取 JSONL 失败:', e.message);
          }
        }
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
        return;
      }

      // 🔥 性能优化：指数退避，减少不必要的轮询
      if (currentMonitor && !jsonlPath) {
        pollInterval = Math.min(Math.floor(pollInterval * 1.5), maxPollInterval);
        if (pollInterval > 100) {
          clearInterval(currentMonitor);
          currentMonitor = setInterval(findAndMonitor, pollInterval);
          this.jsonlMonitors.set(sessionId, currentMonitor);
        }
      }
    };

    currentMonitor = setInterval(findAndMonitor, pollInterval);
    this.jsonlMonitors.set(sessionId, currentMonitor);
  }

  async _findLatestJsonl(sessionDir) {
    if (!fs.existsSync(sessionDir)) {
      return null;
    }

    // 🔥 性能优化：使用 Promise.all 并行获取文件状态，减少 I/O 等待时间
    const fileNames = fs.readdirSync(sessionDir)
      .filter(f => f.startsWith('session-') && f.endsWith('.jsonl'));

    if (fileNames.length === 0) {
      return null;
    }

    try {
      const files = await Promise.all(
        fileNames.map(async f => {
          const filePath = path.join(sessionDir, f);
          const stat = await fs.promises.stat(filePath);
          return { name: f, path: filePath, time: stat.mtime.getTime() };
        })
      );

      files.sort((a, b) => b.time - a.time);
      return files[0].path;
    } catch (e) {
      console.error('[IFlowConnector] 查找 JSONL 文件失败:', e.message);
      return null;
    }
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

  async _findSessionJsonl(sessionDir, sessionId) {
    if (!fs.existsSync(sessionDir)) {
      throw new Error(`会话目录不存在: ${sessionDir}`);
    }

    const files = fs.readdirSync(sessionDir)
      .filter(f => f.startsWith('session-') && f.endsWith('.jsonl'));

    for (const file of files) {
      const filePath = path.join(sessionDir, file);
      try {
        // 🔥 性能优化：使用异步文件读取
        const content = await fs.promises.readFile(filePath, 'utf-8');
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
}

module.exports = IFlowConnector;
