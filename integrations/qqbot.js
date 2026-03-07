/**
 * QQ 机器人集成模块（重构版）
 * 处理 QQ 机器人消息收发
 * 继承 BasePlatformIntegration 基类
 */

const BasePlatformIntegration = require('./base-platform-integration')

class QQBotIntegration extends BasePlatformIntegration {
  constructor(config, logger) {
    super(config, logger)
    this.client = null
  }

  // ==================== 实现抽象方法 ====================

  /**
   * 连接到QQ平台
   * @param {Function} messageHandler - 消息处理回调
   * @returns {Promise<boolean>}
   */
  async connect(messageHandler) {
    if (!this.config.enabled) {
      this.logger.warning('QQBOT', '未启用')
      return false
    }

    try {
      const QQBotClient = require('./qqbot/qqbot-client')

      this.logger.info('QQBOT', '正在连接...')

      this.client = new QQBotClient({
        appId: this.config.appId,
        clientSecret: this.config.clientSecret,
        sandbox: this.config.sandbox || false,
        autoReconnect: true
      })

      // 注册消息监听
      this.client.on('c2c_message', async (message) => {
        await this._handleMessage(message, 'c2c', messageHandler)
      })

      this.client.on('message', async (message) => {
        await this._handleMessage(message, 'channel', messageHandler)
      })

      this.client.on('at_message', async (message) => {
        await this._handleMessage(message, 'at', messageHandler)
      })

      await this.client.connect()
      this.logger.success('QQBOT', '已连接')

      return true
    } catch (error) {
      this.logger.error('QQBOT', '连接失败', { error: error.message })
      return false
    }
  }

  /**
   * 内部：统一处理消息
   * @param {object} message - 消息对象
   * @param {string} type - 消息类型 (c2c/channel/at)
   * @param {Function} messageHandler - 消息处理回调
   */
  async _handleMessage(message, type, messageHandler) {
    const messageId = this.getMessageId(message, type)

    // 去重检查
    if (this.isProcessed(messageId)) {
      return
    }
    this.markAsProcessed(messageId)

    const conversationId = this.getConversationId(message, type)

    // 调用消息处理器
    await messageHandler(message, type, conversationId)
  }

  /**
   * 发送消息到QQ
   * @param {object} target - 原始消息对象
   * @param {string} message - 消息内容
   * @param {object} originalMessage - 原始消息
   * @param {string} type - 消息类型
   * @returns {Promise<*>}
   */
  async send(target, message, originalMessage, type) {
    return this.sendWithRetry(target, message, async () => {
      if (type === 'c2c') {
        return this.client.sendC2CMessage(
          originalMessage.author.user_openid,
          message,
          {}
        )
      } else if (type === 'at' || type === 'channel') {
        return this.client.sendMessage(
          originalMessage.channel_id,
          message,
          {}
        )
      } else {
        // 私信
        return this.client.sendDirectMessage(
          originalMessage.guild_id,
          message,
          {}
        )
      }
    })
  }

  /**
   * 提取消息内容
   * @param {object} rawMessage - 原始消息
   * @returns {string}
   */
  extractContent(rawMessage) {
    return rawMessage.content?.trim() || ''
  }

  /**
   * 获取会话ID
   * @param {object} rawMessage - 原始消息
   * @param {string} type - 消息类型
   * @returns {string}
   */
  getConversationId(rawMessage, type) {
    if (type === 'c2c') {
      return `c2c_${rawMessage.author.user_openid}`
    } else {
      return rawMessage.channel_id || rawMessage.guild_id
    }
  }

  /**
   * 获取回复目标（QQ需要原始消息对象）
   * @param {object} rawMessage - 原始消息
   * @returns {object}
   */
  getReplyTarget(rawMessage) {
    return rawMessage
  }

  /**
   * 获取消息ID（用于去重）
   * @param {object} rawMessage - 原始消息
   * @param {string} type - 消息类型
   * @returns {string}
   */
  getMessageId(rawMessage, type) {
    return `${type}_${rawMessage.id}`
  }
}

module.exports = QQBotIntegration
