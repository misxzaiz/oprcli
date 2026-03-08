/**
 * Base LLM Provider
 * 所有 LLM Provider 的抽象基类
 */
class BaseLLMProvider {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL;
    this.model = config.model;
    this.timeout = config.timeout || 60000;
  }

  /**
   * 抽象方法 - 子类必须实现
   */
  async chat(messages, options) {
    throw new Error('chat() must be implemented by subclass');
  }

  /**
   * 转换工具定义为标准格式
   */
  formatTools(tools) {
    if (!tools || tools.length === 0) return undefined;

    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema || tool.parameters
      }
    }));
  }

  /**
   * 解析工具调用响应
   */
  parseToolCalls(response) {
    return response.choices?.[0]?.message?.tool_calls || [];
  }

  /**
   * 提取文本内容
   */
  extractContent(response) {
    return response.choices?.[0]?.message?.content || '';
  }

  /**
   * 标准化响应格式
   */
  normalizeResponse(apiResponse) {
    return {
      content: this.extractContent(apiResponse),
      toolCalls: this.parseToolCalls(apiResponse),
      usage: apiResponse.usage || {},
      model: apiResponse.model,
      id: apiResponse.id
    };
  }
}

module.exports = BaseLLMProvider;
