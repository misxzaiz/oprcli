/**
 * ClaudeCodeAgent - Claude Code Agent 实现
 *
 * 封装 claude-connector，实现 BaseAgent 接口
 */

const BaseAgent = require('./BaseAgent');
const ClaudeConnector = require('../connectors/claude-connector');

class ClaudeCodeAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      ...config,
      name: 'ClaudeCode'
    });
    this.connector = new ClaudeConnector({
      claudeCmdPath: config.claudeCmdPath,
      workDir: config.workDir || process.cwd(),
      gitBinPath: config.gitBinPath,
      configPath: config.configPath
    });
    this.version = '2.1.63';
  }

  getCapabilities() {
    return {
      streaming: true,
      tools: true,  // 通过文件操作实现
      files: true,
      codeExecution: true
    };
  }

  async connect() {
    const result = await this.connector.connect();
    this.connected = result.success;
    return result;
  }

  /**
   * 非流式聊天（等待完整响应）
   */
  async chat(message, options = {}) {
    const { sessionId, systemPrompt, onEvent } = options;

    const events = [];
    const waitForComplete = new Promise((resolve) => {
      const opts = {
        onEvent: (event) => {
          events.push(event);
          if (onEvent) onEvent(event);
        },
        onError: (error) => {
          console.error('[ClaudeCodeAgent] 错误:', error);
        },
        onComplete: (code) => {
          resolve();
        }
      };

      if (sessionId) {
        this.connector.continueSession(sessionId, message, opts);
      } else {
        this.connector.startSession(message, {
          systemPrompt,
          ...opts
        });
      }
    });

    await waitForComplete;

    // 提取响应
    const response = this._extractResponse(events);
    const newSessionId = this._extractSessionId(events) || sessionId;

    return {
      response,
      sessionId: newSessionId,
      events // 可选：返回原始事件
    };
  }

  /**
   * 流式聊天
   */
  async *stream(message, options = {}) {
    const { sessionId, systemPrompt } = options;
    const events = [];

    // 先等待所有事件收集完成
    await new Promise((resolve) => {
      const opts = {
        onEvent: (event) => {
          events.push(event);
        },
        onError: (error) => {
          console.error('[ClaudeCodeAgent] 错误:', error);
        },
        onComplete: (code) => {
          resolve();
        }
      };

      if (sessionId) {
        this.connector.continueSession(sessionId, message, opts);
      } else {
        this.connector.startSession(message, {
          systemPrompt,
          ...opts
        });
      }
    });

    // 流式输出所有事件
    for (const event of events) {
      yield {
        type: 'event',
        data: event
      };
    }

    // 返回会话信息
    const newSessionId = this._extractSessionId(events) || sessionId;
    yield {
      type: 'session_end',
      sessionId: newSessionId
    };
  }

  /**
   * 中断会话
   * @param {string} sessionId
   */
  interrupt(sessionId) {
    return this.connector.interruptSession(sessionId);
  }

  /**
   * 获取活动会话
   * @returns {Array<string>}
   */
  getActiveSessions() {
    return this.connector.getActiveSessions();
  }

  /**
   * 从事件中提取响应文本
   * @private
   */
  _extractResponse(events) {
    const result = [];
    let hasAssistantContent = false;

    for (const event of events) {
      if (event.type === 'assistant') {
        if (event.message?.content && Array.isArray(event.message.content)) {
          hasAssistantContent = true;
          for (const block of event.message.content) {
            if (block.type === 'text' && block.text) {
              result.push(block.text);
            }
          }
        }

        if (result.length === 0 && event.content) {
          if (typeof event.content === 'string') {
            hasAssistantContent = true;
            result.push(event.content);
          }
        }

        if (result.length === 0 && event.text) {
          hasAssistantContent = true;
          result.push(event.text);
        }
      }
    }

    if (hasAssistantContent) {
      return result.join('').trim();
    }

    // 流式提取
    for (const event of events) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        result.push(event.delta.text);
      }
      if (event.type === 'result' && typeof event.result === 'string') {
        result.push(event.result);
      }
      if (typeof event.content === 'string') result.push(event.content);
      if (typeof event.text === 'string') result.push(event.text);
    }

    return result.join('').trim();
  }

  /**
   * 从事件中提取会话 ID
   * @private
   */
  _extractSessionId(events) {
    for (const event of events) {
      if (event.session_id) return event.session_id;
      if (event.sessionId) return event.sessionId;
      if (event.data?.session_id) return event.data.session_id;
    }
    return null;
  }

  cleanup() {
    // 清理所有活动会话
    const sessions = this.getActiveSessions();
    sessions.forEach(id => this.interrupt(id));
  }
}

module.exports = ClaudeCodeAgent;
