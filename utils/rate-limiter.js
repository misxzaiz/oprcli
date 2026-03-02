/**
 * 速率限制器
 * 防止消息发送过快被限流
 */

class RateLimiter {
  constructor(maxRequests = 5, perMilliseconds = 1000) {
    this.maxRequests = maxRequests
    this.perMilliseconds = perMilliseconds
    this.requests = []
  }

  async waitForSlot() {
    const now = Date.now()
    this.requests = this.requests.filter(t => now - t < this.perMilliseconds)

    if (this.requests.length >= this.maxRequests) {
      const oldest = this.requests[0]
      const waitTime = this.perMilliseconds - (now - oldest)
      if (waitTime > 0) {
        await this.sleep(waitTime)
      }
      this.requests.shift()
    }

    this.requests.push(now)
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  getStats() {
    return {
      recent: this.requests.length,
      max: this.maxRequests
    }
  }
}

module.exports = RateLimiter
