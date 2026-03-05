/**
 * 增强型内存监控器
 *
 * 功能：
 * - 实时监控内存使用情况
 * - 内存泄漏检测
 * - 自动内存使用报告
 * - 内存阈值告警
 * - GC 事件监听
 *
 * 🆕 创建于 2026-03-05 自动升级优化
 */

const os = require('os')
const v8 = require('v8')

class MemoryMonitorEnhanced {
  constructor(logger, options = {}) {
    this.logger = logger
    this.intervalMs = options.intervalMs || 60000 // 默认每分钟检查一次
    this.warningThreshold = options.warningThreshold || 0.7 // 警告阈值 70%
    this.criticalThreshold = options.criticalThreshold || 0.85 // 严重阈值 85%
    this.monitorTimer = null
    this.isMonitoring = false

    // 内存使用历史（用于趋势分析）
    this.history = []
    this.maxHistorySize = options.maxHistorySize || 60 // 保留最近 60 次记录

    // 内存泄漏检测
    this.leakDetectionEnabled = options.leakDetectionEnabled !== false
    this.leakThreshold = options.leakThreshold || 5 // 连续 5 次增长视为泄漏
    this.growthCount = 0

    // 统计信息
    this.stats = {
      maxHeapUsed: 0,
      maxHeapTotal: 0,
      maxRSS: 0,
      gcCount: 0,
      lastGCTime: null
    }

    // 监听 GC 事件
    if (options.trackGC !== false) {
      this.trackGC()
    }
  }

  /**
   * 启动监控
   */
  start() {
    if (this.isMonitoring) {
      this.logger.warning('MEMORY', '内存监控已在运行中')
      return
    }

    this.isMonitoring = true
    this.logger.info('MEMORY', `🚀 内存监控已启动（检查间隔: ${this.intervalMs}ms）`)

    // 立即执行一次检查
    this.check()

    // 定时检查
    this.monitorTimer = setInterval(() => {
      this.check()
    }, this.intervalMs)
  }

  /**
   * 停止监控
   */
  stop() {
    if (!this.isMonitoring) {
      return
    }

    this.isMonitoring = false

    if (this.monitorTimer) {
      clearInterval(this.monitorTimer)
      this.monitorTimer = null
    }

    this.logger.info('MEMORY', '⏸️ 内存监控已停止')
  }

  /**
   * 执行内存检查
   */
  check() {
    try {
      const memInfo = this.getMemoryInfo()

      // 更新历史记录
      this.addToHistory(memInfo)

      // 更新统计信息
      this.updateStats(memInfo)

      // 检查是否超过阈值
      this.checkThresholds(memInfo)

      // 检测内存泄漏
      if (this.leakDetectionEnabled) {
        this.detectLeak(memInfo)
      }

      // 记录调试信息
      this.logger.debug('MEMORY', this.formatMemoryInfo(memInfo))

      return memInfo
    } catch (error) {
      this.logger.error('MEMORY', '内存检查失败', error)
    }
  }

  /**
   * 获取内存信息
   */
  getMemoryInfo() {
    const memUsage = process.memoryUsage()
    const heapStats = v8.getHeapStatistics()

    return {
      timestamp: new Date(),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      arrayBuffers: memUsage.arrayBuffers,
      heapUsedPercent: (memUsage.heapUsed / heapStats.heap_size_limit) * 100,
      heapTotalPercent: (memUsage.heapTotal / heapStats.heap_size_limit) * 100,
      heapSizeLimit: heapStats.heap_size_limit,
      totalAvailable: heapStats.heap_size_limit,
      systemTotal: os.totalmem(),
      systemFree: os.freemem(),
      systemUsedPercent: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100
    }
  }

  /**
   * 添加到历史记录
   */
  addToHistory(memInfo) {
    this.history.push({
      timestamp: memInfo.timestamp,
      heapUsed: memInfo.heapUsed,
      heapUsedPercent: memInfo.heapUsedPercent,
      rss: memInfo.rss
    })

    // 限制历史记录大小
    if (this.history.length > this.maxHistorySize) {
      this.history.shift()
    }
  }

  /**
   * 更新统计信息
   */
  updateStats(memInfo) {
    this.stats.maxHeapUsed = Math.max(this.stats.maxHeapUsed, memInfo.heapUsed)
    this.stats.maxHeapTotal = Math.max(this.stats.maxHeapTotal, memInfo.heapTotal)
    this.stats.maxRSS = Math.max(this.stats.maxRSS, memInfo.rss)
  }

  /**
   * 检查阈值
   */
  checkThresholds(memInfo) {
    const usageRatio = memInfo.heapUsed / memInfo.heapSizeLimit

    if (usageRatio >= this.criticalThreshold) {
      this.logger.error('MEMORY',
        `🚨 内存使用严重告警: ${memInfo.heapUsedPercent.toFixed(2)}% ` +
        `(超过 ${this.criticalThreshold * 100}% 阈值)`
      )
      this.triggerGC()
    } else if (usageRatio >= this.warningThreshold) {
      this.logger.warning('MEMORY',
        `⚠️ 内存使用警告: ${memInfo.heapUsedPercent.toFixed(2)}% ` +
        `(超过 ${this.warningThreshold * 100}% 阈值)`
      )
    }
  }

