/**
 * 命令解析器测试
 * 验证精确匹配和灵活匹配逻辑
 */

const { parseCommand, COMMANDS } = require('../server/commands')

// 简单的测试框架
function test(name, fn) {
  try {
    fn()
    console.log(`✅ ${name}`)
  } catch (error) {
    console.error(`❌ ${name}`)
    console.error(`   ${error.message}`)
  }
}

function assertEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual)
  const expectedStr = JSON.stringify(expected)
  if (actualStr !== expectedStr) {
    throw new Error(message || `Expected: ${expectedStr}, Actual: ${actualStr}`)
  }
}

// Mock logger
const logger = {
  debug: () => {}
}

console.log('=== 命令解析器测试 ===\n')

// 测试组 1: 精确匹配模式（无 / 前缀）
console.log('【精确匹配测试】')

test('精确匹配 - claude 命令', () => {
  const result = parseCommand('claude', logger)
  assertEqual(result.type, 'switch', 'claude 命令类型应为 switch')
  assertEqual(result.provider, 'claude', 'claude 命令 provider 应为 claude')
  assertEqual(result.arg, null, 'claude 命令不应有参数')
})

test('精确匹配 - iflow 命令', () => {
  const result = parseCommand('iflow', logger)
  assertEqual(result.type, 'switch', 'iflow 命令类型应为 switch')
  assertEqual(result.provider, 'iflow', 'iflow 命令 provider 应为 iflow')
})

test('精确匹配 - agent-sonnet 命令', () => {
  const result = parseCommand('agent-sonnet', logger)
  assertEqual(result.type, 'switch', 'agent-sonnet 命令类型应为 switch')
  assertEqual(result.provider, 'agent', 'agent-sonnet 命令 provider 应为 agent')
  assertEqual(result.agentModel, 'sonnet', 'agent-sonnet 命令 agentModel 应为 sonnet')
})

test('精确匹配 - 重启 应不匹配（requireSlash: true）', () => {
  const result = parseCommand('重启', logger)
  assertEqual(result, null, '重启命令不应匹配（需要前缀）')
})

test('精确匹配 - 重启服务 应不匹配（有额外内容）', () => {
  const result = parseCommand('重启服务', logger)
  assertEqual(result, null, '重启服务不应匹配（有额外内容）')
})

test('精确匹配 - status 应不匹配（requireSlash: true）', () => {
  const result = parseCommand('status', logger)
  assertEqual(result, null, 'status 命令不应匹配（需要前缀）')
})

test('精确匹配 - claude 你好 应不匹配（有额外内容）', () => {
  const result = parseCommand('claude 你好', logger)
  assertEqual(result, null, 'claude 你好不应匹配（精确匹配要求完全匹配）')
})

// 测试组 2: 灵活匹配模式（有 / 前缀）
console.log('\n【灵活匹配测试】')

test('灵活匹配 - /重启 命令', () => {
  const result = parseCommand('/重启', logger)
  assertEqual(result.type, 'restart', '/重启 命令类型应为 restart')
  assertEqual(result.arg, null, '/重启 命令不应有参数')
})

test('灵活匹配 - /重启 现在 命令（带参数）', () => {
  const result = parseCommand('/重启 现在', logger)
  assertEqual(result.type, 'restart', '/重启 现在 命令类型应为 restart')
  assertEqual(result.arg, '现在', '/重启 现在 命令应有参数"现在"')
})

test('灵活匹配 - /status 命令', () => {
  const result = parseCommand('/status', logger)
  assertEqual(result.type, 'status', '/status 命令类型应为 status')
})

test('灵活匹配 - /tasks run 1 命令（多词命令+参数）', () => {
  const result = parseCommand('/tasks run 1', logger)
  assertEqual(result.type, 'tasks_run', '/tasks run 1 命令类型应为 tasks_run')
  assertEqual(result.arg, '1', '/tasks run 1 命令应有参数"1"')
})

test('灵活匹配 - /claude 你好 命令（带自定义提示词）', () => {
  const result = parseCommand('/claude 你好', logger)
  assertEqual(result.type, 'switch', '/claude 你好 命令类型应为 switch')
  assertEqual(result.provider, 'claude', '/claude 你好 命令 provider 应为 claude')
  assertEqual(result.arg, '你好', '/claude 你好 命令应有参数"你好"')
})

