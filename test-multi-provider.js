/**
 * 多模型切换功能测试脚本
 */

require('dotenv').config()
const config = require('./utils/config')

function testCommandParsing() {
  console.log('========================================')
  console.log('  命令识别测试')
  console.log('========================================\n')

  // 模拟 _parseCommand 方法
  function _parseCommand(content) {
    const trimmed = content.trim().toLowerCase()

    if (trimmed === 'claude') {
      return { type: 'switch', provider: 'claude' }
    }
    if (trimmed === 'iflow') {
      return { type: 'switch', provider: 'iflow' }
    }
    if (trimmed === 'end' || trimmed === '停止' || trimmed === 'stop') {
      return { type: 'interrupt' }
    }
    if (trimmed === 'status' || trimmed === '状态') {
      return { type: 'status' }
    }
    if (trimmed === 'help' || trimmed === '帮助') {
      return { type: 'help' }
    }

    return null
  }

  const testCases = [
    { input: 'claude', expected: 'switch', provider: 'claude' },
    { input: 'CLAUDE', expected: 'switch', provider: 'claude' },
    { input: '  claude  ', expected: 'switch', provider: 'claude' },
    { input: 'iflow', expected: 'switch', provider: 'iflow' },
    { input: 'IFLOW', expected: 'switch', provider: 'iflow' },
    { input: 'end', expected: 'interrupt' },
    { input: '停止', expected: 'interrupt' },
    { input: 'stop', expected: 'interrupt' },
    { input: 'status', expected: 'status' },
    { input: '状态', expected: 'status' },
    { input: 'help', expected: 'help' },
    { input: '帮助', expected: 'help' },
    { input: '你好，请帮忙', expected: null },
    { input: '分析这个项目', expected: null },
    { input: 'claude 帮我写代码', expected: null },  // 这不是命令，是普通消息
  ]

  let passed = 0
  let failed = 0

  for (const test of testCases) {
    const result = _parseCommand(test.input)

    let success = true
    if (test.expected === null) {
      if (result !== null) success = false
    } else {
      if (result?.type !== test.expected) success = false
      if (test.provider && result?.provider !== test.provider) success = false
    }

    if (success) {
      console.log(`✅ "${test.input}" -> ${result ? JSON.stringify(result) : '普通消息'}`)
      passed++
    } else {
      console.log(`❌ "${test.input}" -> 期望: ${test.expected}, 实际: ${result ? JSON.stringify(result) : 'null'}`)
      failed++
    }
  }

  console.log(`\n📊 测试结果: ${passed} 通过, ${failed} 失败`)
  return failed === 0
}

function testConfiguration() {
  console.log('\n========================================')
  console.log('  配置检查')
  console.log('========================================\n')

  console.log('📋 当前配置:')
  console.log(`   默认模型: ${config.provider}`)

  console.log('\n🤖 Claude 配置:')
  console.log(`   命令路径: ${config.claude.cmdPath || '未配置'}`)
  console.log(`   工作目录: ${config.claude.workDir || '未配置'}`)
  console.log(`   Git 路径: ${config.claude.gitBinPath || '未配置'}`)

  console.log('\n🧠 IFlow 配置:')
  console.log(`   命令路径: ${config.iflow.path || '未配置'}`)
  console.log(`   工作目录: ${config.iflow.workDir || '未配置'}`)
  console.log(`   包含目录: ${config.iflow.includeDirs.length > 0 ? config.iflow.includeDirs.join(', ') : '未配置'}`)

  // 检查配置完整性
  const claudeConfigured = !!(config.claude.cmdPath && config.claude.workDir)
  const iflowConfigured = !!config.iflow.workDir

  console.log('\n✅ 配置状态:')
  console.log(`   Claude: ${claudeConfigured ? '✅ 已配置' : '❌ 未配置'}`)
  console.log(`   IFlow: ${iflowConfigured ? '✅ 已配置' : '❌ 未配置'}`)

  if (!claudeConfigured && !iflowConfigured) {
    console.log('\n⚠️  警告: 没有配置任何 AI 模型！')
    return false
  }

  return true
}

function testCommandSyntax() {
  console.log('\n========================================')
  console.log('  命令语法示例')
  console.log('========================================\n')

  const examples = [
    { command: 'claude', description: '切换到 Claude 模型' },
    { command: 'iflow', description: '切换到 IFlow 模型' },
    { command: 'end / 停止 / stop', description: '中断当前任务' },
    { command: 'status / 状态', description: '查看当前状态' },
    { command: 'help / 帮助', description: '显示帮助信息' },
  ]

  console.log('📖 可用命令:')
  examples.forEach(ex => {
    console.log(`   • ${ex.command}`)
    console.log(`     ${ex.description}\n`)
  })

  console.log('💡 使用示例:')
  console.log('   用户: claude')
  console.log('   系统: ✅ 已切换到 CLAUDE 模型')
  console.log('')
  console.log('   用户: 帮我写一个 Python 脚本')
  console.log('   系统: [Claude 执行并返回结果]')
  console.log('')
  console.log('   用户: iflow')
  console.log('   系统: ✅ 已切换到 IFLOW 模型')
  console.log('')
  console.log('   用户: 分析这个项目')
  console.log('   系统: [IFlow 执行并返回结果]')
}

async function runTests() {
  console.log('\n========================================')
  console.log('  多模型切换功能测试')
  console.log('========================================\n')

  const test1 = testCommandParsing()
  const test2 = testConfiguration()
  testCommandSyntax()

  console.log('\n========================================')
  console.log('  测试总结')
  console.log('========================================\n')

  const allPassed = test1 && test2

  if (allPassed) {
    console.log('✅ 所有测试通过！')
    console.log('\n🚀 下一步:')
    console.log('   1. 启动服务器: npm start')
    console.log('   2. 向钉钉机器人发送命令测试')
    console.log('   3. 尝试在不同模型之间切换')
  } else {
    console.log('❌ 部分测试失败')
    console.log('\n📝 检查事项:')
    if (!test1) {
      console.log('   - 命令识别逻辑有问题')
    }
    if (!test2) {
      console.log('   - 配置文件不完整，请检查 .env')
    }
  }

  console.log('')
}

runTests().catch(console.error)
