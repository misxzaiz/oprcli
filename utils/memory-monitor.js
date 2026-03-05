/**
 * 内存监控器
 *
 * 定期采集内存使用情况，检测内存泄漏
 *
 * @example
 * ```js
 * const monitor = new MemoryMonitor(logger);
 * monitor.start();
 * monitor.setThreshold(500 * 1024 * 1024); // 设置 500MB 阈值
 * ```
 */

class MemoryMonitor {
  constructor(logger, options = {}) {
    this.logger = logger
    this.options = {
      interval: options.interval || 60000, // 默认 60 秒
      threshold: options.threshold || 500 * 1024 * 1024, // 默认 500MB
      alertCooldown: options.alertCooldown || 300000, // 告警冷却时间 5 分钟
      historySize: options.historySize || 60, // 保留 60 个历史记录
      ...options
    }
    this.timer = null
    this.history = []
    this.lastAlertTime = 0
    this.startUsage = null
    this.isRunning = false
  }

  /**
   * 启动监控
   */
  start() {
    if (this.isRunning) {
      this.logger.warning('MEMORY', '内存监控已在运行')
      return
    }

    this.isRunning = true
    this.startUsage = process.memoryUsage()

    this.logger.info('MEMORY', '内存监控已启动', {
      interval: this.options.interval + 'ms',
      threshold: (this.options.threshold / 1024 / 1024).toFixed(2) + 'MB'
    })

    // 立即采集一次
    this._collect()

    // 定时采集
    this.timer = setInterval(() => {
      this._collect()
    }, this.options.interval)
  }

  /**
   * 停止监控
   */
  stop() {
    if (!this.isRunning) {
      return
    }

    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }

    this.isRunning = false
    this.logger.info('MEMORY', '内存监控已停止')
  }

  /**
   * 采集内存数据
   */
  _collect() {
    const usage = process.memoryUsage()
    const timestamp = Date.now()

    const data = {
      timestamp,
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
      arrayBuffers: usage.arrayBuffers || 0
    }

    // 添加到历史记录
    this.history.push(data)

    // 限制历史记录大小
    if (this.history.length > this.options.historySize) {
      this.history.shift()
    }

    // 检查是否超过阈值
    this._checkThreshold(usage)

    // 记录日志（INFO 级别，避免过多日志）
    this.logger.info('MEMORY', '内存使用情况', {
      heapUsed: this._formatBytes(usage.heapUsed),
      heapTotal: this._formatBytes(usage.heapTotal),
      rss: this._formatBytes(usage.rss),
      heapUsedPercent: ((usage.heapUsed / usage.heapTotal) * 100).toFixed(2) + '%'
    })
  }

  /**
   * 检查内存使用是否超过阈值
   */
  _checkThreshold(usage) {
    if (usage.heapUsed > this.options.threshold) {
      const now = Date.now()

      // 检查告警冷却时间
      if (now - this.lastAlertTime < this.options.alertCooldown) {
        return
      }

      this.lastAlertTime = now

      this.logger.error('MEMORY', '内存使用超过阈值！', {
        heapUsed: this._formatBytes(usage.heapUsed),
        threshold: this._formatBytes(this.options.threshold),
        percent: ((usage.heapUsed / this.options.threshold) * 100).toFixed(2) + '%',
        recommendation: '建议检查是否存在内存泄漏'
      })
    }
  }

  /**
   * 获取内存使用统计
   */
  getStats() {
    if (this.history.length === 0) {
      return null
    }

    const latest = this.history[this.history.length - 1]
    const oldest = this.history[0]

    // 计算内存增长率
    const growthRate = oldest ? (
      ((latest.heapUsed - oldest.heapUsed) / oldest.heapUsed * 100).toFixed(2) + '%'
    ) : '0%'

    // 计算平均内存使用
    const avgHeapUsed = this.history.reduce((sum, item) => sum + item.heapUsed, 0) / this.history.length

    // 检测可能的内存泄漏（持续增长）
    let leakDetected = false
    if (this.history.length >= 10) {
      const recent = this.history.slice(-10)
      let growthCount = 0
      for (let i = 1; i < recent.length; i++) {
        if (recent[i].heapUsed > recent[i - 1].heapUsed) {
          growthCount++
        }
      }
      if (growthCount >= 8) { // 10 个样本中至少 8 个在增长
        leakDetected = true
      }
    }

    return {
      current: {
        heapUsed: this._formatBytes(latest.heapUsed),
        heapTotal: this._formatBytes(latest.heapTotal),
        rss: this._formatBytes(latest.rss),
        heapUsedPercent: ((latest.heapUsed / latest.heapTotal) * 100).toFixed(2) + '%'
      },
      average: {
        heapUsed: this._formatBytes(avgHeapUsed)
      },
      growth: {
        rate: growthRate,
        period: this._formatDuration(latest.timestamp - oldest.timestamp)
      },
      leakDetected,
      uptime: this.startUsage ? this._formatDuration(Date.now() - this.startUsage.timestamp) : 'N/A'
    }
  }

  /**
   * 获取历史数据
   */
  getHistory() {
    return this.history.map(item => ({
      ...item,
      heapUsed: this._formatBytes(item.heapUsed),
      heapTotal: this._formatBytes(item.heapTotal),
      rss: this._formatBytes(item.rss),
      time: new Date(item.timestamp).toISOString()
    }))
  }

  /**
   * 设置内存阈值
   * @param {number} bytes - 阈值（字节）
   */
  setThreshold(bytes) {
    this.options.threshold = bytes
    this.logger.info('MEMORY', '内存阈值已更新', {
      threshold: this._formatBytes(bytes)
    })
  }

  /**
   * 设置采集间隔
   * @param {number} ms - 间隔（毫秒）
   */
  setInterval(ms) {
    this.options.interval = ms

    if (this.isRunning) {
      this.stop()
      this.start()
    }

    this.logger.info('MEMORY', '采集间隔已更新', {
      interval: ms + 'ms'
    })
  }

  /**
   * 触发 GC（如果可用）
   */
  forceGC() {
    if (global.gc) {
      const before = process.memoryUsage().heapUsed
      global.gc()
      const after = process.memoryUsage().heapUsed
      const freed = before - after

      this.logger.info('MEMORY', '手动触发 GC', {
        before: this._formatBytes(before),
        after: this._formatBytes(after),
        freed: this._formatBytes(freed)
      })

      return {
        before: this._formatBytes(before),
        after: this._formatBytes(after),
        freed: this._formatBytes(freed)
      }
    } else {
      this.logger.warning('MEMORY', 'GC 不可用，需要使用 --expose-gc 参数启动 Node.js')
      return null
    }
  }

  /**
   * 格式化字节数
   */
  _formatBytes(bytes) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  /**
   * 格式化时长
   */
  _formatDuration(ms) {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  /**
   * 销毁监控器
   */
  destroy() {
    this.stop()
    this.history = []
    this.startUsage = null
  }
}

module.exports = MemoryMonitor
