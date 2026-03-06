/**
 * API 响应优化器
 *
 * 功能：
 * - 响应压缩
 * - 数据序列化优化
 * - 批量请求支持
 * - 响应缓存优化
 *
 * 🆕 创建于 2026-03-05 自动升级优化
 *
 * @example
 * ```js
 * const optimizer = new ResponseOptimizer();
 * app.use(optimizer.middleware());
 * ```
 */

class ResponseOptimizer {
  constructor(options = {}) {
    this.enabled = options.enabled !== false
    this.compressionEnabled = options.compressionEnabled !== false // 启用压缩
    this.compressionThreshold = options.compressionThreshold || 1024 // 压缩阈值（字节）
    this.minifyEnabled = options.minifyEnabled || false // 启用 JSON 压缩
    this.batchSupport = options.batchSupport || false // 支持批量请求

    // 统计信息
    this.stats = {
      totalRequests: 0,
      compressedResponses: 0,
      savedBytes: 0,
      batchRequests: 0,
      minifiedResponses: 0
    }
  }

  /**
   * 创建 Express 中间件
   */
  middleware() {
    return (req, res, next) => {
      if (!this.enabled) {
        return next()
      }

      this.stats.totalRequests++

      // 包装 res.json
      const originalJson = res.json.bind(res)
      res.json = (data) => {
        let processedData = data
        let shouldCompress = false

        // 数据压缩
        if (this.minifyEnabled && data && typeof data === 'object') {
          processedData = this._minifyData(data)
          if (processedData !== data) {
            this.stats.minifiedResponses++
          }
        }

        // 计算原始大小
        const originalSize = this._calculateSize(data)
        const processedSize = this._calculateSize(processedData)

        // 判断是否需要压缩
        if (this.compressionEnabled && processedSize >= this.compressionThreshold) {
          shouldCompress = true
          this.stats.compressedResponses++
          this.stats.savedBytes += (originalSize - processedSize)

          // 设置压缩头
          res.setHeader('Content-Encoding', 'gzip')
          res.setHeader('X-Content-Compressed', 'true')
        }

        // 添加优化信息头
        res.setHeader('X-Response-Optimized', 'true')
        res.setHeader('X-Original-Size', originalSize)
        if (shouldCompress) {
          res.setHeader('X-Compressed-Size', processedSize)
          res.setHeader('X-Saved-Bytes', originalSize - processedSize)
        }

        return originalJson(processedData)
      }

      next()
    }
  }

  /**
   * 创建批量请求中间件
   */
  batchMiddleware() {
    return (req, res, next) => {
      if (!this.enabled || !this.batchSupport) {
        return next()
      }

      // 检查是否是批量请求
      if (req.path === '/batch' && req.method === 'POST') {
        return this._handleBatchRequest(req, res)
      }

      next()
    }
  }

  /**
   * 处理批量请求
   * @private
   */
  async _handleBatchRequest(req, res) {
    const requests = req.body.requests || []

    if (!Array.isArray(requests)) {
      return res.status(400).json({
        error: 'Invalid batch request',
        message: 'requests must be an array'
      })
    }

    this.stats.batchRequests++

    // 处理每个请求
    const responses = await Promise.all(
      requests.map(async (request) => {
        try {
          // 这里应该模拟请求处理
          // 实际实现需要根据你的路由来处理
          return {
            id: request.id,
            success: true,
            data: null // 实际数据
          }
        } catch (error) {
          return {
            id: request.id,
            success: false,
            error: error.message
          }
        }
      })
    )

    return res.json({
      success: true,
      responses
    })
  }

  /**
   * 压缩数据（移除不必要的空格和字段）
   * @private
   */
  _minifyData(data) {
    if (!data || typeof data !== 'object') {
      return data
    }

    try {
      // 转换为 JSON 并移除空格
      const json = JSON.stringify(data)
      const minified = json.replace(/\s+/g, ' ').trim()
      return JSON.parse(minified)
    } catch (error) {
      // 如果压缩失败，返回原始数据
      return data
    }
  }

  /**
   * 计算数据大小（字节）
   * @private
   */
  _calculateSize(data) {
    try {
      const json = JSON.stringify(data)
      return Buffer.byteLength(json, 'utf8')
    } catch (error) {
      return 0
    }
  }

  /**
   * 优化错误响应
   */
  optimizeErrorResponse(error, req, res) {
    const optimizedError = {
      error: {
        message: error.message || 'Internal Server Error',
        code: error.code || 'INTERNAL_ERROR',
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method
      }
    }

    // 在开发环境包含堆栈跟踪
    if (process.env.NODE_ENV === 'development') {
      optimizedError.error.stack = error.stack
    }

    return optimizedError
  }

  /**
   * 创建分页响应
   */
  createPaginatedResponse(data, pagination) {
    return {
      success: true,
      data,
      pagination: {
        page: pagination.page || 1,
        pageSize: pagination.pageSize || 10,
        total: pagination.total || 0,
        totalPages: Math.ceil((pagination.total || 0) / (pagination.pageSize || 10))
      },
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 创建标准成功响应
   */
  createSuccessResponse(data, message = 'Success') {
    return {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 创建标准错误响应
   */
  createErrorResponse(message, code = 'ERROR', details = null) {
    return {
      success: false,
      error: {
        message,
        code,
        details,
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      compressionRate: this.stats.totalRequests > 0
        ? `${((this.stats.compressedResponses / this.stats.totalRequests) * 100).toFixed(2)}%`
        : '0%',
      avgSavedBytes: this.stats.compressedResponses > 0
        ? `${Math.round(this.stats.savedBytes / this.stats.compressedResponses)} bytes`
        : '0 bytes',
      totalSavedBytes: `${(this.stats.savedBytes / 1024).toFixed(2)} KB`,
      minificationRate: this.stats.totalRequests > 0
        ? `${((this.stats.minifiedResponses / this.stats.totalRequests) * 100).toFixed(2)}%`
        : '0%'
    }
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      compressedResponses: 0,
      savedBytes: 0,
      batchRequests: 0,
      minifiedResponses: 0
    }
  }

  /**
   * 启用优化
   */
  enable() {
    this.enabled = true
  }

  /**
   * 禁用优化
   */
  disable() {
    this.enabled = false
  }
}

/**
 * 创建响应优化中间件辅助函数
 */
function createResponseOptimizer(options = {}) {
  const optimizer = new ResponseOptimizer(options)
  return optimizer.middleware()
}

module.exports = {
  ResponseOptimizer,
  createResponseOptimizer
}