test('灵活匹配 - /path /tmp 命令（带路径参数）', () => {
  const result = parseCommand('/path /tmp', logger)
  assertEqual(result.type, 'path', '/path /tmp 命令类型应为 path')
  assertEqual(result.arg, '/tmp', '/path /tmp 命令应有参数"/tmp"')
})

// 测试组 3: Agent 模式特殊处理
console.log('\n【Agent 模式测试】')

test('Agent 模式 - agent-sonnet（无前缀）', () => {
  const result = parseCommand('agent-sonnet', logger)
  assertEqual(result.type, 'switch', 'agent-sonnet 命令类型应为 switch')
  assertEqual(result.provider, 'agent', 'agent-sonnet 命令 provider 应为 agent')
  assertEqual(result.agentModel, 'sonnet', 'agent-sonnet 命令 agentModel 应为 sonnet')
})

test('Agent 模式 - /agent-sonnet（有前缀）', () => {
  const result = parseCommand('/agent-sonnet', logger)
  assertEqual(result.type, 'switch', '/agent-sonnet 命令类型应为 switch')
  assertEqual(result.provider, 'agent', '/agent-sonnet 命令 provider 应为 agent')
  assertEqual(result.agentModel, 'sonnet', '/agent-sonnet 命令 agentModel 应为 sonnet')
})

test('Agent 模式 - agent-sonnet 你好（带参数）', () => {
  const result = parseCommand('agent-sonnet 你好', logger)
  assertEqual(result.type, 'switch', 'agent-sonnet 你好 命令类型应为 switch')
  assertEqual(result.arg, '你好', 'agent-sonnet 你好 命令应有参数"你好"')
})

// 测试组 4: 环境变量配置
console.log('\n【环境变量配置测试】')

test('配置 - 全局要求前缀（COMMAND_REQUIRE_SLASH=true）', () => {
  const config = { requireSlash: true }
  const result = parseCommand('claude', logger, config)
  assertEqual(result, null, '全局要求前缀时，claude 不应匹配')
})

test('配置 - 白名单覆盖（COMMAND_NO_SLASH_LIST）', () => {
  const config = {
    requireSlash: true,
    noSlashList: ['claude', 'iflow']
  }
  const result = parseCommand('claude', logger, config)
  assertEqual(result.type, 'switch', '白名单中的 claude 应匹配')
})

test('配置 - 黑名单强制前缀（COMMAND_REQUIRE_SLASH_LIST）', () => {
  const config = {
    requireSlashList: ['restart', 'stop']
  }
  const result = parseCommand('restart', logger, config)
  assertEqual(result, null, '黑名单中的 restart 不应匹配（需要前缀）')
})

// 测试组 5: 边界情况
console.log('\n【边界情况测试】')

test('边界 - 空字符串', () => {
  const result = parseCommand('', logger)
  assertEqual(result, null, '空字符串不应匹配')
})

test('边界 - 只有空格', () => {
  const result = parseCommand('   ', logger)
  assertEqual(result, null, '只有空格不应匹配')
})

test('边界 - 只有 /', () => {
  const result = parseCommand('/', logger)
  assertEqual(result, null, '只有 / 不应匹配')
})

test('边界 - 大小写不敏感（CLAUDE）', () => {
  const result = parseCommand('CLAUDE', logger)
  assertEqual(result.type, 'switch', 'CLAUDE（大写）应匹配')
})

test('边界 - 混合大小写（ClAuDe）', () => {
  const result = parseCommand('ClAuDe', logger)
  assertEqual(result.type, 'switch', 'ClAuDe（混合大小写）应匹配')
})

test('边界 - 中文命令（状态）', () => {
  const result = parseCommand('状态', logger)
  assertEqual(result, null, '状态命令不应匹配（需要前缀）')
})

test('边界 - 中文命令带前缀（/状态）', () => {
  const result = parseCommand('/状态', logger)
  assertEqual(result.type, 'status', '/状态 命令应匹配')
})

console.log('\n=== 测试完成 ===')
