/**
 * OpenAI Compatible Provider
 * 支持所有兼容 OpenAI API 格式的服务
 * - iFlow (https://apis.iflow.cn/v1)
 * - DeepSeek (https://api.deepseek.com/v1)
 * - OpenAI (https://api.openai.com/v1)
 * - 其他兼容服务
 */

const axios = require('axios');
const BaseLLMProvider = require('./base-provider');

class OpenAICompatibleProvider extends BaseLLMProvider {
  constructor(config) {
    super(config);

    // 服务配置
    this.serviceName = config.serviceName || 'openai';
    this.baseURL = config.baseURL;

    // 请求配置
    this.defaultModel = config.model || 'gpt-3.5-turbo';
    this.defaultTemperature = config.temperature ?? 0.7;
    this.defaultMaxTokens = config.maxTokens || 4096;
  }

  /**
   * 发送聊天请求
   */
  async chat(messages, options = {}) {
    const {
      tools,
      temperature = this.defaultTemperature,
      max_tokens = this.defaultMaxTokens,
      top_p,
      top_k,
      frequency_penalty,
      response_format,
      stream = false
    } = options;

    // 构建请求体
    const requestBody = {
      model: this.model || this.defaultModel,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      temperature,
      max_tokens,
      stream
    };

    // 可选参数
    if (top_p !== undefined) requestBody.top_p = top_p;
    if (top_k !== undefined) requestBody.top_k = top_k;
    if (frequency_penalty !== undefined) requestBody.frequency_penalty = frequency_penalty;
    if (response_format !== undefined) requestBody.response_format = response_format;

    // 添加工具定义（如果支持）
    if (tools && tools.length > 0) {
      requestBody.tools = this.formatTools(tools);
    }

    try {
      const response = await this._makeRequest(requestBody);
      return this.normalizeResponse(response.data);
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * 发送 HTTP 请求
   */
  async _makeRequest(requestBody) {
    return await axios.post(
      `${this.baseURL}/chat/completions`,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: this.timeout
      }
    );
  }

  /**
   * 错误处理
   */
  _handleError(error) {
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.error?.message || error.message;

      return new Error(`API Error (${status}): ${message}`);
    }

    if (error.request) {
      return new Error('Network Error: No response from server');
    }

    return new Error(`Request Error: ${error.message}`);
  }
}

module.exports = OpenAICompatibleProvider;
