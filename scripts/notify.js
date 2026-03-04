#!/usr/bin/env node

/**
 * 统一通知脚本
 * Agent 调用：node scripts/notify.js "通知内容"
 *
 * 功能：
 * - 自动读取环境变量中的通知配置
 * - 支持钉钉机器人（自动签名）
 * - 统一错误处理
 * - 可选的日志记录
 */

const https = require('https')
const crypto = require('crypto')
const url = require('url')
const fs = require('fs')
const path = require('path')

// ========== 环境变量读取 ==========
const NOTIFICATION_TYPE = process.env.NOTIFICATION_TYPE || 'dingtalk'
const WEBHOOK_URL = process.env.NOTIFICATION_DINGTALK_WEBHOOK
const SECRET = process.env.NOTIFICATION_DINGTALK_SECRET
const LOG_ENABLED = process.env.NOTIFICATION_LOG_ENABLED === 'true'
const LOG_FILE = process.env.NOTIFICATION_LOG_FILE || 'logs/notifications.log'

// ========== 参数解析 ==========
const MESSAGE = process.argv[2] || ''

// ========== 帮助信息 ==========
function showHelp() {
  console.log(`
用法: node scripts/notify.js "通知内容"

示例:
  node scripts/notify.js "任务完成"
  node scripts/notify.js "今日天气：晴天 20°C"

环境变量:
  NOTIFICATION_TYPE          通知类型（默认: dingtalk）
  NOTIFICATION_DINGTALK_WEBHOOK 钉钉机器人 Webhook URL
  NOTIFICATION_DINGTALK_SECRET  钉钉机器人加签密钥（可选）
  NOTIFICATION_LOG_ENABLED    是否记录日志（默认: false）
  NOTIFICATION_LOG_FILE       日志文件路径（默认: logs/notifications.log）
`)
}

if (MESSAGE === '--help' || MESSAGE === '-h') {
  showHelp()
  process.exit(0)
}

// ========== 参数验证 ==========
if (!MESSAGE) {
  console.error('❌ 错误: 缺少通知内容')
  console.error('用法: node scripts/notify.js "通知内容"')
  console.error('提示: 使用 --help 查看帮助信息')
  process.exit(1)
}

if (!WEBHOOK_URL) {
  console.error('❌ 错误: 未配置 NOTIFICATION_DINGTALK_WEBHOOK 环境变量')
  console.error('请在 .env 文件中配置:')
  console.error('  NOTIFICATION_DINGTALK_WEBHOOK=https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN')
  process.exit(1)
}

// ========== 签名计算 ==========
function getSignedUrl(webhook, secret) {
  if (!secret) return webhook

  try {
    const timestamp = Date.now()
    const signString = timestamp + '\n' + secret
    const sign = crypto.createHmac('sha256', secret)
      .update(signString)
      .digest('base64')

    const separator = webhook.includes('?') ? '&' : '?'
    return `${webhook}${separator}timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`
  } catch (error) {
    console.error('❌ 签名计算失败:', error.message)
    return webhook
  }
}

// ========== 日志记录 ==========
function logNotification(message, success, error = null) {
  if (!LOG_ENABLED) return

  try {
    const logDir = path.dirname(LOG_FILE)
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }

    const timestamp = new Date().toISOString()
    const logEntry = {
      timestamp,
      type: NOTIFICATION_TYPE,
      message,
      success,
      error: error ? error.message : null
    }

    const logLine = JSON.stringify(logEntry) + '\n'
    fs.appendFileSync(LOG_FILE, logLine)
  } catch (error) {
    // 日志记录失败不影响主流程
    console.warn('⚠️ 日志记录失败:', error.message)
  }
}

// ========== 发送通知 ==========
async function sendNotification(message) {
  const signedUrl = getSignedUrl(WEBHOOK_URL, SECRET)

  const postData = JSON.stringify({
    msgtype: 'text',
    text: { content: message }
  })

  const urlParsed = url.parse(signedUrl)

  return new Promise((resolve, reject) => {
    const options = {
      hostname: urlParsed.hostname,
      path: urlParsed.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 10000 // 10秒超时
    }

    const req = https.request(options, (res) => {
      let data = ''

      res.on('data', chunk => {
        data += chunk
      })

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const result = JSON.parse(data)
            if (result.errcode === 0) {
              resolve(true)
            } else {
              reject(new Error(`钉钉错误: ${result.errmsg} (errcode: ${result.errcode})`))
            }
          } catch (error) {
            // 解析失败，但状态码是200，认为成功
            resolve(true)
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`))
        }
      })
    })

    req.on('error', (error) => {
      reject(error)
    })

    req.on('timeout', () => {
      req.destroy()
      reject(new Error('请求超时（10秒）'))
    })

    req.write(postData)
    req.end()
  })
}

// ========== 执行 ==========
console.log(`📤 发送通知: "${MESSAGE.substring(0, 50)}${MESSAGE.length > 50 ? '...' : ''}"`)

sendNotification(MESSAGE)
  .then(() => {
    console.log('✅ 通知发送成功')
    logNotification(MESSAGE, true)
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ 通知发送失败:', error.message)
    logNotification(MESSAGE, false, error)
    process.exit(1)
  })
