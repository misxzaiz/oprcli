/**
 * 消息格式化器
 * 将不同类型的事件转换为钉钉消息格式
 */

class MessageFormatter {
  constructor(config, logger) {
    this.config = config
    this.logger = logger
  }

  formatEvent(event, context) {
    console.log('=== Event Debug Info ===')
    console.log('Event:', JSON.stringify(event, null, 2))
    console.log('Context:', context)
    console.log('========================')
    const { index, elapsed } = context
    const timeStr = this.config.showTime ? `\n⏱️ ${elapsed}s` : ''

    switch (event.type) {
      case 'thinking':
        return this._formatThinking(event, timeStr)
      case 'tool_start':
        return this._formatToolStart(event, timeStr)
      case 'tool_output':
        return this._formatToolOutput(event, timeStr)
      case 'tool_end':
        return this._formatToolEnd(event, timeStr)
      case 'assistant':
        return this._formatAssistant(event, timeStr)
      case 'result':
        return this._formatResult(event, timeStr)
      case 'session_end':
        return this._formatSessionEnd(event, context)
      case 'error':
        return this._formatError(event, timeStr)
      default:
        return null
    }
  }

  _formatThinking(event, timeStr) {
    if (!this.config.showThinking) return null

    const content = event.content?.substring(0, 200) || ''
    const truncated = event.content?.length > 200 ? '\n...(已截断)' : ''

    return this._buildMessage(`💭 思考中...\n\n${content}${truncated}${timeStr}`, '思考中')
  }

  _formatToolStart(event, timeStr) {
    if (!this.config.showTools) return null

    const icon = this._getToolIcon(event.tool)
    const command = event.command?.substring(0, 200) || ''
    const truncated = event.command?.length > 200 ? '\n...(已截断)' : ''

    return this._buildMessage(
      `${icon} 执行工具：${event.tool}\n\n命令：\n\`\`\`\n${command}${truncated}\n\`\`\`${timeStr}`,
      '执行工具'
    )
  }

  _formatToolOutput(event, timeStr) {
    if (!this.config.showTools) return null

    const output = event.output || ''
    const truncated = this._truncate(output, this.config.maxLength)

    return this._buildMessage(
      `📤 输出：\n\n\`\`\`\n${truncated}\n\`\`\`\n\n${output.length > this.config.maxLength ? `(已截断，共 ${output.length} 字符)` : ''}${timeStr}`,
      '工具输出'
    )
  }

  _formatToolEnd(event, timeStr) {
    if (!this.config.showTools) return null
    if (event.exitCode === 0) return null

    return this._buildMessage(
      `❌ 工具失败：${event.tool}\n退出码：${event.exitCode}${timeStr}`,
      '工具失败'
    )
  }

  _formatAssistant(event, timeStr) {
    const hasText = event.message?.content?.some(c => c.type === 'text')
    const hasThinking = event.message?.content?.some(c => c.type === 'thinking')
    const hasToolUse = event.message?.content?.some(c => c.type === 'tool_use')

    // 处理工具调用
    if (hasToolUse && this.config.showTools) {
      const toolUse = event.message.content.find(c => c.type === 'tool_use')
      
      // 追踪工具调用状态
      if (!this.pendingTools) this.pendingTools = new Map()
      this.pendingTools.set(toolUse.id, {
        name: toolUse.name,
        input: toolUse.input,
        timestamp: Date.now(),
        status: 'started'
      })
      
      console.log(`[Tool Tracker] 工具开始: ${toolUse.name} (ID: ${toolUse.id})`)
      console.log(`[Tool Tracker] 待处理工具:`, Array.from(this.pendingTools.entries()))
      
      return this._buildMessage(
        `🔧 工具调用：${toolUse.name}\n输入：${JSON.stringify(toolUse.input, null, 2)}${timeStr}`,
        '工具调用'
      )
    }

    if (!hasText && hasThinking) {
      return this._formatThinkingFromAssistant(event, timeStr)
    }

    if (hasText && hasThinking) {
      const text = event.message?.content
        ?.filter(c => c.type === 'text')
        ?.map(c => c.text)
        ?.join('\n') || ''

      if (text.trim()) {
        return this._buildMessage(`💬 回复：\n\n${text}${timeStr}`, 'AI回复')
      }
    }

    const text = event.message?.content
      ?.filter(c => c.type === 'text')
      ?.map(c => c.text)
      ?.join('\n') || ''

    if (text.trim()) {
      return this._buildMessage(`💬 回复：\n\n${text}${timeStr}`, 'AI回复')
    }

    return null
  }

  _formatError(event, timeStr) {
    return this._buildMessage(
      `❌ 错误\n\n${event.message || event.error || '未知错误'}${timeStr}`,
      '错误'
    )
  }

  _formatResult(event, timeStr) {
    const result = event.result || ''
    const truncated = this._truncate(result, this.config.maxLength)
    
    // 检查未完成的工具
    if (this.pendingTools && this.pendingTools.size > 0) {
      console.log(`[Tool Tracker] 结果事件触发，待处理工具:`, Array.from(this.pendingTools.entries()))
      // 清空待处理工具（假设结果事件意味着会话结束）
      this.pendingTools.clear()
    }

    return this._buildMessage(
      `📋 最终结果：\n\n\`\`\`\n${truncated}\n\`\`\`\n\n${result.length > this.config.maxLength ? `(已截断，共 ${result.length} 字符)` : ''}${timeStr}`,
      '执行结果'
    )
  }

  _formatSessionEnd(event, context) {
    const { index, elapsed } = context

    // 构建完成统计信息
    const lines = [
      `✅ 响应完成`,
      `• 消息数量：${index}`,
      `• 总耗时：${elapsed}s`,
      ''
    ]

    // 如果有错误信息，显示错误
    if (event.error) {
      lines.push(`• 错误：${event.error}`)
    }

    const content = lines.join('\n')

    return this._buildMessage(content, '完成')
  }

  _formatThinkingFromAssistant(event, timeStr) {
    const thinking = event.message?.content
      ?.filter(c => c.type === 'thinking')
      ?.map(c => c.thinking)
      ?.join('\n')?.substring(0, 200) || ''

    if (thinking) {
      return this._buildMessage(`💭 思考中...\n\n${thinking}${event.message?.content?.length > 200 ? '\n...(已截断)' : ''}${timeStr}`, '思考中')
    }
    return null
  }

  _buildMessage(content, title) {
    if (this.config.useMarkdown) {
      return {
        msgtype: 'markdown',
        markdown: { title, text: content }
      }
    }
    return {
      msgtype: 'text',
      text: { content: content }
    }
  }

  _getToolIcon(tool) {
    const icons = { 'Bash': '🖥️', 'Editor': '📝', 'Browser': '🌐', 'Computer': '💻' }
    return icons[tool] || '🔧'
  }

  _truncate(str, maxLength) {
    if (!str || str.length <= maxLength) return str || ''
    return str.substring(0, maxLength)
  }
}

module.exports = MessageFormatter