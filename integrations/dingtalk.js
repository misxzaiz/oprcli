/**
 * 钉钉 Stream 集成模块（重构版）
 * 处理钉钉机器人消息收发
 * 继承 BasePlatformIntegration 基类
 */

const axios = require('axios')
const BasePlatformIntegration = require('./base-platform-integration')

class DingTalkIntegration extends BasePlatformIntegration {
  constructor(config, logger, rateLimiter) {
    super(config, logger, rateLimiter)
    this.client = null
  }

  // ==================== 实现抽象方法 ====================

  /**
   * 连接到钉钉平台
   * @param {Function} messageHandler - 消息处理回调
   * @returns {Promise<boolean>}
   */
  async connect(messageHandler) {
    if (!this.config.enabled) {
      this.logger.warning('DINGTALK', '未启用')
      return false
    }

    try {
      const { DWClient, TOPIC_ROBOT } = require('dingtalk-stream')

      this.logger.info('DINGTALK', '正在连接...')

      this.client = new DWClient({
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        debug: true
      })

      // 注册事件监听器
      this.client.on('connected', () => {
        this.logger.success('DINGTALK', 'WebSocket 连接成功')
      })

      this.client.on('disconnected', () => {
        this.logger.warning('DINGTALK', '连接断开')
      })

      this.client.on('error', (error) => {
        this.logger.error('DINGTALK', '连接错误', { error: error.message })
      })

      // 注册消息监听
      if (messageHandler) {
        this.client.registerCallbackListener(TOPIC_ROBOT, async (message) => {
          const messageId = this.getMessageId(message)

          // 立即响应钉钉服务器（60秒限制）
          if (messageId) {
            this.client.socketCallBackResponse(messageId, { status: 'SUCCESS' })
          }

          // 异步处理消息
          await messageHandler(message)
        })
      }

      await this.client.connect()
      this.logger.success('DINGTALK', '已连接')

      return true
    } catch (error) {
      this.logger.error('DINGTALK', '连接失败', { error: error.message })
      return false
    }
  }

  /**
   * 发送消息到钉钉
   * @param {string} webhookUrl - Webhook URL
   * @param {string} message - 消息内容
   * @param {object} originalMessage - 原始消息（不使用）
   * @param {string} type - 类型（不使用）
   * @returns {Promise<*>}
   */
  async send(webhookUrl, message, originalMessage, type) {
    return this.sendWithRetry(webhookUrl, message, async (url, msg) => {
      const response = await axios.post(url, {
        msgtype: 'text',
        text: { content: msg }
      }, {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' }
      })
      return response.data
    })
  }

  /**
   * 提取消息内容
   * @param {object} rawMessage - 原始消息
   * @returns {string}
   */
  extractContent(rawMessage) {
    try {
      const robotMessage = JSON.parse(rawMessage.data)
      return robotMessage.text?.content?.trim() || ''
    } catch (error) {
      this.logger.error('DINGTALK', '解析消息失败', { error: error.message })
      return ''
    }
  }

  /**
   * 获取会话ID
   * @param {object} rawMessage - 原始消息
   * @returns {string}
   */
  getConversationId(rawMessage) {
    try {
      const robotMessage = JSON.parse(rawMessage.data)
      return robotMessage.conversationId
    } catch (error) {
      this.logger.error('DINGTALK', '获取会话ID失败', { error: error.message })
      return null
    }
  }

  /**
   * 获取回复目标（Webhook URL）
   * @param {object} rawMessage - 原始消息
   * @returns {string}
   */
  getReplyTarget(rawMessage) {
    try {
      const robotMessage = JSON.parse(rawMessage.data)
      return robotMessage.sessionWebhook
    } catch (error) {
      this.logger.error('DINGTALK', '获取Webhook失败', { error: error.message })
      return null
    }
  }

  /**
   * 获取消息ID（用于去重）
   * @param {object} rawMessage - 原始消息
   * @returns {string|null}
   */
  getMessageId(rawMessage) {
    return rawMessage.headers?.messageId || null
  }
}

module.exports = DingTalkIntegration
