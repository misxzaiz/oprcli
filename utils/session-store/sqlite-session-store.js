const fs = require('fs')
const path = require('path')

class SqliteSessionStore {
  constructor(dbPath) {
    this.dbPath = dbPath
    this.db = null
  }

  async init() {
    const dir = path.dirname(this.dbPath)
    await fs.promises.mkdir(dir, { recursive: true })

    const sqlite = require('node:sqlite')
    this.db = new sqlite.DatabaseSync(this.dbPath)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dingtalk_sessions (
        conversation_id TEXT PRIMARY KEY,
        session_id TEXT,
        provider TEXT,
        start_time INTEGER,
        updated_at INTEGER
      )
    `)
  }

  async loadAll() {
    const stmt = this.db.prepare(`
      SELECT conversation_id, session_id, provider, start_time, updated_at
      FROM dingtalk_sessions
    `)
    const rows = stmt.all()
    return rows.map(row => ({
      conversationId: row.conversation_id,
      sessionId: row.session_id,
      provider: row.provider,
      startTime: row.start_time,
      updatedAt: row.updated_at
    }))
  }

  async upsert({ conversationId, sessionId, provider, startTime, updatedAt }) {
    const stmt = this.db.prepare(`
      INSERT INTO dingtalk_sessions (conversation_id, session_id, provider, start_time, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(conversation_id) DO UPDATE SET
        session_id = excluded.session_id,
        provider = excluded.provider,
        start_time = excluded.start_time,
        updated_at = excluded.updated_at
    `)
    stmt.run(conversationId, sessionId, provider, startTime, updatedAt)
  }

  async delete(conversationId) {
    const stmt = this.db.prepare('DELETE FROM dingtalk_sessions WHERE conversation_id = ?')
    stmt.run(conversationId)
  }

  async clear() {
    this.db.exec('DELETE FROM dingtalk_sessions')
  }
}

module.exports = SqliteSessionStore
