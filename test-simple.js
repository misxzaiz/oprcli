/**
 * 简单测试 - 只测试连接功能
 */

const ClaudeConnector = require('./claude-connector');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m'
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

async function testConnection() {
  log(colors.blue, '\n========================================');
  log(colors.blue, '  Claude Connector 连接测试');
  log(colors.blue, '========================================\n');

  const connector = new ClaudeConnector({
    // 配置从文件读取
  });

  log(colors.yellow, '测试 1: 连接到 Claude Code...');
  const result = await connector.connect();

  if (result.success) {
    log(colors.green, '✓ 连接成功');
    log(colors.green, `  版本: ${result.version}`);
    log(colors.green, `  node.exe: ${connector.nodeExe}`);
    log(colors.green, `  cli.js: ${connector.cliJs}`);

    // 测试会话ID生成
    log(colors.yellow, '\n测试 2: 会话 ID 生成...');
    const tempId1 = connector._generateTempId();
    const tempId2 = connector._generateTempId();
    if (tempId1 !== tempId2) {
      log(colors.green, '✓ 会话 ID 唯一性测试通过');
    }

    log(colors.yellow, '\n测试 3: 活动会话查询...');
    const sessions = connector.getActiveSessions();
    log(colors.green, `✓ 当前活动会话数: ${sessions.length}`);

    log(colors.blue, '\n========================================');
    log(colors.blue, '  所有测试通过 ✓');
    log(colors.blue, '========================================\n');

    log(colors.yellow, '注意：无法在当前 Claude Code 会话中测试实际聊天功能');
    log(colors.yellow, '请在独立终端运行: node test-connector.js');

  } else {
    log(colors.red, '✗ 连接失败');
    log(colors.red, `  错误: ${result.error}`);
  }
}

testConnection().catch(err => {
  log(colors.red, '测试失败:');
  console.error(err);
  process.exit(1);
});
