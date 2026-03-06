/**
 * 响应缓存中间件
 * 基于内存的 HTTP 响应缓存，提升性能
 *
 * @version 1.0.0
 * @created 2026-03-05
 *
 * 功能：
 * - 可配置的缓存策略
 * - 自动缓存失效
 * - 支持自定义缓存键
 * - 支持条件缓存
 */

/**
 * 缓存存储类
 */
class CacheStore {
  constructor(options = {}) {
    this.cache = new Map()
    this.maxSize = options.maxSize || 1000 // 最大缓存条目数
    this.defaultTTL = options.defaultTTL || 60000 // 默认 TTL 1分钟
    this.cleanupInterval = options.cleanupInterval || 60000 // 清理间隔 1分钟

    // 启动定期清理
    this.startCleanup()
  }

  /**
   * 生成缓存键
   */
  generateKey(req) {
    const url = req.originalUrl || req.url
    const method = req.method

    // 对于 GET 请求，包含查询参数
    if (method === 'GET') {
      return `${method}:${url}`
    }

    // 对于其他请求，可以包含请求体（需要配置）
    return `${method}:${url}`
  }

  /**
   * 设置缓存
   */
  set(key, value, ttl = this.defaultTTL) {
    // 如果超过最大大小，删除最旧的条目
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }

    this.cache.set(key, {
      value,
      expires: Date.now() + ttl,
      createdAt: Date.now()
    })
  }

  /**
   * 获取缓存
   */
  get(key) {
    const entry = this.cache.get(key)

    if (!entry) {
      return null
    }

    // 检查是否过期
    if (Date.now() > entry.expires) {
      this.cache.delete(key)
      return null
    }

    return entry.value
  }

  /**
   * 删除缓存
   */
  delete(key) {
    this.cache.delete(key)
  }

  /**
   * 清空缓存
   */
  clear() {
    this.cache.clear()
  }

  /**
   * 定期清理过期缓存
   */
  startCleanup() {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now()
      let deletedCount = 0

      for (const [key, entry] of this.cache.entries()) {
        if (now > entry.expires) {
          this.cache.delete(key)
          deletedCount++
        }
      }
    }, this.cleanupInterval)
  }

  /**
   * 停止清理
   */
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
    }
  }

  /**
   * 获取缓存统计
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      utilizationRate: `${((this.cache.size / this.maxSize) * 100).toFixed(1)}%`
    }
  }
}

// 全局缓存存储实例
const globalCacheStore = new CacheStore()

/**
 * 响应缓存中间件工厂
 * @param {Object} options - 配置选项
 * @returns {Function} Express 中间件
 *
 * @example
 * // 基本使用
 * app.get('/api/data',
 *   responseCache({ ttl: 60000 }),
 *   handler
 * )
 *
 * // 高级使用
 * app.get('/api/data',
 *   responseCache({
 *     ttl: 60000,
 *     condition: (req) => req.user?.premium,
 *     keyGenerator: (req) => `user:${req.user.id}:${req.url}`
 *   }),
 *   handler
 * )
 */
