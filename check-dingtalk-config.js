/**
 * 钉钉配置快速诊断工具
 */

require('dotenv').config();

const CONFIG = {
  dingtalk: {
    clientId: process.env.DINGTALK_CLIENT_ID || '',
    clientSecret: process.env.DINGTALK_CLIENT_SECRET || '',
    agentId: process.env.DINGTALK_AGENT_ID || '',
  }
};

console.log('========================================');
console.log('  钉钉配置诊断工具');
console.log('========================================\n');

// 检查 1: 环境变量
console.log('1️⃣  环境变量检查:');
if (CONFIG.dingtalk.clientId) {
  console.log(`   ✅ Client ID: ${CONFIG.dingtalk.clientId.substring(0, 8)}...`);
  console.log(`   ✅ 长度: ${CONFIG.dingtalk.clientId.length} 字符`);
} else {
  console.log('   ❌ Client ID: 未设置');
}

if (CONFIG.dingtalk.clientSecret) {
  console.log(`   ✅ Client Secret: ${CONFIG.dingtalk.clientSecret.substring(0, 8)}...`);
  console.log(`   ✅ 长度: ${CONFIG.dingtalk.clientSecret.length} 字符`);
} else {
  console.log('   ❌ Client Secret: 未设置');
}

if (CONFIG.dingtalk.agentId) {
  console.log(`   ✅ Agent ID: ${CONFIG.dingtalk.agentId}`);
} else {
  console.log('   ⚠️  Agent ID: 未设置（可选）');
}

console.log('');

// 检查 2: 配置有效性
console.log('2️⃣  配置有效性:');

if (CONFIG.dingtalk.clientId && CONFIG.dingtalk.clientId.length >= 20) {
  console.log('   ✅ Client ID 格式正常');
} else if (CONFIG.dingtalk.clientId) {
  console.log('   ⚠️  Client ID 长度似乎太短');
} else {
  console.log('   ❌ Client ID 未设置');
}

if (CONFIG.dingtalk.clientSecret && CONFIG.dingtalk.clientSecret.length >= 20) {
  console.log('   ✅ Client Secret 格式正常');
} else if (CONFIG.dingtalk.clientSecret) {
  console.log('   ⚠️  Client Secret 长度似乎太短');
} else {
  console.log('   ❌ Client Secret 未设置');
}

console.log('');

// 检查 3: 常见问题
console.log('3️⃣  常见问题检查:');

const commonIssues = [];

if (!CONFIG.dingtalk.clientId || !CONFIG.dingtalk.clientSecret) {
  commonIssues.push('❌ 缺少必要的环境变量（.env 文件）');
}

if (CONFIG.dingtalk.clientId && CONFIG.dingtalk.clientId.length < 20) {
  commonIssues.push('⚠️  Client ID 可能不完整');
}

if (CONFIG.dingtalk.clientSecret && CONFIG.dingtalk.clientSecret.length < 20) {
  commonIssues.push('⚠️  Client Secret 可能不完整');
}

if (commonIssues.length === 0) {
  console.log('   ✅ 未发现明显配置问题');
} else {
  commonIssues.forEach(issue => console.log(`   ${issue}`));
}

console.log('');

// 检查 4: 下一步操作
console.log('4️⃣  下一步操作:');
console.log('');

if (!CONFIG.dingtalk.clientId || !CONFIG.dingtalk.clientSecret) {
  console.log('   📝 需要配置 .env 文件：');
  console.log('');
  console.log('   DINGTALK_CLIENT_ID=your-client-id');
  console.log('   DINGTALK_CLIENT_SECRET=your-client-secret');
  console.log('   DINGTALK_AGENT_ID=your-agent-id');
  console.log('');
} else {
  console.log('   ✅ 配置看起来正常，可以启动服务：');
  console.log('');
  console.log('   npm run dingtalk:multi');
  console.log('');
  console.log('   然后在钉钉中发送测试消息。');
  console.log('');
}

console.log('========================================');
console.log('💡 提示：');
console.log('========================================');
console.log('');
console.log('• 如果启动成功但收不到消息：');
console.log('  1. 检查机器人是否已发布（正式版）');
console.log('  2. 检查机器人是否已添加到会话');
console.log('  3. 检查机器人是否有接收消息权限');
console.log('');
console.log('• 查看启动日志中的调试信息：');
console.log('  - SDK 连接状态');
console.log('  - 订阅是否成功');
console.log('  - 心跳是否正常');
console.log('');
console.log('• 发送消息后应该看到：');
console.log('  - [Stream] ⭐ 收到机器人消息');
console.log('  - [Stream] 完整数据: {...}');
console.log('');
