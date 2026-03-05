/**
 * 速率限制器
 * 防止消息发送过快被限流
 *
 * 优化：
 * - 使用滑动窗口算法提升性能
 * - 使用计数器代替数组过滤，减少内存使用
 * - 添加详细的统计信息
 */

class RateLimiter {
  constructor(maxRequests = 5, perMilliseconds = 1000) {
    this.maxRequests = maxRequests
    this.perMilliseconds = perMilliseconds

    // 滑动窗口：使用计数器代替数组
    this.windowStart = Date.now()
    this.requestCount = 0

    // 统计信息
    this.totalRequests = 0
    this.totalWaitTime = 0
    this.throttledCount = 0
  }

  async waitForSlot() {
    const now = Date.now()
    const elapsed = now - this.windowStart

    // 如果时间窗口已过，重置计数器
    if (elapsed >= this.perMilliseconds) {
      this.windowStart = now
      this.requestCount = 0
    }

    // 检查是否超过限制
    if (this.requestCount >= this.maxRequests) {
      // 计算需要等待的时间
      const waitTime = this.perMilliseconds - elapsed

      if (waitTime > 0) {
        this.throttledCount++
        this.totalWaitTime += waitTime
        await this.sleep(waitTime)

        // 等待后重置窗口
        this.windowStart = Date.now()
        this.requestCount = 0
      } else {
        // 时间窗口刚好过去，立即重置
        this.windowStart = now
        this.requestCount = 0
      }
    }

    // 记录请求
    this.requestCount++
    this.totalRequests++
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  getStats() {
    const now = Date.now()
    const elapsed = now - this.windowStart
    const utilizationRate = (this.requestCount / this.maxRequests * 100).toFixed(1)

    return {
      recent: this.requestCount,
      max: this.maxRequests,
      windowRemaining: Math.max(0, this.perMilliseconds - elapsed),
      utilizationRate: `${utilizationRate}%`,
      totalRequests: this.totalRequests,
      throttledCount: this.throttledCount,
      totalWaitTime: `${(this.totalWaitTime / 1000).toFixed(2)}s`,
      avgWaitTime: this.throttledCount > 0
        ? `${(this.totalWaitTime / this.throttledCount).toFixed(0)}ms`
        : '0ms'
    }
  }

  /**
   * 重置统计信息（保留当前窗口状态）
   */
  resetStats() {
    this.totalRequests = 0
    this.totalWaitTime = 0
    this.throttledCount = 0
  }
}

module.exports = RateLimiter
