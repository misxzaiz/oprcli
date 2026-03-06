/**
 * 内存清理工具
 * 定期清理内存，防止内存泄漏
 *
 * @version 1.0.0
 * @created 2026-03-05
 *
 * 功能：
 * - 自动清理过期缓存
 * - 监控内存使用
 * - 触发垃圾回收（如果可用）
 * - 清理过期数据
 */

const Logger = require('../integrations/logger')

/**
 * 内存清理器类
 */
class MemoryCleaner {
  constructor(options = {}) {
    this.logger = options.logger || new Logger({ level: 'INFO' })
    this.enabled = options.enabled !== false

    // 内存阈值配置
    this.thresholds = {
      heapUsedPercent: options.heapUsedPercent || 80, // 堆内存使用率阈值
      rssMemory: options.rssMemory || 500 * 1024 * 1024, // RSS 内存阈值（默认 500MB）
      triggerCleanup: options.triggerCleanup || 70 // 触发清理的阈值
    }

    // 清理间隔
    this.checkInterval = options.checkInterval || 60000 // 默认 1 分钟

    // 清理任务列表
    this.cleanupTasks = []

    // 统计信息
    this.stats = {
      totalCleanups: 0,
      lastCleanupTime: null,
      memoryFreed: 0,
      avgHeapBefore: 0,
      avgHeapAfter: 0
    }

    // 启动定期清理
    if (this.enabled) {
      this.start()
    }
  }

  /**
   * 启动定期清理
   */
  start() {
    if (this.timer) {
      return
    }

    this.timer = setInterval(() => {
      this.checkAndClean()
    }, this.checkInterval)

    this.logger.info('MEMORY', '内存清理器已启动', {
      interval: `${this.checkInterval}ms`,
      thresholds: this.thresholds
    })
  }

  /**
   * 停止定期清理
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
      this.logger.info('MEMORY', '内存清理器已停止')
    }
  }

  /**
   * 检查内存并执行清理
   */
  checkAndClean() {
    const memoryUsage = process.memoryUsage()
    const heapUsedPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100

    // 记录内存使用
    this.logger.debug('MEMORY', '内存使用情况', {
      heapUsedPercent: `${heapUsedPercent.toFixed(2)}%`,
      rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)}MB`,
      heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`,
      heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`
    })

    // 检查是否需要清理
    if (heapUsedPercent > this.thresholds.triggerCleanup) {
      this.performCleanup()
    }
  }

  /**
   * 执行清理
   */
  performCleanup() {
    const startTime = Date.now()
    const memoryBefore = process.memoryUsage()

    this.logger.info('MEMORY', '开始执行内存清理', {
      heapUsedPercent: `${((memoryBefore.heapUsed / memoryBefore.heapTotal) * 100).toFixed(2)}%`
    })

    let cleanedItems = 0

    // 执行所有清理任务
    for (const task of this.cleanupTasks) {
      try {
        const count = task.cleanup()
        if (count > 0) {
          cleanedItems += count
          this.logger.debug('MEMORY', `清理任务执行成功`, {
            task: task.name,
            count
          })
        }
      } catch (error) {
        this.logger.error('MEMORY', `清理任务执行失败`, {
          task: task.name,
          error: error.message
        })
      }
    }

    // 尝试触发垃圾回收
    if (global.gc) {
      try {
        global.gc()
        this.logger.debug('MEMORY', '手动触发垃圾回收')
      } catch (error) {
        this.logger.error('MEMORY', '垃圾回收失败', {
          error: error.message
        })
      }
    }

    const memoryAfter = process.memoryUsage()
    const memoryFreed = memoryBefore.heapUsed - memoryAfter.heapUsed
    const duration = Date.now() - startTime

    // 更新统计
    this.stats.totalCleanups++
    this.stats.lastCleanupTime = new Date().toISOString()
    this.stats.memoryFreed += memoryFreed
    this.stats.avgHeapBefore =
      (this.stats.avgHeapBefore * (this.stats.totalCleanups - 1) + memoryBefore.heapUsed) / this.stats.totalCleanups
    this.stats.avgHeapAfter =
      (this.stats.avgHeapAfter * (this.stats.totalCleanups - 1) + memoryAfter.heapUsed) / this.stats.totalCleanups

    this.logger.success('MEMORY', '内存清理完成', {
      duration: `${duration}ms`,
      cleanedItems,
      memoryFreed: `${(memoryFreed / 1024 / 1024).toFixed(2)}MB`,
      heapBefore: `${(memoryBefore.heapUsed / 1024 / 1024).toFixed(2)}MB`,
      heapAfter: `${(memoryAfter.heapUsed / 1024 / 1024).toFixed(2)}MB`
    })
  }

  /**
   * 注册清理任务
   * @param {Object} task - 清理任务对象
   */
  registerCleanupTask(task) {
    this.cleanupTasks.push({
      name: task.name || 'unnamed',
      cleanup: task.cleanup || (() => 0),
      priority: task.priority || 0
    })

    // 按优先级排序
    this.cleanupTasks.sort((a, b) => b.priority - a.priority)

    this.logger.info('MEMORY', `清理任务已注册`, {
      name: task.name,
      totalTasks: this.cleanupTasks.length
    })
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const memoryUsage = process.memoryUsage()
    const heapUsedPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100

    return {
      ...this.stats,
      currentMemory: {
        heapUsedPercent: `${heapUsedPercent.toFixed(2)}%`,
        rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)}MB`,
        heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`,
        heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        external: `${(memoryUsage.external / 1024 / 1024).toFixed(2)}MB`
      },
      registeredTasks: this.cleanupTasks.length,
      isRunning: !!this.timer
    }
  }

  /**
   * 强制执行清理
   */
  forceCleanup() {
    this.performCleanup()
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.stats = {
      totalCleanups: 0,
      lastCleanupTime: null,
      memoryFreed: 0,
      avgHeapBefore: 0,
      avgHeapAfter: 0
    }
  }
}

// 全局内存清理器实例（延迟初始化）
let globalMemoryCleaner = null

/**
 * 获取全局内存清理器实例
 */
function getGlobalMemoryCleaner(options = {}) {
  if (!globalMemoryCleaner) {
    globalMemoryCleaner = new MemoryCleaner({
      logger: options.logger,
      ...options
    })
  }
  return globalMemoryCleaner
}

/**
 * 中间件：检查内存使用
 */
function memoryCheckMiddleware(options = {}) {
  const {
    threshold = 90, // 内存使用阈值（百分比）
    logger = null
  } = options

  return (req, res, next) => {
    const memoryUsage = process.memoryUsage()
    const heapUsedPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100

    // 添加内存使用头
    res.setHeader('X-Memory-Heap-Used', `${heapUsedPercent.toFixed(2)}%`)
    res.setHeader('X-Memory-RSS', `${(memoryUsage.rss / 1024 / 1024).toFixed(2)}MB`)

    // 如果内存使用过高，记录警告
    if (heapUsedPercent > threshold) {
      logger?.warn('MEMORY', `内存使用过高 [${req.id}]`, {
        heapUsedPercent: `${heapUsedPercent.toFixed(2)}%`,
        threshold: `${threshold}%`,
        rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)}MB`
      })

      // 可以选择性地拒绝请求
      if (options.rejectOnHighMemory) {
        return res.status(503).json({
          success: false,
          error: {
            code: 'HIGH_MEMORY_USAGE',
            message: '服务器内存使用过高，请稍后再试'
          }
        })
      }
    }

    next()
  }
}

module.exports = {
  MemoryCleaner,
  getGlobalMemoryCleaner,
  memoryCheckMiddleware
}
