/**
 * OpenAIAgent - OpenAI 协议兼容的 Agent
 *
 * 支持：
 * - OpenAI (GPT-4, GPT-3.5)
 * - DeepSeek
 * - 其他兼容 OpenAI API 的服务
 */

const BaseAgent = require('./BaseAgent');

class OpenAIAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      ...config,
      name: config.name || 'OpenAI'
    });

    // API 配置
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.model = config.model || 'gpt-3.5-turbo';

    // DeepSeek 特殊配置
    if (config.provider === 'deepseek') {
      this.baseUrl = config.baseUrl || 'https://api.deepseek.com/v1';
      this.model = config.model || 'deepseek-chat';
    }

    // 工具管理
    this.toolManager = config.toolManager;
  }

  getCapabilities() {
    return {
      streaming: true,
      tools: true,
      files: false,
      codeExecution: false
    };
  }

  async connect() {
    if (!this.apiKey) {
      return {
        success: false,
        error: '未设置 API Key'
      };
    }

    // 验证 API 连接
    try {
      const result = await this._callAPI('/models', 'GET');
      this.connected = true;
      return {
        success: true,
        version: this.model
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async chat(message, options = {}) {
    const { sessionId, systemPrompt, tools } = options;

    // 构建消息历史
    const messages = [];

    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt
      });
    }

    // 如果有历史上下文（可以从 sessionId 获取）
    // 这里简化处理，只发送当前消息
    messages.push({
      role: 'user',
      content: message
    });

    // 构建请求体
    const requestBody = {
      model: this.model,
      messages,
      stream: false
    };

    // 如果启用工具
    if (tools && this.toolManager) {
      requestBody.tools = this.toolManager.getToolDefinitions().map(tool => ({
        type: 'function',
        function: tool
      }));
    }

    try {
      const response = await this._callAPI('/chat/completions', 'POST', requestBody);

      const choice = response.choices[0];
      const responseMessage = choice.message;

      // 处理工具调用
      if (responseMessage.tool_calls && this.toolManager) {
        const toolResults = [];

        for (const toolCall of responseMessage.tool_calls) {
          const result = await this.toolManager.execute(
            toolCall.function.name,
            JSON.parse(toolCall.function.arguments)
          );
          toolResults.push(result);
        }

        // 将工具结果发送回 AI
        messages.push(responseMessage);
        for (let i = 0; i < toolResults.length; i++) {
          messages.push({
            role: 'tool',
            tool_call_id: responseMessage.tool_calls[i].id,
            content: JSON.stringify(toolResults[i])
          });
        }

        // 再次调用获取最终响应
        const finalResponse = await this._callAPI('/chat/completions', 'POST', {
          model: this.model,
          messages
        });

        return {
          response: finalResponse.choices[0].message.content,
          sessionId: sessionId || this._generateSessionId(),
          toolCalls: toolResults
        };
      }

      return {
        response: responseMessage.content,
        sessionId: sessionId || this._generateSessionId()
      };
    } catch (error) {
      throw new Error(`API 调用失败: ${error.message}`);
    }
  }

  async *stream(message, options = {}) {
    const { sessionId, systemPrompt } = options;

    const messages = [];

    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt
      });
    }

    messages.push({
      role: 'user',
      content: message
    });

    const requestBody = {
      model: this.model,
      messages,
      stream: true
    };

    try {
      const stream = await this._callAPIStream('/chat/completions', 'POST', requestBody);

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (delta?.content) {
          yield {
            type: 'content',
            text: delta.content
          };
        }

        if (chunk.choices[0]?.finish_reason === 'stop') {
          yield {
            type: 'session_end',
            sessionId: sessionId || this._generateSessionId()
          };
          break;
        }
      }
    } catch (error) {
      yield {
        type: 'error',
        error: error.message
      };
    }
  }

  /**
   * 调用 API
   * @private
   */
  async _callAPI(endpoint, method, body = null) {
    const url = `${this.baseUrl}${endpoint}`;

    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      // 如果是 GET 请求，将 body 作为查询参数
      if (method === 'GET') {
        const params = new URLSearchParams(body).toString();
        url += `?${params}`;
      } else {
        options.body = JSON.stringify(body);
      }
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    return await response.json();
  }

  /**
   * 调用流式 API
   * @private
   */
  async *_callAPIStream(endpoint, method, body) {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          yield parsed;
        } catch (e) {
          console.error('[OpenAIAgent] 解析 SSE 失败:', trimmed);
        }
      }
    }
  }

  /**
   * 生成会话 ID
   * @private
   */
  _generateSessionId() {
    return `openai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = OpenAIAgent;
