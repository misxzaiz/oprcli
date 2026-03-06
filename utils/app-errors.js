/**
 * 自定义错误类
 * 提供统一的错误处理和响应格式
 *
 * @version 1.1.0
 * @updated 2026-03-05 - 添加错误统计功能
 */

/**
 * 错误统计器
 * 跟踪和分析系统错误
 */
class ErrorStats {
  constructor() {
    this.errorCounts = new Map() // 错误类型计数
    this.errorCountsByCode = new Map() // 错误代码计数
    this.recentErrors = [] // 最近错误记录
    this.maxRecentErrors = 100 // 最大记录数
  }

  /**
   * 记录错误
   * @param {Error} error - 错误对象
   */
  recordError(error) {
    const errorType = error.constructor.name
    const errorCode = error.code || 'UNKNOWN'

    // 更新错误类型计数
    if (!this.errorCounts.has(errorType)) {
      this.errorCounts.set(errorType, 0)
    }
    this.errorCounts.set(errorType, this.errorCounts.get(errorType) + 1)

    // 更新错误代码计数
    if (!this.errorCountsByCode.has(errorCode)) {
      this.errorCountsByCode.set(errorCode, 0)
    }
    this.errorCountsByCode.set(errorCode, this.errorCountsByCode.get(errorCode) + 1)

    // 记录最近的错误
    this.recentErrors.push({
      timestamp: new Date().toISOString(),
      type: errorType,
      code: errorCode,
      message: error.message,
      statusCode: error.statusCode || 500
    })

    // 保持最近错误记录在限制内
    if (this.recentErrors.length > this.maxRecentErrors) {
      this.recentErrors.shift()
    }
  }

  /**
   * 获取错误统计
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      totalErrors: Array.from(this.errorCounts.values()).reduce((a, b) => a + b, 0),
      byType: Object.fromEntries(this.errorCounts),
      byCode: Object.fromEntries(this.errorCountsByCode)
    }
  }

  /**
   * 获取最近的错误
   * @param {number} limit - 返回数量
   * @returns {Array} 最近错误列表
   */
  getRecentErrors(limit = 20) {
    return this.recentErrors.slice(-limit).reverse()
  }

  /**
   * 重置统计
   */
  reset() {
    this.errorCounts.clear()
    this.errorCountsByCode.clear()
    this.recentErrors = []
  }
}

// 全局错误统计器实例
const globalErrorStats = new ErrorStats()

/**
 * 基础应用错误
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.isOperational = true // 标记为可操作的错误
    this.timestamp = new Date().toISOString()
    Error.captureStackTrace(this, this.constructor)

    // 自动记录到统计器
    globalErrorStats.recordError(this)
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp
    }
  }
}

/**
 * 400 - 请求参数错误
 */
class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 400, 'VALIDATION_ERROR')
    if (field) {
      this.field = field
    }
  }
}

/**
 * 401 - 未授权
 */
class UnauthorizedError extends AppError {
  constructor(message = '未授权访问') {
    super(message, 401, 'UNAUTHORIZED')
  }
}

/**
 * 403 - 禁止访问
 */
class ForbiddenError extends AppError {
  constructor(message = '禁止访问') {
    super(message, 403, 'FORBIDDEN')
  }
}

/**
 * 404 - 资源未找到
 */
class NotFoundError extends AppError {
  constructor(message = '资源未找到') {
    super(message, 404, 'NOT_FOUND')
  }
}

/**
 * 409 - 资源冲突
 */
class ConflictError extends AppError {
  constructor(message = '资源冲突') {
    super(message, 409, 'CONFLICT')
  }
}

/**
 * 429 - 请求过于频繁
 */
class RateLimitError extends AppError {
  constructor(message = '请求过于频繁，请稍后再试', retryAfter = 60) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED')
    this.retryAfter = retryAfter
  }
}

/**
 * 500 - 服务器内部错误
 */
class InternalServerError extends AppError {
  constructor(message = '服务器内部错误') {
    super(message, 500, 'INTERNAL_ERROR')
  }
}

/**
 * 503 - 服务不可用
 */
class ServiceUnavailableError extends AppError {
  constructor(message = '服务暂时不可用') {
    super(message, 503, 'SERVICE_UNAVAILABLE')
  }
}

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalServerError,
  ServiceUnavailableError,
  ErrorStats,
  globalErrorStats
}
