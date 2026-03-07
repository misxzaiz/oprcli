/**
 * 基础平台集成类
 *
 * 提供所有平台集成的通用功能：
 * - 消息去重
 * - 会话管理
 * - 重试机制
 *
 * 子类需要实现以下抽象方法：
 * - connect(messageHandler): 连接到平台
 * - send(target, message, originalMessage, type): 发送消息
 * - extractContent(rawMessage): 提取消息内容
 * - getConversationId(rawMessage, type): 获取会话ID
 * - getReplyTarget(rawMessage): 获取回复目标
 */

class BasePlatformIntegration {
  constructor(config, logger, rateLimiter) {
    this.config = config
    this.logger = logger
    this.rateLimiter = rateLimiter

    // 简化的存储（使用普通Map，不用BoundedMap）
    this.conversations = new Map()
    this.processedMessages = new Map()
  }

  // ==================== 通用方法 ====================

  /**
   * 检查消息是否已处理
   * @param {string} messageId - 消息ID
   * @returns {boolean}
   */
  isProcessed(messageId) {
    return this.processedMessages.has(messageId)
  }

  /**
   * 标记消息为已处理
   * @param {string} messageId - 消息ID
   */
  markAsProcessed(messageId) {
    this.processedMessages.set(messageId, Date.now())
  }

  /**
   * 获取会话
   * @param {string} conversationId - 会话ID
   * @returns {object|null} 会话对象 { sessionId, provider, startTime }
   */
  getSession(conversationId) {
    return this.conversations.get(conversationId) || null
  }

  /**
   * 设置会话
   * @param {string} conversationId - 会话ID
   * @param {string} sessionId - SessionID
   * @param {string} provider - Provider名称
   */
  setSession(conversationId, sessionId, provider) {
    this.conversations.set(conversationId, {
      sessionId,
      provider,
      startTime: Date.now()
    })

    this.logger.debug('SESSION', `会话已保存`, {
      conversationId,
      sessionId,
      provider,
      totalSessions: this.conversations.size
    })
  }

  /**
   * 简化的重试发送机制（指数退避）
   * @param {string} target - 目标（webhook URL 或 channel ID）
   * @param {string} message - 消息内容
   * @param {Function} sendFn - 实际的发送函数
   * @param {number} maxRetries - 最大重试次数
   * @returns {Promise<*>}
   */
  async sendWithRetry(target, message, sendFn, maxRetries = 3) {
    let lastError = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await sendFn(target, message)
      } catch (error) {
        lastError = error

        // 最后一次尝试失败
        if (attempt === maxRetries) {
          this.logger.error('SEND', `发送失败（已重试${maxRetries}次）: ${error.message}`)
          throw error
        }

        // 指数退避：1s, 2s, 4s（最大5s）
        const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
        this.logger.warning('SEND', `发送失败，${waitTime}ms后重试 (${attempt}/${maxRetries})...`)

        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }

    throw lastError
  }

  // ==================== 抽象方法（子类必须实现） ====================

  /**
   * 连接到平台
   * @param {Function} messageHandler - 消息处理回调函数
   * @returns {Promise<void>}
   */
  async connect(messageHandler) {
    throw new Error(`${this.constructor.name}.connect() must be implemented by subclass`)
  }

  /**
   * 发送消息到平台
   * @param {string} target - 目标（webhook URL 或 channel ID）
   * @param {string} message - 消息内容
   * @param {object} originalMessage - 原始消息对象（QQ需要）
   * @param {string} type - 消息类型（QQ需要）
   * @returns {Promise<*>}
   */
  async send(target, message, originalMessage, type) {
    throw new Error(`${this.constructor.name}.send() must be implemented by subclass`)
  }

  /**
   * 从原始消息中提取文本内容
   * @param {object} rawMessage - 原始消息对象
   * @returns {string} 消息内容
   */
  extractContent(rawMessage) {
    throw new Error(`${this.constructor.name}.extractContent() must be implemented by subclass`)
  }

  /**
   * 获取会话ID
   * @param {object} rawMessage - 原始消息对象
   * @param {string} type - 消息类型（可选）
   * @returns {string} 会话ID
   */
  getConversationId(rawMessage, type) {
    throw new Error(`${this.constructor.name}.getConversationId() must be implemented by subclass`)
  }

  /**
   * 获取回复目标
   * @param {object} rawMessage - 原始消息对象
   * @returns {string} 回复目标（webhook URL 或原始消息对象）
   */
  getReplyTarget(rawMessage) {
    throw new Error(`${this.constructor.name}.getReplyTarget() must be implemented by subclass`)
  }

  /**
   * 获取消息ID（用于去重）
   * @param {object} rawMessage - 原始消息对象
   * @param {string} type - 消息类型（可选）
   * @returns {string} 消息ID
   */
  getMessageId(rawMessage, type) {
    throw new Error(`${this.constructor.name}.getMessageId() must be implemented by subclass`)
  }
}

module.exports = BasePlatformIntegration
