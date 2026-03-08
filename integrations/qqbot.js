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
   * 提取消息内容（支持图片、文件、语音、视频附件，自动下载）
   * @param {object} rawMessage - 原始消息
   * @returns {Promise<object>} { content: string, attachments: array }
   */
  async extractContent(rawMessage) {
    const content = rawMessage.content?.trim() || ''

    // 提取附件并下载到本地
    const attachments = []
    if (rawMessage.attachments && Array.isArray(rawMessage.attachments)) {
      for (let i = 0; i < rawMessage.attachments.length; i++) {
        const att = rawMessage.attachments[i]
        const contentType = att.content_type || ''
        const fileUrl = att.url || att.tencent_url

        if (!fileUrl) continue

        let attachmentType = null
        let localPath = null
        let skipDownload = false

        // 1. 图片
        if (contentType === 'image' || contentType.startsWith('image/')) {
          attachmentType = 'image'
          try {
            localPath = await this._downloadFile(fileUrl, i, 'image', contentType)
            this.logger.info('QQBOT', `✅ 图片已下载: ${localPath}`)
          } catch (error) {
            this.logger.warning('QQBOT', `⚠️ 图片下载失败: ${error.message}`)
          }
        }
        // 2. QQ 语音（voice 类型，不是标准 audio/*）
        else if (contentType === 'voice') {
          attachmentType = 'audio'
          try {
            // 优先使用 wav 格式 URL（如果有的话）
            const voiceUrl = att.voice_wav_url || fileUrl
            localPath = await this._downloadFile(voiceUrl, i, 'audio', 'audio/wav', att.filename)
            this.logger.info('QQBOT', `✅ 语音已下载: ${localPath}`)
          } catch (error) {
            this.logger.warning('QQBOT', `⚠️ 语音下载失败: ${error.message}`)
          }
        }
        // 3. QQ 文件（file 类型，不是标准 application/*）
        else if (contentType === 'file') {
          attachmentType = 'file'
          try {
            localPath = await this._downloadFile(fileUrl, i, 'file', 'application/octet-stream', att.filename)
            this.logger.info('QQBOT', `✅ 文件已下载: ${localPath}`)
          } catch (error) {
            this.logger.warning('QQBOT', `⚠️ 文件下载失败: ${error.message}`)
          }
        }
        // 4. 文件（文档类，标准 MIME 类型）
        else if (contentType.startsWith('application/') || contentType.startsWith('text/')) {
          attachmentType = 'file'
          try {
            localPath = await this._downloadFile(fileUrl, i, 'file', contentType, att.file_name)
            this.logger.info('QQBOT', `✅ 文件已下载: ${localPath}`)
          } catch (error) {
            this.logger.warning('QQBOT', `⚠️ 文件下载失败: ${error.message}`)
          }
        }
        // 5. 音频（标准 MIME 类型）
        else if (contentType.startsWith('audio/')) {
          attachmentType = 'audio'
          try {
            localPath = await this._downloadFile(fileUrl, i, 'audio', contentType)
            this.logger.info('QQBOT', `✅ 音频已下载: ${localPath}`)
          } catch (error) {
            this.logger.warning('QQBOT', `⚠️ 音频下载失败: ${error.message}`)
          }
        }
        // 6. 视频（限制大小）
        else if (contentType.startsWith('video/')) {
          const fileSize = att.file_size || 0
          const maxSize = 50 * 1024 * 1024 // 50MB

          if (fileSize > maxSize) {
            this.logger.warning('QQBOT', `⚠️ 视频文件过大 (${(fileSize / 1024 / 1024).toFixed(2)}MB)，超过限制 50MB`)
            skipDownload = true
          } else {
            attachmentType = 'video'
            try {
              localPath = await this._downloadFile(fileUrl, i, 'video', contentType)
              this.logger.info('QQBOT', `✅ 视频已下载: ${localPath}`)
            } catch (error) {
              this.logger.warning('QQBOT', `⚠️ 视频下载失败: ${error.message}`)
            }
          }
        }
        // 7. 默认：有 URL 但没有 content_type，当作文件处理
        else if (fileUrl) {
          attachmentType = 'file'
          try {
            localPath = await this._downloadFile(fileUrl, i, 'file', 'application/octet-stream', att.filename)
            this.logger.info('QQBOT', `✅ 文件已下载: ${localPath}`)
          } catch (error) {
            this.logger.warning('QQBOT', `⚠️ 文件下载失败: ${error.message}`)
          }
        }

        // 添加到附件列表
        if (attachmentType) {
          attachments.push({
            type: attachmentType,
            url: fileUrl,
            localPath: localPath,
            contentType: contentType,
            fileName: att.file_name || null,
            fileSize: att.file_size || null,
            content: att.content // base64 数据（如果有）
          })
        }
      }
    }

    return { content, attachments }
  }

  /**
   * 下载文件到本地 temp 目录（通用方法）
   * @param {string} fileUrl - 文件 URL
   * @param {number} index - 文件索引
   * @param {string} fileType - 文件类型 (image/file/audio/video)
   * @param {string} contentType - Content-Type header
   * @param {string} originalFileName - 原始文件名（可选）
   * @returns {Promise<string>} 本地文件路径
   * @private
   */
  async _downloadFile(fileUrl, index = 0, fileType = 'file', contentType = '', originalFileName = null) {
    const https = require('https')
    const http = require('http')
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
      let fileExt = this._getFileExtension(contentType, originalFileName)
      let filename

      if (originalFileName) {
        // 使用原始文件名
        const nameWithoutExt = path.parse(originalFileName).name
        filename = `qq-${fileType}-${timestamp}-${index}-${nameWithoutExt}${fileExt}`
      } else {
        // 使用默认文件名
        filename = `qq-${fileType}-${timestamp}-${index}${fileExt}`
      }

      const filePath = path.join(tempDir, filename)

      const parsedUrl = url.parse(fileUrl)
      const isHttps = parsedUrl.protocol === 'https:'
      const requestLib = isHttps ? https : http

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.path,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 30000 // 30 秒超时（文件可能较大）
      }

      const req = requestLib.request(options, (res) => {
        // 处理重定向 (301, 302, 303, 307, 308)
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          this._downloadFile(res.headers.location, index, fileType, contentType, originalFileName)
            .then(resolve)
            .catch(reject)
          return
        }

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
        reject(new Error('请求超时（30秒）'))
      })

      req.end()
    })
  }

  /**
   * 根据 Content-Type 或原始文件名获取文件扩展名
   * @param {string} contentType - Content-Type header
   * @param {string} originalFileName - 原始文件名
   * @returns {string} 文件扩展名（包含点号）
   * @private
   */
  _getFileExtension(contentType = '', originalFileName = null) {
    // 优先使用原始文件名的扩展名
    if (originalFileName) {
      const ext = path.parse(originalFileName).ext
      if (ext) return ext
    }

    // 根据 Content-Type 推断扩展名
    const mimeMap = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'text/plain': '.txt',
      'text/markdown': '.md',
      'text/csv': '.csv',
      'application/json': '.json',
      'application/xml': '.xml',
      'application/pdf': '.pdf',
      'application/zip': '.zip',
      'application/x-tar': '.tar',
      'application/x-gzip': '.gz',
      'audio/mpeg': '.mp3',
      'audio/wav': '.wav',
      'audio/ogg': '.ogg',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'video/quicktime': '.mov'
    }

    return mimeMap[contentType] || '.' + contentType.split('/')[1] || '.bin'
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
