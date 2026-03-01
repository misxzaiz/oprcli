/**
 * BaseAgent - 所有 AI Agent 的抽象基类
 *
 * 定义统一的接口，所有 Agent 实现必须遵循
 */

class BaseAgent {
  /**
   * 构造函数
   * @param {Object} config - Agent 配置
   */
  constructor(config = {}) {
    this.config = config;
    this.name = config.name || 'BaseAgent';
    this.connected = false;
  }

  /**
   * 连接到 AI 服务
   * @returns {Promise<{success: boolean, version?: string, error?: string}>}
   */
  async connect() {
    throw new Error(`${this.name}.connect() 必须被实现`);
  }

  /**
   * 发送消息并获取响应（非流式）
   * @param {string} message - 用户消息
   * @param {Object} options - 选项 {sessionId, systemPrompt, tools}
   * @returns {Promise<{response: string, sessionId: string}>}
   */
  async chat(message, options = {}) {
    throw new Error(`${this.name}.chat() 必须被实现`);
  }

  /**
   * 发送消息并获取流式响应
   * @param {string} message - 用户消息
   * @param {Object} options - 选项
   * @returns {AsyncIterable<{type: string, data: any}>}
   */
  async *stream(message, options = {}) {
    throw new Error(`${this.name}.stream() 必须被实现`);
  }

  /**
   * 获取 Agent 信息
   * @returns {Object}
   */
  getInfo() {
    return {
      name: this.name,
      version: this.version || 'unknown',
      connected: this.connected,
      capabilities: this.getCapabilities()
    };
  }

  /**
   * 获取 Agent 能力
   * @returns {Object} {streaming: boolean, tools: boolean, files: boolean}
   */
  getCapabilities() {
    return {
      streaming: false,
      tools: false,
      files: false,
      codeExecution: false
    };
  }

  /**
   * 清理资源
   */
  cleanup() {
    // 子类可以覆盖
  }
}

module.exports = BaseAgent;
