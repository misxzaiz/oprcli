/**
 * 钉钉 Stream 集成模块
 * 处理钉钉机器人消息收发
 */

const axios = require('axios')
const BoundedMap = require('../utils/bounded-map')

class DingTalkIntegration {
  constructor(config, logger, rateLimiter) {
    this.config = config
    this.logger = logger
    this.rateLimiter = rateLimiter
    this.client = null

    // 统一的会话状态管理（替代原来的 sessionMap）
    // conversationId -> { sessionId, provider, startTime }
    this.conversations = new Map()

    // 🔥 使用 BoundedMap 限制 processedMessages 大小，防止内存泄漏
    // FIFO 策略：当超过最大容量时，自动删除最旧的消息
    this.processedMessages = new BoundedMap(1000, {
      evictionPolicy: 'fifo', // 先进先出
      onEvict: (key) => {
        this.logger.debug('DINGTALK', `Processed message evicted: ${key}`)
      }
    })
    // ✨ 优化：移除未使用的 maxProcessedMessages 配置（BoundedMap 已在构造时设置大小）

    // 🆕 自动清理配置
    this.cleanupConfig = {
      enabled: true,
      interval: 5 * 60 * 1000, // 5分钟
      messageAgeLimit: 60 * 60 * 1000, // 1小时
      sessionAgeLimit: 24 * 60 * 60 * 1000 // 24小时
    }

    // 🆕 清理定时器
    this.cleanupTimer = null

    // 🆕 清理统计信息
    this.cleanupStats = {
      totalRuns: 0,
      messagesCleaned: 0,
      sessionsCleaned: 0,
      lastCleanupTime: null,
      lastCleanupDuration: 0
    }
  }

  async init(messageHandler = null) {
    if (!this.config.enabled) {
      this.logger.warning('DINGTALK', '未启用')
      return false
    }

    this.logger.info('DINGTALK', '开始初始化...')
    this.logger.debug('DINGTALK', '配置信息', {
      clientId: this.config.clientId?.substring(0, 10) + '...',
      hasClientSecret: !!this.config.clientSecret
    })

    try {
      const { DWClient, TOPIC_ROBOT } = require('dingtalk-stream')

      this.logger.debug('DINGTALK', '创建 DWClient 实例')

      this.client = new DWClient({
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret
      })

      this.logger.debug('DINGTALK', '注册事件监听器')

      this.client.on('connected', () => {
        this.logger.success('DINGTALK', 'WebSocket 连接成功')
      })

      this.client.on('disconnected', () => {
        this.logger.warning('DINGTALK', '连接断开')
      })

      this.client.on('error', (error) => {
        this.logger.error('DINGTALK', '连接错误', { error: error.message, stack: error.stack })
      })

      // ⭐ 关键修复：在连接之前注册消息处理器
      // 这样可以确保不会遗漏任何消息
      if (messageHandler) {
        this.logger.debug('DINGTALK', '注册消息处理器（连接前）')
        this.client.registerCallbackListener(TOPIC_ROBOT, async (message) => {
          const messageId = message.headers?.messageId
          
          // 🔥 关键：立即响应钉钉服务器，避免 60 秒后重试
          // 必须在收到消息后立即响应，然后再异步处理
          if (messageId) {
            this.logger.debug('DINGTALK', `立即响应钉钉服务器，messageId: ${messageId}`)
            this.client.socketCallBackResponse(messageId, { status: 'SUCCESS' })
          }
          
          // 异步处理消息（不阻塞响应）
          this.logger.debug('DINGTALK', '✅ 收到消息', { headers: message.headers })
          await messageHandler(message)
        })
        this.logger.success('DINGTALK', '消息处理器已注册（连接前）')
      }

      this.logger.info('DINGTALK', '正在连接到钉钉服务器...')
      await this.client.connect()
      this.logger.success('DINGTALK', '初始化成功，客户端已连接')

      // 🆕 启动自动清理
      if (this.cleanupConfig.enabled) {
        this.startAutoCleanup()
        this.logger.info('DINGTALK', '自动内存清理已启用')
      }

      return true
    } catch (error) {
      this.logger.error('DINGTALK', '初始化失败', {
        error: error.message,
        stack: error.stack
      })
      return false
    }
  }

  registerMessageHandler(handler) {
    if (!this.client) {
      this.logger.error('DINGTALK', '客户端未初始化，无法注册消息处理器')
      return
    }

    // ⚠️ 警告：动态注册消息处理器可能会错过已发送的消息
    // 推荐在 init(messageHandler) 时传入处理器
    this.logger.warning('DINGTALK', '动态注册消息处理器（推荐在 init 时传入）')

    const { TOPIC_ROBOT } = require('dingtalk-stream')
    this.client.registerCallbackListener(TOPIC_ROBOT, async (message) => {
      this.logger.debug('DINGTALK', '✅ 收到消息（动态注册）', { headers: message.headers })
      await handler(message)
    })

    this.logger.success('DINGTALK', '消息处理器已注册')
  }

