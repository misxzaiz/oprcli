/**
 * 请求统计工具
 * 跟踪和记录请求的性能指标
 *
 * @version 1.0.0
 * @created 2026-03-05
 */

class RequestStats {
  constructor() {
    // 请求计数器
    this.requestCount = 0
    this.successCount = 0
    this.errorCount = 0

    // 响应时间统计（毫秒）
    this.totalResponseTime = 0
    this.minResponseTime = Infinity
    this.maxResponseTime = 0

    // 端点统计
    this.endpointStats = new Map()

    // 状态码统计
    this.statusCodes = new Map()

    // 时间窗口统计（最近1000个请求）
    this.recentRequests = []
    this.maxRecentRequests = 1000
  }

  /**
   * 记录请求
   * @param {string} method - HTTP 方法
   * @param {string} path - 请求路径
   * @param {number} statusCode - 响应状态码
   * @param {number} responseTime - 响应时间（毫秒）
   */
  recordRequest(method, path, statusCode, responseTime) {
    const now = Date.now()

    // 更新基本计数器
    this.requestCount++
    if (statusCode >= 200 && statusCode < 400) {
      this.successCount++
    } else {
      this.errorCount++
    }

    // 更新响应时间统计
    this.totalResponseTime += responseTime
    this.minResponseTime = Math.min(this.minResponseTime, responseTime)
    this.maxResponseTime = Math.max(this.maxResponseTime, responseTime)

    // 更新端点统计
    const endpoint = `${method} ${path}`
    if (!this.endpointStats.has(endpoint)) {
      this.endpointStats.set(endpoint, {
        count: 0,
        successCount: 0,
        errorCount: 0,
        totalTime: 0,
        minTime: Infinity,
        maxTime: 0
      })
    }
    const endpointStat = this.endpointStats.get(endpoint)
    endpointStat.count++
    endpointStat.totalTime += responseTime
    endpointStat.minTime = Math.min(endpointStat.minTime, responseTime)
    endpointStat.maxTime = Math.max(endpointStat.maxTime, responseTime)
    if (statusCode >= 200 && statusCode < 400) {
      endpointStat.successCount++
    } else {
      endpointStat.errorCount++
    }

    // 更新状态码统计
    if (!this.statusCodes.has(statusCode)) {
      this.statusCodes.set(statusCode, 0)
    }
    this.statusCodes.set(statusCode, this.statusCodes.get(statusCode) + 1)

    // 更新最近请求记录
    this.recentRequests.push({
      timestamp: now,
      method,
      path,
      statusCode,
      responseTime
    })

    // 保持最近请求记录在限制内
    if (this.recentRequests.length > this.maxRecentRequests) {
      this.recentRequests.shift()
    }
  }

  /**
   * 获取基本统计信息
   * @returns {Object} 统计信息对象
   */
  getStats() {
    const avgResponseTime = this.requestCount > 0
      ? this.totalResponseTime / this.requestCount
      : 0

    const successRate = this.requestCount > 0
      ? (this.successCount / this.requestCount * 100).toFixed(2)
      : '0.00'

    return {
      requestCount: this.requestCount,
      successCount: this.successCount,
      errorCount: this.errorCount,
      successRate: `${successRate}%`,
      responseTime: {
        avg: avgResponseTime.toFixed(2),
        min: this.minResponseTime === Infinity ? 0 : this.minResponseTime,
        max: this.maxResponseTime
      },
      statusCodes: Object.fromEntries(this.statusCodes)
    }
  }

  /**
   * 获取端点统计
   * @param {number} limit - 返回的端点数量限制
   * @returns {Array} 端点统计数组
   */
  getEndpointStats(limit = 10) {
    const endpoints = []

    for (const [endpoint, stats] of this.endpointStats.entries()) {
      endpoints.push({
        endpoint,
        count: stats.count,
        successCount: stats.successCount,
        errorCount: stats.errorCount,
        successRate: ((stats.successCount / stats.count) * 100).toFixed(2) + '%',
        avgTime: (stats.totalTime / stats.count).toFixed(2),
        minTime: stats.minTime,
        maxTime: stats.maxTime
      })
    }

    // 按请求次数排序
    endpoints.sort((a, b) => b.count - a.count)

    return endpoints.slice(0, limit)
  }

  /**
   * 获取最近的请求记录
   * @param {number} limit - 返回的记录数量
   * @returns {Array} 最近的请求记录
   */
  getRecentRequests(limit = 50) {
    return this.recentRequests.slice(-limit).reverse()
  }

  /**
   * 获取时间窗口内的统计
   * @param {number} windowMs - 时间窗口（毫秒）
   * @returns {Object} 时间窗口内的统计信息
   */
  getWindowStats(windowMs = 60000) {
    const now = Date.now()
    const cutoff = now - windowMs

    // 过滤时间窗口内的请求
    const windowRequests = this.recentRequests.filter(req => req.timestamp >= cutoff)

    if (windowRequests.length === 0) {
      return {
        count: 0,
        avgResponseTime: 0,
        successRate: '0.00%',
        requestsPerSecond: 0
      }
    }

    const totalTime = windowRequests.reduce((sum, req) => sum + req.responseTime, 0)
    const successCount = windowRequests.filter(req => req.statusCode >= 200 && req.statusCode < 400).length
    const avgResponseTime = totalTime / windowRequests.length
    const successRate = (successCount / windowRequests.length * 100).toFixed(2)
    const requestsPerSecond = (windowRequests.length / (windowMs / 1000)).toFixed(2)

    return {
      count: windowRequests.length,
      avgResponseTime: avgResponseTime.toFixed(2),
      successRate: `${successRate}%`,
      requestsPerSecond: parseFloat(requestsPerSecond)
    }
  }

  /**
   * 重置所有统计数据
   */
  reset() {
    this.requestCount = 0
    this.successCount = 0
    this.errorCount = 0
    this.totalResponseTime = 0
    this.minResponseTime = Infinity
    this.maxResponseTime = 0
    this.endpointStats.clear()
    this.statusCodes.clear()
    this.recentRequests = []
  }

  /**
   * 获取性能报告
   * @returns {string} 格式化的性能报告
   */
  getPerformanceReport() {
    const stats = this.getStats()
    const endpointStats = this.getEndpointStats(5)
    const windowStats = this.getWindowStats(60000) // 最近1分钟

    let report = '\n📊 请求统计报告\n'
    report += '='.repeat(50) + '\n'
    report += `总请求数: ${stats.requestCount}\n`
    report += `成功请求: ${stats.successCount}\n`
    report += `失败请求: ${stats.errorCount}\n`
    report += `成功率: ${stats.successRate}\n`
    report += '\n⏱️ 响应时间\n'
    report += `- 平均: ${stats.responseTime.avg}ms\n`
    report += `- 最小: ${stats.responseTime.min}ms\n`
    report += `- 最大: ${stats.responseTime.max}ms\n`
    report += '\n📈 最近1分钟\n'
    report += `- 请求数: ${windowStats.count}\n`
    report += `- RPS: ${windowStats.requestsPerSecond}\n`
    report += `- 平均响应时间: ${windowStats.avgResponseTime}ms\n`
    report += '\n🔥 热门端点 (Top 5)\n'

    endpointStats.forEach((ep, index) => {
      report += `${index + 1}. ${ep.endpoint}\n`
      report += `   次数: ${ep.count} | 成功率: ${ep.successRate} | 平均时间: ${ep.avgTime}ms\n`
    })

    report += '='.repeat(50)

    return report
  }
}

// 创建全局单例
const globalRequestStats = new RequestStats()

module.exports = {
  RequestStats,
  globalRequestStats
}
