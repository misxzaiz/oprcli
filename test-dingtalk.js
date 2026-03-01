/**
 * 钉钉集成测试脚本
 *
 * 用于测试钉钉 Stream 模式的各种场景
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3000';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

function error(message) {
  log(`❌ ${message}`, 'red');
}

function info(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function warning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

// 测试用例
const tests = [
  {
    name: '测试 1: 检查服务状态',
    async fn() {
      const response = await axios.get(`${API_BASE}/api/status`);
      if (response.data.connected) {
        success('Claude 已连接');
        info(`版本: ${response.data.version || 'unknown'}`);
      } else {
        error('Claude 未连接');
        return false;
      }

      if (response.data.dingtalk.enabled) {
        success('钉钉已启用');
        info(`连接状态: ${response.data.dingtalk.connected ? '已连接' : '未连接'}`);
      } else {
        warning('钉钉未启用');
      }

      return true;
    }
  },

  {
    name: '测试 2: 获取钉钉状态',
    async fn() {
      try {
        const response = await axios.get(`${API_BASE}/api/dingtalk/status`);
        if (response.data.enabled) {
          success('钉钉 API 可用');
          info(`活动会话数: ${response.data.activeSessions.length}`);
        } else {
          warning('钉钉未启用');
          return false;
        }
        return true;
      } catch (err) {
        if (err.response?.status === 404) {
          warning('钉钉 API 端点不存在（可能使用的是旧版本 web-server.js）');
          return false;
        }
        throw err;
      }
    }
  },

  {
    name: '测试 3: 发送测试消息到 Claude',
    async fn() {
      const response = await axios.post(`${API_BASE}/api/message`, {
        message: '你好，请用一句话介绍你自己',
        systemPrompt: '你是一个友好的助手'
      });

      if (response.data.success) {
        success('消息发送成功');
        info(`会话ID: ${response.data.sessionId}`);
        info(`事件数: ${response.data.events.length}`);
        info(`退出码: ${response.data.exitCode}`);

        // 提取回复内容
        const assistantEvents = response.data.events.filter(e => e.type === 'assistant');
        if (assistantEvents.length > 0) {
          const reply = assistantEvents
            .flatMap(e => e.message.content)
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join('');
          info(`Claude 回复: ${reply.substring(0, 100)}...`);
        }
      } else {
        error('消息发送失败');
        info(`错误: ${response.data.error}`);
        return false;
      }

      return true;
    }
  },

  {
    name: '测试 4: 继续会话',
    async fn() {
      // 先获取当前会话ID
      const statusResponse = await axios.get(`${API_BASE}/api/status`);
      const sessionId = statusResponse.data.currentSessionId;

      if (!sessionId) {
        warning('没有活动会话，跳过测试');
        return false;
      }

      const response = await axios.post(`${API_BASE}/api/message`, {
        message: '你刚才说了什么？',
        sessionId: sessionId
      });

      if (response.data.success) {
        success('会话继续成功');
        info(`会话ID: ${response.data.sessionId}`);
        info(`是否继续: ${response.data.isResume}`);
      } else {
        error('会话继续失败');
        return false;
      }

      return true;
    }
  },

  {
    name: '测试 5: 重置会话',
    async fn() {
      const response = await axios.post(`${API_BASE}/api/reset`);

      if (response.data.success) {
        success('会话重置成功');
      } else {
        error('会话重置失败');
        return false;
      }

      return true;
    }
  }
];

// 主测试流程
async function runTests() {
  console.log('\n========================================');
  console.log('  钉钉集成测试');
  console.log('========================================\n');

  info(`API 地址: ${API_BASE}`);
  info(`测试数量: ${tests.length}\n`);

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const test of tests) {
    info(`运行: ${test.name}`);
    try {
      const result = await test.fn();
      if (result === false) {
        skipped++;
      } else {
        passed++;
      }
    } catch (err) {
      failed++;
      error(`测试失败: ${err.message}`);
      if (err.response) {
        info(`响应数据: ${JSON.stringify(err.response.data, null, 2)}`);
      }
    }
    console.log('');
  }

  // 总结
  console.log('========================================');
  console.log('  测试总结');
  console.log('========================================');
  success(`通过: ${passed}`);
  if (failed > 0) {
    error(`失败: ${failed}`);
  }
  if (skipped > 0) {
    warning(`跳过: ${skipped}`);
  }
  console.log('');

  // 钉钉集成提示
  if (passed > 0) {
    info('📱 钉钉集成测试提示：');
    info('1. 确保服务正在运行（使用 web-server-dingtalk.js）');
    info('2. 确保已在钉钉开放平台创建应用并启用 Stream 模式');
    info('3. 确保已在 .claude-connector.json 中配置 clientId 和 clientSecret');
    info('4. 在钉钉群中添加机器人并发送消息测试');
    info('5. 示例消息: "@机器人 你好"');
    console.log('');
  }
}

// 运行测试
runTests().catch(err => {
  error(`测试运行失败: ${err.message}`);
  process.exit(1);
});
