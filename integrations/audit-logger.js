const fs = require('fs')
const path = require('path')

class AuditLogger {
  constructor() {
    this.enabled = process.env.AUDIT_LOG_ENABLED !== 'false'
    this.agentEnabled = process.env.AUDIT_LOG_AGENT_IO !== 'false'
    this.botEnabled = process.env.AUDIT_LOG_BOT_TRANSFORM !== 'false'
    this.maxFieldLength = parseInt(process.env.AUDIT_LOG_MAX_FIELD_LENGTH || '8000', 10)
    this.logDir = path.resolve(process.cwd(), process.env.AUDIT_LOG_DIR || './logs')
    this.redactKeys = (process.env.AUDIT_LOG_REDACT_KEYS || 'clientSecret,token,authorization,webhook,secret')
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(Boolean)
  }

  _ensureDir() {
    if (!this.enabled) return
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }
  }

  _datePart() {
    return new Date().toISOString().slice(0, 10)
  }

  _maskValue(value) {
    if (typeof value !== 'string') return value
    if (value.length <= 8) return '***'
    return `${value.slice(0, 4)}***${value.slice(-3)}`
  }

  _sanitize(obj, seen = new WeakSet()) {
    if (obj === null || obj === undefined) return obj
    if (typeof obj === 'string') {
      if (obj.length > this.maxFieldLength) {
        return `${obj.slice(0, this.maxFieldLength)}...[truncated:${obj.length}]`
      }
      return obj
    }
    if (typeof obj !== 'object') return obj
    if (seen.has(obj)) return '[Circular]'
    seen.add(obj)

    if (Array.isArray(obj)) {
      return obj.map(item => this._sanitize(item, seen))
    }

    const out = {}
    for (const [k, v] of Object.entries(obj)) {
      const key = k.toLowerCase()
      if (this.redactKeys.some(maskKey => key.includes(maskKey))) {
        out[k] = this._maskValue(v)
      } else {
        out[k] = this._sanitize(v, seen)
      }
    }
    return out
  }

  _append(fileName, record) {
    if (!this.enabled) return
    this._ensureDir()
    const filePath = path.join(this.logDir, fileName)
    const line = JSON.stringify(this._sanitize(record)) + '\n'
    fs.promises.appendFile(filePath, line, 'utf8').catch(() => {})
  }

  logAgent(event, data = {}) {
    if (!this.enabled || !this.agentEnabled) return
    this._append(`agent-raw-${this._datePart()}.jsonl`, {
      ts: new Date().toISOString(),
      event,
      ...data
    })
  }

  logBot(event, data = {}) {
    if (!this.enabled || !this.botEnabled) return
    this._append(`bot-raw-${this._datePart()}.jsonl`, {
      ts: new Date().toISOString(),
      event,
      ...data
    })
  }
}

module.exports = new AuditLogger()

