/**
 * 请求性能追踪器
 *
 * 功能：
 * - 记录请求响应时间
 * - 统计慢请求
 * - 生成性能报告
 * - 识别性能瓶颈
 *
 * 🆕 创建于 2026-03-05 自动升级优化
 *
 * @example
 * ```js
 * const tracker = new PerformanceTracker({ slowRequestThreshold: 1000 });
 * app.use(tracker.middleware());
 * ```
 */

class PerformanceTracker {
  constructor(options = {}) {
    this.slowRequestThreshold = options.slowRequestThreshold || 1000 // 默认 1 秒
    this.maxHistorySize = options.maxHistorySize || 1000 // 保留最近 1000 条记录
    this.enabled = options.enabled !== false

    // 请求历史
    this.history = []

    // 统计信息
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      slowRequests: 0,
      totalResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      lastResetTime: new Date()
    }

    // 路由统计
    this.routeStats = new Map()

    // 状态码统计
    this.statusStats = new Map()

    // 慢请求记录
    this.slowRequests = []
  }

  /**
   * 创建 Express 中间件
   */
  middleware() {
    return (req, res, next) => {
      if (!this.enabled) {
        return next()
      }

      const startTime = Date.now()
      const route = req.route ? req.route.path : req.path

      // 监听响应完成
      res.on('finish', () => {
        const duration = Date.now() - startTime
        this._recordRequest(req, res, duration, route)
      })

      next()
    }
  }

  /**
   * 记录请求
   * @private
   */
  _recordRequest(req, res, duration, route) {
    const timestamp = new Date()
    const record = {
      timestamp,
      method: req.method,
      path: req.path,
      route,
      statusCode: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.get('user-agent')
    }

    // 添加到历史
    this.history.push(record)
    if (this.history.length > this.maxHistorySize) {
      this.history.shift()
    }

    // 更新统计
    this.stats.totalRequests++
    this.stats.totalResponseTime += duration
    this.stats.minResponseTime = Math.min(this.stats.minResponseTime, duration)
    this.stats.maxResponseTime = Math.max(this.stats.maxResponseTime, duration)

    if (res.statusCode >= 200 && res.statusCode < 400) {
      this.stats.successfulRequests++
    } else {
      this.stats.failedRequests++
    }

    // 更新路由统计
    if (!this.routeStats.has(route)) {
      this.routeStats.set(route, {
        count: 0,
        totalTime: 0,
        minTime: Infinity,
        maxTime: 0,
        errors: 0
      })
    }
    const routeStat = this.routeStats.get(route)
    routeStat.count++
    routeStat.totalTime += duration
    routeStat.minTime = Math.min(routeStat.minTime, duration)
    routeStat.maxTime = Math.max(routeStat.maxTime, duration)
    if (res.statusCode >= 400) {
      routeStat.errors++
    }

    // 更新状态码统计
    const statusKey = `${Math.floor(res.statusCode / 100)}xx`
    if (!this.statusStats.has(statusKey)) {
      this.statusStats.set(statusKey, 0)
    }
    this.statusStats.set(statusKey, this.statusStats.get(statusKey) + 1)

    // 记录慢请求
    if (duration >= this.slowRequestThreshold) {
      this.stats.slowRequests++
      this.slowRequests.push(record)
      if (this.slowRequests.length > 100) {
        this.slowRequests.shift()
      }
    }
  }

  /**
   * 获取统计摘要
   */
  getSummary() {
    const avgResponseTime = this.stats.totalRequests > 0
      ? this.stats.totalResponseTime / this.stats.totalRequests
      : 0

    const errorRate = this.stats.totalRequests > 0
      ? (this.stats.failedRequests / this.stats.totalRequests) * 100
      : 0

    const slowRequestRate = this.stats.totalRequests > 0
      ? (this.stats.slowRequests / this.stats.totalRequests) * 100
      : 0

    return {
      totalRequests: this.stats.totalRequests,
      successfulRequests: this.stats.successfulRequests,
      failedRequests: this.stats.failedRequests,
      errorRate: `${errorRate.toFixed(2)}%`,
      avgResponseTime: `${avgResponseTime.toFixed(2)}ms`,
      minResponseTime: this.stats.minResponseTime === Infinity ? 0 : `${this.stats.minResponseTime}ms`,
      maxResponseTime: `${this.stats.maxResponseTime}ms`,
      slowRequests: this.stats.slowRequests,
      slowRequestRate: `${slowRequestRate.toFixed(2)}%`,
      uptime: `${Math.round((Date.now() - this.stats.lastResetTime.getTime()) / 1000)}s`
    }
  }

  /**
   * 获取路由性能报告
   */
  getRouteReport() {
    const report = []

    for (const [route, stats] of this.routeStats.entries()) {
      report.push({
        route,
        count: stats.count,
        avgTime: `${(stats.totalTime / stats.count).toFixed(2)}ms`,
        minTime: `${stats.minTime}ms`,
        maxTime: `${stats.maxTime}ms`,
        errors: stats.errors,
        errorRate: `${((stats.errors / stats.count) * 100).toFixed(2)}%`
      })
    }

    // 按平均响应时间排序
    report.sort((a, b) => {
      const aTime = parseFloat(a.avgTime)
      const bTime = parseFloat(b.avgTime)
      return bTime - aTime
    })

    return report
  }

  /**
   * 获取状态码分布
   */
  getStatusDistribution() {
    const distribution = {}

    for (const [status, count] of this.statusStats.entries()) {
      distribution[status] = count
    }

    return distribution
  }

  /**
   * 获取慢请求列表
   */
  getSlowRequests(limit = 20) {
    return this.slowRequests
      .slice(-limit)
      .map(req => ({
        time: req.timestamp.toISOString(),
        method: req.method,
        path: req.path,
        duration: `${req.duration}ms`,
        statusCode: req.statusCode
      }))
  }

  /**
   * 获取性能建议
   */
  getPerformanceAdvice() {
    const advice = []
    const summary = this.getSummary()
    const avgResponseTime = parseFloat(summary.avgResponseTime)
    const errorRate = parseFloat(summary.errorRate)
    const slowRequestRate = parseFloat(summary.slowRequestRate)

    // 响应时间建议
    if (avgResponseTime > 500) {
      advice.push({
        level: 'warning',
        message: `平均响应时间过高 (${summary.avgResponseTime})`,
        suggestions: [
          '检查数据库查询性能',
          '优化慢查询',
          '考虑添加缓存',
          '检查外部 API 调用'
        ]
      })
    }

    // 错误率建议
    if (errorRate > 5) {
      advice.push({
        level: 'error',
        message: `错误率过高 (${summary.errorRate})`,
        suggestions: [
          '检查错误日志',
          '修复常见错误',
          '改进错误处理',
          '增加输入验证'
        ]
      })
    }

    // 慢请求建议
    if (slowRequestRate > 10) {
      advice.push({
        level: 'warning',
        message: `慢请求比例过高 (${summary.slowRequestRate})`,
        suggestions: [
          '识别慢请求路径',
          '优化性能瓶颈',
          '增加超时设置',
          '考虑异步处理'
        ]
      })
    }

    // 性能良好
    if (advice.length === 0) {
      advice.push({
        level: 'success',
        message: '系统性能良好',
        suggestions: [
          '继续保持监控',
          '定期检查性能指标'
        ]
      })
    }

    return advice
  }

  /**
   * 生成完整报告
   */
  generateReport() {
    return {
      summary: this.getSummary(),
      routes: this.getRouteReport(),
      statusDistribution: this.getStatusDistribution(),
      slowRequests: this.getSlowRequests(),
      advice: this.getPerformanceAdvice(),
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 重置统计
   */
  reset() {
    this.history = []
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      slowRequests: 0,
      totalResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      lastResetTime: new Date()
    }
    this.routeStats.clear()
    this.statusStats.clear()
    this.slowRequests = []
  }

  /**
   * 启用追踪
   */
  enable() {
    this.enabled = true
  }

  /**
   * 禁用追踪
   */
  disable() {
    this.enabled = false
  }

  /**
   * 导出数据
   */
  exportData(format = 'json') {
    const data = {
      summary: this.getSummary(),
      routes: this.getRouteReport(),
      statusDistribution: this.getStatusDistribution(),
      slowRequests: this.getSlowRequests(),
      history: this.history.map(h => ({
        timestamp: h.timestamp.toISOString(),
        method: h.method,
        path: h.path,
        duration: h.duration,
        statusCode: h.statusCode
      })),
      exportedAt: new Date().toISOString()
    }

    if (format === 'json') {
      return JSON.stringify(data, null, 2)
    }

    return data
  }
}

module.exports = PerformanceTracker
