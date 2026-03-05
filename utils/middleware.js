/**
 * 自定义中间件集合
 * 提供请求跟踪、错误处理、安全增强等功能
 *
 * @version 2.1.0
 * @lastUpdated 2026-03-05
 */

const { randomUUID } = require('crypto')

/**
 * 请求 ID 中间件
 * 为每个请求分配唯一的跟踪 ID
 */
function requestIdMiddleware(req, res, next) {
  req.id = req.headers['x-request-id'] || randomUUID()
  res.setHeader('X-Request-ID', req.id)
  next()
}

/**
 * 安全头中间件
 * 添加基本的安全响应头（如果 helmet 不可用）
 */
function securityHeadersMiddleware(req, res, next) {
  // 防止点击劫持
  res.setHeader('X-Frame-Options', 'DENY')
  // 防止 MIME 类型嗅探
  res.setHeader('X-Content-Type-Options', 'nosniff')
  // 启用浏览器 XSS 过滤
  res.setHeader('X-XSS-Protection', '1; mode=block')
  // 限制引用来源
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  next()
}

/**
 * CORS 配置中间件
 * 提供基本的跨域资源共享支持
 */
function corsMiddleware(options = {}) {
  const {
    origin = '*',
    methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders = ['Content-Type', 'Authorization'],
    credentials = false
  } = options

  return (req, res, next) => {
    // 设置允许的来源
    if (origin === '*') {
      res.setHeader('Access-Control-Allow-Origin', '*')
    } else if (typeof origin === 'function') {
      const originValue = origin(req)
      if (originValue) {
        res.setHeader('Access-Control-Allow-Origin', originValue)
      }
    } else {
      res.setHeader('Access-Control-Allow-Origin', origin)
    }

    // 设置允许的方法
    res.setHeader('Access-Control-Allow-Methods', methods.join(', '))

    // 设置允许的请求头
    res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(', '))

    // 设置是否允许凭证
    if (credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true')
    }

    // 处理预检请求
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Max-Age', '86400') // 24小时
      return res.status(204).end()
    }

    next()
  }
}

/**
 * 请求超时中间件
 * 为长时间运行的请求设置超时限制
 */
function requestTimeoutMiddleware(timeoutMs = 30000) {
  return (req, res, next) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(503).json({
          success: false,
          error: {
            message: '请求超时',
            timeout: timeoutMs
          }
        })
      }
    }, timeoutMs)

    // 清理定时器
    res.on('finish', () => clearTimeout(timeout))
    res.on('close', () => clearTimeout(timeout))
    res.on('error', () => clearTimeout(timeout))

    next()
  }
}

/**
 * HTTP 缓存头中间件
 * 为静态资源添加缓存控制
 */
function cacheControlMiddleware(options = {}) {
  const {
    maxAge = 3600, // 默认1小时
    public = true,
    immutable = false
  } = options

  return (req, res, next) => {
    const cacheDirectives = []

    if (public) cacheDirectives.push('public')
    else cacheDirectives.push('private')

    if (immutable) cacheDirectives.push('immutable')

    cacheDirectives.push(`max-age=${maxAge}`)

    res.setHeader('Cache-Control', cacheDirectives.join(', '))
    next()
  }
}

/**
 * 性能监控中间件
 * 记录请求处理时间和统计信息
 */
function performanceMonitorMiddleware(logger) {
  const stats = {
    totalRequests: 0,
    totalErrors: 0,
    avgResponseTime: 0,
    routes: {}
  }

  return (req, res, next) => {
    const startTime = Date.now()
    stats.totalRequests++

    // 记录响应
    res.on('finish', () => {
      const duration = Date.now() - startTime

      // 更新平均响应时间
      stats.avgResponseTime =
        (stats.avgResponseTime * (stats.totalRequests - 1) + duration) / stats.totalRequests

      // 记录错误
      if (res.statusCode >= 400) {
        stats.totalErrors++
      }

      // 记录路由统计
      const routeKey = `${req.method} ${req.path}`
      if (!stats.routes[routeKey]) {
        stats.routes[routeKey] = { count: 0, totalTime: 0, errors: 0 }
      }
      stats.routes[routeKey].count++
      stats.routes[routeKey].totalTime += duration
      if (res.statusCode >= 400) {
        stats.routes[routeKey].errors++
      }

      // 记录慢请求
      if (duration > 1000) {
        logger.warn('PERF', `慢请求检测 [${req.id}]`, {
          path: req.path,
          method: req.method,
          duration: `${duration}ms`,
          statusCode: res.statusCode
        })
      }
    })

    // 将统计对象附加到请求上
    req.performanceStats = stats
    next()
  }
}

/**
 * 获取性能统计信息
 */
function getPerformanceStats(stats) {
  return {
    totalRequests: stats.totalRequests,
    totalErrors: stats.totalErrors,
    errorRate: stats.totalRequests > 0
      ? `${(stats.totalErrors / stats.totalRequests * 100).toFixed(2)}%`
      : '0%',
    avgResponseTime: `${stats.avgResponseTime.toFixed(0)}ms`,
    routes: Object.entries(stats.routes).map(([route, data]) => ({
      route,
      requests: data.count,
      avgTime: `${(data.totalTime / data.count).toFixed(0)}ms`,
      errors: data.errors
    })).sort((a, b) => b.requests - a.requests).slice(0, 10) // Top 10 routes
  }
}

/**
 * 全局错误处理中间件
 * 捕获所有未处理的错误
 */
function errorHandlerMiddleware(logger) {
  return (err, req, res, next) => {
    const errorId = randomUUID()

    logger.error('SERVER', `未处理的错误 [${errorId}]`, {
      errorId,
      message: err.message,
      stack: err.stack,
      requestId: req.id,
      path: req.path,
      method: req.method
    })

    // 根据环境决定返回详细程度
    const isDevelopment = process.env.NODE_ENV === 'development'

    res.status(err.status || 500).json({
      success: false,
      error: {
        id: errorId,
        message: isDevelopment ? err.message : '服务器内部错误',
        ...(isDevelopment && { stack: err.stack })
      }
    })
  }
}

/**
 * 404 处理中间件
 */
function notFoundMiddleware(req, res) {
  res.status(404).json({
    success: false,
    error: {
      message: '接口不存在',
      path: req.path,
      method: req.method
    }
  })
}

/**
 * 环境变量验证中间件
 * 启动前检查必需的环境变量
 */
function validateEnv(requiredVars = []) {
  const missing = []

  for (const envVar of requiredVars) {
    if (!process.env[envVar]) {
      missing.push(envVar)
    }
  }

  if (missing.length > 0) {
    throw new Error(`缺少必需的环境变量: ${missing.join(', ')}`)
  }
}

/**
 * 异步错误包装器
 * 用于路由处理器中捕获异步错误
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

module.exports = {
  // 原有中间件
  requestIdMiddleware,
  errorHandlerMiddleware,
  notFoundMiddleware,
  validateEnv,
  asyncHandler,

  // 🆕 新增中间件（2026-03-05）
  securityHeadersMiddleware,
  corsMiddleware,
  requestTimeoutMiddleware,
  cacheControlMiddleware,
  performanceMonitorMiddleware,
  getPerformanceStats
}
