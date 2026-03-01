/**
 * 检查 SDK 订阅状态
 */

require('dotenv').config();
const { DWClient, TOPIC_ROBOT } = require('dingtalk-stream');

async function checkSubscription() {
  console.log('========================================');
  console.log('  SDK 订阅状态检查');
  console.log('========================================\n');

  const clientId = process.env.DINGTALK_CLIENT_ID;
  const clientSecret = process.env.DINGTALK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('❌ 缺少配置：DINGTALK_CLIENT_ID 或 DINGTALK_CLIENT_SECRET');
    process.exit(1);
  }

  console.log(`Client ID: ${clientId.substring(0, 8)}...\n`);

  // 创建客户端
  const client = new DWClient({
    clientId,
    clientSecret,
    debug: true,  // 启用完整调试日志
  });

  console.log('✅ SDK 已创建\n');

  // 监听所有事件
  const events = [];

  client.on('connected', () => {
    console.log('✅ [SDK] 连接已建立');
    console.log('✅ [SDK] 正在订阅 Topic...\n');
  });

  client.on('disconnected', () => {
    console.error('❌ [SDK] 连接已断开');
  });

  client.on('error', (err) => {
    console.error('❌ [SDK] 错误:', err.message);
  });

  // 注册回调
  let messageReceived = false;

  client.registerCallbackListener(TOPIC_ROBOT, (res) => {
    messageReceived = true;
    console.log('\n========================================');
    console.log('✅✅✅ 收到消息推送！');
    console.log('========================================\n');
    console.log('完整数据:', JSON.stringify(res, null, 2));
    console.log('\n这说明 SDK 订阅成功！');
    console.log('如果实际使用中收不到，请检查：');
    console.log('1. 机器人是否已添加到会话');
    console.log('2. 是否在群聊中 @ 了机器人');
    console.log('3. 机器人是否已发布（正式版）');
    console.log('');
  });

  console.log('✅ 回调已注册');
  console.log('正在连接...\n');

  try {
    await client.connect();

    console.log('========================================');
    console.log('等待消息中...');
    console.log('========================================\n');
    console.log('请在钉钉中发送消息\n');
    console.log('观察：');
    console.log('1. 是否有 SDK 内部日志（认证、订阅等）');
    console.log('2. 是否有 [SDK] 心跳日志');
    console.log('3. 发送消息后是否出现 "收到消息推送"');
    console.log('\n');
    console.log('等待 60 秒...\n');

    // 等待 60 秒
    await new Promise(resolve => setTimeout(resolve, 60000));

    if (!messageReceived) {
      console.log('\n========================================');
      console.log('⚠️  60 秒内未收到任何消息');
      console.log('========================================\n');
      console.log('可能的原因：');
      console.log('');
      console.log('1. 机器人未添加到会话（最常见）');
      console.log('   → 单聊：添加机器人为好友');
      console.log('   → 群聊：拉机器人进群并 @ 它');
      console.log('');
      console.log('2. 机器人未发布');
      console.log('   → 开发版不稳定，需要发布为正式版');
      console.log('   → 在开放平台点击"发布应用"');
      console.log('');
      console.log('3. 消息接收权限未开启');
      console.log('   → 检查权限管理');
      console.log('   → 确保有"消息接收"权限');
      console.log('');
      console.log('4. 消息接收范围限制');
      console.log('   → 检查机器人配置');
      console.log('   → 确保当前用户在接收范围内');
      console.log('');
      console.log('5. 使用群聊但未 @ 机器人');
      console.log('   → 群聊必须 @ 机器人才能触发');
      console.log('');
    }

  } catch (err) {
    console.error('\n❌ 连接失败:', err.message);
    console.error('\n请检查：');
    console.error('1. Client ID 是否正确');
    console.error('2. Client Secret 是否正确');
    console.error('3. 网络连接是否正常');
  }

  console.log('\n测试结束\n');
}

checkSubscription().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
