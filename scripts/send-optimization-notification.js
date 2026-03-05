/**
 * 发送优化分析结果通知
 */

const http = require('http');

function sendNotification() {
  const message = `🔍 OPRCLI 系统优化分析报告

📊 系统健康度评估
━━━━━━━━━━━━━━━━
整体状态: ✅ 良好
功能测试: ✅ 93% 通过率
代码质量: ✅ 良好 (复杂度适中)
性能表现: ⚠️ 需要优化
架构设计: ✅ 优秀

🎯 关键发现
━━━━━━━━━━━━━━━━
🔴 关键问题: 2 个
  • IFlow 轮询频率过高 (100ms)
  • 建议使用文件监听或增加间隔

🟠 优化机会: 27 个高复杂度文件
  • cache-manager.js (复杂度 55)
  • config.js (复杂度 49)
  • 建议拆分大函数，降低复杂度

🟡 代码重复: 26 处重复模式
  • rate-limit 相关文件 3 个
  • memory-monitor 相关文件 2 个
  • 建议合并相似文件

⚡ 快速改进建议
━━━━━━━━━━━━━━━━
1. 增加轮询间隔到 500ms (立即)
2. 合并重复的工具函数 (本周)
3. 提取通用错误处理 (本周)

📈 技术指标
━━━━━━━━━━━━━━━━
• 代码行数: 14,868 行
• 文件总数: 44 个核心文件
• JSDoc 覆盖: 100%
• 技术债务: 低

💡 下一步行动
━━━━━━━━━━━━━━━━
优先级1: 优化 IFlow 轮询策略
优先级2: 降低高复杂度文件
优先级3: 合并重复代码文件

详细报告已生成:
tasks/optimization-analysis-*.md

📅 分析时间: ${new Date().toLocaleString('zh-CN')}`;

  // 发送到钉钉
  sendToDingTalk(message);
}

function sendToDingTalk(content) {
  const webhook = process.env.DINGTALK_WEBHOOK;
  if (!webhook) {
    console.log('⚠️  未配置钉钉 Webhook，跳过通知');
    console.log('\n通知内容:');
    console.log(content);
    return;
  }

  const data = JSON.stringify({
    msgtype: 'text',
    text: {
      content: content
    }
  });

  const options = {
    hostname: webhook.match(/https:\/\/([^\/]+)/)[1],
    port: 443,
    path: webhook.match(/\.com\/(.+)/)[1],
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  const req = http.request(options, (res) => {
    let responseData = '';
    res.on('data', (chunk) => {
      responseData += chunk;
    });
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log('✅ 钉钉通知发送成功');
      } else {
        console.log('⚠️  钉钉通知发送失败:', res.statusCode);
        console.log(responseData);
      }
    });
  });

  req.on('error', (error) => {
    console.log('❌ 钉钉通知发送错误:', error.message);
    console.log('\n通知内容:');
    console.log(content);
  });

  req.write(data);
  req.end();
}

// 运行通知
if (require.main === module) {
  sendNotification();
}

module.exports = { sendNotification };
