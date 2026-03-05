/**
 * 统一响应格式工具
 *
 * 提供标准化的 API 响应格式，便于前端处理和错误追踪
 *
 * @example
 * ```js
 * const formatter = new ResponseFormatter();
 * res.json(formatter.success({ data: 'value' }));
 * res.json(formatter.error('操作失败', 400));
 * res.json(formatter.paginated([1, 2, 3], 1, 10, 100));
 * ```
 */

class ResponseFormatter {
  constructor(options = {}) {
    this.options = {
      includeTimestamp: options.includeTimestamp !== false,
      includeRequestId: options.includeRequestId !== false,
      stackTrace: options.stackTrace || false, // 是否包含错误堆栈（仅开发环境）
      camelCase: options.camelCase || false // 是否使用驼峰命名
    }
  }

  /**
   * 成功响应
   * @param {Object} data - 响应数据
   * @param {string} message - 成功消息
   * @param {Object} meta - 元数据
   * @returns {Object} - 标准化的成功响应
   */
  success(data = null, message = '操作成功', meta = {}) {
    const response = {
      success: true,
      message,
      data
    }

    if (Object.keys(meta).length > 0) {
      response.meta = meta
    }

    return this._addCommonFields(response)
  }

  /**
   * 错误响应
   * @param {string} message - 错误消息
   * @param {number} code - 错误代码（HTTP 状态码）
   * @param {string} errorCode - 应用错误代码
   * @param {Object} details - 错误详情
   * @returns {Object} - 标准化的错误响应
   */
  error(message = '操作失败', code = 500, errorCode = null, details = null) {
    const response = {
      success: false,
      message,
      error: {
        code: errorCode || this._getErrorCode(code),
        http_status: code
      }
    }

    if (details) {
      response.error.details = details
    }

    return this._addCommonFields(response)
  }

  /**
   * 分页响应
   * @param {Array} items - 数据项数组
   * @param {number} page - 当前页码
   * @param {number} pageSize - 每页大小
   * @param {number} total - 总数据量
   * @param {string} message - 响应消息
   * @returns {Object} - 标准化的分页响应
   */
  paginated(items, page = 1, pageSize = 10, total = 0, message = '获取成功') {
    const totalPages = Math.ceil(total / pageSize)
    const hasNext = page < totalPages
    const hasPrev = page > 1

    return this.success(items, message, {
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNext,
        hasPrev,
        hasNextPage: hasNext,
        hasPrevPage: hasPrev
      }
    })
  }

  /**
   * 验证错误响应
   * @param {Object} errors - 验证错误对象
   * @param {string} message - 错误消息
   * @returns {Object} - 标准化的验证错误响应
   */
  validationError(errors, message = '数据验证失败') {
    return this.error(message, 422, 'VALIDATION_ERROR', {
      validation_errors: errors
    })
  }

  /**
   * 未授权响应
   * @param {string} message - 错误消息
   * @returns {Object} - 标准化的未授权响应
   */
  unauthorized(message = '未授权访问') {
    return this.error(message, 401, 'UNAUTHORIZED')
  }

  /**
   * 禁止访问响应
   * @param {string} message - 错误消息
   * @returns {Object} - 标准化的禁止访问响应
   */
  forbidden(message = '禁止访问') {
    return this.error(message, 403, 'FORBIDDEN')
  }

  /**
   * 资源未找到响应
   * @param {string} resource - 资源名称
   * @returns {Object} - 标准化的未找到响应
   */
  notFound(resource = '资源') {
    return this.error(`${resource}未找到`, 404, 'NOT_FOUND')
  }

  /**
   * 请求格式错误响应
   * @param {string} message - 错误消息
   * @returns {Object} - 标准化的请求格式错误响应
   */
  badRequest(message = '请求格式错误') {
    return this.error(message, 400, 'BAD_REQUEST')
  }

  /**
   * 服务器错误响应
   * @param {string} message - 错误消息
   * @param {Error} error - 原始错误对象
   * @returns {Object} - 标准化的服务器错误响应
   */
  serverError(message = '服务器内部错误', error = null) {
    const response = this.error(message, 500, 'INTERNAL_SERVER_ERROR')

    if (error && this.options.stackTrace) {
      response.error.stack = error.stack
      response.error.name = error.name
    }

    return response
  }

  /**
   * 服务不可用响应
   * @param {string} message - 错误消息
   * @returns {Object} - 标准化的服务不可用响应
   */
  serviceUnavailable(message = '服务暂时不可用') {
    return this.error(message, 503, 'SERVICE_UNAVAILABLE')
  }

  /**
   * 请求超时响应
   * @param {string} message - 错误消息
   * @returns {Object} - 标准化的请求超时响应
   */
  timeout(message = '请求超时') {
    return this.error(message, 408, 'REQUEST_TIMEOUT')
  }

  /**
   * 批量操作响应
   * @param {number} success - 成功数量
   * @param {number} failed - 失败数量
   * @param {number} total - 总数量
   * @param {Object} results - 详细结果
   * @returns {Object} - 标准化的批量操作响应
   */
  batchResult(success, failed, total, results = null) {
    const message = failed === 0
      ? `批量操作完成：成功 ${success} 条`
      : `批量操作完成：成功 ${success} 条，失败 ${failed} 条`

    return this.success(results, message, {
      batch: {
        success,
        failed,
        total,
        successRate: total > 0 ? ((success / total) * 100).toFixed(2) + '%' : '0%'
      }
    })
  }

  /**
   * 从错误对象创建响应
   * @param {Error} err - 错误对象
   * @param {string} defaultMessage - 默认错误消息
   * @returns {Object} - 标准化的错误响应
   */
  fromError(err, defaultMessage = '操作失败') {
    const message = err.message || defaultMessage

    // 根据错误类型返回不同的响应
    if (err.name === 'ValidationError') {
      return this.validationError(err.details || {})
    }

    if (err.status || err.statusCode) {
      const code = err.status || err.statusCode
      return this.error(message, code, err.code || this._getErrorCode(code))
    }

    return this.serverError(message, err)
  }

  /**
   * 添加通用字段（时间戳、请求 ID）
   * @private
   */
  _addCommonFields(response) {
    if (this.options.includeTimestamp) {
      response.timestamp = new Date().toISOString()
    }

    if (this.options.includeRequestId && typeof response !== 'string') {
      // 注意：requestId 需要从上下文中获取，这里留空
      // 在实际使用时，可以通过中间件注入
      response.request_id = null
    }

    return response
  }

  /**
   * 根据 HTTP 状态码获取错误代码
   * @private
   */
  _getErrorCode(httpStatus) {
    const errorCodes = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      408: 'REQUEST_TIMEOUT',
      409: 'CONFLICT',
      422: 'VALIDATION_ERROR',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
      504: 'GATEWAY_TIMEOUT'
    }

    return errorCodes[httpStatus] || 'UNKNOWN_ERROR'
  }

  /**
   * 创建 Express 中间件（自动注入请求 ID）
   */
  middleware() {
    return (req, res, next) => {
      // 原始 json 方法
      const originalJson = res.json.bind(res)

      // 重写 json 方法
      res.json = function(data) {
        // 如果是标准化响应，添加请求 ID
        if (data && typeof data === 'object' && 'request_id' in data) {
          data.request_id = req.id || null
        }
        return originalJson(data)
      }

      next()
    }
  }
}

module.exports = ResponseFormatter
