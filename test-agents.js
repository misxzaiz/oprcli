/**
 * Agent 系统测试脚本
 *
 * 测试各种 Agent 的功能
 */

require('dotenv').config();
const { createManager } = require('./agents');

async function testAgents() {
  console.log('========================================');
  console.log('  Agent 系统测试');
  console.log('========================================\n');

  // 1. 初始化管理器
  console.log('1️⃣  初始化 AgentManager...');
  const manager = await createManager();
  console.log('');

  // 2. 列出所有 Agent
  console.log('2️⃣  可用的 Agent:');
  const agents = manager.listAgents();
  agents.forEach(agent => {
    const status = agent.connected ? '✅ 已连接' : '❌ 未连接';
    const current = agent.current ? ' [当前]' : '';
    console.log(`   - ${agent.id}: ${agent.name}${current} ${status}`);
  });
  console.log('');

  // 3. 测试当前 Agent
  const currentAgent = manager.getCurrentAgent();
  console.log(`3️⃣  测试当前 Agent: ${currentAgent.name}`);
  console.log(`   能力: ${JSON.stringify(currentAgent.getCapabilities())}`);
  console.log('');

  // 4. 发送测试消息
  console.log('4️⃣  发送测试消息...');
  try {
    const result = await manager.chat('你好，请简单介绍一下你自己', {
      tools: true  // 启用工具
    });

    console.log('✅ 响应成功:');
    console.log('─'.repeat(50));
    console.log(result.response.substring(0, 200) + '...');
    console.log('─'.repeat(50));
    console.log(`会话ID: ${result.sessionId}`);
    console.log('');
  } catch (error) {
    console.error('❌ 发送失败:', error.message);
    console.log('');
  }

  // 5. 测试工具系统
  console.log('5️⃣  测试工具系统...');
  const toolManager = manager.getToolManager();
  const tools = toolManager.listTools();
  console.log(`可用工具: ${tools.join(', ')}`);

  // 测试文件读取工具
  try {
    const result = await toolManager.execute('read_file', {
      filePath: './package.json'
    });
    if (result.success) {
      console.log('✅ 文件读取测试成功');
      console.log(`   内容大小: ${result.size} 字节`);
    } else {
      console.log('❌ 文件读取测试失败:', result.error);
    }
  } catch (error) {
    console.error('❌ 工具执行失败:', error.message);
  }
  console.log('');

  // 6. 测试 Agent 切换
  if (agents.length > 1) {
    console.log('6️⃣  测试 Agent 切换...');
    for (const agent of agents) {
      if (!agent.current && agent.connected) {
        try {
          manager.switchAgent(agent.id);
          console.log(`✅ 切换到: ${agent.name}`);
          break;
        } catch (error) {
          console.error(`❌ 切换失败:`, error.message);
        }
      }
    }
    console.log('');
  }

  // 7. 清理
  console.log('7️⃣  清理资源...');
  manager.cleanup();
  console.log('✅ 完成');
}

// 测试 DeepSeek 专用
async function testDeepSeek() {
  console.log('========================================');
  console.log('  DeepSeek Agent 测试');
  console.log('========================================\n');

  const { OpenAIAgent } = require('./agents');

  const agent = new OpenAIAgent({
    name: 'DeepSeek',
    provider: 'deepseek',
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat'
  });

  const result = await agent.connect();
  console.log('连接结果:', result);

  if (result.success) {
    const response = await agent.chat('用一句话介绍深度求索（DeepSeek）');
    console.log('\n响应:', response.response);
  }

  agent.cleanup();
}

// 主测试
async function main() {
  try {
    // 完整测试
    await testAgents();

    // 如果设置了 DEEPSEEK_API_KEY，单独测试
    if (process.env.DEEPSEEK_API_KEY) {
      console.log('\n\n');
      await testDeepSeek();
    }

  } catch (error) {
    console.error('测试失败:', error);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  main().then(() => {
    console.log('\n测试完成');
    process.exit(0);
  });
}

module.exports = { testAgents, testDeepSeek };
