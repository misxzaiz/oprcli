const crypto = require('crypto')

class RobotDedup {
  constructor(windowMs = 5000) {
    this.windowMs = Number(windowMs) || 5000
    this.cache = new Map()
  }

  _hash(text) {
    return crypto.createHash('sha1').update(String(text || '')).digest('hex')
  }

  _isMeaningful(text) {
    const v = String(text || '').trim()
    if (!v) return false
    if (/^\[[A-Z_]+\]$/.test(v)) return false
    if (/^[\[\]A-Z_]+$/.test(v)) return false
    return true
  }

  shouldSend(traceId, eventType, text) {
    if (!this._isMeaningful(text)) {
      return { send: false, reason: 'empty_or_label_only' }
    }

    const now = Date.now()
    const normalized = String(text).trim()
    const typeGroup = (eventType === 'assistant_chunk' || eventType === 'result') ? 'assistant_text' : (eventType || 'unknown')
    const key = `${traceId || 'na'}|${typeGroup}|${this._hash(normalized)}`
    const last = this.cache.get(key)

    if (last && now - last < this.windowMs) {
      return { send: false, reason: 'dedup_window' }
    }

    this.cache.set(key, now)
    if (this.cache.size > 2000) {
      for (const [k, ts] of this.cache.entries()) {
        if (now - ts > this.windowMs * 6) this.cache.delete(k)
      }
    }
    return { send: true, reason: 'ok' }
  }
}

module.exports = RobotDedup
