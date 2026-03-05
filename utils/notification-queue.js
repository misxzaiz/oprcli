/**
 * 通知队列管理器
 * 提供智能通知聚合、优先级队列、失败重试等功能
 *
 * @version 1.0.0
 * @created 2026-03-05
 *
 * 功能：
 * - 通知优先级队列（紧急/普通/低优先级）
 * - 通知聚合（短时间内相同类型通知合并）
 * - 失败重试和本地缓存
 * - 通知统计和监控
 * - 防抖和节流
 */

const fs = require('fs')
const path = require('path')

class NotificationQueue {
  constructor(options = {}) {
    this.logger = options.logger || console
    this.enabled = options.enabled !== false
    this.aggregationTime = options.aggregationTime || 5000 // 5秒内的相同通知会聚合
    this.maxRetries = options.maxRetries || 3
    this.retryDelay = options.retryDelay || 5000
    this.cacheDir = options.cacheDir || path.join(process.cwd(), 'data', 'notifications')
    this.maxCacheSize = options.maxCacheSize || 1000

    // 通知队列
    this.queues = {
      urgent: [], // 紧急通知
      normal: [], // 普通通知
      low: [] // 低优先级通知
    }

    // 聚合窗口（用于聚合相同类型的通知）
    this.aggregationWindow = new Map()

    // 失败缓存
    this.failedCache = []

    // 统计信息
    this.stats = {
      sent: 0,
      aggregated: 0,
      failed: 0,
      retried: 0,
      byType: {}
    }

    // 处理状态
    this.isProcessing = false
    this.processInterval = null

    // 确保缓存目录存在
    this._ensureCacheDir()

    // 加载失败的缓存
    this._loadFailedCache()
  }

