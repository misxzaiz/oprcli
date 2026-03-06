#!/usr/bin/env node
/**
 * Codex Connector 快速启动示例
 *
 * 演示如何使用 Codex Connector 进行基本操作
 */

require('dotenv').config({ override: true });
const CodexConnector = require('../connectors/codex-connector');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  gray: '\x1b[90m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 主函数
async function main() {
  log('╔════════════════════════════════════════╗', 'blue');
  log('║   Codex Connector 快速启动示例         ║', 'blue');
  log('╚════════════════════════════════════════╝', 'blue');

  // 创建连接器
  const connector = new CodexConnector({
    codexPath: process.env.CODEX_PATH || 'codex',
    workDir: process.env.CODEX_WORK_DIR || process.cwd(),
    systemPromptFile: process.env.CODEX_SYSTEM_PROMPT_FILE,
    modelConfig: {
      model: process.env.CODEX_MODEL,
      provider: process.env.CODEX_MODEL_PROVIDER
    }
  });

  try {
    // 1. 连接
    log('\n▶ 步骤 1: 连接到 Codex...', 'blue');
    const result = await connector.connect();

    if (!result.success) {
      log(`❌ 连接失败: ${result.error}`, 'red');
      log('\n提示: 请确保 Codex CLI 已安装', 'yellow');
      log('安装命令: pip install codex', 'gray');
      process.exit(1);
    }

    log(`✅ 连接成功! 版本: ${result.version || 'unknown'}`, 'green');

    // 2. 启动会话
    log('\n▶ 步骤 2: 启动会话...', 'blue');
    log('发送消息: "请用一句话介绍你自己"', 'yellow');
    log('━'.repeat(50), 'gray');

    const message = '请用一句话介绍你自己';
    const session = await connector.startSession(message, {
      onEvent: (event) => {
        if (event.type === 'assistant') {
          const content = event.message?.content || [];
          content.forEach(block => {
            if (block.type === 'text') {
              log(block.text, 'reset');
            }
          });
        } else if (event.type === 'session_end') {
          log('━'.repeat(50), 'gray');
          log('\n✅ 会话完成', 'green');
        }
      },

      onError: (err) => {
        log(`\n❌ 错误: ${err.message}`, 'red');
      },

      onComplete: (code) => {
        log(`\n进程退出码: ${code}`, 'gray');
      }
    });

    log(`\n会话 ID: ${session.sessionId}`, 'gray');

    // 等待会话完成
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 3. 检查活动会话
    log('\n▶ 步骤 3: 检查活动会话...', 'blue');
    const activeSessions = connector.getActiveSessions();
    log(`活动会话数: ${activeSessions.length}`, 'yellow');

    if (activeSessions.length > 0) {
      log(`会话列表: ${activeSessions.join(', ')}`, 'gray');
    }

    // 4. 清理
    log('\n▶ 步骤 4: 清理资源...', 'blue');
    connector.cleanup();
    log('✅ 清理完成', 'green');

    log('\n╔════════════════════════════════════════╗', 'blue');
    log('║   示例完成                              ║', 'blue');
    log('╚════════════════════════════════════════╝', 'blue');

  } catch (error) {
    log(`\n❌ 发生错误: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// 运行
main().catch(error => {
  log(`\n❌ 启动失败: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
