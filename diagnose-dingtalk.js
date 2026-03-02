/**
 * 钉钉配置诊断工具
 * 用于检查钉钉 Stream 模式配置是否正确
 */

require('dotenv').config()
const { DWClient, TOPIC_ROBOT } = require('dingtalk-stream')

async function main() {
  console.log('\n========================================')
  console.log('  钉钉配置诊断工具')
  console.log('========================================\n')

  // 1. 检查环境变量
  console.log('📋 1. 检查环境变量')
  console.log('-------------------')
  const clientId = process.env.DINGTALK_CLIENT_ID
  const clientSecret = process.env.DINGTALK_CLIENT_SECRET

  if (!clientId) {
    console.error('❌ DINGTALK_CLIENT_ID 未配置')
    process.exit(1)
  }
  if (!clientSecret) {
    console.error('❌ DINGTALK_CLIENT_SECRET 未配置')
    process.exit(1)
  }

  console.log(`✅ DINGTALK_CLIENT_ID: ${clientId.substring(0, 10)}...`)
  console.log(`✅ DINGTALK_CLIENT_SECRET: ${clientSecret.substring(0, 10)}...`)

  // 2. 测试连接
  console.log('\n📡 2. 测试钉钉 Stream 连接')
  console.log('-------------------')

  const client = new DWClient({
    clientId,
    clientSecret
  })

  let connected = false
  let messageReceived = false

  client.on('connected', () => {
    console.log('✅ WebSocket 连接成功')
    connected = true
  })

  client.on('disconnected', () => {
    console.log('⚠️ 连接断开')
    connected = false
  })

  client.on('error', (error) => {
    console.error('❌ 连接错误:', error.message)
  })

  // 注册消息监听器
  client.registerCallbackListener(TOPIC_ROBOT, async (message) => {
    console.log('\n✅ 收到消息！')
    console.log('Headers:', JSON.stringify(message.headers, null, 2))
    console.log('Data (前200字符):', message.data.substring(0, 200))
    messageReceived = true

    // 返回成功响应
    return { status: 'SUCCESS' }
  })

  console.log('正在连接...')
  console.log('⏳ 请在钉钉中发送一条消息给机器人...')

  try {
    await client.connect()
    console.log('✅ 客户端启动成功')

    // 等待 30 秒接收消息
    console.log('⏳ 等待消息（最多 30 秒）...\n')

    let waitTime = 0
    const checkInterval = setInterval(() => {
      waitTime += 5
      if (waitTime >= 30) {
        clearInterval(checkInterval)

        console.log('\n========================================')
        console.log('  诊断结果')
        console.log('========================================\n')

        if (!connected) {
          console.log('❌ 未连接到钉钉服务器')
          console.log('   请检查：')
          console.log('   1. Client ID 和 Client Secret 是否正确')
          console.log('   2. 网络连接是否正常')
          console.log('   3. 钉钉服务是否可用')
        } else if (!messageReceived) {
          console.log('⚠️ 已连接但未收到消息')
          console.log('   请检查：')
          console.log('   1. 钉钉开放平台是否配置了订阅关系')
          console.log('   2. 订阅的主题是否包含: ' + TOPIC_ROBOT)
          console.log('   3. 机器人是否已添加到群聊或单聊')
          console.log('   4. 消息是否发送给了机器人')
        } else {
          console.log('✅ 配置正确！已成功接收消息')
        }

        console.log('\n提示：')
        console.log('- 如果未收到消息，请检查钉钉开放平台的订阅配置')
        console.log('- 订阅管理路径：钉钉开放平台 -> 应用 -> 机器人 -> 订阅管理')
        console.log(`- 需要订阅的主题: ${TOPIC_ROBOT}`)

        process.exit(0)
      } else {
        console.log(`⏳ 等待中... (${waitTime}s/30s)`)
      }
    }, 5000)

  } catch (error) {
    console.error('❌ 连接失败:', error.message)
    console.error('\n详细错误:')
    console.error(error)
    process.exit(1)
  }
}

main().catch(error => {
  console.error('诊断工具运行失败:', error)
  process.exit(1)
})

