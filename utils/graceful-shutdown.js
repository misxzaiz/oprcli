/**
 * 优雅关闭处理器
 *
 * 确保应用在收到终止信号时能够：
 * 1. 停止接受新请求
 * 2. 完成正在处理的请求
 * 3. 关闭所有连接
 * 4. 释放资源
 * 5. 保存必要的数据
 *
 * @example
 * ```js
 * const shutdown = new GracefulShutdown(server, logger);
 * shutdown.setup();
 * ```
 */

class GracefulShutdown {
  constructor(server, logger, options = {}) {
    this.server = server
    this.logger = logger
    this.options = {
      timeout: options.timeout || 30000, // 默认 30 秒
      forceTimeout: options.forceTimeout || 5000, // 强制关闭超时 5 秒
      ...options
    }
    this.isShuttingDown = false
    this.connections = new Set()
    this.cleanupTasks = []
  }

  /**
   * 设置信号监听器
   */
  setup() {
    // 监听终止信号
    process.on('SIGTERM', () => this.shutdown('SIGTERM'))
    process.on('SIGINT', () => this.shutdown('SIGINT'))

    // 监听未捕获的异常
    process.on('uncaughtException', (error) => {
      this.logger.error('SHUTDOWN', '未捕获的异常', {
        error: error.message,
        stack: error.stack
      })
      this.shutdown('UNCAUGHT_EXCEPTION')
    })

    // 监听未处理的 Promise 拒绝
    // 注意：仅记录日志，不触发关闭，避免因发送失败等非致命错误导致服务崩溃
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('SHUTDOWN', '未处理的 Promise 拒绝（已记录，不触发关闭）', { reason })
      // 不调用 this.shutdown()，让服务继续运行
    })

    this.logger.info('SHUTDOWN', '优雅关闭处理器已设置')
  }

  /**
   * 注册清理任务
   * @param {Function} task - 清理任务（返回 Promise）
   */
  registerCleanupTask(task) {
    if (typeof task === 'function') {
      this.cleanupTasks.push(task)
      this.logger.info('SHUTDOWN', '已注册清理任务', { totalTasks: this.cleanupTasks.length })
    }
  }

  /**
   * 开始关闭流程
   * @param {string} signal - 触发关闭的信号
   */
  async shutdown(signal) {
    if (this.isShuttingDown) {
      this.logger.warning('SHUTDOWN', '已经在关闭中，忽略信号')
      return
    }

    this.isShuttingDown = true
    const startTime = Date.now()

    this.logger.warning('SHUTDOWN', `收到 ${signal} 信号，开始优雅关闭...`)

    try {
      // 1. 停止接受新连接
      await this._stopAcceptingConnections()

      // 2. 等待现有请求完成
      await this._waitForRequests()

      // 3. 执行清理任务
      await this._executeCleanupTasks()

      // 4. 关闭服务器
      await this._closeServer()

      const duration = Date.now() - startTime
      this.logger.success('SHUTDOWN', `优雅关闭完成，耗时 ${duration}ms`)

      // 退出进程
      process.exit(0)
    } catch (error) {
      this.logger.error('SHUTDOWN', '优雅关闭失败', { error: error.message })

      // 强制退出
      setTimeout(() => {
        this.logger.error('SHUTDOWN', '强制退出')
        process.exit(1)
      }, this.options.forceTimeout)
    }
  }

  /**
   * 停止接受新连接
   */
  async _stopAcceptingConnections() {
    return new Promise((resolve) => {
      this.server.close((err) => {
        if (err) {
          this.logger.warning('SHUTDOWN', '服务器关闭时出错', { error: err.message })
        } else {
          this.logger.info('SHUTDOWN', '已停止接受新连接')
        }
        resolve()
      })
    })
  }

  /**
   * 等待现有请求完成
   */
  async _waitForRequests() {
    const timeout = this.options.timeout
    const startTime = Date.now()

    this.logger.info('SHUTDOWN', `等待现有请求完成（超时 ${timeout}ms）...`)

    // 定期检查
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const elapsed = Date.now() - startTime

        // 检查是否有活跃连接（这里简化处理）
        // 实际应用中可能需要跟踪活跃请求
        if (elapsed > timeout) {
          this.logger.warning('SHUTDOWN', '等待请求超时，继续关闭流程')
          clearInterval(checkInterval)
          resolve()
        }
      }, 500)

      // 超时保护：确保在超时后清理定时器
      setTimeout(() => {
        if (checkInterval) {
          clearInterval(checkInterval)
        }
        resolve()
      }, timeout + 100)
    })
  }

  /**
   * 执行清理任务
   */
  async _executeCleanupTasks() {
    if (this.cleanupTasks.length === 0) {
      return
    }

    this.logger.info('SHUTDOWN', `执行 ${this.cleanupTasks.length} 个清理任务...`)

    for (let i = 0; i < this.cleanupTasks.length; i++) {
      try {
        const taskName = this.cleanupTasks[i].name || `Task ${i + 1}`
        this.logger.info('SHUTDOWN', `执行清理任务: ${taskName}`)
        await this.cleanupTasks[i]()
        this.logger.success('SHUTDOWN', `清理任务完成: ${taskName}`)
      } catch (error) {
        this.logger.error('SHUTDOWN', '清理任务失败', {
          task: i,
          error: error.message
        })
      }
    }
  }

  /**
   * 关闭服务器
   */
  async _closeServer() {
    return new Promise((resolve) => {
      // 服务器已经在 _stopAcceptingConnections 中关闭
      // 这里只是为了确保
      resolve()
    })
  }

  /**
   * 手动触发关闭（用于测试）
   */
  triggerShutdown() {
    return this.shutdown('MANUAL')
  }
}

module.exports = GracefulShutdown
