/**
 * 请求去重中间件
 * 防止短时间内重复提交相同请求
 *
 * @version 1.0.0
 * @created 2026-03-05
 */

const { createHash } = require('crypto')

/**
 * 请求去重器类
 */
class RequestDeduplicator {
  constructor(options = {}) {
    this.requests = new Map()
    this.ttl = options.ttl || 5000 // 默认 5 秒
    this.maxSize = options.maxSize || 1000 // 最大记录数
  }

  /**
   * 生成请求指纹
   */
  generateFingerprint(req) {
    const data = {
      method: req.method,
      url: req.originalUrl || req.url,
      body: req.body,
      query: req.query,
      ip: req.ip
    }

    return createHash('md5')
      .update(JSON.stringify(data))
      .digest('hex')
  }

  /**
   * 检查是否重复请求
   */
  isDuplicate(req) {
    const fingerprint = this.generateFingerprint(req)
    const record = this.requests.get(fingerprint)

    if (!record) {
      // 记录新请求
      this.requests.set(fingerprint, {
        timestamp: Date.now(),
        requestId: req.id
      })

      // 清理过期记录
      this.cleanup()

      return false
    }

    // 检查是否在 TTL 内
    if (Date.now() - record.timestamp < this.ttl) {
      return true
    }

    // 更新记录
    this.requests.set(fingerprint, {
      timestamp: Date.now(),
      requestId: req.id
    })

    return false
  }

  /**
   * 清理过期记录
   */
  cleanup() {
    const now = Date.now()
    const expired = []

    for (const [key, value] of this.requests.entries()) {
      if (now - value.timestamp > this.ttl) {
        expired.push(key)
      }
    }

    for (const key of expired) {
      this.requests.delete(key)
    }

    // 如果超过最大大小，删除最旧的记录
    if (this.requests.size > this.maxSize) {
      const keys = Array.from(this.requests.keys())
      const toDelete = keys.slice(0, this.requests.size - this.maxSize)

      for (const key of toDelete) {
        this.requests.delete(key)
      }
    }
  }

  /**
   * 清空所有记录
   */
  clear() {
    this.requests.clear()
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      size: this.requests.size,
      maxSize: this.maxSize,
      ttl: this.ttl
    }
  }
}

// 全局去重器实例
const globalDeduplicator = new RequestDeduplicator()

/**
 * 请求去重中间件
 * @param {Object} options - 配置选项
 * @returns {Function} Express 中间件
 */
function requestDeduplication(options = {}) {
  const {
    deduplicator = globalDeduplicator,
    enabled = true,
    excludePaths = [], // 排除的路径
    logDuplicates = true
  } = options

  return (req, res, next) => {
    if (!enabled) {
      return next()
    }

    // 检查是否在排除列表中
    if (excludePaths.some(path => req.path.startsWith(path))) {
      return next()
    }

    // 检查是否重复
    if (deduplicator.isDuplicate(req)) {
      req.logger?.warn('DEDUPLICATION', `检测到重复请求 [${req.id}]`, {
        ip: req.ip,
        method: req.method,
        path: req.path
      })

      return res.status(429).json({
        success: false,
        error: {
          code: 'DUPLICATE_REQUEST',
          message: '请勿重复提交相同请求'
        }
      })
    }

    next()
  }
}

module.exports = {
  RequestDeduplicator,
  requestDeduplication,
  globalDeduplicator
}
