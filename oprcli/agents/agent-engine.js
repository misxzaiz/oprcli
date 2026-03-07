/**
 * Agent Engine
 * Agent 核心引擎，整合 LLM 和工具调用
 */

class AgentEngine {
  constructor(options) {
    this.llmProvider = options.llmProvider;
    this.toolManager = options.toolManager;
    this.maxIterations = options.maxIterations || 10;
    this.logger = options.logger || console;
  }

  /**
   * 执行 Agent 任务
   */
  async execute(userMessage, onEvent) {
    const messages = [
      {
        role: 'system',
        content: this._buildSystemPrompt()
      },
      {
        role: 'user',
        content: userMessage
      }
    ];

    let iteration = 0;
    const startTime = Date.now();

    try {
      while (iteration < this.maxIterations) {
        iteration++;

        this.logger.debug(`[Agent] Iteration ${iteration}/${this.maxIterations}`);

        // 1. 调用 LLM
        const response = await this.llmProvider.chat(messages, {
          tools: this.toolManager.getTools()
        });

        // 2. 添加助手响应到消息历史
        const assistantMessage = {
          role: 'assistant',
          content: response.content
        };

        // 如果有工具调用，添加到消息中
        if (response.toolCalls && response.toolCalls.length > 0) {
          assistantMessage.tool_calls = response.toolCalls;
        }

        messages.push(assistantMessage);

        // 3. 发送思考事件
        if (onEvent && response.content) {
          await onEvent({
            type: 'thinking',
            iteration,
            content: response.content
          });
        }

        // 4. 如果没有工具调用，任务完成
        if (!response.toolCalls || response.toolCalls.length === 0) {
          this.logger.info(`[Agent] 任务完成，迭代 ${iteration} 次`);

          return {
            success: true,
            content: response.content,
            iterations: iteration,
            duration: Date.now() - startTime,
            usage: response.usage
          };
        }

        // 5. 执行工具调用
        for (const toolCall of response.toolCalls) {
          const toolName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);

          this.logger.debug(`[Agent] 调用工具: ${toolName}`, args);

          // 发送工具调用事件
          if (onEvent) {
            await onEvent({
              type: 'tool_call',
              iteration,
              tool: toolName,
              args
            });
          }

          try {
            // 执行工具
            const result = await this.toolManager.execute(toolName, args);

            this.logger.debug(`[Agent] 工具结果:`, result);

            // 发送工具结果事件
            if (onEvent) {
              await onEvent({
                type: 'tool_result',
                iteration,
                tool: toolName,
                result
              });
            }

            // 添加工具结果到消息历史
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result)
            });
          } catch (error) {
            this.logger.error(`[Agent] 工具执行错误:`, error.message);

            // 添加错误信息到消息历史
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                success: false,
                error: error.message
              })
            });
          }
        }
      }

      // 达到最大迭代次数
      this.logger.warn(`[Agent] 达到最大迭代次数 ${this.maxIterations}`);

      return {
        success: false,
        error: '达到最大迭代次数',
        iterations: iteration,
        duration: Date.now() - startTime
      };
    } catch (error) {
      this.logger.error(`[Agent] 执行错误:`, error);

      return {
        success: false,
        error: error.message,
        iterations: iteration,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * 构建系统提示词
   */
  _buildSystemPrompt() {
    const toolsDesc = this.toolManager.getToolsDescription();

    return `你是一个AI助手，可以帮助用户完成各种任务。

你可以使用以下工具：
${toolsDesc}

使用工具时，请确保：
1. 仔细检查工具参数是否正确
2. 根据工具返回的结果继续完成任务
3. 如果任务完成，请总结结果并给出清晰的建议
4. 如果遇到错误，请分析原因并尝试其他方法

请始终以用户的目标为导向，高效地完成任务。`;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      maxIterations: this.maxIterations,
      availableTools: this.toolManager.getStats().total,
      provider: this.llmProvider.serviceName || 'unknown'
    };
  }
}

module.exports = AgentEngine;
