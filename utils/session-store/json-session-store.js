const fs = require('fs')
const path = require('path')

class JsonSessionStore {
  constructor(filePath) {
    this.filePath = filePath
    this.data = {}
  }

  async init() {
    const dir = path.dirname(this.filePath)
    await fs.promises.mkdir(dir, { recursive: true })
    await this._load()
  }

  async _load() {
    try {
      const raw = await fs.promises.readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw)
      this.data = parsed && typeof parsed === 'object' ? parsed : {}
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
      this.data = {}
    }
  }

  async _save() {
    await fs.promises.writeFile(this.filePath, JSON.stringify(this.data, null, 2), 'utf8')
  }

  async loadAll() {
    return Object.entries(this.data).map(([conversationId, session]) => ({
      conversationId,
      sessionId: session.sessionId || null,
      provider: session.provider || null,
      startTime: session.startTime || Date.now(),
      updatedAt: session.updatedAt || Date.now()
    }))
  }

  async upsert({ conversationId, sessionId, provider, startTime, updatedAt }) {
    this.data[conversationId] = { sessionId, provider, startTime, updatedAt }
    await this._save()
  }

  async delete(conversationId) {
    delete this.data[conversationId]
    await this._save()
  }

  async clear() {
    this.data = {}
    await this._save()
  }
}

module.exports = JsonSessionStore
