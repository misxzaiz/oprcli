/**
 * IFlow 工具包装器 - 跨平台版本
 *
 * 解决 IFlow 在 Windows 上调用外部工具失败的问题
 * 提供统一的接口供 IFlow 调用
 */

const { execSync } = require('child_process');
const os = require('os');
const path = require('path');

/**
 * 跨平台执行命令
 */
function executeCommand(command, args = []) {
  try {
    const platform = os.platform();
    let cmd, cmdArgs;

    if (platform === 'win32') {
      // Windows: 使用 cmd /c
      cmd = 'cmd';
      cmdArgs = ['/c', command].concat(args.map(arg => `"${arg}"`));
    } else {
      // Linux/Mac: 直接执行或使用 bash -c
      cmd = command;
      cmdArgs = args;
    }

    const result = execSync(cmdArgs ? `${cmd} ${cmdArgs.join(' ')}` : cmd, {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      stdio: 'pipe'
    });

    return {
      success: true,
      output: result.trim(),
      exitCode: 0
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      exitCode: error.status || 1
    };
  }
}

/**
 * 发送钉钉通知（IFlow 友好版）
 */
function sendNotification(message, options = {}) {
  const {
    type = 'text',
    title = 'IFlow 通知',
    webhook = process.env.NOTIFICATION_DINGTALK_WEBHOOK
  } = options;

  // 构建命令参数
  const args = ['scripts/notify.js'];

  if (type) {
    args.push(`--type=${type}`);
  }

  if (title) {
    args.push(`--title=${title}`);
  }

  args.push(message);

  // 执行命令
  const result = executeCommand('node', args);

  if (result.success) {
    return {
      success: true,
      message: '✅ 钉钉通知发送成功'
    };
  } else {
    return {
      success: false,
      error: result.error,
      message: '❌ 钉钉通知发送失败'
    };
  }
}

/**
 * 发送 Markdown 格式通知
 */
function sendMarkdownNotification(title, content) {
  return sendNotification(content, {
    type: 'markdown',
    title: title
  });
}

/**
 * 执行资讯收集任务
 */
function runNewsCollector() {
  const result = executeCommand('node', ['tasks/news-collector-iflow.js']);

  if (result.success) {
    return {
      success: true,
      message: '✅ 资讯收集完成',
      output: result.output
    };
  } else {
    return {
      success: false,
      error: result.error,
      message: '❌ 资讯收集失败'
    };
  }
}

/**
 * 主函数（供 IFlow 调用）
 */
function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  let result;

  switch (command) {
    case 'notify':
      const message = args[1] || '测试消息';
      result = sendNotification(message);
      break;

    case 'notify-markdown':
      const title = args[1] || '标题';
      const content = args[2] || '内容';
      result = sendMarkdownNotification(title, content);
      break;

    case 'collect-news':
      result = runNewsCollector();
      break;

    default:
      console.log(`可用命令:
  - notify <message>           发送文本通知
  - notify-markdown <title> <content>  发送 Markdown 通知
  - collect-news               执行资讯收集`);
      return;
  }

  // 输出结果（IFlow 会读取这个输出）
  if (result) {
    console.log(JSON.stringify(result, null, 2));
  }

  return result;
}

// 导出函数供其他模块使用
module.exports = {
  sendNotification,
  sendMarkdownNotification,
  runNewsCollector,
  executeCommand
};

// 如果直接运行脚本
if (require.main === module) {
  try {
    const result = main();
    process.exit(result && result.success ? 0 : 1);
  } catch (error) {
    console.error(JSON.stringify({
      success: false,
      error: error.message
    }, null, 2));
    process.exit(1);
  }
}
