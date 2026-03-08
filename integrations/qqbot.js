/**
 * QQ 机器人集成模块（重构版）
 * 处理 QQ 机器人消息收发
 * 继承 BasePlatformIntegration 基类
 * 开发文档：https://bot.q.qq.com/wiki/develop/api-v2/
 */

const BasePlatformIntegration = require('./base-platform-integration')
const AuditLogger = require('./audit-logger')

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
  async send(target, message, originalMessage, type, meta = {}) {
    const traceId = meta.traceId || `tr-${Date.now()}`
    const conversationId = meta.conversationId || this.getConversationId(originalMessage, type)
    const payloadPreview = {}
    AuditLogger.logBot('bot.before_transform', {
      trace_id: traceId,
      platform: 'qq',
      conversation_id: conversationId,
      message_type: meta.messageType || type || 'default',
      original_message: message
    })

    try {
      return await this.sendWithRetry(target, message, async () => {
        if (type === 'c2c') {
          payloadPreview.api = 'sendC2CMessage'
          payloadPreview.target = originalMessage.author.user_openid
          payloadPreview.content = message
          AuditLogger.logBot('bot.after_transform', { trace_id: traceId, platform: 'qq', payload: payloadPreview })

          const result = await this.client.sendC2CMessage(
            originalMessage.author.user_openid,
            message,
            {}
          )
          AuditLogger.logBot('bot.send_result', { trace_id: traceId, platform: 'qq', response: result })
          return result
        } else if (type === 'at' || type === 'channel') {
          payloadPreview.api = 'sendMessage'
          payloadPreview.target = originalMessage.channel_id
          payloadPreview.content = message
          AuditLogger.logBot('bot.after_transform', { trace_id: traceId, platform: 'qq', payload: payloadPreview })
          const result = await this.client.sendMessage(
            originalMessage.channel_id,
            message,
            {}
          )
          AuditLogger.logBot('bot.send_result', { trace_id: traceId, platform: 'qq', response: result })
          return result
        } else {
          // 私信
          payloadPreview.api = 'sendDirectMessage'
          payloadPreview.target = originalMessage.guild_id
          payloadPreview.content = message
          AuditLogger.logBot('bot.after_transform', { trace_id: traceId, platform: 'qq', payload: payloadPreview })
          const result = await this.client.sendDirectMessage(
            originalMessage.guild_id,
            message,
            {}
          )
          AuditLogger.logBot('bot.send_result', { trace_id: traceId, platform: 'qq', response: result })
          return result
        }
      })
    } catch (error) {
      AuditLogger.logBot('bot.send_error', {
        trace_id: traceId,
        platform: 'qq',
        error: error.message
      })
      throw error
    }
  }

  /**
   * 提取消息内容（支持图片附件，自动下载）
   * @param {object} rawMessage - 原始消息
   * @returns {Promise<object>} { content: string, attachments: array }
   */
  async extractContent(rawMessage) {
    const content = rawMessage.content?.trim() || ''

    // 提取图片附件并下载到本地
    const attachments = []
    if (rawMessage.attachments && Array.isArray(rawMessage.attachments)) {
      for (let i = 0; i < rawMessage.attachments.length; i++) {
        const att = rawMessage.attachments[i]
        if (att.content_type === 'image' || att.content_type?.startsWith('image/')) {
          const imageUrl = att.url || att.tencent_url

          // 尝试下载图片到本地
          let localPath = null
          if (imageUrl) {
            try {
              localPath = await this._downloadImage(imageUrl, i)
              this.logger.info('QQBOT', `✅ 图片已下载: ${localPath}`)
            } catch (error) {
              this.logger.warning('QQBOT', `⚠️ 图片下载失败: ${error.message}`)
            }
          }

          attachments.push({
            type: 'image',
            url: imageUrl,
            localPath: localPath, // 本地路径
            content: att.content // base64 数据（如果有）
          })
        }
      }
    }

    return { content, attachments }
  }

  /**
   * 下载图片到本地 temp 目录
   * @param {string} imageUrl - 图片 URL
   * @param {number} index - 图片索引
   * @returns {Promise<string>} 本地文件路径
   * @private
   */
  async _downloadImage(imageUrl, index = 0) {
    const https = require('https')
    const fs = require('fs')
    const path = require('path')
    const url = require('url')

    return new Promise((resolve, reject) => {
      // 确保目录存在
      const tempDir = 'D:/space/temp'
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true })
      }

      // 生成文件名
      const timestamp = Date.now()
      const filename = `qq-image-${timestamp}-${index}.jpg`
      const filePath = path.join(tempDir, filename)

      const parsedUrl = url.parse(imageUrl)

      const options = {
        hostname: parsedUrl.hostname,
        port: 443,
        path: parsedUrl.path,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 15000 // 15 秒超时
      }

      const req = https.request(options, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }

        const fileStream = fs.createWriteStream(filePath)
        res.pipe(fileStream)

        fileStream.on('finish', () => {
          fileStream.close()
          resolve(filePath)
        })

        fileStream.on('error', (err) => {
          fs.unlink(filePath, () => {})
          reject(err)
        })
      })

      req.on('error', (err) => {
        reject(new Error(`请求失败: ${err.message}`))
      })

      req.on('timeout', () => {
        req.destroy()
        reject(new Error('请求超时（15秒）'))
      })

      req.end()
    })
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
