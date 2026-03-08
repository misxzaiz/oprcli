/**
 * Codex Connector
 *
 * 独立的 Node.js 模块，用于与 Codex CLI 交互
 *
 * @example
 * ```js
 * const connector = new CodexConnector({
 *   codexPath: 'codex',
 *   workDir: 'D:\\MyProject',
 *   systemPrompt: './system-prompts/codex.txt'
 * });
 *
 * await connector.connect();
 * const session = await connector.startSession('分析这个项目', {
 *   onEvent: (event) => console.log(event)
 * });
 * ```
 */

const BaseConnector = require('./base-connector');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const Logger = require('../integrations/logger');

class CodexConnector extends BaseConnector {
  constructor(options = {}) {
    super(options);
    this.codexPath = options.codexPath || 'codex';
    this.systemPrompt = options.systemPrompt || null;
    this.systemPromptFile = options.systemPromptFile || null;
    this.currentSessionId = null;
    this.modelConfig = options.modelConfig || {};

    // 🆕 会话历史存储（实现上下文记忆）
    this.conversationHistory = new Map(); // sessionId -> [{role, content, timestamp}]
    this.maxHistoryLength = parseInt(process.env.CODEX_MAX_HISTORY_LENGTH || '20', 10); // 最大历史轮数

    // 初始化 Logger（如果没有提供）
    if (!this.logger) {
      this.logger = new Logger('CodexConnector');
    }
  }

  // ==================== 内部实现 ====================

  async _connectInternal(options) {
    const version = await this._testCommand();
    if (!version) {
      return {
        success: false,
        error: 'Codex 命令不可用，请确保 codex 已安装并在 PATH 中'
      };
    }
    return { success: true, version };
  }

  async _testCommand() {
    const args = ['--version'];
    const options = this._isWindows() ? { shell: true } : {};
    return this._testCommandGeneric(this.codexPath, args, options);
  }

  async _startSessionInternal(message, options) {
    const tempSessionId = this._generateTempId();
    this.logger.log(`[CodexConnector] 启动会话: ${tempSessionId}`);
    this.logger.log(`[CodexConnector] 消息长度: ${message.length} 字符`);

    // 🆕 初始化会话历史
    this.conversationHistory.set(tempSessionId, [
      { role: 'user', content: message, timestamp: Date.now() }
    ]);
    this.logger.log(`[CodexConnector] 初始化历史记录: ${tempSessionId}`);

    const fullMessage = this._buildFullMessage(message, false, tempSessionId);
    const args = this._buildCommandArgs(fullMessage, false);
    const child = this._spawnProcess(args);

    this._registerSession(tempSessionId, { process: child });
    this._setupEventHandlers(child, tempSessionId, options);

    await new Promise(resolve => setTimeout(resolve, 100));

    return { sessionId: this.currentSessionId || tempSessionId };
  }

  async _continueSessionInternal(sessionId, message, options) {
    this.logger.log(`[CodexConnector] 继续会话: ${sessionId}`);
    this.logger.log(`[CodexConnector] 消息长度: ${message.length} 字符`);

    // 🆕 添加新消息到历史记录
    const history = this.conversationHistory.get(sessionId) || [];
    history.push({ role: 'user', content: message, timestamp: Date.now() });

    // 🆕 限制历史长度（防止 token 溢出）
    if (history.length > this.maxHistoryLength * 2) {
      // 保留最近的 N 轮对话（每轮包含 user + assistant）
      const keepLength = this.maxHistoryLength * 2;
      const removed = history.length - keepLength;
      history.splice(0, removed);
      this.logger.log(`[CodexConnector] 历史记录过长，移除最早的 ${removed} 条消息`);
    }

    this.conversationHistory.set(sessionId, history);
    this.logger.log(`[CodexConnector] 历史记录长度: ${history.length}`);

    const session = this._getSession(sessionId);
    if (session?.process && !session.process.killed) {
      this.logger.log(`[CodexConnector] 终止旧进程: ${session.process.pid}`);
      this._terminateProcess(session.process);
    }

    // 🆕 构建包含历史上下文的消息
    const fullMessage = this._buildFullMessage(message, true, sessionId);
    const args = this._buildCommandArgs(fullMessage, true, sessionId);
    const child = this._spawnProcess(args);

    this._registerSession(sessionId, { process: child });
    this.currentSessionId = sessionId;

    this._setupEventHandlers(child, sessionId, options);
  }

