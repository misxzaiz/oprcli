/**
 * AgentConfig - Agent 配置管理
 *
 * 支持从文件或环境变量加载配置
 */

const fs = require('fs').promises;
const path = require('path');

class AgentConfig {
  constructor() {
    this.configPath = path.join(process.cwd(), 'agent-config.json');
    this.config = {
      default: 'claude-code',
      agents: []
    };
  }

  /**
   * 从文件加载配置
   * @param {string} filePath
   */
  async loadFromFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      this.config = JSON.parse(content);
      console.log(`[AgentConfig] 从文件加载配置: ${filePath}`);
      return this.config;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`[AgentConfig] 配置文件不存在，使用默认配置`);
        return this.config;
      }
      throw error;
    }
  }

  /**
   * 保存配置到文件
   * @param {string} filePath
   */
  async saveToFile(filePath) {
    const content = JSON.stringify(this.config, null, 2);
    await fs.writeFile(filePath, content, 'utf-8');
    console.log(`[AgentConfig] 配置已保存: ${filePath}`);
  }

  /**
   * 从环境变量加载配置
   */
  loadFromEnv() {
    // DeepSeek 配置
    if (process.env.DEEPSEEK_API_KEY) {
      this.config.agents.push({
        id: 'deepseek',
        type: 'deepseek',
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat'
      });
    }

    // OpenAI 配置
    if (process.env.OPENAI_API_KEY) {
      this.config.agents.push({
        id: 'openai',
        type: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo'
      });
    }

    // Claude Code 配置
    if (process.env.CLAUDE_CMD_PATH || process.env.CLAUDE_CONFIG_PATH) {
      this.config.agents.push({
        id: 'claude-code',
        type: 'claude-code',
        claudeCmdPath: process.env.CLAUDE_CMD_PATH,
        configPath: process.env.CLAUDE_CONFIG_PATH,
        workDir: process.env.CLAUDE_WORK_DIR || process.cwd()
      });
    }

    // 设置默认 Agent
    if (process.env.DEFAULT_AGENT) {
      this.config.default = process.env.DEFAULT_AGENT;
    }

    console.log(`[AgentConfig] 从环境变量加载了 ${this.config.agents.length} 个 Agent 配置`);
    return this.config;
  }

  /**
   * 自动加载配置（先文件，后环境变量）
   */
  async autoLoad() {
    // 先尝试从文件加载
    await this.loadFromFile(this.configPath);

    // 然后从环境变量加载（会覆盖文件中的配置）
    this.loadFromEnv();

    return this.config;
  }

  /**
   * 获取默认 Agent ID
   */
  getDefaultAgentId() {
    return this.config.default;
  }

  /**
   * 获取所有 Agent 配置
   */
  getAgentConfigs() {
    return this.config.agents;
  }

  /**
   * 获取特定 Agent 配置
   * @param {string} id
   */
  getAgentConfig(id) {
    return this.config.agents.find(a => a.id === id);
  }

  /**
   * 添加 Agent 配置
   * @param {Object} agentConfig
   */
  addAgent(agentConfig) {
    if (!agentConfig.id) {
      throw new Error('Agent 配置必须包含 id');
    }
    this.config.agents.push(agentConfig);
  }

  /**
   * 设置默认 Agent
   * @param {string} id
   */
  setDefault(id) {
    const agent = this.getAgentConfig(id);
    if (!agent) {
      throw new Error(`Agent 不存在: ${id}`);
    }
    this.config.default = id;
  }

  /**
   * 生成示例配置文件
   */
  static generateExample() {
    return {
      default: 'claude-code',
      agents: [
        {
          id: 'claude-code',
          type: 'claude-code',
          workDir: process.cwd(),
          enabled: true
        },
        {
          id: 'deepseek',
          type: 'deepseek',
          apiKey: 'your-deepseek-api-key',
          baseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-chat',
          enabled: true
        },
        {
          id: 'openai',
          type: 'openai',
          apiKey: 'your-openai-api-key',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-3.5-turbo',
          enabled: false
        }
      ]
    };
  }
}

module.exports = AgentConfig;