  /**
   * 确保缓存目录存在
   * @private
   */
  _ensureCacheDir() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true })
    }
  }

  /**
   * 加载失败的缓存
   * @private
   */
  _loadFailedCache() {
    const cacheFile = path.join(this.cacheDir, 'failed-cache.json')
    try {
      if (fs.existsSync(cacheFile)) {
        const data = fs.readFileSync(cacheFile, 'utf-8')
        this.failedCache = JSON.parse(data)
        this.logger.info('NOTIFICATION_QUEUE', `加载失败缓存: ${this.failedCache.length} 条`)
      }
    } catch (error) {
      this.logger.warning('NOTIFICATION_QUEUE', '加载失败缓存失败', { error: error.message })
    }
  }

  /**
   * 保存失败的缓存
   * @private
   */
  _saveFailedCache() {
    const cacheFile = path.join(this.cacheDir, 'failed-cache.json')
    try {
      // 限制缓存大小
      const toSave = this.failedCache.slice(-this.maxCacheSize)
      fs.writeFileSync(cacheFile, JSON.stringify(toSave, null, 2))
    } catch (error) {
      this.logger.error('NOTIFICATION_QUEUE', '保存失败缓存失败', { error: error.message })
    }
  }

  /**
   * 添加通知到队列
   * @param {Object} notification - 通知对象
   * @returns {string} 通知ID
   */
  add(notification) {
    if (!this.enabled) {
      return null
    }

    const id = this._generateId()
    const item = {
      id,
      ...notification,
      priority: notification.priority || 'normal',
      timestamp: Date.now(),
      attempts: 0
    }

    // 检查是否可以聚合
    const aggregated = this._tryAggregate(item)
    if (aggregated) {
      this.stats.aggregated++
      this.logger.debug('NOTIFICATION_QUEUE', `通知已聚合: ${item.type}`)
      return id
    }

    // 添加到对应优先级队列
    this.queues[item.priority].push(item)
    this.logger.debug('NOTIFICATION_QUEUE', `通知已添加到队列: ${item.type} (${item.priority})`)

    // 更新统计
    this.stats.byType[item.type] = (this.stats.byType[item.type] || 0) + 1

    return id
  }

  /**
   * 尝试聚合通知
   * @private
   */
  _tryAggregate(item) {
    const key = `${item.type}_${item.level || 'info'}`

    // 检查聚合窗口
    if (this.aggregationWindow.has(key)) {
      const existing = this.aggregationWindow.get(key)

      // 如果在聚合时间窗口内，合并内容
      if (Date.now() - existing.timestamp < this.aggregationTime) {
        existing.count++
        existing.items.push(item)

        // 更新内容（添加计数）
        if (item.content) {
          existing.content = `${existing.content} (${existing.count})`
        }

        return true
      }
    }

    // 创建新的聚合窗口
    this.aggregationWindow.set(key, {
      ...item,
      count: 1,
      items: [item]
    })

    // 清理过期的聚合窗口
    this._cleanupAggregationWindow()

    return false
  }

  /**
   * 清理过期的聚合窗口
   * @private
   */
  _cleanupAggregationWindow() {
    const now = Date.now()
    for (const [key, item] of this.aggregationWindow.entries()) {
      if (now - item.timestamp > this.aggregationTime) {
        // 过期的聚合项目，添加到队列
        this.queues[item.priority].push(item)
        this.aggregationWindow.delete(key)
      }
    }
  }

  /**
   * 处理队列中的通知
   * @param {Function} sender - 发送函数
   */
  async process(sender) {
    if (this.isProcessing) {
      return
    }

    this.isProcessing = true

    try {
      // 按优先级处理：urgent -> normal -> low
      const priorities = ['urgent', 'normal', 'low']

      for (const priority of priorities) {
        const queue = this.queues[priority]

        while (queue.length > 0) {
          const item = queue.shift()

          try {
            await sender(item)
            this.stats.sent++
            this.logger.debug('NOTIFICATION_QUEUE', `通知发送成功: ${item.type}`)
          } catch (error) {
            this._handleFailedItem(item, error)
          }
        }
      }

      // 处理聚合窗口中的项目
      this._cleanupAggregationWindow()
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * 处理发送失败的通知
   * @private
   */
  _handleFailedItem(item, error) {
    item.attempts++
    item.lastError = error.message
    item.lastAttempt = Date.now()

    // 如果未达到最大重试次数，重新加入队列
    if (item.attempts < this.maxRetries) {
      setTimeout(() => {
        this.queues[item.priority].push(item)
        this.stats.retried++
        this.logger.debug('NOTIFICATION_QUEUE', `通知重试: ${item.type} (${item.attempts}/${this.maxRetries})`)
      }, this.retryDelay * item.attempts) // 递增延迟
    } else {
      // 达到最大重试次数，保存到失败缓存
      this.failedCache.push(item)
      this.stats.failed++
      this.logger.error('NOTIFICATION_QUEUE', `通知发送失败，已保存到缓存: ${item.type}`)

      // 限制缓存大小
      if (this.failedCache.length > this.maxCacheSize) {
        this.failedCache.shift()
      }

      // 保存到文件
      this._saveFailedCache()
    }
  }

  /**
   * 重试失败的通知
   * @param {Function} sender - 发送函数
   */
  async retryFailed(sender) {
    if (this.failedCache.length === 0) {
      this.logger.info('NOTIFICATION_QUEUE', '没有失败的通知需要重试')
      return
    }

    this.logger.info('NOTIFICATION_QUEUE', `开始重试失败的通知: ${this.failedCache.length} 条`)

    const items = [...this.failedCache]
    this.failedCache = []

    for (const item of items) {
      try {
        await sender(item)
        this.stats.sent++
        this.logger.debug('NOTIFICATION_QUEUE', `失败通知重试成功: ${item.type}`)
      } catch (error) {
        item.attempts++
        item.lastError = error.message
        item.lastAttempt = Date.now()
        this.failedCache.push(item)
      }
    }

    this._saveFailedCache()
  }

  /**
   * 清空队列
   */
  clear() {
    this.queues.urgent = []
    this.queues.normal = []
    this.queues.low = []
    this.aggregationWindow.clear()
    this.logger.info('NOTIFICATION_QUEUE', '队列已清空')
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      queueSize: {
        urgent: this.queues.urgent.length,
        normal: this.queues.normal.length,
        low: this.queues.low.length,
        total: this.queues.urgent.length + this.queues.normal.length + this.queues.low.length
      },
      aggregationWindowSize: this.aggregationWindow.size,
      failedCacheSize: this.failedCache.length
    }
  }

  /**
   * 获取队列状态
   * @returns {Object} 队列状态
   */
  getStatus() {
    return {
      enabled: this.enabled,
      isProcessing: this.isProcessing,
      queueSize: this.getStats().queueSize,
      failedCount: this.failedCache.length
    }
  }

  /**
   * 生成唯一ID
   * @private
   */
  _generateId() {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 启动自动处理
   * @param {Function} sender - 发送函数
   * @param {number} interval - 处理间隔（毫秒）
   */
  startAutoProcess(sender, interval = 5000) {
    if (this.processInterval) {
      clearInterval(this.processInterval)
    }

    this.processInterval = setInterval(() => {
      this.process(sender).catch(error => {
        this.logger.error('NOTIFICATION_QUEUE', '自动处理失败', { error: error.message })
      })
    }, interval)

    this.logger.info('NOTIFICATION_QUEUE', `自动处理已启动，间隔: ${interval}ms`)
  }

  /**
   * 停止自动处理
   */
  stopAutoProcess() {
    if (this.processInterval) {
      clearInterval(this.processInterval)
      this.processInterval = null
      this.logger.info('NOTIFICATION_QUEUE', '自动处理已停止')
    }
  }
}

// 导出
module.exports = NotificationQueue

// 如果直接运行，进行测试
if (require.main === module) {
  const queue = new NotificationQueue({ logger: console })

  // 测试添加通知
  queue.add({
    type: 'test',
    level: 'info',
    content: '测试通知',
    priority: 'normal'
  })

  // 查看统计
  console.log('队列状态:', queue.getStatus())
  console.log('统计信息:', queue.getStats())
}
