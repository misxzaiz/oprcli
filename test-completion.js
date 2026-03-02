/**
 * 测试完成消息功能
 * 模拟钉钉消息处理并验证完成标识
 */

require('dotenv').config()
const config = require('./utils/config')
const Logger = require('./integrations/logger')
const MessageFormatter = require('./utils/message-formatter')

function test() {
  console.log('========================================')
  console.log('  完成消息功能测试')
  console.log('========================================\n')

  const logger = new Logger({ level: 'DEBUG', colored: true })
  const formatter = new MessageFormatter(config.streaming, logger)

  console.log('📋 当前配置:')
  console.log(`   显示完成总结: ${config.streaming.showCompletionSummary}`)
  console.log(`   显示时间: ${config.streaming.showTime}`)
  console.log('')

  // 测试 1: session_end 事件
  console.log('🧪 测试 1: session_end 事件')
  console.log('─────────────────────────────────────')

  const sessionEndEvent = {
    type: 'session_end',
    exitCode: 0
  }

  const context1 = {
    index: 15,
    elapsed: '12.5'
  }

  const formatted1 = formatter.formatEvent(sessionEndEvent, context1)

  if (formatted1) {
    console.log('✅ 格式化成功')
    console.log('\n📨 发送到钉钉的消息:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(formatted1.text?.content || formatted1.markdown?.text)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  } else {
    console.log('❌ 格式化失败')
  }

  console.log('\n')

  // 测试 2: session_end 事件（有错误）
  console.log('🧪 测试 2: session_end 事件（有错误）')
  console.log('─────────────────────────────────────')

  const sessionEndEventWithError = {
    type: 'session_end',
    exitCode: 1,
    error: 'Tool execution failed'
  }

  const context2 = {
    index: 8,
    elapsed: '3.2'
  }

  const formatted2 = formatter.formatEvent(sessionEndEventWithError, context2)

  if (formatted2) {
    console.log('✅ 格式化成功')
    console.log('\n📨 发送到钉钉的消息:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(formatted2.text?.content || formatted2.markdown?.text)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  } else {
    console.log('❌ 格式化失败')
  }

  console.log('\n')

  // 测试 3: result 事件
  console.log('🧪 测试 3: result 事件')
  console.log('─────────────────────────────────────')

  const resultEvent = {
    type: 'result',
    result: '这是最终的结果内容。所有任务已成功完成，文件已保存到指定位置。'
  }

  const context3 = {
    index: 10,
    elapsed: '8.7'
  }

  const formatted3 = formatter.formatEvent(resultEvent, context3)

  if (formatted3) {
    console.log('✅ 格式化成功')
    console.log('\n📨 发送到钉钉的消息:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(formatted3.text?.content || formatted3.markdown?.text)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  } else {
    console.log('❌ 格式化失败')
  }

  console.log('\n')

  // 测试 4: 完整流程模拟
  console.log('🧪 测试 4: 完整流程模拟')
  console.log('─────────────────────────────────────')

  const events = [
    { type: 'thinking', content: '正在分析用户请求...' },
    { type: 'assistant', message: { content: [{ type: 'text', text: '你好！我可以帮你处理这个任务。' }] } },
    { type: 'tool_start', tool: 'Bash', command: 'ls -la' },
    { type: 'tool_output', output: 'total 0\ndrwxr-xr-x 2 user group 60 Jan 1 12:00 .' },
    { type: 'tool_end', tool: 'Bash', exitCode: 0 },
    { type: 'result', result: '任务完成！' },
    { type: 'session_end', exitCode: 0 }
  ]

  let idx = 0
  for (const event of events) {
    idx++
    const ctx = { index: idx, elapsed: (idx * 1.5).toFixed(1) }
    const fmt = formatter.formatEvent(event, ctx)

    if (fmt) {
      console.log(`\n📨 [事件 ${idx}] ${event.type}`)
      const content = fmt.text?.content || fmt.markdown?.text
      console.log(content.substring(0, 100) + (content.length > 100 ? '...' : ''))
    }
  }

  console.log('\n\n✅ 测试完成！')
  console.log('\n💡 提示:')
  console.log('   - 完成消息会在响应结束时自动发送')
  console.log('   - 可通过 STREAM_SHOW_COMPLETION=false 关闭')
  console.log('   - 包含消息数、耗时、退出码等统计信息')
}

test()
