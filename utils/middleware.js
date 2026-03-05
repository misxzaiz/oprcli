/**
 * 自定义中间件集合
 * 提供请求跟踪、错误处理、安全增强等功能
 *
 * @version 2.2.0
 * @lastUpdated 2026-03-05
 * @changelog 集成请求统计工具，增强性能监控
 */

const { randomUUID } = require('crypto')
const { globalRequestStats } = require('./request-stats')

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
 * 安全头中间件（增强版）
 * 添加基本的安全响应头（如果 helmet 不可用）
 * @version 2.0.0 - 添加 CSP 和 Permissions-Policy
 */
function securityHeadersMiddleware(options = {}) {
  const {
    // CSP 配置
    enableCSP = true,
    cspDirectives = null,
    // Permissions-Policy 配置
    enablePermissionsPolicy = true,
    permissionsPolicy = null,
    // 其他安全头
    frameOptions = 'DENY', // DENY | SAMEORIGIN | ALLOW-FROM
    referrerPolicy = 'strict-origin-when-cross-origin'
  } = options

  return (req, res, next) => {
    // 防止点击劫持
    res.setHeader('X-Frame-Options', frameOptions)

    // 防止 MIME 类型嗅探
    res.setHeader('X-Content-Type-Options', 'nosniff')

    // 启用浏览器 XSS 过滤（虽然已被 CSP 弃用，但仍可使用）
    res.setHeader('X-XSS-Protection', '1; mode=block')

    // 限制引用来源
    res.setHeader('Referrer-Policy', referrerPolicy)

    // 🆕 Content-Security-Policy (CSP)
    if (enableCSP) {
      const defaultCSP = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'"
      ].join('; ')

      const csp = cspDirectives || defaultCSP
      res.setHeader('Content-Security-Policy', csp)
    }

    // 🆕 Permissions-Policy (原 Feature-Policy)
    if (enablePermissionsPolicy) {
      const defaultPermissions = [
        'geolocation=()',
        'microphone=()',
        'camera=()',
        'payment=()',
        'usb=()',
        'magnetometer=()',
        'gyroscope=()',
        'accelerometer=()'
      ].join(', ')

      const permissions = permissionsPolicy || defaultPermissions
      res.setHeader('Permissions-Policy', permissions)
    }

    // 🆕 Cross-Origin-Opener-Policy
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')

    // 🆕 Cross-Origin-Resource-Policy
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')

    // 🆕 Cross-Origin-Embedder-Policy
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')

    next()
  }
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
 * 🆕 请求体大小限制中间件（2026-03-05）
 * 防止大文件攻击和内存溢出
 * @param {Object} options - 配置选项
 * @returns {Function} Express 中间件
 */
function requestSizeLimitMiddleware(options = {}) {
  const {
    maxBodySize = 10 * 1024 * 1024, // 默认 10MB
    maxUrlLength = 2000, // 默认 2000 字符
    throwOnLimit = true // 是否抛出错误
  } = options

  return (req, res, next) => {
    // 检查 URL 长度
    const urlLength = req.originalUrl?.length || 0
    if (urlLength > maxUrlLength) {
      req.logger?.warn('SECURITY', `URL 长度超限 [${req.id}]`, {
        urlLength,
        maxUrlLength,
        url: req.originalUrl.substring(0, 100)
      })

      if (throwOnLimit) {
        return res.status(414).json({
          success: false,
          error: {
            code: 'URI_TOO_LONG',
            message: '请求 URL 过长',
            maxLength: maxUrlLength
          }
        })
      }
    }

    // 检查 Content-Length
    const contentLength = parseInt(req.headers['content-length'] || '0', 10)
    if (contentLength > maxBodySize) {
      req.logger?.warn('SECURITY', `请求体大小超限 [${req.id}]`, {
        contentLength,
        maxBodySize,
        contentType: req.headers['content-type']
      })

      if (throwOnLimit) {
        return res.status(413).json({
          success: false,
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: '请求体过大',
            maxSize: `${(maxBodySize / 1024 / 1024).toFixed(2)}MB`,
            receivedSize: `${(contentLength / 1024 / 1024).toFixed(2)}MB`
          }
        })
      }
    }

    // 添加请求体大小监控
    if (contentLength > 0) {
      req.bodySize = contentLength
    }

    next()
  }
}

