/**
 * 自定义错误类
 * 提供统一的错误处理和响应格式
 *
 * @version 1.0.0
 */

/**
 * 基础应用错误
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.isOperational = true // 标记为可操作的错误
    Error.captureStackTrace(this, this.constructor)
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode
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
  ServiceUnavailableError
}
