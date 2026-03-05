/**
 * 缓存管理器
 *
 * 提供内存缓存功能，支持 TTL（Time To Live）策略
 *
 * @example
 * ```js
 * const cache = new CacheManager();
 * cache.set('key', { data: 'value' }, 60000); // 缓存 60 秒
 * const value = cache.get('key');
 * cache.clear(); // 清空所有缓存
 * ```
 */

class CacheManager {
  constructor(options = {}) {
    this.cache = new Map()
    this.timers = new Map()
    this.enabled = options.enabled !== false
    this.defaultTTL = options.defaultTTL || 60000 // 默认 60 秒
    this.maxEntries = options.maxEntries || 1000 // 最大缓存条目数
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      clears: 0
    }
  }

  /**
   * 设置缓存
   * @param {string} key - 缓存键
   * @param {any} value - 缓存值
   * @param {number} ttl - 过期时间（毫秒）
   */
  set(key, value, ttl = this.defaultTTL) {
    if (!this.enabled) return false

    // 检查缓存大小限制
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      // 🆕 改进的 LRU 策略：删除最旧的多个条目以避免频繁清理
      const cleanupCount = Math.floor(this.maxEntries * 0.1) // 清理 10%
      const keysToDelete = Array.from(this.cache.keys()).slice(0, cleanupCount)
      for (const k of keysToDelete) {
        this.delete(k)
      }
    }

    this.cache.set(key, {
      value,
      expires: Date.now() + ttl,
      createdAt: Date.now(),
      size: this._estimateSize(value) // 🆕 记录值的大小
    })

    // 设置定时器自动删除
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key))
    }

    const timer = setTimeout(() => {
      this.delete(key)
    }, ttl)

    this.timers.set(key, timer)
    this.stats.sets++

    return true
  }

  /**
   * 获取缓存
   * @param {string} key - 缓存键
   * @returns {any|null} 缓存值或 null
   */
  get(key) {
    if (!this.enabled) return null

    const item = this.cache.get(key)

    if (!item) {
      this.stats.misses++
      return null
    }

    // 检查是否过期
    if (Date.now() > item.expires) {
      this.delete(key)
      this.stats.misses++
      return null
    }

    this.stats.hits++
    return item.value
  }

  /**
   * 删除缓存
   * @param {string} key - 缓存键
   */
  delete(key) {
    if (!this.enabled) return false

    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key))
      this.timers.delete(key)
    }

    const deleted = this.cache.delete(key)
    if (deleted) {
      this.stats.deletes++
    }

    return deleted
  }

  /**
   * 检查缓存是否存在
   * @param {string} key - 缓存键
   */
  has(key) {
    if (!this.enabled) return false

    const item = this.cache.get(key)
    if (!item) return false

    // 检查是否过期
    if (Date.now() > item.expires) {
      this.delete(key)
      return false
    }

    return true
  }

  /**
   * 清空所有缓存
   */
  clear() {
    if (!this.enabled) return

    // 清除所有定时器
    this.timers.forEach(timer => clearTimeout(timer))
    this.timers.clear()

    this.cache.clear()
    this.stats.clears++
  }

  /**
   * 清理过期缓存
   */
  cleanup() {
    if (!this.enabled) return

    const now = Date.now()
    const expiredKeys = []

    for (const [key, item] of this.cache.entries()) {
      if (now > item.expires) {
        expiredKeys.push(key)
      }
    }

    expiredKeys.forEach(key => this.delete(key))

    return expiredKeys.length
  }

  /**
   * 获取缓存统计信息（增强版）
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(2) + '%'
      : '0%'

    // 🆕 计算内存使用估算
    const memoryUsage = this._calculateMemoryUsage()

    return {
      size: this.cache.size,
      maxSize: this.maxEntries,
      ...this.stats,
      hitRate,
      memoryUsage // 🆕 添加内存使用信息
    }
  }

  /**
   * 获取缓存详情（用于调试）
   */
  getDetails() {
    const details = []

    for (const [key, item] of this.cache.entries()) {
      details.push({
        key,
        expires: new Date(item.expires).toISOString(),
        remaining: Math.max(0, item.expires - Date.now()) + 'ms',
        age: Date.now() - item.createdAt + 'ms'
      })
    }

    return details
  }

  /**
   * 禁用缓存
   */
  disable() {
    this.enabled = false
    this.clear()
  }

  /**
   * 启用缓存
   */
  enable() {
    this.enabled = true
  }

  /**
   * 销毁缓存管理器
   */
  destroy() {
    this.clear()
    this.cache = null
    this.timers = null
  }

  /**
   * 🆕 估算值的内存大小（字节）
   * @private
   */
  _estimateSize(value) {
    if (value === null || value === undefined) return 0
    if (typeof value === 'string') return value.length * 2 // UTF-16
    if (typeof value === 'number') return 8
    if (typeof value === 'boolean') return 4
    if (typeof value === 'object') return JSON.stringify(value).length * 2
    return 0
  }

  /**
   * 🆕 计算缓存总内存使用
   * @private
   */
  _calculateMemoryUsage() {
    let totalSize = 0
    for (const [key, item] of this.cache.entries()) {
      totalSize += key.length * 2 // 键的大小
      totalSize += item.size || 0 // 值的大小
      totalSize += 64 // 元数据开销估算
    }
    return {
      estimatedBytes: totalSize,
      estimatedKB: (totalSize / 1024).toFixed(2),
      estimatedMB: (totalSize / 1024 / 1024).toFixed(2)
    }
  }

  /**
   * 🆕 智能清理：清理最旧和最不常用的缓存
   */
  smartCleanup(cleanupRatio = 0.2) {
    if (!this.enabled) return 0

    const cleanupCount = Math.floor(this.cache.size * cleanupRatio)
    if (cleanupCount === 0) return 0

    // 按创建时间排序，删除最旧的
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].createdAt - b[1].createdAt)
      .slice(0, cleanupCount)

    for (const [key] of entries) {
      this.delete(key)
    }

    return cleanupCount
  }
}

/**
 * 创建缓存中间件
 * @param {CacheManager} cache - 缓存管理器实例
 * @param {Object} options - 配置选项
 * @returns {Function} Express 中间件
 */
function createCacheMiddleware(cache, options = {}) {
  const {
    keyGenerator = (req) => req.originalUrl,
    ttl = options.ttl || 60000,
    shouldCache = () => true
  } = options

  return (req, res, next) => {
    if (!cache.enabled || !shouldCache(req)) {
      return next()
    }

    const key = keyGenerator(req)
    const cached = cache.get(key)

    if (cached) {
      return res.json(cached)
    }

    // 拦截 res.json
    const originalJson = res.json.bind(res)
    res.json = function (data) {
      cache.set(key, data, ttl)
      return originalJson(data)
    }

    next()
  }
}

module.exports = {
  CacheManager,
  createCacheMiddleware
}
