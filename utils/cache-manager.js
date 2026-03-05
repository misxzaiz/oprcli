/**
 * 缓存管理器
 *
 * 提供内存缓存功能，支持 TTL（Time To Live）策略
 *
 * 🆕 增强功能（2026-03-05 自动升级优化）：
 * - 缓存预热功能
 * - 智能预测和预加载
 * - 缓存命中率分析
 * - 热点数据识别
 *
 * @example
 * ```js
 * const cache = new CacheManager();
 * cache.set('key', { data: 'value' }, 60000); // 缓存 60 秒
 * const value = cache.get('key');
 * cache.clear(); // 清空所有缓存
 * cache.warmup([{ key: 'key1', value: 'value1' }]); // 缓存预热
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
      clears: 0,
      warms: 0 // 🆕 预热统计
    }

    // 🆕 缓存预热配置
    this.warmupConfig = {
      enabled: options.warmupEnabled !== false,
      autoWarmup: options.autoWarmup || false,
      warmupInterval: options.warmupInterval || 300000 // 默认 5 分钟
    }

    // 🆕 热点数据追踪
    this.hotKeys = new Map() // 记录访问频率
    this.accessHistory = [] // 访问历史

    // 🆕 预热数据加载器
    this.dataLoaders = new Map()

    // 🆕 自动预热定时器引用
    this.autoWarmupTimer = null

    // 🆕 启动自动预热
    if (this.warmupConfig.autoWarmup) {
      this._startAutoWarmup()
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

    // 🆕 记录访问
    this._trackAccess(key)

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
    // 🔥 修复：停止自动预热定时器
    if (this.autoWarmupTimer) {
      clearInterval(this.autoWarmupTimer)
      this.autoWarmupTimer = null
    }

    this.clear()
    this.cache = null
    this.timers = null
    this.hotKeys = null
    this.accessHistory = null
    this.dataLoaders = null
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

  /**
   * 🆕 缓存预热 - 批量预加载数据
   * @param {Array} items - 预加载项数组 [{ key, value, ttl }]
   * @returns {Object} 预热结果
   */
  warmup(items = []) {
    if (!this.enabled || !this.warmupConfig.enabled) {
      return { success: false, message: '缓存预热功能未启用' }
    }

    const results = {
      total: items.length,
      succeeded: 0,
      failed: 0,
      skipped: 0
    }

    for (const item of items) {
      try {
        if (!item.key) {
          results.skipped++
          continue
        }

        // 如果键已存在且未过期，跳过
        if (this.has(item.key)) {
          results.skipped++
          continue
        }

        // 使用加载器或直接设置值
        if (this.dataLoaders.has(item.key)) {
          // 使用异步加载器
          const loader = this.dataLoaders.get(item.key)
          // 🔥 修复：正确处理异步操作的计数
          loader().then(value => {
            this.set(item.key, value, item.ttl || this.defaultTTL)
            this.stats.warms++
            results.succeeded++
          }).catch(err => {
            this.logger?.error?.('CACHE', `预热加载失败: ${item.key}`, { error: err.message })
            results.failed++
          })
        } else if (item.value !== undefined) {
          // 直接设置值
          this.set(item.key, item.value, item.ttl || this.defaultTTL)
          this.stats.warms++
          results.succeeded++
        } else {
          results.skipped++
        }
      } catch (error) {
        results.failed++
      }
    }

    return results
  }

  /**
   * 🆕 注册数据加载器（用于延迟加载）
   * @param {string} key - 缓存键
   * @param {Function} loader - 异步加载函数
   */
  registerLoader(key, loader) {
    if (typeof loader !== 'function') {
      throw new Error('Loader must be a function')
    }
    this.dataLoaders.set(key, loader)
  }

  /**
   * 🆕 智能预热 - 基于热点数据预测
   * @param {number} topN - 预加载前 N 个热点数据
   */
  async smartWarmup(topN = 10) {
    if (!this.enabled || !this.warmupConfig.enabled) {
      return { success: false, message: '缓存预热功能未启用' }
    }

    // 获取热点数据
    const hotKeys = this.getHotKeys(topN)

    if (hotKeys.length === 0) {
      return { success: true, message: '无热点数据需要预热', count: 0 }
    }

    const items = []
    for (const keyInfo of hotKeys) {
      if (!this.has(keyInfo.key) && this.dataLoaders.has(keyInfo.key)) {
        items.push({ key: keyInfo.key })
      }
    }

    if (items.length === 0) {
      return { success: true, message: '所有热点数据已缓存', count: 0 }
    }

    // 执行预热
    return this.warmup(items)
  }

  /**
   * 🆕 获取热点数据（按访问频率排序）
   * @param {number} limit - 返回数量限制
   */
  getHotKeys(limit = 10) {
    const sortedKeys = Array.from(this.hotKeys.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([key, info]) => ({
        key,
        count: info.count,
        lastAccess: info.lastAccess
      }))

    return sortedKeys
  }

  /**
   * 🆕 获取缓存命中率
   */
  getHitRate() {
    const total = this.stats.hits + this.stats.misses
    return total > 0 ? (this.stats.hits / total) * 100 : 0
  }

  /**
   * 🆕 获取缓存统计报告（增强版）
   */
  getDetailedStats() {
    const stats = this.getStats()
    const hitRate = this.getHitRate()

    return {
      ...stats,
      hitRate: `${hitRate.toFixed(2)}%`,
      warmupStats: {
        enabled: this.warmupConfig.enabled,
        autoWarmup: this.warmupConfig.autoWarmup,
        warms: this.stats.warms,
        loadersRegistered: this.dataLoaders.size
      },
      hotKeys: this.getHotKeys(5)
    }
  }

  /**
   * 🆕 跟踪访问（用于热点分析）
   * @private
   */
  _trackAccess(key) {
    // 更新访问频率
    if (!this.hotKeys.has(key)) {
      this.hotKeys.set(key, { count: 0, lastAccess: null })
    }

    const info = this.hotKeys.get(key)
    info.count++
    info.lastAccess = Date.now()

    // 添加到访问历史
    this.accessHistory.push({
      key,
      timestamp: Date.now()
    })

    // 限制历史大小
    if (this.accessHistory.length > 1000) {
      this.accessHistory.shift()
    }
  }

  /**
   * 🆕 启动自动预热
   * @private
   */
  _startAutoWarmup() {
    // 🔥 修复：存储定时器引用，以便后续停止
    this.autoWarmupTimer = setInterval(() => {
      this.smartWarmup()
    }, this.warmupConfig.warmupInterval)
  }

  /**
   * 🆕 预测可能需要的缓存（基于访问模式）
   */
  predictNextKeys(count = 5) {
    if (this.accessHistory.length < 10) {
      return []
    }

    // 分析最近的访问模式
    const recentAccess = this.accessHistory.slice(-100)
    const keySequences = []

    // 构建键序列
    for (let i = 0; i < recentAccess.length - 1; i++) {
      keySequences.push({
        current: recentAccess[i].key,
        next: recentAccess[i + 1].key
      })
    }

    // 找出最后访问的键
    const lastKey = recentAccess[recentAccess.length - 1].key

    // 预测下一个可能的键
    const predictions = keySequences
      .filter(seq => seq.current === lastKey)
      .map(seq => seq.next)

    // 统计并返回最可能的前 N 个
    const predictionCount = {}
    for (const key of predictions) {
      predictionCount[key] = (predictionCount[key] || 0) + 1
    }

    return Object.entries(predictionCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([key]) => key)
  }

  /**
   * 🆕 清理热点数据统计
   */
  clearHotKeys() {
    this.hotKeys.clear()
    this.accessHistory = []
  }

  /**
   * 🆕 停止自动预热
   */
  stopAutoWarmup() {
    if (this.autoWarmupTimer) {
      clearInterval(this.autoWarmupTimer)
      this.autoWarmupTimer = null
    }
  }

  /**
   * 🆕 启动自动预热（如果尚未启动）
   */
  startAutoWarmup() {
    if (this.autoWarmupTimer) {
      return // 已经在运行
    }
    this._startAutoWarmup()
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
