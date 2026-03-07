const fs = require('fs')
const path = require('path')
const JsonSessionStore = require('./json-session-store')
const SqliteSessionStore = require('./sqlite-session-store')

async function migrateJsonToSqlite({ sqliteStore, jsonPath, logger }) {
  if (!fs.existsSync(jsonPath)) {
    return 0
  }

  let raw
  try {
    raw = await fs.promises.readFile(jsonPath, 'utf8')
  } catch (error) {
    logger?.warning?.('DINGTALK', `读取 JSON 会话失败，跳过迁移: ${error.message}`)
    return 0
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    logger?.warning?.('DINGTALK', `JSON 会话格式错误，跳过迁移: ${error.message}`)
    return 0
  }

  if (!parsed || typeof parsed !== 'object') {
    return 0
  }

  const existing = await sqliteStore.loadAll()
  if (existing.length > 0) {
    return 0
  }

  let migrated = 0
  for (const [conversationId, session] of Object.entries(parsed)) {
    if (!conversationId || !session || typeof session !== 'object') {
      continue
    }
    await sqliteStore.upsert({
      conversationId,
      sessionId: session.sessionId || null,
      provider: session.provider || null,
      startTime: session.startTime || Date.now(),
      updatedAt: session.updatedAt || Date.now()
    })
    migrated++
  }

  if (migrated > 0) {
    logger?.info?.('DINGTALK', `已从 JSON 迁移 ${migrated} 条会话到 SQLite`)
  }

  return migrated
}

async function createSessionPersistence(logger, options = {}) {
  const driver = (options.driver || process.env.SESSION_STORE_DRIVER || 'sqlite').toLowerCase()
  const sqlitePath = options.sqlitePath || process.env.SESSION_STORE_SQLITE_PATH || path.join(process.cwd(), 'data', 'oprcli.db')
  const jsonPath = options.jsonPath || process.env.SESSION_STORE_JSON_PATH || path.join(process.cwd(), 'data', 'dingtalk-sessions.json')

  if (driver === 'json') {
    const jsonStore = new JsonSessionStore(jsonPath)
    await jsonStore.init()
    logger?.info?.('DINGTALK', `会话存储已启用 JSON: ${jsonPath}`)
    return jsonStore
  }

  if (driver !== 'sqlite') {
    logger?.warning?.('DINGTALK', `未知会话驱动 ${driver}，将自动使用 sqlite->json 回退策略`)
  }

  try {
    const sqliteStore = new SqliteSessionStore(sqlitePath)
    await sqliteStore.init()
    await migrateJsonToSqlite({ sqliteStore, jsonPath, logger })
    logger?.info?.('DINGTALK', `会话存储已启用 SQLite: ${sqlitePath}`)
    return sqliteStore
  } catch (error) {
    logger?.warning?.('DINGTALK', `SQLite 不可用，回退 JSON 存储: ${error.message}`)
    const jsonStore = new JsonSessionStore(jsonPath)
    await jsonStore.init()
    logger?.info?.('DINGTALK', `会话存储已启用 JSON: ${jsonPath}`)
    return jsonStore
  }
}

module.exports = {
  createSessionPersistence,
  migrateJsonToSqlite,
  JsonSessionStore,
  SqliteSessionStore
}