  /**
   * 发送消息到钉钉（带重试机制）
   * @param {string} sessionWebhook - Webhook URL
   * @param {Object} message - 消息对象
   * @param {number} maxRetries - 最大重试次数（默认3次）
   */
  async send(sessionWebhook, message, maxRetries = 3) {
    if (!sessionWebhook) {
      throw new Error('sessionWebhook is required')
    }

    await this.rateLimiter.waitForSlot()

    let lastError = null

    // 🆕 重试机制
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await axios.post(sessionWebhook, message, {
          timeout: 10000, // 10秒超时
          headers: {
            'Content-Type': 'application/json'
          }
        })

        if (attempt > 1) {
          this.logger.success('DINGTALK', `消息发送成功（第${attempt}次尝试）`)
        } else {
          this.logger.debug('DINGTALK', '消息已发送')
        }

        return // 成功发送，退出
      } catch (error) {
        lastError = error
        const isLastAttempt = attempt === maxRetries

        if (!isLastAttempt) {
          // 指数退避：等待时间随尝试次数增加
          const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
          this.logger.warning('DINGTALK',
            `发送失败，${waitTime}ms后重试（${attempt}/${maxRetries}）`,
            { error: error.message }
          )
          await this.sleep(waitTime)
        } else {
          this.logger.error('DINGTALK',
            `发送失败，已达最大重试次数（${maxRetries}）`,
            { error: error.message }
          )
        }
      }
    }

    // 所有重试都失败
    throw lastError
  }

  /**
   * 🆕 辅助方法：休眠指定毫秒数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  isProcessed(messageId) {
    return this.processedMessages.has(messageId)
  }

  markAsProcessed(messageId) {
    const now = Date.now()
    this.processedMessages.set(messageId, now)
    // ✨ 优化：BoundedMap 已自动处理 FIFO 淘汰，无需手动清理
    // 原手动清理逻辑已移除，避免双重管理导致的冲突
  }

  // ==================== 会话状态管理 ====================

  /**
   * 开始或更新会话
   * @param {string} conversationId - 会话 ID
   * @param {string} sessionId - AI 会话 ID
   * @param {string} provider - 提供商（claude/iflow）
   */
  setSession(conversationId, sessionId, provider) {
    this.conversations.set(conversationId, {
      sessionId,
      provider,
      startTime: Date.now()
    })
  }

  /**
   * 获取会话信息
   * @param {string} conversationId - 会话 ID
   * @returns {Object|null} { sessionId, provider, startTime }
   */
  getSession(conversationId) {
    return this.conversations.get(conversationId) || null
  }

  /**
   * 获取会话 ID
   * @param {string} conversationId - 会话 ID
   * @returns {string|null}
   */
  getSessionId(conversationId) {
    const session = this.conversations.get(conversationId)
    return session ? session.sessionId : null
  }

  /**
   * 获取提供商
   * @param {string} conversationId - 会话 ID
   * @returns {string|null}
   */
  getProvider(conversationId) {
    const session = this.conversations.get(conversationId)
    return session ? session.provider : null
  }

  /**
   * 删除会话
   * @param {string} conversationId - 会话 ID
   * @returns {boolean}
   */
  deleteSession(conversationId) {
    return this.conversations.delete(conversationId)
  }

  /**
   * 检查是否有活动会话
   * @param {string} conversationId - 会话 ID
   * @returns {boolean}
   */
  hasSession(conversationId) {
    return this.conversations.has(conversationId)
  }

  /**
   * 获取所有活动会话
   * @returns {Array}
   */
  getActiveSessions() {
    return Array.from(this.conversations.entries()).map(([convId, session]) => ({
      conversationId: convId,
      sessionId: session.sessionId,
      provider: session.provider,
      startTime: session.startTime
    }))
  }

  /**
   * 清除所有会话
   */
  clearSessions() {
    this.conversations.clear()
  }

  async close() {
    // 🆕 停止自动清理定时器
    this.stopAutoCleanup()

    if (this.client) {
      await this.client.close()
      this.logger.info('DINGTALK', 'Stream 客户端已关闭')
    }
  }

  // ==================== 🆕 自动内存清理功能 ====================

  /**
   * 启动自动清理定时器
   */
  startAutoCleanup() {
    if (this.cleanupTimer) {
      this.logger.warning('DINGTALK', '自动清理定时器已在运行')
      return
    }

    this.cleanupTimer = setInterval(() => {
      this.performCleanup().catch(error => {
        this.logger.error('DINGTALK', '自动清理失败', { error: error.message })
      })
    }, this.cleanupConfig.interval)

    this.logger.debug('DINGTALK', `自动清理定时器已启动（间隔：${this.cleanupConfig.interval / 1000}秒）`)
  }

  /**
   * 停止自动清理定时器
   */
  stopAutoCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
      this.logger.debug('DINGTALK', '自动清理定时器已停止')
    }
  }

  /**
   * 执行清理操作
   */
  async performCleanup() {
    const startTime = Date.now()
    const stats = {
      messagesCleaned: 0,
      sessionsCleaned: 0
    }

    try {
      // 清理过期的已处理消息
      stats.messagesCleaned = this.cleanExpiredMessages()

      // 清理过期的会话
      stats.sessionsCleaned = this.cleanExpiredSessions()

      // 更新统计信息
      this.cleanupStats.totalRuns++
      this.cleanupStats.messagesCleaned += stats.messagesCleaned
      this.cleanupStats.sessionsCleaned += stats.sessionsCleaned
      this.cleanupStats.lastCleanupTime = new Date().toISOString()
      this.cleanupStats.lastCleanupDuration = Date.now() - startTime

      // 如果清理了内容，记录日志
      if (stats.messagesCleaned > 0 || stats.sessionsCleaned > 0) {
        this.logger.info('DINGTALK', '内存清理完成', {
          messagesCleaned: stats.messagesCleaned,
          sessionsCleaned: stats.sessionsCleaned,
          duration: `${this.cleanupStats.lastCleanupDuration}ms`,
          processedMessagesCount: this.processedMessages.size,
          conversationsCount: this.conversations.size
        })
      }

      return stats
    } catch (error) {
      this.logger.error('DINGTALK', '清理过程出错', { error: error.message })
      throw error
    }
  }

  /**
   * 清理过期的已处理消息
   * @returns {number} 清理的消息数量
   */
  cleanExpiredMessages() {
    const now = Date.now()
    const messageAgeLimit = this.cleanupConfig.messageAgeLimit
    let cleanedCount = 0

    for (const [messageId, timestamp] of this.processedMessages.entries()) {
      if (now - timestamp > messageAgeLimit) {
        this.processedMessages.delete(messageId)
        cleanedCount++
      }
    }

    return cleanedCount
  }

  /**
   * 清理过期的会话
   * @returns {number} 清理的会话数量
   */
  cleanExpiredSessions() {
    const now = Date.now()
    const sessionAgeLimit = this.cleanupConfig.sessionAgeLimit
    let cleanedCount = 0

    for (const [conversationId, session] of this.conversations.entries()) {
      if (now - session.startTime > sessionAgeLimit) {
        this.conversations.delete(conversationId)
        cleanedCount++
        this.logger.debug('DINGTALK', `清理过期会话: ${conversationId}`)
      }
    }

    return cleanedCount
  }

  /**
   * 手动触发清理
   * @returns {Promise<Object>} 清理统计信息
   */
  async manualCleanup() {
    this.logger.info('DINGTALK', '手动触发内存清理')
    return await this.performCleanup()
  }

  /**
   * 获取清理统计信息
   * @returns {Object} 统计信息
   */
  getCleanupStats() {
    return {
      ...this.cleanupStats,
      currentProcessedMessages: this.processedMessages.size,
      currentConversations: this.conversations.size,
      maxProcessedMessages: this.processedMessages.maxSize || 1000, // 从 BoundedMap 获取最大容量
      cleanupInterval: this.cleanupConfig.interval,
      messageAgeLimit: this.cleanupConfig.messageAgeLimit,
      sessionAgeLimit: this.cleanupConfig.sessionAgeLimit,
      isAutoCleanupEnabled: this.cleanupConfig.enabled,
      isAutoCleanupRunning: this.cleanupTimer !== null
    }
  }

  /**
   * 更新清理配置
   * @param {Object} newConfig - 新的配置
   */
  updateCleanupConfig(newConfig) {
    const oldConfig = { ...this.cleanupConfig }

    // 更新配置
    if (newConfig.enabled !== undefined) this.cleanupConfig.enabled = newConfig.enabled
    if (newConfig.interval !== undefined) this.cleanupConfig.interval = newConfig.interval
    if (newConfig.messageAgeLimit !== undefined) this.cleanupConfig.messageAgeLimit = newConfig.messageAgeLimit
    if (newConfig.sessionAgeLimit !== undefined) this.cleanupConfig.sessionAgeLimit = newConfig.sessionAgeLimit

    // 如果定时器间隔改变了，重启定时器
    if (newConfig.interval !== undefined && newConfig.interval !== oldConfig.interval) {
      if (this.cleanupTimer) {
        this.stopAutoCleanup()
        if (this.cleanupConfig.enabled) {
          this.startAutoCleanup()
        }
      }
    }

    this.logger.info('DINGTALK', '清理配置已更新', {
      oldConfig,
      newConfig: this.cleanupConfig
    })
  }
}

module.exports = DingTalkIntegration
