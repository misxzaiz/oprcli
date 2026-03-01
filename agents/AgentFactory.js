/**
 * AgentFactory - Agent 工厂
 *
 * 根据配置创建不同的 Agent 实例
 */

const ClaudeCodeAgent = require('./ClaudeCodeAgent');
const OpenAIAgent = require('./OpenAIAgent');
const { ToolManager } = require('./tools/ToolManager');

class AgentFactory {
  constructor() {
    this.agentTypes = new Map();
    this.toolManager = new ToolManager();
    this.registerDefaultAgents();
  }

  /**
   * 注册默认 Agent 类型
   */
  registerDefaultAgents() {
    this.register('claude-code', ClaudeCodeAgent);
    this.register('openai', OpenAIAgent);
    this.register('deepseek', OpenAIAgent);
  }

  /**
   * 注册 Agent 类型
   * @param {string} type
   * @param {Class} AgentClass
   */
  register(type, AgentClass) {
    this.agentTypes.set(type, AgentClass);
    console.log(`[AgentFactory] 注册 Agent 类型: ${type}`);
  }

  /**
   * 创建 Agent
   * @param {string} type - Agent 类型
   * @param {Object} config - 配置
   * @returns {BaseAgent}
   */
  create(type, config = {}) {
    const AgentClass = this.agentTypes.get(type);

    if (!AgentClass) {
      throw new Error(`未知的 Agent 类型: ${type}。可用类型: ${Array.from(this.agentTypes.keys()).join(', ')}`);
    }

    // 自动注入 toolManager
    if (!config.toolManager) {
      config.toolManager = this.toolManager;
    }

    const agent = new AgentClass(config);
    console.log(`[AgentFactory] 创建 Agent: ${type} (${agent.name})`);

    return agent;
  }

  /**
   * 从配置对象创建 Agent
   * @param {Object} agentConfig
   * @returns {BaseAgent}
   */
  createFromConfig(agentConfig) {
    const { type, ...config } = agentConfig;
    return this.create(type, config);
  }

  /**
   * 批量创建 Agent
   * @param {Array<Object>} configs
   * @returns {Map<string, BaseAgent>}
   */
  createMultiple(configs) {
    const agents = new Map();

    for (const config of configs) {
      const { id, type, ...options } = config;
      const agent = this.create(type, options);
      agents.set(id, agent);
    }

    return agents;
  }

  /**
   * 获取工具管理器
   * @returns {ToolManager}
   */
  getToolManager() {
    return this.toolManager;
  }

  /**
   * 注册自定义工具
   * @param {Tool} tool
   */
  registerTool(tool) {
    this.toolManager.register(tool);
  }

  /**
   * 列出所有可用的 Agent 类型
   * @returns {Array<string>}
   */
  listTypes() {
    return Array.from(this.agentTypes.keys());
  }
}

module.exports = AgentFactory;
