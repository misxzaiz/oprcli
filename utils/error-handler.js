/**
 * 增强的错误处理工具
 *
 * 功能：
 * - 统一的错误处理
 * - 详细的错误日志
 * - 错误分类和优先级
 * - 安全的错误响应
 * - 错误统计和报告
 *
 * @version 1.0.0
 */

const Logger = require('../integrations/logger')

// 错误类型枚举
const ErrorType = {
  VALIDATION: 'VALIDATION',
  AUTHENTICATION: 'AUTHENTICATION',
  AUTHORIZATION: 'AUTHORIZATION',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMIT: 'RATE_LIMIT',
  INTERNAL: 'INTERNAL',
  EXTERNAL: 'EXTERNAL',
  TIMEOUT: 'TIMEOUT',
  SECURITY: 'SECURITY'
}

// 错误严重级别
const ErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
}

class ErrorHandler {
  constructor(logger) {
    this.logger = logger || new Logger({ level: 'WARN' })
    this.errorStats = new Map() // 错误统计
  }

  /**
   * 创建标准化的错误响应
   */
  createErrorResponse(error, req) {
    // 如果是自定义错误
    if (error.type && error.severity) {
      return {
        success: false,
        error: error.message,
        errorType: error.type,
        requestId: req.id,
        timestamp: new Date().toISOString()
      }
    }

    // 默认错误响应
    return {
      success: false,
      error: this.sanitizeErrorMessage(error.message),
      requestId: req.id,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 清理错误消息（移除敏感信息）
   */
  sanitizeErrorMessage(message) {
    if (typeof message !== 'string') {
      return '发生未知错误'
    }

    // 移除敏感信息模式
    const sanitized = message
      .replace(/password["\s:=]+[^\s"']+/gi, 'password: ***')
      .replace(/token["\s:=]+[^\s"']+/gi, 'token: ***')
      .replace(/secret["\s:=]+[^\s"']+/gi, 'secret: ***')
      .replace(/key["\s:=]+[^\s"']+/gi, 'key: ***')
      .replace(/\b\d{16}\b/g, '***') // 信用卡号
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '***-**-****') // SSN
      .replace(/mongodb:\/\/[^@]+@/gi, 'mongodb://***@') // MongoDB 连接字符串
      .replace(/postgres:\/\/[^@]+@/gi, 'postgres://***@') // PostgreSQL 连接字符串

    return sanitized
  }

  /**
   * 分类错误
   */
  classifyError(error) {
    if (error.name === 'ValidationError') {
      return { type: ErrorType.VALIDATION, severity: ErrorSeverity.LOW }
    }

    if (error.name === 'UnauthorizedError' || error.name === 'AuthenticationError') {
      return { type: ErrorType.AUTHENTICATION, severity: ErrorSeverity.MEDIUM }
    }

    if (error.name === 'ForbiddenError' || error.name === 'AuthorizationError') {
      return { type: ErrorType.AUTHORIZATION, severity: ErrorSeverity.MEDIUM }
    }

    if (error.name === 'NotFoundError' || error.code === 'ENOENT') {
      return { type: ErrorType.NOT_FOUND, severity: ErrorSeverity.LOW }
    }

    if (error.name === 'ConflictError') {
      return { type: ErrorType.CONFLICT, severity: ErrorSeverity.MEDIUM }
    }

    if (error.name === 'RateLimitError' || error.name === 'TooManyRequestsError') {
      return { type: ErrorType.RATE_LIMIT, severity: ErrorSeverity.LOW }
    }

    if (error.name === 'TimeoutError' || error.code === 'ETIMEDOUT') {
      return { type: ErrorType.TIMEOUT, severity: ErrorSeverity.MEDIUM }
    }

    if (error.name === 'SecurityError') {
      return { type: ErrorType.SECURITY, severity: ErrorSeverity.HIGH }
    }

    // 外部服务错误
    if (error.message?.includes('ECONNREFUSED') ||
        error.message?.includes('ENOTFOUND') ||
        error.message?.includes('external service')) {
      return { type: ErrorType.EXTERNAL, severity: ErrorSeverity.MEDIUM }
    }

    // 默认为内部错误
    return { type: ErrorType.INTERNAL, severity: ErrorSeverity.HIGH }
  }

  /**
   * 记录错误
   */
  logError(error, req, context = {}) {
    const { type, severity } = this.classifyError(error)

    // 更新统计
    this.updateErrorStats(type, severity)

    // 构建日志上下文
    const logContext = {
      requestId: req.id,
      type,
      severity,
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      ...context
    }

    // 根据严重级别选择日志方法
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        this.logger.error('ERROR', this.sanitizeErrorMessage(error.message), logContext)
        // 对于严重错误，可以添加额外的处理，如发送告警
        this.handleCriticalError(error, logContext)
        break

      case ErrorSeverity.HIGH:
        this.logger.error('ERROR', this.sanitizeErrorMessage(error.message), logContext)
        break

      case ErrorSeverity.MEDIUM:
        this.logger.warn('WARN', this.sanitizeErrorMessage(error.message), logContext)
        break

      case ErrorSeverity.LOW:
        this.logger.debug('DEBUG', this.sanitizeErrorMessage(error.message), logContext)
        break
    }

    // 记录堆栈跟踪（仅在高严重级别时）
    if (severity === ErrorSeverity.HIGH || severity === ErrorSeverity.CRITICAL) {
      this.logger.debug('ERROR_STACK', error.stack, { requestId: req.id })
    }
  }

  /**
   * 更新错误统计
   */
  updateErrorStats(type, severity) {
    const key = `${type}:${severity}`
    const current = this.errorStats.get(key) || { count: 0, lastOccurrence: null }

    this.errorStats.set(key, {
      count: current.count + 1,
      lastOccurrence: new Date().toISOString()
    })
  }

  /**
   * 获取错误统计
   */
  getErrorStats() {
    const stats = {}

    this.errorStats.forEach((value, key) => {
      stats[key] = value
    })

    return stats
  }

  /**
   * 重置错误统计
   */
  resetErrorStats() {
    this.errorStats.clear()
  }

  /**
   * 处理严重错误
   */
  handleCriticalError(error, context) {
    // 这里可以添加严重错误的特殊处理
    // 例如：发送告警、写入专门的日志、触发自动恢复等

    this.logger.error('CRITICAL', '检测到严重错误', {
      error: this.sanitizeErrorMessage(error.message),
      context
    })

    // 可以在这里集成钉钉通知
    if (process.env.CRITICAL_ERROR_NOTIFICATION === 'true') {
      // 发送告警通知
      this.sendCriticalErrorAlert(error, context)
    }
  }

  /**
   * 发送严重错误告警
   */
  sendCriticalErrorAlert(error, context) {
    // 这里可以集成钉钉或其他通知渠道
    // 示例实现（需要根据实际通知系统调整）
    try {
      const alertMessage = `
【严重错误告警】

时间: ${new Date().toISOString()}
类型: ${context.type}
严重级别: ${context.severity}

错误信息: ${this.sanitizeErrorMessage(error.message)}

请求信息:
- 方法: ${context.method}
- 路径: ${context.path}
- 请求 ID: ${context.requestId}
- IP: ${context.ip}
      `.trim()

      // 调用通知系统（需要根据实际情况实现）
      // notificationService.send(alertMessage)

      this.logger.debug('ALERT', '严重错误告警已发送')
    } catch (err) {
      this.logger.error('ALERT', '发送告警失败', { error: err.message })
    }
  }

  /**
   * 创建 Express 错误处理中间件
   */
  createErrorMiddleware() {
    return (err, req, res, next) => {
      // 记录错误
      this.logError(err, req)

      // 创建错误响应
      const errorResponse = this.createErrorResponse(err, req)

      // 确定状态码
      let statusCode = 500
      const { type } = this.classifyError(err)

      switch (type) {
        case ErrorType.VALIDATION:
        case ErrorType.NOT_FOUND:
          statusCode = 400
          break
        case ErrorType.AUTHENTICATION:
          statusCode = 401
          break
        case ErrorType.AUTHORIZATION:
          statusCode = 403
          break
        case ErrorType.RATE_LIMIT:
          statusCode = 429
          break
        case ErrorType.CONFLICT:
          statusCode = 409
          break
        default:
          statusCode = 500
      }

      // 发送响应
      res.status(statusCode).json(errorResponse)
    }
  }

  /**
   * 创建异步错误包装器
   */
  asyncHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(err => {
        next(err)
      })
    }
  }

  /**
   * 创建自定义错误类
   */
  static createErrorClass(className, defaultType, defaultSeverity) {
    return class CustomError extends Error {
      constructor(message, type = defaultType, severity = defaultSeverity) {
        super(message)
        this.name = className
        this.type = type
        this.severity = severity
        Error.captureStackTrace(this, this.constructor)
      }
    }
  }
}

// 创建常用的自定义错误类
const ValidationError = ErrorHandler.createErrorClass(
  'ValidationError',
  ErrorType.VALIDATION,
  ErrorSeverity.LOW
)

const AuthenticationError = ErrorHandler.createErrorClass(
  'AuthenticationError',
  ErrorType.AUTHENTICATION,
  ErrorSeverity.MEDIUM
)

const AuthorizationError = ErrorHandler.createErrorClass(
  'AuthorizationError',
  ErrorType.AUTHORIZATION,
  ErrorSeverity.MEDIUM
)

const NotFoundError = ErrorHandler.createErrorClass(
  'NotFoundError',
  ErrorType.NOT_FOUND,
  ErrorSeverity.LOW
)

const ConflictError = ErrorHandler.createErrorClass(
  'ConflictError',
  ErrorType.CONFLICT,
  ErrorSeverity.MEDIUM
)

const RateLimitError = ErrorHandler.createErrorClass(
  'RateLimitError',
  ErrorType.RATE_LIMIT,
  ErrorSeverity.LOW
)

const SecurityError = ErrorHandler.createErrorClass(
  'SecurityError',
  ErrorType.SECURITY,
  ErrorSeverity.HIGH
)

const TimeoutError = ErrorHandler.createErrorClass(
  'TimeoutError',
  ErrorType.TIMEOUT,
  ErrorSeverity.MEDIUM
)

module.exports = {
  ErrorHandler,
  ErrorType,
  ErrorSeverity,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  SecurityError,
  TimeoutError
}
