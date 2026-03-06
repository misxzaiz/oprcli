/**
 * BoundedMap - 有界 Map 集合
 *
 * 防止 Map 无限增长导致内存泄漏
 * 当达到最大容量时，自动删除最旧的条目（FIFO 策略）
 *
 * @example
 * ```js
 * const map = new BoundedMap(1000); // 最多存储 1000 个条目
 * map.set('key1', 'value1');
 * map.set('key2', 'value2');
 * // 当超过 1000 个条目时，最旧的条目将被自动删除
 * ```
 */

class BoundedMap {
  /**
   * @param {number} maxSize - 最大容量，默认 1000
   * @param {Object} options - 配置选项
   * @param {string} options.evictionPolicy - �逐策略: 'fifo' (默认) | 'lru' | 'lfu'
   * @param {Function} options.onEvict - 驱逐回调 (key, value) => void
   */
  constructor(maxSize = 1000, options = {}) {
    if (maxSize <= 0) {
      throw new Error('maxSize must be greater than 0')
    }

    this.maxSize = maxSize
    this.options = {
      evictionPolicy: options.evictionPolicy || 'fifo',
      onEvict: options.onEvict || null
    }

    this.map = new Map()
    this.accessOrder = new Map() // key -> timestamp (for LRU)
    this.accessCount = new Map() // key -> count (for LFU)
    this.insertOrder = [] // [key1, key2, ...] (for FIFO)
  }

  /**
   * 设置键值对
   * @param {any} key - 键
   * @param {any} value - 值
   * @returns {BoundedMap} 返回自身，支持链式调用
   */
  set(key, value) {
    // 如果键已存在，更新值并更新访问记录
    if (this.map.has(key)) {
      this.map.set(key, value)
      this._updateAccess(key)
      return this
    }

    // 检查是否超过最大容量
    if (this.map.size >= this.maxSize) {
      this._evictOne()
    }

    // 添加新条目
    this.map.set(key, value)
    this.insertOrder.push(key)
    this.accessOrder.set(key, Date.now())
    this.accessCount.set(key, 0)

    return this
  }

  /**
   * 获取键对应的值
   * @param {any} key - 键
   * @returns {any} 值，如果键不存在则返回 undefined
   */
  get(key) {
    const value = this.map.get(key)

    if (value !== undefined) {
      this._updateAccess(key)
    }

    return value
  }

  /**
   * 检查键是否存在
   * @param {any} key - 键
   * @returns {boolean}
   */
  has(key) {
    return this.map.has(key)
  }

  /**
   * 删除键
   * @param {any} key - 键
   * @returns {boolean} 是否成功删除
   */
  delete(key) {
    const deleted = this.map.delete(key)

    if (deleted) {
      this._cleanupMetadata(key)
    }

    return deleted
  }

  /**
   * 清空所有条目
   */
  clear() {
    this.map.clear()
    this.accessOrder.clear()
    this.accessCount.clear()
    this.insertOrder = []
  }

  /**
   * 获取 Map 的大小
   * @returns {number}
   */
  get size() {
    return this.map.size
  }

  /**
   * 获取所有键
   * @returns {Array<any>}
   */
  keys() {
    return Array.from(this.map.keys())
  }

  /**
   * 获取所有值
   * @returns {Array<any>}
   */
  values() {
    return Array.from(this.map.values())
  }

  /**
   * 获取所有条目
   * @returns {Array<[any, any]>}
   */
  entries() {
    return Array.from(this.map.entries())
  }

  /**
   * 遍历所有条目
   * @param {Function} callback - (value, key, map) => void
   */
  forEach(callback) {
    this.map.forEach(callback)
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    return {
      size: this.map.size,
      maxSize: this.maxSize,
      utilization: `${((this.map.size / this.maxSize) * 100).toFixed(2)}%`,
      evictionPolicy: this.options.evictionPolicy
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 更新访问记录（用于 LRU/LFU）
   */
  _updateAccess(key) {
    const now = Date.now()
    this.accessOrder.set(key, now)

    const count = (this.accessCount.get(key) || 0) + 1
    this.accessCount.set(key, count)
  }

  /**
   * 清理元数据
   */
  _cleanupMetadata(key) {
    this.accessOrder.delete(key)
    this.accessCount.delete(key)

    const index = this.insertOrder.indexOf(key)
    if (index > -1) {
      this.insertOrder.splice(index, 1)
    }
  }

  /**
   * 驱逐一个条目
   */
  _evictOne() {
    let keyToEvict = null

    switch (this.options.evictionPolicy) {
      case 'lru':
        // Least Recently Used - 删除最久未使用的
        keyToEvict = this._findLRU()
        break

      case 'lfu':
        // Least Frequently Used - 删除使用频率最低的
        keyToEvict = this._findLFU()
        break

      case 'fifo':
      default:
        // First In First Out - 删除最早插入的
        keyToEvict = this.insertOrder[0]
        break
    }

    if (keyToEvict) {
      const value = this.map.get(keyToEvict)

      // 调用驱逐回调
      if (this.options.onEvict) {
        try {
          this.options.onEvict(keyToEvict, value)
        } catch (error) {
          console.error('[BoundedMap] Eviction callback error:', error)
        }
      }

      // 删除条目
      this.map.delete(keyToEvict)
      this._cleanupMetadata(keyToEvict)

      console.log(`[BoundedMap] Evicted key: ${keyToEvict}, Policy: ${this.options.evictionPolicy}`)
    }
  }

  /**
   * 查找最久未使用的键（LRU）
   */
  _findLRU() {
    let minTime = Infinity
    let minKey = null

    for (const [key, time] of this.accessOrder.entries()) {
      if (time < minTime) {
        minTime = time
        minKey = key
      }
    }

    return minKey
  }

  /**
   * 查找使用频率最低的键（LFU）
   */
  _findLFU() {
    let minCount = Infinity
    let minKey = null

    for (const [key, count] of this.accessCount.entries()) {
      if (count < minCount) {
        minCount = count
        minKey = key
      }
    }

    return minKey
  }
}

module.exports = BoundedMap