/**
 * 性能监控中间件（增强版）
 * 记录请求处理时间和统计信息，集成全局请求统计
 */
function performanceMonitorMiddleware(logger) {
  const stats = {
    totalRequests: 0,
    totalErrors: 0,
    avgResponseTime: 0,
    routes: {},
    maxRoutes: 1000, // 最大路由统计数（防止内存泄漏）
    lastCleanup: Date.now()
  }

  /**
   * 清理旧的路由统计（防止内存泄漏）
   * @private
   */
  function cleanupOldRoutes() {
    const routes = Object.entries(stats.routes)
    if (routes.length > stats.maxRoutes) {
      // 按请求数排序，保留最常访问的路由
      routes.sort((a, b) => b[1].count - a[1].count)

      // 删除最少访问的路由
      const toDelete = routes.slice(stats.maxRoutes)
      for (const [route] of toDelete) {
        delete stats.routes[route]
      }

      stats.lastCleanup = Date.now()
      logger?.debug('PERF', `已清理路由统计: ${toDelete.length} 条`)
    }
  }

  return (req, res, next) => {
    const startTime = Date.now()
    stats.totalRequests++

    // 记录响应
    res.on('finish', () => {
      const duration = Date.now() - startTime

      // 🆕 记录到全局请求统计器
      try {
        globalRequestStats.recordRequest(
          req.method,
          req.path,
          res.statusCode,
          duration
        )
      } catch (err) {
        // 静默失败，不影响主流程
      }

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
        stats.routes[routeKey] = { count: 0, totalTime: 0, errors: 0, lastAccess: Date.now() }
      }
      stats.routes[routeKey].count++
      stats.routes[routeKey].totalTime += duration
      stats.routes[routeKey].lastAccess = Date.now()
      if (res.statusCode >= 400) {
        stats.routes[routeKey].errors++
      }

      // 定期清理旧路由（每1000次请求检查一次）
      if (stats.totalRequests % 1000 === 0) {
        cleanupOldRoutes()
      }

      // 记录慢请求
      if (duration > 1000) {
        logger?.warn('PERF', `慢请求检测 [${req.id}]`, {
          path: req.path,
          method: req.method,
          duration: `${duration}ms`,
          statusCode: res.statusCode
        })
      }

      // 🆕 添加响应时间头
      if (!res.headersSent) {
        res.setHeader('X-Response-Time', `${duration}ms`)
      }
    })

    // 将统计对象附加到请求上
    req.performanceStats = stats
    next()
  }
}

/**
 * 获取性能统计信息（增强版）
 * 整合本地统计和全局统计
 */
function getPerformanceStats(localStats) {
  const localStatsData = {
    totalRequests: localStats.totalRequests,
    totalErrors: localStats.totalErrors,
    errorRate: localStats.totalRequests > 0
      ? `${(localStats.totalErrors / localStats.totalRequests * 100).toFixed(2)}%`
      : '0%',
    avgResponseTime: `${localStats.avgResponseTime.toFixed(0)}ms`,
    routes: Object.entries(localStats.routes).map(([route, data]) => ({
      route,
      requests: data.count,
      avgTime: `${(data.totalTime / data.count).toFixed(0)}ms`,
      errors: data.errors
    })).sort((a, b) => b.requests - a.requests).slice(0, 10) // Top 10 routes
  }

  // 🆕 合并全局统计
  const globalStats = globalRequestStats.getStats()
  const endpointStats = globalRequestStats.getEndpointStats(10)
  const windowStats = globalRequestStats.getWindowStats(60000)

  return {
    ...localStatsData,
    global: {
      totalRequests: globalStats.requestCount,
      successRate: globalStats.successRate,
      avgResponseTime: `${globalStats.responseTime.avg}ms`,
      minResponseTime: globalStats.responseTime.min,
      maxResponseTime: globalStats.responseTime.max,
      statusCodes: globalStats.statusCodes
    },
    window: {
      lastMinute: {
        requests: windowStats.count,
        rps: windowStats.requestsPerSecond,
        avgResponseTime: `${windowStats.avgResponseTime}ms`
      }
    },
    topEndpoints: endpointStats
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
  getPerformanceStats,

  // 🆕 新增中间件（2026-03-05 安全增强）
  requestSizeLimitMiddleware,

  // 🆕 导出请求统计工具（2026-03-05）
  globalRequestStats
}
