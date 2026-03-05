/**
 * 速率限制中间件
 * 基于 IP 的请求速率限制，防止 API 滥用
 *
 * @version 1.0.0
 */

const MemoryStore = require('./rate-limiter-memory')

/**
 * 创建速率限制中间件
 * @param {Object} options - 配置选项
 * @param {number} options.windowMs - 时间窗口（毫秒）
 * @param {number} options.maxRequests - 最大请求次数
 * @param {string} options.message - 限制消息
 * @param {boolean} options.skipSuccessfulRequests - 是否跳过成功请求
 * @returns {Function} Express 中间件
 */
function createRateLimit(options = {}) {
  const {
    windowMs = 60 * 1000, // 默认1分钟
    maxRequests = 100, // 默认100次
    message = '请求过于频繁，请稍后再试',
    skipSuccessfulRequests = false,
    keyGenerator = null // 自定义 key 生成器
  } = options

  const store = new MemoryStore(windowMs)

  return (req, res, next) => {
    // 生成限制 key（默认使用 IP）
    const key = keyGenerator ? keyGenerator(req) : getClientIP(req)

    // 检查是否超过限制
    const result = store.increment(key)
    const exceeded = result.count > maxRequests

    if (exceeded) {
      // 设置速率限制头
      res.setHeader('X-RateLimit-Limit', maxRequests)
      res.setHeader('X-RateLimit-Remaining', 0)
      res.setHeader('X-RateLimit-Reset', new Date(Date.now() + windowMs).toISOString())

      // 记录速率限制事件
      req.logger?.warn('RATE_LIMIT', `速率限制触发 [${req.id}]`, {
        ip: key,
        limit: maxRequests,
        window: `${windowMs}ms`
      })

      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message,
          retryAfter: Math.ceil(windowMs / 1000)
        }
      })
    }

    // 设置速率限制头
    res.setHeader('X-RateLimit-Limit', maxRequests)
    res.setHeader('X-RateLimit-Remaining', maxRequests - result.count)
    res.setHeader('X-RateLimit-Reset', new Date(result.resetTime).toISOString())

    // 如果配置了跳过成功请求，监听响应
    if (skipSuccessfulRequests) {
      res.on('finish', () => {
        if (res.statusCode < 400) {
          store.reset(key)
        }
      })
    }

    next()
  }
}

/**
 * 获取客户端 IP 地址
 * @param {Object} req - Express 请求对象
 * @returns {string} IP 地址
 */
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         req.ip ||
         'unknown'
}

/**
 * 创建不同场景的速率限制器
 */

// 严格限制（用于敏感操作）
function createStrictRateLimit() {
  return createRateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    maxRequests: 5,
    message: '敏感操作请求过于频繁，请15分钟后再试'
  })
}

// 中等限制（用于 API 端点）
function createMediumRateLimit() {
  return createRateLimit({
    windowMs: 60 * 1000, // 1分钟
    maxRequests: 60,
    message: 'API 请求过于频繁，请稍后再试'
  })
}

// 宽松限制（用于一般请求）
function createLooseRateLimit() {
  return createRateLimit({
    windowMs: 60 * 1000, // 1分钟
    maxRequests: 200,
    message: '请求过于频繁，请稍后再试'
  })
}

module.exports = {
  createRateLimit,
  createStrictRateLimit,
  createMediumRateLimit,
  createLooseRateLimit,
  getClientIP
}
