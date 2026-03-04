/**
 * 钉钉 Stream 集成模块
 * 处理钉钉机器人消息收发
 */

const axios = require('axios')

class DingTalkIntegration {
  constructor(config, logger, rateLimiter) {
    this.config = config
    this.logger = logger
    this.rateLimiter = rateLimiter
    this.client = null

    // 统一的会话状态管理（替代原来的 sessionMap）
    // conversationId -> { sessionId, provider, startTime }
    this.conversations = new Map()

    // 使用 Map + 时间戳来正确删除最旧的消息（Set 是无序的）
    this.processedMessages = new Map() // messageId -> timestamp
    this.maxProcessedMessages = 1000
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

  async send(sessionWebhook, message) {
    if (!sessionWebhook) {
      throw new Error('sessionWebhook is required')
    }

    await this.rateLimiter.waitForSlot()

    try {
      await axios.post(sessionWebhook, message)
      this.logger.debug('DINGTALK', '消息已发送')
    } catch (error) {
      this.logger.error('DINGTALK', '发送失败', { error: error.message })
      throw error
    }
  }

  isProcessed(messageId) {
    return this.processedMessages.has(messageId)
  }

  markAsProcessed(messageId) {
    const now = Date.now()
    this.processedMessages.set(messageId, now)

    // 删除最旧的消息（按时间戳）
    if (this.processedMessages.size > this.maxProcessedMessages) {
      let oldestTimestamp = Infinity
      let oldestMessageId = null

      for (const [id, timestamp] of this.processedMessages.entries()) {
        if (timestamp < oldestTimestamp) {
          oldestTimestamp = timestamp
          oldestMessageId = id
        }
      }

      if (oldestMessageId) {
        this.processedMessages.delete(oldestMessageId)
      }
    }
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
    if (this.client) {
      await this.client.close()
      this.logger.info('DINGTALK', 'Stream 客户端已关闭')
    }
  }
}

module.exports = DingTalkIntegration
