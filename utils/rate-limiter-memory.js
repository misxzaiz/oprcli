/**
 * 速率限制器 - 内存存储
 * 简单高效的内存存储实现
 *
 * @version 1.0.0
 */

class MemoryStore {
  constructor(windowMs) {
    this.windowMs = windowMs
    this.clients = new Map()
    // 定期清理过期数据
    this.cleanupInterval = setInterval(() => this.cleanup(), windowMs)
  }

  /**
   * 增加请求计数
   * @param {string} key - 客户端标识
   * @returns {Object} { count, exceeded, resetTime }
   */
  increment(key) {
    const now = Date.now()
    const record = this.clients.get(key)

    if (!record) {
      // 首次请求
      const resetTime = now + this.windowMs
      this.clients.set(key, {
        count: 1,
        resetTime
      })
      return {
        count: 1,
        exceeded: false,
        resetTime
      }
    }

    // 检查是否在时间窗口内
    if (now > record.resetTime) {
      // 超出时间窗口，重置计数
      const resetTime = now + this.windowMs
      record.count = 1
      record.resetTime = resetTime
      return {
        count: 1,
        exceeded: false,
        resetTime
      }
    }

    // 在时间窗口内，增加计数
    record.count++
    return {
      count: record.count,
      resetTime: record.resetTime
    }
  }

  /**
   * 重置请求计数
   * @param {string} key - 客户端标识
   */
  reset(key) {
    this.clients.delete(key)
  }

  /**
   * 清理过期数据
   */
  cleanup() {
    const now = Date.now()
    for (const [key, record] of this.clients.entries()) {
      if (now > record.resetTime) {
        this.clients.delete(key)
      }
    }
  }

  /**
   * 获取当前存储状态
   * @returns {Object} 存储统计信息
   */
  getStats() {
    return {
      totalClients: this.clients.size,
      windowMs: this.windowMs
    }
  }

  /**
   * 清空所有数据
   */
  clear() {
    this.clients.clear()
  }

  /**
   * 销毁存储
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    this.clear()
  }
}

module.exports = MemoryStore