function responseCache(options = {}) {
  const {
    ttl = 60000, // 缓存时间（毫秒）
    condition = null, // 缓存条件函数
    keyGenerator = null, // 自定义键生成器
    store = globalCacheStore, // 缓存存储
    skipOnError = true, // 出错时跳过缓存
    methods = ['GET'], // 支持的 HTTP 方法
    addHeaders = true // 添加缓存头
  } = options

  return (req, res, next) => {
    // 检查方法
    if (!methods.includes(req.method)) {
      return next()
    }

    // 检查条件
    if (condition && !condition(req)) {
      return next()
    }

    // 生成缓存键
    const cacheKey = keyGenerator ? keyGenerator(req) : store.generateKey(req)

    // 尝试从缓存获取
    const cached = store.get(cacheKey)
    if (cached) {
      req.logger?.debug('CACHE', `缓存命中 [${req.id}]`, {
        key: cacheKey,
        age: Date.now() - cached.createdAt
      })

      // 添加缓存头
      if (addHeaders) {
        res.setHeader('X-Cache', 'HIT')
        res.setHeader('X-Cache-Key', cacheKey.substring(0, 50))
      }

      return res.status(cached.statusCode).set(cached.headers).send(cached.body)
    }

    // 缓存未命中，继续处理
    if (addHeaders) {
      res.setHeader('X-Cache', 'MISS')
    }

    // 拦截响应
    const originalSend = res.send
    const originalJson = res.json
    const originalStatus = res.status
    const originalSet = res.set

    let statusCode = 200
    let headers = {}
    let body = null
    let sent = false

    // 拦截 status
    res.status = function (code) {
      statusCode = code
      return originalStatus.call(this, code)
    }

    // 拦截 set
    res.set = function (name, value) {
      if (typeof name === 'string') {
        headers[name] = value
      } else {
        Object.assign(headers, name)
      }
      return originalSet.call(this, name, value)
    }

    // 拦截 send
    res.send = function (data) {
      if (!sent) {
        sent = true
        body = data

        // 缓存响应
        if (!skipOnError || statusCode < 400) {
          store.set(cacheKey, {
            statusCode,
            headers,
            body,
            createdAt: Date.now()
          }, ttl)

          req.logger?.debug('CACHE', `响应已缓存 [${req.id}]`, {
            key: cacheKey,
            ttl,
            statusCode
          })
        }

        return originalSend.call(this, data)
      }
    }

    // 拦截 json
    res.json = function (data) {
      if (!sent) {
        sent = true
        body = JSON.stringify(data)
        headers['Content-Type'] = headers['Content-Type'] || 'application/json'

        // 缓存响应
        if (!skipOnError || statusCode < 400) {
          store.set(cacheKey, {
            statusCode,
            headers,
            body,
            createdAt: Date.now()
          }, ttl)

          req.logger?.debug('CACHE', `响应已缓存 [${req.id}]`, {
            key: cacheKey,
            ttl,
            statusCode
          })
        }

        return originalJson.call(this, data)
      }
    }

    next()
  }
}

/**
 * 清除缓存中间件
 * @param {Object} options - 配置选项
 * @returns {Function} Express 中间件
 */
function clearCache(options = {}) {
  const {
    keyGenerator = null,
    store = globalCacheStore,
    pattern = null // 正则模式匹配
  } = options

  return (req, res, next) => {
    if (pattern) {
      // 按模式清除
      const regex = new RegExp(pattern)
      let clearedCount = 0

      for (const key of store.cache.keys()) {
        if (regex.test(key)) {
          store.delete(key)
          clearedCount++
        }
      }

      req.logger?.info('CACHE', `按模式清除缓存 [${req.id}]`, {
        pattern,
        clearedCount
      })
    } else if (keyGenerator) {
      // 按键清除
      const key = keyGenerator(req)
      store.delete(key)

      req.logger?.info('CACHE', `缓存已清除 [${req.id}]`, {
        key
      })
    } else {
      // 清除所有
      store.clear()

      req.logger?.info('CACHE', `所有缓存已清除 [${req.id}]`)
    }

    next()
  }
}

/**
 * 预定义的缓存策略
 */
const cacheStrategies = {
  // 短期缓存（5秒）
  short: {
    ttl: 5000,
    addHeaders: true
  },

  // 中期缓存（1分钟）
  medium: {
    ttl: 60000,
    addHeaders: true
  },

  // 长期缓存（5分钟）
  long: {
    ttl: 300000,
    addHeaders: true
  },

  // 健康检查缓存（30秒）
  health: {
    ttl: 30000,
    addHeaders: true,
    condition: (req) => req.path.startsWith('/health')
  }
}

module.exports = {
  responseCache,
  clearCache,
  CacheStore,
  globalCacheStore,
  cacheStrategies
}
