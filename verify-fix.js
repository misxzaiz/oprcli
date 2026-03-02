/**
 * 验证钉钉集成修复
 * 确保消息处理器在连接之前注册
 */

require('dotenv').config()
const config = require('./utils/config')
const Logger = require('./integrations/logger')
const RateLimiter = require('./utils/rate-limiter')
const DingTalkIntegration = require('./integrations/dingtalk')

async function verify() {
  console.log('========================================')
  console.log('  钉钉集成修复验证')
  console.log('========================================\n')

  const logger = new Logger({ level: 'DEBUG', colored: true })
  const rateLimiter = new RateLimiter(5, 1000)
  const dingtalk = new DingTalkIntegration(config.dingtalk, logger, rateLimiter)

  // 模拟消息处理器
  const mockHandler = async (message) => {
    console.log('✅✅✅ mockHandler 被调用了！')
    console.log('消息 ID:', message.headers?.messageId)
    console.log('消息类型:', message.data?.substring(0, 100))
  }

  console.log('📝 测试 1: 在 init() 时传入消息处理器')
  console.log('预期顺序：')
  console.log('  1. 创建 DWClient')
  console.log('  2. 注册事件监听器')
  console.log('  3. ⭐ 注册消息处理器（连接前）')
  console.log('  4. 连接到钉钉服务器')
  console.log('  5. WebSocket 连接成功\n')

  try {
    const enabled = await dingtalk.init(mockHandler)

    if (enabled) {
      console.log('\n✅ 初始化成功')
      console.log('⏳ 等待 30 秒以接收钉钉消息...')
      console.log('请向钉钉机器人发送一条消息进行测试\n')

      // 等待 30 秒以接收消息
      await new Promise(resolve => setTimeout(resolve, 30000))

      console.log('\n⏱️  等待结束')
    } else {
      console.log('\n⚠️  钉钉未启用')
    }
  } catch (error) {
    console.error('\n❌ 错误:', error.message)
    console.error(error.stack)
  } finally {
    await dingtalk.close()
    console.log('\n✅ 验证完成')
  }
}

verify().catch(console.error)
