/**
 * 任务队列系统
 *
 * 提供异步任务管理、并发控制、优先级队列和失败重试功能
 *
 * @example
 * ```js
 * const queue = new TaskQueue({ concurrency: 5 });
 * queue.add(() => {
 *   return new Promise((resolve) => {
 *     setTimeout(() => resolve('任务完成'), 1000);
 *   });
 * }, { priority: 1 });
 * ```
 */

class TaskQueue {
  constructor(options = {}) {
    this.options = {
      concurrency: options.concurrency || 5, // 并发数
      timeout: options.timeout || 30000, // 任务超时时间（毫秒）
      maxRetries: options.maxRetries || 3, // 最大重试次数
      retryDelay: options.retryDelay || 1000, // 重试延迟（毫秒）
      autoStart: options.autoStart !== false // 自动启动
    }

    this.queue = []
    this.running = 0
    this.stats = {
      total: 0,
      completed: 0,
      failed: 0,
      retried: 0,
      timeout: 0
    }

    // 优先级映射：1=高优先级，2=中优先级，3=低优先级
    this.priorityMap = {
      1: 'high',
      2: 'medium',
      3: 'low'
    }

    if (this.options.autoStart) {
      this._processQueue()
    }
  }

  /**
   * 添加任务到队列
   * @param {Function} task - 任务函数（返回 Promise）
   * @param {Object} options - 任务选项
   * @param {number} options.priority - 优先级（1=高，2=中，3=低）
   * @param {number} options.retries - 自定义重试次数
   * @param {string} options.id - 任务ID（用于追踪）
   * @param {Object} options.metadata - 任务元数据
   * @returns {Promise} - 任务完成的 Promise
   */
  add(task, options = {}) {
    return new Promise((resolve, reject) => {
      const taskItem = {
        id: options.id || this._generateId(),
        task,
        priority: options.priority || 2,
        retries: options.retries !== undefined ? options.retries : this.options.maxRetries,
        retryCount: 0,
        metadata: options.metadata || {},
        createdAt: Date.now(),
        resolve,
        reject
      }

      this.queue.push(taskItem)
      this.stats.total++

      // 按优先级排序（数字越小优先级越高）
      this.queue.sort((a, b) => a.priority - b.priority)

      this._processQueue()
    })
  }

  /**
   * 处理队列中的任务
   * @private
   */
  async _processQueue() {
    // 如果正在运行的任务数已达到并发限制，或队列为空，则返回
    if (this.running >= this.options.concurrency || this.queue.length === 0) {
      return
    }

    // 取出队列中的第一个任务
    const taskItem = this.queue.shift()
    this.running++

    try {
      // 执行任务（带超时控制）
      const result = await this._executeWithTimeout(taskItem)

      // 任务成功
      this.stats.completed++
      taskItem.resolve(result)
    } catch (error) {
      // 任务失败，检查是否需要重试
      if (taskItem.retryCount < taskItem.retries) {
        taskItem.retryCount++
        this.stats.retried++

        // 重新加入队列，延迟重试
        setTimeout(() => {
          this.queue.unshift(taskItem)
          this._processQueue()
        }, this.options.retryDelay * taskItem.retryCount) // 指数退避

        this.running--
        this._processQueue()
        return
      }

      // 重试次数用尽，任务失败
      this.stats.failed++
      taskItem.reject(error)
    } finally {
      this.running--
      this._processQueue()
    }
  }

  /**
   * 执行任务（带超时控制）
   * @private
   */
  async _executeWithTimeout(taskItem) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.stats.timeout++
        reject(new Error(`任务超时: ${taskItem.id}`))
      }, this.options.timeout)

      taskItem.task()
        .then(result => {
          clearTimeout(timeout)
          resolve(result)
        })
        .catch(error => {
          clearTimeout(timeout)
          reject(error)
        })
    })
  }

  /**
   * 生成唯一任务 ID
   * @private
   */
  _generateId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 获取队列统计信息
   * @returns {Object} - 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      running: this.running,
      queued: this.queue.length,
      successRate: this.stats.total > 0
        ? ((this.stats.completed / this.stats.total) * 100).toFixed(2) + '%'
        : '0%',
      avgRetries: this.stats.total > 0
        ? (this.stats.retried / this.stats.total).toFixed(2)
        : '0'
    }
  }

  /**
   * 获取队列状态（详细）
   * @returns {Object} - 详细状态
   */
  getStatus() {
    const queueByPriority = {
      high: 0,
      medium: 0,
      low: 0
    }

    this.queue.forEach(item => {
      const priority = this.priorityMap[item.priority] || 'low'
      queueByPriority[priority]++
    })

    return {
      stats: this.getStats(),
      running: this.running,
      queued: this.queue.length,
      queueByPriority,
      options: {
        concurrency: this.options.concurrency,
        timeout: this.options.timeout + 'ms',
        maxRetries: this.options.maxRetries,
        retryDelay: this.options.retryDelay + 'ms'
      }
    }
  }

  /**
   * 清空队列（不影响正在运行的任务）
   */
  clear() {
    // 拒绝所有等待中的任务
    this.queue.forEach(taskItem => {
      taskItem.reject(new Error('队列已清空'))
    })

    this.queue = []
  }

  /**
   * 暂停队列（停止处理新任务）
   */
  pause() {
    this.options.autoStart = false
  }

  /**
   * 恢复队列
   */
  resume() {
    this.options.autoStart = true
    this._processQueue()
  }

  /**
   * 等待所有任务完成
   * @returns {Promise}
   */
  async onIdle() {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.queue.length === 0 && this.running === 0) {
          clearInterval(checkInterval)
          resolve()
        }
      }, 100)
    })
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      total: 0,
      completed: 0,
      failed: 0,
      retried: 0,
      timeout: 0
    }
  }
}

module.exports = TaskQueue
