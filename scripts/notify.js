#!/usr/bin/env node
/**
 * 钉钉通知脚本
 * 用于发送通知到钉钉群
 *
 * @version 1.0.0
 * @created 2026-03-05
 *
 * 使用方法:
 *   node scripts/notify.js "消息内容"
 *   node scripts/notify.js --type=markdown "消息内容"
 *   node scripts/notify.js --title="标题" "消息内容"
 */

const crypto = require('crypto')
const axios = require('axios')
const path = require('path')

// 加载环境变量
require('dotenv').config()

/**
 * 生成钉钉签名
 * @param {string} secret - 钉钉机器人密钥
 * @param {number} timestamp - 时间戳
 * @returns {string} 签名字符串
 */
function generateSignature(secret, timestamp) {
  const stringToSign = `${timestamp}\n${secret}`
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(stringToSign)
  return encodeURIComponent(hmac.digest('base64'))
}

/**
 * 发送钉钉通知（增强版 - 支持重试机制）
 * @param {string} content - 消息内容
 * @param {Object} options - 配置选项
 * @returns {Promise<Object>} 发送结果
 */
async function sendDingTalkNotification(content, options = {}) {
  const {
    type = 'text',
    title = 'OPRCLI 通知',
    webhook = process.env.NOTIFICATION_DINGTALK_WEBHOOK,
    secret = process.env.NOTIFICATION_DINGTALK_SECRET,
    maxRetries = 3, // 最大重试次数
    retryDelay = 1000 // 重试延迟（毫秒）
  } = options

  // 验证配置
  if (!webhook) {
    throw new Error('钉钉 Webhook 未配置，请设置 NOTIFICATION_DINGTALK_WEBHOOK 环境变量')
  }

  // 构建消息数据
  let data = {}

  const timestamp = Date.now()

  if (type === 'text') {
    // 文本消息
    data = {
      msgtype: 'text',
      text: {
        content: content
      }
    }
  } else if (type === 'markdown') {
    // Markdown 消息
    data = {
      msgtype: 'markdown',
      markdown: {
        title: title,
        text: content
      }
    }
  } else if (type === 'link') {
    // 链接消息
    data = {
      msgtype: 'link',
      link: {
        title: title,
        text: content,
        messageUrl: options.url || '',
        picUrl: options.picUrl || ''
      }
    }
  } else {
    throw new Error(`不支持的消息类型: ${type}`)
  }

  // 添加签名（如果配置了密钥）
  let url = webhook
  if (secret) {
    const sign = generateSignature(secret, timestamp)
    url = `${webhook}&timestamp=${timestamp}&sign=${sign}`
  }

  // 重试机制
  let lastError = null
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 发送请求
      const response = await axios.post(url, data, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 5000
      })

      // 检查响应
      if (response.data.errcode !== 0) {
        throw new Error(`钉钉通知发送失败: ${response.data.errmsg} (错误码: ${response.data.errcode})`)
      }

      return {
        success: true,
        data: response.data,
        attempt // 记录尝试次数
      }
    } catch (error) {
      lastError = error

      // 如果是最后一次尝试，不再重试
      if (attempt === maxRetries) {
        break
      }

      // 判断是否应该重试
      const shouldRetry =
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.response?.status >= 500 ||
        error.message?.includes('timeout')

      if (!shouldRetry) {
        // 不可重试的错误，直接返回
        break
      }

      // 等待后重试
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt))
      }
    }
  }

  // 所有重试都失败
  return {
    success: false,
    error: lastError?.message || '发送失败',
    attempt: maxRetries
  }
}

/**
 * 格式化消息为 Markdown
 * @param {string} title - 标题
 * @param {string} message - 消息内容
 * @param {Object} metadata - 额外元数据
 * @returns {string} Markdown 格式的消息
 */
function formatMarkdownMessage(title, message, metadata = {}) {
  let content = `# ${title}\n\n`
  content += `${message}\n\n`

  if (metadata.time) {
    content += `**时间**: ${metadata.time}\n`
  }

  if (metadata.level) {
    const levelIcon = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    }
    content += `${levelIcon[metadata.level] || ''} **级别**: ${metadata.level}\n`
  }

  if (metadata.source) {
    content += `**来源**: ${metadata.source}\n`
  }

  return content
}

/**
 * 主函数
 */
async function main() {
  // 解析命令行参数
  const args = process.argv.slice(2)

  let content = ''
  let type = 'text'
  let title = 'OPRCLI 通知'
  let level = 'info'

  // 解析选项
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg.startsWith('--type=')) {
      type = arg.split('=')[1]
    } else if (arg.startsWith('--title=')) {
      title = arg.split('=')[1]
    } else if (arg.startsWith('--level=')) {
      level = arg.split('=')[1]
    } else if (!arg.startsWith('--')) {
      content = arg
    }
  }

  // 如果没有提供内容，从标准输入读取
  if (!content) {
    if (process.stdin.isTTY) {
      console.error('错误: 请提供消息内容')
      console.error('使用方法: node scripts/notify.js "消息内容"')
      process.exit(1)
    }

    // 从管道读取
    content = await new Promise((resolve, reject) => {
      let data = ''
      process.stdin.on('data', chunk => data += chunk)
      process.stdin.on('end', () => resolve(data))
      process.stdin.on('error', reject)
    })
  }

  // 如果是 Markdown 类型，格式化消息
  if (type === 'markdown') {
    const metadata = {
      time: new Date().toLocaleString('zh-CN'),
      level,
      source: 'OPRCLI 系统通知'
    }
    content = formatMarkdownMessage(title, content, metadata)
  }

  // 发送通知
  const result = await sendDingTalkNotification(content, { type, title })

  if (result.success) {
    console.log('✅ 钉钉通知发送成功')
    process.exit(0)
  } else {
    console.error('❌ 钉钉通知发送失败:', result.error)
    process.exit(1)
  }
}

// 如果直接运行脚本
if (require.main === module) {
  main().catch(error => {
    console.error('❌ 发生错误:', error.message)
    process.exit(1)
  })
}

// 导出函数供其他模块使用
module.exports = {
  sendDingTalkNotification,
  formatMarkdownMessage
}
