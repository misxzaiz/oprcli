/**
 * 性能对比测试
 */

require('dotenv').config();
const { createManager } = require('./agents');

async function testPerformance() {
  console.log('========================================');
  console.log('  Agent 性能测试');
  console.log('========================================\n');

  const manager = await createManager();

  const testMessage = '1+1等于几？';

  console.log(`测试消息: "${testMessage}"\n`);

  // 测试 DeepSeek
  console.log('1️⃣  测试 DeepSeek (tools=true)...');
  let start = Date.now();
  try {
    const result1 = await manager.chat(testMessage, { tools: true });
    const time1 = Date.now() - start;
    console.log(`✅ 响应: ${result1.response.substring(0, 50)}...`);
    console.log(`⏱️  耗时: ${time1}ms (${(time1/1000).toFixed(2)}秒)\n`);
  } catch (err) {
    console.log(`❌ 失败: ${err.message}\n`);
  }

  // 测试 DeepSeek（无工具）
  console.log('2️⃣  测试 DeepSeek (tools=false)...');
  start = Date.now();
  try {
    const result2 = await manager.chat(testMessage, { tools: false });
    const time2 = Date.now() - start;
    console.log(`✅ 响应: ${result2.response.substring(0, 50)}...`);
    console.log(`⏱️  耗时: ${time2}ms (${(time2/1000).toFixed(2)}秒)\n`);
  } catch (err) {
    console.log(`❌ 失败: ${err.message}\n`);
  }

  // 如果有 Claude Code，也测试
  const agents = manager.listAgents();
  const claudeAgent = agents.find(a => a.id === 'claude-code');

  if (claudeAgent && claudeAgent.connected) {
    console.log('3️⃣  测试 Claude Code...');
    manager.switchAgent('claude-code');
    start = Date.now();
    try {
      const result3 = await manager.chat(testMessage, { tools: false });
      const time3 = Date.now() - start;
      console.log(`✅ 响应: ${result3.response.substring(0, 50)}...`);
      console.log(`⏱️  耗时: ${time3}ms (${(time3/1000).toFixed(2)}秒)\n`);
    } catch (err) {
      console.log(`❌ 失败: ${err.message}\n`);
    }
  }

  console.log('========================================');
  console.log('💡 结论:');
  console.log('========================================');
  console.log('如果 tools=false 快 1-2 秒 → 工具开销明显');
  console.log('如果 Claude Code 快 3-5 秒 → API 延迟明显');
  console.log('');
  console.log('推荐方案:');
  console.log('• 日常对话 → DeepSeek (tools=false)');
  console.log('• 代码开发 → Claude Code');
  console.log('• 需要工具 → 任何 Agent (tools=true)');
  console.log('');
}

testPerformance().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