  _interruptSessionInternal(sessionId) {
    const session = this._getSession(sessionId);
    if (!session?.process) return false;

    this._terminateProcess(session.process);
    return true;
  }

  // ==================== 辅助方法 ====================

  /**
   * 构建命令行参数
   * 使用 `codex exec` 非交互模式（codex resume 是交互式 TUI，无法用于非交互环境）
   */
  _buildCommandArgs(message, isResume, sessionId = null) {
    // 始终使用 exec 非交互模式
    let args = ['exec', '--json', '--skip-git-repo-check'];

    // 消息作为参数传递
    if (message) {
      args.push(message);
    }

    return args;
  }

  /**
   * 构建完整的消息内容（包含系统提示词和历史上下文）
   * 恢复会话时，从 JSONL 文件读取历史并注入到消息中
   */
  _buildFullMessage(message, isResume, sessionId = null) {
    let finalMessage = message;

    // 首次会话时加载系统提示词
    if (!isResume) {
      if (this.systemPromptFile && fs.existsSync(this.systemPromptFile)) {
        try {
          const systemPrompt = fs.readFileSync(this.systemPromptFile, 'utf-8');
          finalMessage = `${systemPrompt}\n\n${message}`;
          this.logger.log('[CodexConnector] 已加载系统提示词文件');
        } catch (err) {
          this.logger.error('[CodexConnector] 读取系统提示词文件失败:', err.message);
        }
      } else if (this.systemPrompt && this.systemPrompt.trim()) {
        finalMessage = `${this.systemPrompt}\n\n${message}`;
        this.logger.log('[CodexConnector] 已添加系统提示词到 prompt（首次会话）');
      }
    } else if (isResume && sessionId) {
      // 🆕 恢复会话时，从 JSONL 文件读取历史上下文
      const history = this._loadHistoryFromFile(sessionId);
      if (history && history.length > 0) {
        const context = this._buildConversationContext(history, message);
        finalMessage = context;
        this.logger.log(`[CodexConnector] 已从文件加载历史上下文 (${history.length} 条消息)`);
      } else {
        // 降级：尝试从内存中获取历史
        const memHistory = this.conversationHistory.get(sessionId);
        if (memHistory && memHistory.length > 0) {
          const context = this._buildConversationContext(memHistory, message);
          finalMessage = context;
          this.logger.log(`[CodexConnector] 已从内存加载历史上下文 (${memHistory.length} 条消息)`);
        }
      }
    }

    return finalMessage;
  }

  /**
   * 从 Codex JSONL 文件读取历史对话
   * @param {string} sessionId - 会话 ID (ULID 格式)
   * @returns {Array} 历史消息列表 [{role, content, timestamp}]
   */
  _loadHistoryFromFile(sessionId) {
    const os = require('os');
    const path = require('path');

    // Codex 会话文件路径：~/.codex/sessions/{yyyy}/{MM}/{dd}/rollout-{ts}-{ulid}.jsonl
    // 需要查找匹配 sessionId (ULID) 的文件
    const codexDir = path.join(os.homedir(), '.codex', 'sessions');

    if (!fs.existsSync(codexDir)) {
      this.logger.log('[CodexConnector] Codex sessions 目录不存在');
      return null;
    }

    // 遍历最近 7 天的目录查找匹配的会话文件
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);

      const datePath = path.join(
        codexDir,
        String(date.getFullYear()).padStart(4, '0'),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
      );

      if (!fs.existsSync(datePath)) continue;

      const files = fs.readdirSync(datePath);
      const targetFile = files.find(f => f.includes(sessionId) && f.endsWith('.jsonl'));

