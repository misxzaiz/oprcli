#!/usr/bin/env node

/**
 * 通知功能测试脚本
 * 测试通知脚本的各项功能
 */

require('dotenv').config()
const { execSync } = require('child_process')

console.log('🧪 通知功能测试\n')

// ========== 测试 1: 帮助信息 ==========
console.log('📋 测试 1: 帮助信息')
try {
  const help = execSync('node scripts/notify.js --help', { encoding: 'utf-8' })
  console.log('✅ 帮助信息正常')
  console.log(help.substring(0, 200) + '...\n')
} catch (error) {
  console.log('❌ 帮助信息测试失败\n')
}

// ========== 测试 2: 缺少参数 ==========
console.log('📋 测试 2: 缺少参数')
try {
  execSync('node scripts/notify.js', { encoding: 'utf-8' })
  console.log('❌ 应该报错但没有\n')
} catch (error) {
  console.log('✅ 正确处理缺少参数的情况\n')
}

// ========== 测试 3: 环境变量检查 ==========
console.log('📋 测试 3: 环境变量检查')
console.log('NOTIFICATION_ENABLED:', process.env.NOTIFICATION_ENABLED)
console.log('NOTIFICATION_TYPE:', process.env.NOTIFICATION_TYPE)
console.log('WEBHOOK配置:', process.env.NOTIFICATION_DINGTALK_WEBHOOK ? '✅ 已配置' : '❌ 未配置')
console.log('SECRET配置:', process.env.NOTIFICATION_DINGTALK_SECRET ? '✅ 已配置' : '⚠️ 未配置（可选）')
console.log('')

// ========== 测试 4: 实际发送通知 ==========
console.log('📋 测试 4: 实际发送通知')
if (!process.env.NOTIFICATION_DINGTALK_WEBHOOK || process.env.NOTIFICATION_DINGTALK_WEBHOOK.includes('YOUR_TOKEN')) {
  console.log('⚠️ 跳过实际发送测试（需要配置有效的 WEBHOOK_URL）')
  console.log('请在 .env 中配置 NOTIFICATION_DINGTALK_WEBHOOK\n')
} else {
  console.log('正在发送测试通知...')
  try {
    const result = execSync('node scripts/notify.js "🧪 这是一条测试通知"', { encoding: 'utf-8' })
    console.log(result)
    console.log('✅ 通知发送成功！请检查钉钉群消息\n')
  } catch (error) {
    console.log('❌ 通知发送失败')
    console.log(error.stdout || error.stderr)
    console.log('')
  }
}

console.log('📊 测试完成！')
console.log('\n💡 提示:')
console.log('- 如果通知失败，请检查 .env 中的 WEBHOOK_URL 配置')
console.log('- 查看日志: cat logs/notifications.log')
