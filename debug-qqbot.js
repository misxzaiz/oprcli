/**
 * QQ 机器人调试脚本
 *
 * 用于诊断消息处理问题
 */

require('dotenv').config();

async function testAgent() {
  console.log('========================================');
  console.log('  QQ 机器人 Agent 调试');
  console.log('========================================\n');

  // 创建 Agent Manager
  const { createManager } = require('./agents');

  try {
    console.log('1️⃣  初始化 Agent Manager...\n');
    const agentManager = await createManager();

    console.log('2️⃣  当前 Agent 信息：\n');
    const currentAgent = agentManager.getCurrentAgent();
    console.log(`   ID: ${currentAgent.id}`);
    console.log(`   名称: ${currentAgent.name}`);
    console.log(`   连接状态: ${currentAgent.connected ? '✅ 已连接' : '❌ 未连接'}`);
    console.log(`   类型: ${currentAgent.constructor.name}\n`);

    console.log('3️⃣  测试发送消息：\n');
    console.log('   测试1: "你好"\n');

    try {
      const response1 = await agentManager.chat('你好', { sessionId: null, tools: false });

      console.log('   响应结果：');
      console.log(`   - 有响应: ${!!response1}`);
      console.log(`   - 响应内容: "${response1?.response?.substring(0, 100) || '(空)'}..."`);
      console.log(`   - 响应长度: ${response1?.response?.length || 0}`);
      console.log(`   - Session ID: ${response1?.sessionId || '(无)'}\n`);
    } catch (error) {
      console.error('   ❌ 错误:', error.message);
      console.error('   堆栈:', error.stack);
    }

    console.log('\n   测试2: "help"\n');

    try {
      const response2 = await agentManager.chat('help', { sessionId: null, tools: false });

      console.log('   响应结果：');
      console.log(`   - 有响应: ${!!response2}`);
      console.log(`   - 响应内容: "${response2?.response?.substring(0, 100) || '(空)'}..."`);
      console.log(`   - 响应长度: ${response2?.response?.length || 0}`);
      console.log(`   - Session ID: ${response2?.sessionId || '(无)'}\n`);
    } catch (error) {
      console.error('   ❌ 错误:', error.message);
      console.error('   堆栈:', error.stack);
    }

    console.log('4️⃣  列出所有可用的 Agent：\n');
    const agents = agentManager.listAgents();
    agents.forEach(agent => {
      const status = agent.connected ? '✅' : '❌';
      const current = agent.current ? ' [当前]' : '';
      console.log(`   ${status} ${agent.id}: ${agent.name}${current}`);
    });

    console.log('\n5️⃣  建议：\n');

    if (currentAgent.id === 'deepseek') {
      console.log('   ⚠️  当前使用的是 deepseek agent');
      console.log('   💡 建议尝试切换到 claude-code:');
      console.log('      - 在QQ中发送: claude');
      console.log('      - 或修改 .env 设置默认 agent\n');
    }

  } catch (error) {
    console.error('\n❌ 初始化失败:', error.message);
    console.error('\n可能的原因：');
    console.error('1. API Key 未设置或错误');
    console.error('2. 网络连接问题');
    console.error('3. Agent 配置错误\n');

    console.log('💡 检查步骤：');
    console.log('   1. 确认 .env 文件中有 API Key');
    console.log('   2. 确认网络连接正常');
    console.log('   3. 尝试切换到其他 Agent\n');
  }

  console.log('========================================');
  console.log('  调试完成');
  console.log('========================================\n');
}

// 运行测试
testAgent().catch(error => {
  console.error('测试失败:', error);
  process.exit(1);
});