      if (targetFile) {
        const filePath = path.join(datePath, targetFile);
        this.logger.log(`[CodexConnector] 找到会话文件: ${filePath}`);
        return this._parseHistoryJsonl(filePath);
      }
    }

    this.logger.log(`[CodexConnector] 未找到会话文件: ${sessionId}`);
    return null;
  }

  /**
   * 解析 Codex JSONL 文件提取历史对话
   * @param {string} filePath - JSONL 文件路径
   * @returns {Array} 历史消息列表
   */
  _parseHistoryJsonl(filePath) {
    const history = [];

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const data = JSON.parse(line);

          // 解析用户消息
          if (data.type === 'response_item' && data.payload?.role === 'user') {
            const content = data.payload.content;
            if (Array.isArray(content)) {
              const text = content
                .filter(c => c.type === 'input_text')
                .map(c => c.text)
                .join('');

              // 跳过系统注入的消息
              if (text && !this._isSystemMessage(text)) {
                history.push({
                  role: 'user',
                  content: text,
                  timestamp: data.timestamp
                });
              }
            }
          }

          // 解析助手消息
          if (data.type === 'response_item' && data.payload?.role === 'assistant') {
            const content = data.payload.content;
            if (Array.isArray(content)) {
              const text = content
                .filter(c => c.type === 'output_text')
                .map(c => c.text)
                .join('');

              if (text) {
                history.push({
                  role: 'assistant',
                  content: text,
                  timestamp: data.timestamp
                });
              }
            }
          }
        } catch (parseError) {
          // 跳过解析失败的行
          continue;
        }
      }

      return history;
    } catch (err) {
      this.logger.error(`[CodexConnector] 解析历史文件失败: ${err.message}`);
      return null;
    }
  }

  /**
   * 判断是否为系统消息（跳过系统注入的内容）
   */
  _isSystemMessage(content) {
    const systemPatterns = [
      '[RUNTIME_CONTEXT]',
      '[MODE_PROMPT]',
      '<permissions instructions>',
      '<INSTRUCTIONS>',
      '<environment_context>',
      '<command-',
      '</command',
      '[system-reminder]'
    ];

    return systemPatterns.some(pattern => content.includes(pattern));
  }

  /**
   * 构建对话上下文（用于继续会话）
   */
  _buildConversationContext(history, newMessage) {
    const parts = [];

    // 添加历史对话
    for (const item of history) {
      if (item.role === 'user') {
        parts.push(`**用户**: ${item.content}`);
      } else if (item.role === 'assistant') {
        parts.push(`**助手**: ${item.content}`);
      }
    }

    const last = history[history.length - 1];
    const alreadyIncluded = !!last && last.role === 'user' && last.content === newMessage;
    if (!alreadyIncluded) {
      parts.push(`**用户**: ${newMessage}`);
    }
    parts.push('请继续上述对话。');

    return parts.join('\n\n---\n\n');
  }

  /**
   * 启动子进程
   * 直接调用 node.js 运行 Codex
   */
  _spawnProcess(args) {
    // 如果 codexPath 是 .cmd 文件，需要解析到实际的 .js 文件
    let executable = this.codexPath;
    let useShell = this._isWindows();
    let command = null;
    let finalArgs = args;

    // 检测是否是 .cmd 文件（Windows npm 安装）
    if (this.codexPath.endsWith('.cmd')) {
      // 解析到实际的 JS 文件
      // C:/Users/.../npm/codex.cmd -> C:/Users/.../npm/node_modules/@openai/codex/bin/codex.js
      const npmPath = this.codexPath.replace(/codex\.cmd$/, '');
      executable = `${npmPath}node_modules/@openai/codex/bin/codex.js`;
      command = 'node';
      finalArgs = [executable, ...args];
      useShell = false; // 直接用 node 运行，不需要 shell
    } else if (this.codexPath.endsWith('.js')) {
      command = 'node';
      finalArgs = [executable, ...args];
      useShell = false;
    } else {
      command = executable;
      finalArgs = args;
    }

    const spawnOptions = {
      cwd: this.workDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: useShell,
      env: {
        ...process.env,
        // 🔧 强制 UTF-8 编码（解决 Windows/Linux 中文乱码）
        LANG: this._isWindows() ? 'zh_CN.UTF-8' : 'zh_CN.UTF-8',
        LC_ALL: 'zh_CN.UTF-8',
        // Node.js 编码设置
        NODE_OPTIONS: '--max-old-space-size=4096'
      }
    };

    // Windows 下额外设置编码页
    if (this._isWindows()) {
      spawnOptions.env.CHCP = '65001'; // UTF-8 代码页
    }

    this.logger.log(`[CodexConnector] 执行命令: ${command} ${finalArgs.join(' ')}`);
    this.logger.log(`[CodexConnector] useShell: ${useShell}`);

    const child = spawn(command, finalArgs, spawnOptions);

    return child;
  }

  /**
   * 设置事件处理器
   */
  _setupEventHandlers(child, sessionId, options) {
    const { onEvent, onError, onComplete } = options;

    // 🆕 包装 onEvent 回调，用于保存助手回复到历史记录
    const wrappedOnEvent = (event) => {
      // 保存助手回复到历史记录
      if (event.type === 'assistant' && event.message?.content) {
        const text = event.message.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('');

        if (text.trim()) {
          const history = this.conversationHistory.get(sessionId);
          if (history) {
            history.push({
              role: 'assistant',
              content: text,
              timestamp: Date.now()
            });
            this.conversationHistory.set(sessionId, history);
            this.logger.log(`[CodexConnector] 保存助手回复到历史 (${text.length} 字符)`);
          }
        }
      }

      // 调用原始回调
      if (onEvent) {
        onEvent(event);
      }
    };

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let realSessionId = null;
    let hasParsedEvents = false; // 🔍 标志：是否已解析到事件

    // 处理标准输出
    child.stdout.on('data', (data) => {
      const text = data.toString('utf-8'); // 🔧 显式指定 UTF-8 编码
      this.logger.log('[CodexConnector] stdout:', text.substring(0, 200));
      stdoutBuffer += text;

      // 尝试实时解析输出（使用包装后的回调）
      const parsedEvents = this._processOutput(text, sessionId, { ...options, onEvent: wrappedOnEvent });
      if (parsedEvents > 0) {
        hasParsedEvents = true; // ✅ 标记已解析到事件
      }
    });

    // 处理标准错误
    child.stderr.on('data', (data) => {
      const text = data.toString('utf-8'); // 🔧 显式指定 UTF-8 编码
      this.logger.log('[CodexConnector] stderr:', text);
      stderrBuffer += text;

      // 尝试从 stderr 中提取 sessionId
      if (!realSessionId) {
        const idMatch = text.match(/session[-_]?id[:\s]+([a-zA-Z0-9-]+)/i);
        if (idMatch) {
          realSessionId = idMatch[1];
          this._handleSessionIdUpdate(sessionId, realSessionId);
        }
      }
    });

    // 进程关闭
    child.on('close', (code) => {
      const finalSessionId = realSessionId || sessionId;
      this.logger.log(`[CodexConnector] 进程结束: ${finalSessionId}, code: ${code}`);
      this.logger.log(`[CodexConnector] hasParsedEvents: ${hasParsedEvents}`);

      // 🔍 只没有解析到事件时，才使用原始输出作为降级方案
      // 这样可以避免重复推送（已通过 JSONL 解析推送的内容）
      if (!hasParsedEvents && stdoutBuffer.trim() && wrappedOnEvent) {
        this.logger.warning('[CodexConnector] 未解析到 JSONL 事件，使用原始输出作为降级方案');
        wrappedOnEvent({
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: stdoutBuffer.trim() }]
          }
        });
      } else if (hasParsedEvents) {
        this.logger.log('[CodexConnector] 已解析到 JSONL 事件，跳过原始输出（避免重复）');
      }

      // 发送会话结束事件
      if (wrappedOnEvent) {
        wrappedOnEvent({ type: 'session_end' });
      }

      this._unregisterSession(finalSessionId);

      if (onComplete) {
        onComplete(code);
      }
    });

    // 进程错误
    child.on('error', (err) => {
      this.logger.error(`[CodexConnector] 进程错误: ${err.message}`);
      if (onError) {
        onError(err);
      }
    });
  }

  /**
   * 处理输出并转换为事件流
   * Codex exec 输出 JSONL 格式
   * @returns {number} 解析到的事件数量
   */
  _processOutput(text, sessionId, options) {
    const { onEvent } = options;
    let eventCount = 0;

    // Codex exec 输出 JSONL（每行一个 JSON 对象）
    const lines = text.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;

      // 尝试解析 JSON
      try {
        const data = JSON.parse(line);
        const event = this._parseCodexExecEvent(data, sessionId);
        if (event && onEvent) {
          onEvent(event);
          eventCount++;
        }
      } catch (e) {
        // 不是 JSON，忽略（Codex exec 应该只输出 JSONL）
        this.logger.log(`[CodexConnector] 忽略非 JSON 行: ${line.substring(0, 50)}`);
      }
    }

    return eventCount;
  }

  /**
   * 解析 Codex exec 事件
   * Codex exec 的事件格式:
   * - thread.started
   * - turn.started
   * - item.completed (包含 agent_message)
   * - turn.completed
   */
  _parseCodexExecEvent(data, sessionId) {
    switch (data.type) {
      case 'thread.started':
        // 线程开始，提取 thread_id 作为会话 ID
        if (data.thread_id) {
          this._handleSessionIdUpdate(sessionId, data.thread_id);
        }
        return null; // 不需要转发此事件

      case 'item.completed':
        // 项目完成，提取内容
        if (data.item?.type === 'agent_message' && data.item?.text) {
          return {
            type: 'assistant',
            message: {
              content: [{
                type: 'text',
                text: data.item.text
              }],
              id: data.item.id,
              model: this.modelConfig.model || 'gpt-5.3-codex'
            }
          };
        }
        // 如果是 tool_use 或其他类型
        if (data.item?.type === 'tool_use') {
          return {
            type: 'tool_use',
            id: data.item.id,
            name: data.item.name,
            input: data.item.input
          };
        }
        break;

      case 'turn.completed':
        // 轮次完成，发送会话结束事件
        return {
          type: 'session_end',
          usage: data.usage
        };

      default:
        // 其他事件类型不处理
        break;
    }

    return null;
  }

  /**
   * 解析 Codex 事件（保留用于兼容）
   */
  _parseCodexEvent(data, sessionId) {
    // 根据 Codex 的实际数据结构进行解析
    // 这里提供一个通用的解析框架

    if (data.type === 'assistant' || data.role === 'assistant') {
      return {
        type: 'assistant',
        message: {
          content: this._parseContent(data.content || data.message),
          model: data.model,
          id: data.id
        }
      };
    }

    if (data.type === 'tool_use' || data.type === 'tool') {
      return {
        type: 'tool_use',
        id: data.id,
        name: data.name,
        input: data.input
      };
    }

    if (data.type === 'tool_result') {
      return {
        type: 'tool_end',
        tool_use_id: data.tool_use_id,
        output: data.output || data.result
      };
    }

    return null;
  }

  /**
   * 解析内容块
   */
  _parseContent(content) {
    if (typeof content === 'string') {
      return [{ type: 'text', text: content }];
    }

    if (Array.isArray(content)) {
      return content.map(item => {
        if (typeof item === 'string') {
          return { type: 'text', text: item };
        }
        if (item && typeof item === 'object') {
          return {
            type: item.type || 'text',
            text: item.text || item.content,
            id: item.id,
            name: item.name,
            input: item.input
          };
        }
        return null;
      }).filter(Boolean);
    }

    return [{ type: 'text', text: JSON.stringify(content) }];
  }

  /**
   * 处理 sessionId 更新
   */
  _handleSessionIdUpdate(tempId, realId) {
    this.logger.log(`[CodexConnector] 检测到 session_id: ${realId}`);

    if (realId !== tempId) {
      const session = this._getSession(tempId);
      if (session) {
        this._unregisterSession(tempId);
        this._registerSession(realId, session);
        this.currentSessionId = realId;
        this.logger.log(`[CodexConnector] 会话 ID 更新: ${tempId} -> ${realId}`);
      }

      // 🆕 迁移对话历史（关键修复！）
      const history = this.conversationHistory.get(tempId);
      if (history) {
        this.conversationHistory.set(realId, history);
        this.conversationHistory.delete(tempId);
        this.logger.log(`[CodexConnector] 历史记录已迁移: ${tempId} -> ${realId} (${history.length} 条消息)`);
      } else {
        this.logger.warning(`[CodexConnector] 未找到临时会话的历史记录: ${tempId}`);
      }
    }

    // 触发回调通知 server.js
    if (this.sessionIdUpdateCallback) {
      this.sessionIdUpdateCallback(realId);
    }
  }

  /**
   * 清理资源
   */
  cleanup() {
    this.logger.log('[CodexConnector] 清理资源...');

    // 终止所有活动会话
    for (const sessionId of this.getActiveSessions()) {
      this.interruptSession(sessionId);
    }

    // 🆕 清理会话历史
    this.conversationHistory.clear();
    this.logger.log('[CodexConnector] 已清理会话历史');

    this.currentSessionId = null;
  }
}

module.exports = CodexConnector;
