/**
 * Agent Connector
 * 基于 LLM + Tools 的 AI Agent 连接器
 * 支持多种大模型（iFlow、DeepSeek、OpenAI 等）
 */

const BaseConnector = require('./base-connector');
const AgentEngine = require('../agents/agent-engine');
const ToolManager = require('../agents/tools/tool-manager');
const { createProvider } = require('../agents/llm-providers');

class AgentConnector extends BaseConnector {
  constructor(options = {}) {
    super(options);

    // Agent 配置
    this.providerType = options.providerType || 'iflow';
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.server = options.server; // 用于访问定时任务等功能

    // 运行时实例（在 connect 中初始化）
    this.llmProvider = null;
    this.toolManager = null;
    this.agentEngine = null;
  }

  /**
   * 连接到 Agent 服务
   */
  async _connectInternal(options) {
    try {
      // 1. 创建 LLM Provider
      this.llmProvider = createProvider({
        type: this.providerType,
        apiKey: this.apiKey,
        model: this.model
      });

      // 2. 创建工具管理器
      this.toolManager = new ToolManager(this.workDir);

      // 添加定时任务工具（如果可用）
      if (this.server && this.server.scheduler) {
        const schedulerTools = this.constructor.getSchedulerTools();
        Object.entries(schedulerTools).forEach(([name, toolDef]) => {
          this.toolManager.registerTool({
            ...toolDef,
            handler: async (args) => {
              return await this.handleSchedulerTool(name, args);
            }
          });
        });
      }

      // 3. 创建 Agent 引擎
      this.agentEngine = new AgentEngine({
        llmProvider: this.llmProvider,
        toolManager: this.toolManager,
        logger: this.logger || console
      });

      return {
        success: true,
        version: '1.0.0',
        provider: this.providerType,
        model: this.llmProvider.model,
        tools: this.toolManager.getStats().total
      };
    } catch (error) {
      return {
        success: false,
        error: `连接失败: ${error.message}`
      };
    }
  }

  /**
   * 启动新的 Agent 会话
   */
  async _startSessionInternal(message, options = {}) {
    const tempId = this._generateTempId();

    // 包装事件回调，添加 sessionId
    const wrappedOnEvent = options.onEvent ? (event) => {
      options.onEvent({
        sessionId: tempId,
        ...event
      });
    } : null;

    // 异步执行 Agent（不阻塞）
    this._executeAgentAsync(message, wrappedOnEvent)
      .catch(error => {
        this.logger?.error(`[AgentConnector] 执行错误: ${error.message}`);

        if (wrappedOnEvent) {
          wrappedOnEvent({
            type: 'error',
            error: error.message
          });
        }
      });

    // 注册会话（Agent 会话是无状态的，但保留记录）
    this._registerSession(tempId, {
      startTime: Date.now(),
      message
    });

    return { sessionId: tempId };
  }

  /**
   * 继续已有会话（Agent 无状态，等同于新会话）
   */
  async _continueSessionInternal(sessionId, message, options = {}) {
    // Agent 是无状态的，每个任务独立执行
    // 如果需要上下文，可以从会话历史中获取
    const session = this._getSession(sessionId);

    return this._startSessionInternal(message, options);
  }

  /**
   * 中断会话（Agent 不支持中断，只移除记录）
   */
  _interruptSessionInternal(sessionId) {
    // Agent 执行无法中断（异步执行中）
    // 只移除会话记录
    this._unregisterSession(sessionId);
    return true;
  }

  /**
   * 异步执行 Agent
   */
  async _executeAgentAsync(message, onEvent) {
    try {
      const result = await this.agentEngine.execute(message, onEvent);

      // 发送完成事件
      if (onEvent) {
        onEvent({
          type: 'done',
          success: result.success,
          content: result.content || result.error,
          iterations: result.iterations,
          duration: result.duration,
          usage: result.usage
        });
      }

      return result;
    } catch (error) {
      this.logger?.error(`[AgentConnector] 执行失败: ${error.message}`);

      if (onEvent) {
        onEvent({
          type: 'error',
          error: error.message
        });
      }

      throw error;
    }
  }

  /**
   * 获取 Agent 统计信息
   */
  getStats() {
    if (!this.agentEngine) {
      return {
        connected: this.connected,
        provider: this.providerType
      };
    }

    return {
      connected: this.connected,
      provider: this.providerType,
      model: this.llmProvider.model,
      ...this.agentEngine.getStats()
    };
  }
}

module.exports = AgentConnector;
