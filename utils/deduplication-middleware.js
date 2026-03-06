/**
 * 请求去重中间件
 *
 * 防止短时间内重复请求，减轻服务器压力
 *
 * @example
 * ```js
 * const deduplication = require('./deduplication-middleware');
 * app.use('/api/sensitive', deduplication({ windowMs: 5000 }));
 * ```
 */

const { createHash } = require('crypto')

/**
 * 创建请求去重中间件
 * @param {Object} options - 配置选项
 * @param {number} options.windowMs - 去重时间窗口（毫秒）
 * @param {number} options.maxRequests - 时间窗口内允许的最大请求数
 * @param {Function} options.keyGenerator - 自定义键生成函数
 * @param {Array<string>} options.headers - 包含在哈希中的请求头
 * @param {boolean} options.includeQuery - 是否包含查询参数
 * @param {boolean} options.includeBody - 是否包含请求体
 * @param {string} options.message - 拒绝时的错误消息
 * @returns {Function} - Express 中间件
 */
function deduplicationMiddleware(options = {}) {
  const config = {
    windowMs: options.windowMs || 5000, // 默认 5 秒
    maxRequests: options.maxRequests || 1, // 默认只允许 1 次
    headers: options.headers || ['content-type', 'user-agent'],
    includeQuery: options.includeQuery !== false,
    includeBody: options.includeBody !== false,
    message: options.message || '请求过于频繁，请稍后再试',
    keyGenerator: options.keyGenerator || null
  }

  // 存储请求记录（内存中）
  const requestHistory = new Map()

  // 定期清理过期记录
  setInterval(() => {
    const now = Date.now()
    for (const [key, records] of requestHistory.entries()) {
      // 移除时间窗口外的记录
      const validRecords = records.filter(r => now - r.timestamp < config.windowMs)

      if (validRecords.length === 0) {
        requestHistory.delete(key)
      } else {
        requestHistory.set(key, validRecords)
      }
    }
  }, config.windowMs)

  return function deduplication(req, res, next) {
    // 不处理 GET 请求（通常是幂等的）
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next()
    }

    // 生成请求指纹
    const fingerprint = config.keyGenerator
      ? config.keyGenerator(req)
      : generateFingerprint(req, config)

    // 检查是否重复请求
    const records = requestHistory.get(fingerprint) || []
    const now = Date.now()

    // 过滤时间窗口外的记录
    const validRecords = records.filter(r => now - r.timestamp < config.windowMs)

    // 检查是否超过限制
    if (validRecords.length >= config.maxRequests) {
      const oldestRecord = validRecords[0]
      const waitTime = Math.ceil((config.windowMs - (now - oldestRecord.timestamp)) / 1000)

      return res.status(429).json({
        success: false,
        message: config.message,
        error: {
          code: 'TOO_MANY_REQUESTS',
          http_status: 429,
          details: {
            retry_after: waitTime + 's',
            fingerprint: fingerprint.substring(0, 16) + '...'
          }
        }
      })
    }

    // 记录本次请求
    validRecords.push({
      timestamp: now,
      ip: req.ip || req.connection.remoteAddress
    })

    requestHistory.set(fingerprint, validRecords)

    next()
  }
}

/**
 * 生成请求指纹
 * @private
 */
function generateFingerprint(req, config) {
  const components = []

  // 1. 请求方法
  components.push(req.method)

  // 2. 请求路径
  components.push(req.path)

  // 3. 请求头（选择性）
  if (config.headers && config.headers.length > 0) {
    const headers = config.headers
      .map(h => req.headers[h.toLowerCase()])
      .filter(Boolean)
      .join('|')
    components.push(headers)
  }

  // 4. 查询参数
  if (config.includeQuery && req.query && Object.keys(req.query).length > 0) {
    const query = Object.keys(req.query)
      .sort()
      .map(k => `${k}=${req.query[k]}`)
      .join('&')
    components.push(query)
  }

  // 5. 请求体（仅对非 GET 请求）
  if (config.includeBody && req.body && Object.keys(req.body).length > 0) {
    try {
      const body = JSON.stringify(req.body)
      components.push(body)
    } catch (err) {
      // 忽略无法序列化的请求体
    }
  }

  // 生成哈希
  const data = components.join('||')
  return createHash('sha256').update(data).digest('hex')
}

/**
 * 创建基于 IP 的简单去重中间件
 * @param {Object} options - 配置选项
 */
function createIpBasedDeduplication(options = {}) {
  return deduplicationMiddleware({
    ...options,
    keyGenerator: (req) => {
      // 基于 IP + 路径去重
      const ip = req.ip || req.connection.remoteAddress || 'unknown'
      return createHash('sha256')
        .update(`${ip}:${req.method}:${req.path}`)
        .digest('hex')
    }
  })
}

/**
 * 创建基于用户的去重中间件（需要身份验证）
 * @param {Function} userExtractor - 从请求中提取用户 ID 的函数
 * @param {Object} options - 配置选项
 */
function createUserBasedDeduplication(userExtractor, options = {}) {
  return deduplicationMiddleware({
    ...options,
    keyGenerator: (req) => {
      try {
        const userId = userExtractor(req)
        if (!userId) {
          // 如果未提取到用户 ID，回退到基于 IP
          const ip = req.ip || req.connection.remoteAddress || 'unknown'
          return createHash('sha256')
            .update(`${ip}:${req.method}:${req.path}`)
            .digest('hex')
        }

        return createHash('sha256')
          .update(`${userId}:${req.method}:${req.path}`)
          .digest('hex')
      } catch (err) {
        // 出错时回退到默认行为
        return generateFingerprint(req, options)
      }
    }
  })
}

/**
 * 获取去重统计信息
 */
function getStats() {
  // 这个功能可以扩展为返回去重命中率等统计信息
  return {
    message: '去重统计功能待实现'
  }
}

module.exports = deduplicationMiddleware
module.exports.createIpBasedDeduplication = createIpBasedDeduplication
module.exports.createUserBasedDeduplication = createUserBasedDeduplication
module.exports.getStats = getStats
