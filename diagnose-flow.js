/**
 * 诊断脚本：测试完整的消息处理流程
 */

require('dotenv').config()
const config = require('./utils/config')
const Logger = require('./integrations/logger')
const ClaudeConnector = require('./connectors/claude-connector')
const IFlowConnector = require('./connectors/iflow-connector')

async function diagnose() {
  console.log('========================================')
  console.log('  AI Connector 流程诊断')
  console.log('========================================\n')

  const logger = new Logger({ level: 'DEBUG', colored: true })

  // 显示当前配置
  console.log('📋 当前配置:')
  console.log(`   Provider: ${config.provider}`)
  console.log(`   Port: ${config.port}`)
  console.log(`   Stream Enabled: ${config.streaming.enabled}`)
  console.log(`   DingTalk Enabled: ${config.dingtalk.enabled}`)

  if (config.provider === 'claude') {
    console.log(`   Claude Path: ${config.claude.cmdPath}`)
    console.log(`   Work Dir: ${config.claude.workDir}`)
  } else if (config.provider === 'iflow') {
    console.log(`   IFlow Path: ${config.iflow.path}`)
    console.log(`   Work Dir: ${config.iflow.workDir}`)
    console.log(`   Include Dirs: ${config.iflow.includeDirs.join(', ') || '未配置'}`)
  }
  console.log('')

  // 验证配置
  console.log('🔍 验证配置...')
  const validation = config.validate()
  if (!validation.valid) {
    console.log('❌ 配置错误:')
    validation.errors.forEach(err => console.log(`   - ${err}`))
    return
  }
  console.log('✅ 配置验证通过\n')

  // 创建 connector
  console.log('📦 创建 Connector...')
  let connector
  try {
    const options = config.getConnectorOptions()
    console.log('Connector Options:', JSON.stringify(options, null, 2))

    if (config.provider === 'claude') {
      connector = new ClaudeConnector(options)
    } else if (config.provider === 'iflow') {
      connector = new IFlowConnector(options)
    }
    console.log('✅ Connector 创建成功\n')
  } catch (error) {
    console.log('❌ Connector 创建失败:', error.message)
    return
  }

  // 连接测试
  console.log('🔗 连接测试...')
  try {
    const result = await connector.connect()
    if (!result.success) {
      console.log('❌ 连接失败:', result.error)
      return
    }
    console.log('✅ 连接成功')
    if (result.version) {
      console.log(`   版本: ${result.version}`)
    }
    console.log('')
  } catch (error) {
    console.log('❌ 连接异常:', error.message)
    console.log(error.stack)
    return
  }

  // 测试会话
  console.log('💬 测试会话（发送测试消息）...')
  console.log('   消息内容: "你好，请简单介绍一下你自己"\n')

  let eventCount = 0
  let hasSystemEvent = false
  let hasAssistantEvent = false
  let hasResultEvent = false

  try {
    await new Promise((resolve, reject) => {
      const options = {
        onEvent: (event) => {
          eventCount++
          const eventType = event.type || 'unknown'
          console.log(`📨 事件 #${eventCount}: ${eventType}`)

          if (eventType === 'system') {
            hasSystemEvent = true
            if (event.extra?.session_id) {
              console.log(`   Session ID: ${event.extra.session_id}`)
            }
          } else if (eventType === 'assistant') {
            hasAssistantEvent = true
            const text = event.message?.content
              ?.filter(c => c.type === 'text')
              ?.map(c => c.text)
              ?.join('') || ''
            console.log(`   内容: ${text.substring(0, 100)}...`)
          } else if (eventType === 'result') {
            hasResultEvent = true
            console.log(`   结果: ${event.result?.substring(0, 100)}...`)
          }
        },
        onComplete: (exitCode) => {
          console.log(`\n✅ 会话完成`)
          console.log(`   退出码: ${exitCode}`)
          console.log(`   事件总数: ${eventCount}`)
          console.log(`   系统事件: ${hasSystemEvent ? '✅' : '❌'}`)
          console.log(`   助手事件: ${hasAssistantEvent ? '✅' : '❌'}`)
          console.log(`   结果事件: ${hasResultEvent ? '✅' : '❌'}`)
          resolve()
        },
        onError: (error) => {
          console.log(`\n❌ 会话错误: ${error.message}`)
          reject(error)
        }
      }

      connector.startSession('你好，请简单介绍一下你自己', options)
    })

    console.log('\n✅ 诊断完成')
  } catch (error) {
    console.log('\n❌ 会话测试失败:', error.message)
    console.log(error.stack)
  }

  // 清理
  console.log('\n🧹 清理资源...')
  const sessions = connector.getActiveSessions()
  sessions.forEach(sid => connector.interruptSession(sid))
  console.log('✅ 完成')
}

// 运行诊断
diagnose().catch(console.error)
