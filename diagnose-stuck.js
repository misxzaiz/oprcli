/**
 * 快速诊断工具 - 判断消息接收问题
 */

require('dotenv').config();

async function quickTest() {
  console.log('========================================');
  console.log('  钉钉消息接收诊断');
  console.log('========================================\n');

  const { createManager } = require('./agents');

  console.log('步骤 1️⃣ : 初始化 AgentManager...\n');

  try {
    const manager = await createManager();

    console.log('步骤 2️⃣ : 测试 Agent 响应速度...\n');

    const start = Date.now();

    console.log('发送测试消息: "你好"\n');

    const result = await manager.chat('你好', {
      tools: false  // 先关闭工具测试
    });

    const elapsed = Date.now() - start;

    console.log('✅ Agent 响应成功！');
    console.log(`响应内容: ${result.response.substring(0, 100)}...`);
    console.log(`耗时: ${elapsed}ms (${(elapsed/1000).toFixed(2)}秒)\n`);

    if (elapsed < 3000) {
      console.log('✅ Agent 速度正常（< 3秒）');
    } else if (elapsed < 10000) {
      console.log('⚠️  Agent 稍慢（3-10秒），可能是网络问题');
    } else {
      console.log('❌ Agent 很慢（> 10秒），可能是 API 问题');
    }

    console.log('\n步骤 3️⃣ : 检查钉钉配置...\n');

    const https = require('https');

    // 测试获取 token
    const clientId = process.env.DINGTALK_CLIENT_ID;
    const clientSecret = process.env.DINGTALK_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.log('❌ 钉钉配置缺失');
      return;
    }

    console.log(`✅ Client ID: ${clientId.substring(0, 8)}...`);
    console.log(`✅ Client Secret: ${clientSecret.substring(0, 8)}...`);

    const tokenUrl = `https://oapi.dingtalk.com/gettoken?appkey=${clientId}&appsecret=${clientSecret}`;

    console.log('\n测试获取 access_token...\n');

    const tokenStart = Date.now();

    try {
      const tokenResult = await new Promise((resolve, reject) => {
        https.get(tokenUrl, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (err) {
              reject(err);
            }
          });
        }).on('error', reject);
      });

      const tokenTime = Date.now() - tokenStart;

      if (tokenResult.errcode === 0) {
        console.log('✅ 获取 token 成功！');
        console.log(`耗时: ${tokenTime}ms`);
        console.log(`Token: ${tokenResult.access_token.substring(0, 20)}...\n`);
      } else {
        console.log(`❌ 获取 token 失败: ${tokenResult.errmsg}\n`);
      }

    } catch (err) {
      console.log(`❌ 网络请求失败: ${err.message}\n`);
    }

    console.log('========================================');
    console.log('诊断结论');
    console.log('========================================\n');

    console.log('如果以上测试都通过，问题可能是：');
    console.log('');
    console.log('A. 钉钉机器人配置问题：');
    console.log('   1. 机器人未发布（开发版不稳定）');
    console.log('   2. 消息接收权限未开启');
    console.log('   3. 消息接收范围未包含当前用户');
    console.log('   4. 机器人未添加到会话');
    console.log('');
    console.log('B. 下一步操作：');
    console.log('   1. 重启钉钉服务: npm run dingtalk:multi');
    console.log('   2. 在钉钉发送消息');
    console.log('   3. 观察终端日志');
    console.log('');
    console.log('预期日志：');
    console.log('   - 如果收到消息: [Stream] ⭐ 收到机器人消息');
    console.log('   - 如果卡在解析: [解析] senderId=xxx');
    console.log('   - 如果卡在处理: [消息] ... (然后很久没响应)');
    console.log('');
    console.log('========================================\n');

  } catch (err) {
    console.error('❌ 测试失败:', err.message);
    console.error('\n错误详情:', err);
  }
}

quickTest().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('诊断失败:', err);
  process.exit(1);
});