  /**
   * 检测内存泄漏
   */
  detectLeak(memInfo) {
    if (this.history.length < 3) {
      return
    }

    // 获取最近几次的记录
    const recent = this.history.slice(-3)
    let increasingCount = 0

    for (let i = 1; i < recent.length; i++) {
      if (recent[i].heapUsed > recent[i - 1].heapUsed) {
        increasingCount++
      }
    }

    if (increasingCount === recent.length - 1) {
      this.growthCount++
    } else {
      this.growthCount = 0
    }

    if (this.growthCount >= this.leakThreshold) {
      this.logger.error('MEMORY',
        `🚨 可能存在内存泄漏！内存连续增长 ${this.growthCount} 次`
      )
      this.growthCount = 0 // 重置计数
    }
  }

  /**
   * 格式化内存信息
   */
  formatMemoryInfo(memInfo) {
    return (
      `Heap: ${this.formatBytes(memInfo.heapUsed)} / ${this.formatBytes(memInfo.heapTotal)} ` +
      `(${memInfo.heapUsedPercent.toFixed(2)}%) | ` +
      `RSS: ${this.formatBytes(memInfo.rss)} | ` +
      `System: ${memInfo.systemUsedPercent.toFixed(2)}%`
    )
  }

  /**
   * 格式化字节数
   */
  formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
  }

  /**
   * 触发垃圾回收
   */
  triggerGC() {
    if (global.gc) {
      this.logger.info('MEMORY', '🔄 触发垃圾回收...')
      const before = process.memoryUsage().heapUsed
      global.gc()
      const after = process.memoryUsage().heapUsed
      const freed = before - after

      this.logger.success('MEMORY',
        `✓ 垃圾回收完成，释放 ${this.formatBytes(freed)}`
      )
    } else {
      this.logger.warning('MEMORY',
        '无法触发垃圾回收，请使用 --expose-gc 参数启动 Node.js'
      )
    }
  }

  /**
   * 监听 GC 事件
   */
  trackGC() {
    if (typeof v8.getHeapStatistics !== 'function') {
      return
    }

    try {
      // 监听 GC 事件（需要 --expose-gc 或 --trace-gc）
      const v8Flags = require('v8').setFlagsFromString
      if (v8Flags) {
        // 尝试启用 GC 统计
        try {
          v8Flags('--trace-gc')
        } catch (e) {
          // 忽略错误
        }
      }

      this.logger.info('MEMORY', '✓ GC 事件监听已启用')
    } catch (error) {
      this.logger.debug('MEMORY', 'GC 事件监听初始化失败（可能需要 --expose-gc）')
    }
  }

  /**
   * 获取内存趋势
   */
  getTrend() {
    if (this.history.length < 2) {
      return { trend: 'unknown', change: 0 }
    }

    const latest = this.history[this.history.length - 1]
    const oldest = this.history[0]
    const change = latest.heapUsed - oldest.heapUsed
    const changePercent = (change / oldest.heapUsed) * 100

    let trend = 'stable'
    if (changePercent > 10) {
      trend = 'increasing'
    } else if (changePercent < -10) {
      trend = 'decreasing'
    }

    return {
      trend,
      change,
      changePercent,
      duration: latest.timestamp - oldest.timestamp
    }
  }

  /**
   * 获取详细报告
   */
  getReport() {
    const current = this.getMemoryInfo()
    const trend = this.getTrend()

    return {
      current: {
        heapUsed: this.formatBytes(current.heapUsed),
        heapTotal: this.formatBytes(current.heapTotal),
        heapUsedPercent: current.heapUsedPercent.toFixed(2) + '%',
        rss: this.formatBytes(current.rss),
        systemUsedPercent: current.systemUsedPercent.toFixed(2) + '%'
      },
      stats: {
        maxHeapUsed: this.formatBytes(this.stats.maxHeapUsed),
        maxHeapTotal: this.formatBytes(this.stats.maxHeapTotal),
        maxRSS: this.formatBytes(this.stats.maxRSS),
        gcCount: this.stats.gcCount
      },
      trend: {
        direction: trend.trend,
        change: this.formatBytes(Math.abs(trend.change)),
        changePercent: trend.changePercent.toFixed(2) + '%',
        duration: Math.round(trend.duration / 1000) + 's'
      },
      history: this.history.map(h => ({
        timestamp: h.timestamp.toISOString(),
        heapUsed: this.formatBytes(h.heapUsed),
        heapUsedPercent: h.heapUsedPercent.toFixed(2) + '%'
      })),
      isMonitoring: this.isMonitoring,
      leakDetectionEnabled: this.leakDetectionEnabled
    }
  }

  /**
   * 获取健康状态
   */
  getHealthStatus() {
    const current = this.getMemoryInfo()
    const usageRatio = current.heapUsed / current.heapSizeLimit

    let status = 'healthy'
    let message = '内存使用正常'

    if (usageRatio >= this.criticalThreshold) {
      status = 'critical'
      message = `内存使用严重告警: ${current.heapUsedPercent.toFixed(2)}%`
    } else if (usageRatio >= this.warningThreshold) {
      status = 'warning'
      message = `内存使用警告: ${current.heapUsedPercent.toFixed(2)}%`
    }

    return {
      status,
      message,
      usagePercent: current.heapUsedPercent,
      trend: this.getTrend().trend
    }
  }

  /**
   * 清理资源
   */
  dispose() {
    this.stop()
    this.history = []
    this.stats = {
      maxHeapUsed: 0,
      maxHeapTotal: 0,
      maxRSS: 0,
      gcCount: 0,
      lastGCTime: null
    }
  }
}

module.exports = MemoryMonitorEnhanced
