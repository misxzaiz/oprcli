/**
 * 自定义中间件集合
 * 提供请求跟踪、错误处理等功能
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
  requestIdMiddleware,
  errorHandlerMiddleware,
  notFoundMiddleware,
  validateEnv,
  asyncHandler
}
