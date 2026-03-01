/**
 * Agents 模块主入口
 *
 * 提供统一的 API 来创建和管理不同的 AI Agent
 */

const AgentFactory = require('./AgentFactory');
const AgentConfig = require('./AgentConfig');
const { ToolManager } = require('./tools/ToolManager');

const ClaudeCodeAgent = require('./ClaudeCodeAgent');
const OpenAIAgent = require('./OpenAIAgent');

/**
 * AgentManager - Agent 管理器
 *
 * 提供高级 API 来管理多个 Agent
 */
class AgentManager {
  constructor() {
    this.factory = new AgentFactory();
    this.config = new AgentConfig();
    this.agents = new Map();
    this.currentAgentId = null;
  }

  /**
   * 初始化（自动加载配置）
   */
  async init() {
    await this.config.autoLoad();

    // 创建所有已配置的 Agent
    const configs = this.config.getAgentConfigs();
    for (const agentConfig of configs) {
      if (agentConfig.enabled !== false) {
        try {
          const agent = this.factory.createFromConfig(agentConfig);
          this.agents.set(agentConfig.id, agent);

          // 自动连接
          const result = await agent.connect();
          if (result.success) {
            console.log(`[AgentManager] Agent ${agentConfig.id} 已连接`);
          } else {
            console.error(`[AgentManager] Agent ${agentConfig.id} 连接失败:`, result.error);
          }
        } catch (error) {
          console.error(`[AgentManager] 创建 Agent ${agentConfig.id} 失败:`, error.message);
        }
      }
    }

    // 设置默认 Agent
    const defaultId = this.config.getDefaultAgentId();
    if (this.agents.has(defaultId)) {
      this.currentAgentId = defaultId;
      console.log(`[AgentManager] 默认 Agent: ${defaultId}`);
    } else if (this.agents.size > 0) {
      this.currentAgentId = this.agents.keys().next().value;
      console.log(`[AgentManager] 使用第一个可用 Agent: ${this.currentAgentId}`);
    }

    return this;
  }

  /**
   * 获取当前 Agent
   */
  getCurrentAgent() {
    if (!this.currentAgentId) {
      throw new Error('没有可用的 Agent');
    }
    return this.agents.get(this.currentAgentId);
  }

  /**
   * 切换 Agent
   * @param {string} id
   */
  switchAgent(id) {
    if (!this.agents.has(id)) {
      throw new Error(`Agent 不存在: ${id}`);
    }
    this.currentAgentId = id;
    console.log(`[AgentManager] 切换到 Agent: ${id}`);
    return this.getCurrentAgent();
  }

  /**
   * 获取指定 Agent
   * @param {string} id
   */
  getAgent(id) {
    return this.agents.get(id);
  }

  /**
   * 列出所有 Agent
   */
  listAgents() {
    return Array.from(this.agents.entries()).map(([id, agent]) => ({
      id,
      name: agent.name,
      connected: agent.connected,
      current: id === this.currentAgentId
    }));
  }

  /**
   * 聊天（使用当前 Agent）
   * @param {string} message
   * @param {Object} options
   */
  async chat(message, options = {}) {
    const agent = this.getCurrentAgent();
    return await agent.chat(message, options);
  }

  /**
   * 流式聊天
   * @param {string} message
   * @param {Object} options
   */
  async *stream(message, options = {}) {
    const agent = this.getCurrentAgent();
    yield* agent.stream(message, options);
  }

  /**
   * 清理所有 Agent
   */
  cleanup() {
    for (const [id, agent] of this.agents) {
      try {
        if (agent.cleanup) {
          agent.cleanup();
        }
        console.log(`[AgentManager] 清理 Agent: ${id}`);
      } catch (error) {
        console.error(`[AgentManager] 清理 Agent ${id} 失败:`, error.message);
      }
    }
  }

  /**
   * 获取工厂实例
   */
  getFactory() {
    return this.factory;
  }

  /**
   * 获取工具管理器
   */
  getToolManager() {
    return this.factory.getToolManager();
  }
}

// 单例模式
let managerInstance = null;

/**
 * 获取 AgentManager 单例
 */
function getManager() {
  if (!managerInstance) {
    managerInstance = new AgentManager();
  }
  return managerInstance;
}

/**
 * 快速初始化并返回 Manager
 */
async function createManager() {
  const manager = getManager();
  await manager.init();
  return manager;
}

module.exports = {
  // 类
  AgentFactory,
  AgentConfig,
  AgentManager,
  ToolManager,

  // Agent 实现
  ClaudeCodeAgent,
  OpenAIAgent,

  // 工具
  getManager,
  createManager
};
