/**
 * 批量日志写入器
 *
 * 功能：
 * - 缓冲多条日志，减少 I/O 操作
 * - 定时批量写入
 * - 支持异步和同步模式
 * - 自动日志轮转
 *
 * 🆕 创建于 2026-03-05 自动升级优化
 *
 * @example
 * ```js
 * const batchLogger = new BatchLogger({
 *   logFile: 'logs/app.log',
 *   batchSize: 100,
 *   flushInterval: 5000
 * });
 * batchLogger.log('info', 'Application started');
 * ```
 */

const fs = require('fs')
const path = require('path')

class BatchLogger {
  constructor(options = {}) {
    this.logFile = options.logFile || 'logs/app.log'
    this.batchSize = options.batchSize || 50 // 默认 50 条日志批量写入
    this.flushInterval = options.flushInterval || 3000 // 默认 3 秒
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024 // 默认 10 MB
    this.maxFiles = options.maxFiles || 5 // 默认保留 5 个日志文件
    this.asyncMode = options.asyncMode !== false // 默认异步模式

    this.buffer = []
    this.flushTimer = null
    this.isWriting = false
    this.currentFileSize = 0

    // 初始化
    this._initLogFile()
    this._startFlushTimer()

    // 统计信息
    this.stats = {
      totalLogs: 0,
      totalFlushes: 0,
      totalBytes: 0,
      droppedLogs: 0
    }
  }

  /**
   * 初始化日志文件
   * @private
   */
  _initLogFile() {
    try {
      const dir = path.dirname(this.logFile)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      // 检查文件是否存在并获取当前大小
      if (fs.existsSync(this.logFile)) {
        const stats = fs.statSync(this.logFile)
        this.currentFileSize = stats.size
      }
    } catch (error) {
      console.error('批量日志写入器初始化失败:', error.message)
    }
  }

  /**
   * 启动定时刷新
   * @private
   */
  _startFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
    }

    this.flushTimer = setInterval(() => {
      this.flush()
    }, this.flushInterval)
  }

  /**
   * 记录日志
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {Object} meta - 元数据
   */
  log(level, message, meta = null) {
    const timestamp = new Date().toISOString()
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      meta
    }

    // 格式化日志行
    const logLine = this._formatLogEntry(logEntry)

    // 添加到缓冲区
    this.buffer.push(logLine)
    this.stats.totalLogs++

    // 检查是否需要立即刷新
    if (this.buffer.length >= this.batchSize) {
      this.flush()
    }
  }

  /**
   * 格式化日志条目
   * @private
   */
  _formatLogEntry(entry) {
    let logLine = `[${entry.timestamp}] [${entry.level}] ${entry.message}`

    if (entry.meta && typeof entry.meta === 'object') {
      try {
        const metaStr = JSON.stringify(entry.meta)
        logLine += ` | ${metaStr}`
      } catch (error) {
        // 忽略序列化错误
      }
    }

    return logLine + '\n'
  }

  /**
   * 刷新缓冲区到文件
   * @returns {Promise<boolean>} 是否成功刷新
   */
  async flush() {
    if (this.isWriting || this.buffer.length === 0) {
      return false
    }

    this.isWriting = true
    const logsToWrite = this.buffer.splice(0, this.buffer.length)

    try {
      // 检查是否需要轮转
      if (this.currentFileSize >= this.maxFileSize) {
        await this._rotateLogFile()
      }

      // 写入日志
      const data = logsToWrite.join('')
      await this._writeToFile(data)

      this.stats.totalFlushes++
      this.stats.totalBytes += data.length

      return true
    } catch (error) {
      console.error('批量日志写入失败:', error.message)
      this.stats.droppedLogs += logsToWrite.length
      return false
    } finally {
      this.isWriting = false
    }
  }

  /**
   * 写入到文件
   * @private
   */
  async _writeToFile(data) {
    return new Promise((resolve, reject) => {
      if (this.asyncMode) {
        fs.appendFile(this.logFile, data, 'utf8', (err) => {
          if (err) {
            reject(err)
          } else {
            this.currentFileSize += data.length
            resolve()
          }
        })
      } else {
        try {
          fs.appendFileSync(this.logFile, data, 'utf8')
          this.currentFileSize += data.length
          resolve()
        } catch (err) {
          reject(err)
        }
      }
    })
  }

  /**
   * 轮转日志文件
   * @private
   */
  async _rotateLogFile() {
    try {
      // 关闭当前文件（如果需要）
      // 删除最旧的日志文件
      const oldestFile = `${this.logFile}.${this.maxFiles}`
      if (fs.existsSync(oldestFile)) {
        fs.unlinkSync(oldestFile)
      }

      // 重命名现有日志文件
      for (let i = this.maxFiles - 1; i >= 1; i--) {
        const currentFile = i === 1 ? this.logFile : `${this.logFile}.${i}`
        const newFile = `${this.logFile}.${i + 1}`

        if (fs.existsSync(currentFile)) {
          fs.renameSync(currentFile, newFile)
        }
      }

      // 重置文件大小
      this.currentFileSize = 0

      return true
    } catch (error) {
      console.error('日志文件轮转失败:', error.message)
      return false
    }
  }

  /**
   * 同步刷新（阻塞式）
   */
  flushSync() {
    const wasAsync = this.asyncMode
    this.asyncMode = false

    try {
      return this.flush()
    } finally {
      this.asyncMode = wasAsync
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      bufferSize: this.buffer.length,
      currentFileSize: this.currentFileSize,
      currentFileSizeMB: (this.currentFileSize / 1024 / 1024).toFixed(2)
    }
  }

  /**
   * 清空缓冲区
   */
  clear() {
    this.buffer = []
  }

  /**
   * 停止批量日志写入器
   */
  async stop() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }

    // 刷新剩余日志
    await this.flush()
  }

  /**
   * 销毁批量日志写入器
   */
  async destroy() {
    await this.stop()
    this.buffer = []
    this.stats = null
  }
}

/**
 * 创建批量日志写入器中间件
 * @param {BatchLogger} batchLogger - 批量日志写入器实例
 * @returns {Function} Express 中间件
 */
function createBatchLoggerMiddleware(batchLogger) {
  return (req, res, next) => {
    const startTime = Date.now()

    // 记录请求
    batchLogger.log('info', `${req.method} ${req.originalUrl}`, {
      ip: req.ip,
      userAgent: req.get('user-agent')
    })

    // 监听响应
    res.on('finish', () => {
      const duration = Date.now() - startTime
      batchLogger.log('info', `${req.method} ${req.originalUrl} - ${res.statusCode}`, {
        duration: `${duration}ms`,
        status: res.statusCode
      })
    })

    next()
  }
}

module.exports = {
  BatchLogger,
  createBatchLoggerMiddleware
}
