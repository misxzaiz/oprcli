class RobotEventFormatter {
  constructor(options = {}) {
    this.maxChars = options.maxChars || 1200
  }

  _trim(text) {
    if (!text) return ''
    const raw = String(text).trim()
    if (raw.length <= this.maxChars) return raw
    return `${raw.slice(0, this.maxChars)}...(截断:${raw.length})`
  }

  _safeJson(value) {
    if (value === undefined || value === null) return ''
    try {
      return this._trim(typeof value === 'string' ? value : JSON.stringify(value))
    } catch (_) {
      return this._trim(String(value))
    }
  }

  format(eventType, event, extractedText, ctx = {}) {
    const profile = ctx.profile || 'standard'
    const elapsedMs = Number(ctx.elapsedMs || 0)
    const elapsedSec = (elapsedMs / 1000).toFixed(1)

    console.log('[eventType] eventType:', eventType);
    console.log('[event] event:', event);
    console.log('[extractedText] extractedText:', extractedText);
    console.log('[ctx] ctx:', ctx);

    if (eventType === 'assistant_chunk' || eventType === 'result') {
      // 优先使用 extractedText，然后尝试其他字段（包括 Agent 的 content 字段）
      const text = this._trim(extractedText || event?.result || event?.text || event?.content || '')
      if (!text) return ''
      return `💬 ${text}`
    }

    if (eventType === 'thinking_exposed') {
      const thinking = this._trim(event?.delta?.text || event?.thinking || extractedText || '')
      if (!thinking) return ''
      return `🤔 思考：${thinking}`
    }

    if (eventType === 'tool_use') {
      const toolName = event?.name || event?.tool_name || event?.tool || event?.extra?.name || 'unknown'
      const action = event?.action || event?.method || event?.command || event?.extra?.action
      const input = event?.input ?? event?.arguments ?? event?.params ?? event?.extra?.input
      const actionLine = action ? `\n⚙️ 动作：${this._trim(action)}` : ''
      const inputLine = input !== undefined ? `\n📥 参数：${this._safeJson(input)}` : ''
      return `🛠 工具调用：${toolName}${actionLine}${inputLine}`
    }

    if (eventType === 'tool_result') {
      const ok = event?.ok === false || event?.success === false ? '失败' : '完成'
      const output = this._safeJson(event?.output || extractedText || event?.result || event?.text || '')
      const outputLine = output ? `\n📤 结果：${output}` : ''
      return `🧩 工具结果：${ok}${outputLine}`
    }

    if (eventType === 'http_request') {
      if (profile === 'compact') return ''
      const method = event?.method || event?.request?.method || 'GET'
      const url = event?.url || event?.request?.url || ''
      return `🌐 请求：${method} ${this._trim(url)}`
    }

    if (eventType === 'http_response') {
      if (profile === 'compact') return ''
      const status = event?.status || event?.response?.status || 'unknown'
      const url = event?.url || event?.request?.url || ''
      return `📡 响应：${status}${url ? ` ${this._trim(url)}` : ''}`
    }

    if (eventType === 'error') {
      const err = this._trim(event?.error || event?.message || extractedText || '未知错误')
      return `❌ 异常：${err}`
    }

    if (eventType === 'end') {
      const responseType = ctx.finalResponseType ? `，类型：${ctx.finalResponseType}` : ''
      return `✅ 已结束（⏰ ${elapsedSec}秒${responseType}）`
    }

    if (eventType === 'start') {
      return '🕒 开始处理请求'
    }

    return ''
  }
}

module.exports = RobotEventFormatter
