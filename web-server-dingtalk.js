/**
 * Claude Connector Web Server with DingTalk Stream Integration
 *
 * 在现有 web-server.js 基础上集成钉钉 Stream 模式
 *
 * 运行方式：
 * node web-server-dingtalk.js
 */

const express = require('express');
const path = require('path');
const ClaudeConnector = require('./claude-connector');

// 钉钉 Stream 客户端（需要安装：npm install dingtalk-stream）
let DWClient = null;
let TOPIC_ROBOT = null;
try {
  const sdk = require('dingtalk-stream');
  DWClient = sdk.DWClient;
  TOPIC_ROBOT = sdk.TOPIC_ROBOT;
} catch (e) {
  console.log('⚠️  未安装 dingtalk-stream，钉钉功能将不可用');
  console.log('   安装命令: npm install dingtalk-stream');
}

const app = express();
const PORT = 3000;

// 解析 JSON 和 URL-encoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件
app.use(express.static(path.join(__dirname, 'public')));

// 全局连接器实例
let connector = null;
let currentSessionId = null;

// 钉钉 Stream 客户端
let dingtalkClient = null;

// 会话映射：钉钉 conversationId -> Claude sessionId
const sessionMap = new Map();

// 消息去重（记录已处理的消息 ID）
const processedMessages = new Set();

// ==================== 配置和常量 ====================

// 加载配置
function loadConfig() {
  const configPath = path.join(__dirname, '.claude-connector.json');
  try {
    return require(configPath);
  } catch (e) {
    return {};
  }
}

const config = loadConfig();

// 流式响应配置
const streamConfig = {
  enabled: config.dingtalk?.streaming?.enabled !== false,  // 默认启用
  mode: config.dingtalk?.streaming?.mode || 'realtime',     // realtime | batch
  sendInterval: config.dingtalk?.streaming?.sendInterval || 2000,
  maxOutputLength: config.dingtalk?.streaming?.maxOutputLength || 500,
  showThinking: config.dingtalk?.streaming?.showThinking !== false,  // 默认显示
  showTools: config.dingtalk?.streaming?.showTools !== false,        // 默认显示
  showTime: config.dingtalk?.streaming?.showTime !== false,          // 默认显示
  debugRawEvents: config.dingtalk?.streaming?.debugRawEvents || false, // 调试模式：输出原始事件
  useMarkdown: config.dingtalk?.streaming?.useMarkdown || false          // 使用 Markdown 格式
};

// 日志配置
const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  EVENT: 2,
  SUCCESS: 3,
  WARNING: 4,
  ERROR: 5
};

const logConfig = {
  level: config.dingtalk?.logging?.level || 'EVENT',
  colored: config.dingtalk?.logging?.colored !== false
};

// 日志级别映射
const logLevelMap = {
  'DEBUG': LogLevel.DEBUG,
  'INFO': LogLevel.INFO,
  'EVENT': LogLevel.EVENT,
  'SUCCESS': LogLevel.SUCCESS,
  'WARNING': LogLevel.WARNING,
  'ERROR': LogLevel.ERROR
};

const currentLogLevel = logLevelMap.hasOwnProperty(logConfig.level)
  ? logLevelMap[logConfig.level]
  : LogLevel.EVENT;

// 启动时输出配置信息（调试用）
console.log('[Config] 钉钉配置加载完成:');
console.log('  - streaming.enabled:', streamConfig.enabled);
console.log('  - streaming.debugRawEvents:', streamConfig.debugRawEvents);
console.log('  - logConfig.level:', logConfig.level);
console.log('  - logLevelMap[logConfig.level]:', logLevelMap[logConfig.level]);
console.log('  - currentLogLevel:', currentLogLevel);
console.log('  - LogLevel.DEBUG:', LogLevel.DEBUG);
console.log('  - LogLevel.EVENT:', LogLevel.EVENT);
console.log('  - 日志级别映射:', logLevelMap);

// 颜色代码
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

// ==================== 工具类 ====================

/**
 * 速率限制器
 * 防止消息发送过快被钉钉限制
 */
class RateLimiter {
  constructor(maxRequests = 5, perMilliseconds = 1000) {
    this.maxRequests = maxRequests;
    this.perMilliseconds = perMilliseconds;
    this.requests = [];
  }

  async waitForSlot() {
    const now = Date.now();
    // 清理过期的请求记录
    this.requests = this.requests.filter(t => now - t < this.perMilliseconds);

    // 如果达到限制，等待
    if (this.requests.length >= this.maxRequests) {
      const oldest = this.requests[0];
      const waitTime = this.perMilliseconds - (now - oldest);
      if (waitTime > 0) {
        await sleep(waitTime);
      }
      this.requests.shift();
    }

    this.requests.push(now);
  }

  getStats() {
    return {
      recent: this.requests.length,
      max: this.maxRequests
    };
  }
}

// 创建速率限制器实例（每秒最多 5 条消息）
const rateLimiter = new RateLimiter(5, 1000);

/**
 * 睡眠函数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== 日志系统 ====================

/**
 * 日志函数
 */
function log(level, category, message, data = null) {
  if (level < currentLogLevel) return;

  const timestamp = new Date().toISOString().split('T')[1].substring(0, 12);
  const levelNames = {
    [LogLevel.DEBUG]: 'DEBUG',
    [LogLevel.INFO]: 'INFO',
    [LogLevel.EVENT]: 'EVENT',
    [LogLevel.SUCCESS]: 'SUCCESS',
    [LogLevel.WARNING]: 'WARNING',
    [LogLevel.ERROR]: 'ERROR'
  };

  const levelIcons = {
    [LogLevel.DEBUG]: '🔍',
    [LogLevel.INFO]: 'ℹ️',
    [LogLevel.EVENT]: '📡',
    [LogLevel.SUCCESS]: '✅',
    [LogLevel.WARNING]: '⚠️',
    [LogLevel.ERROR]: '❌'
  };

  const color = {
    [LogLevel.DEBUG]: colors.cyan,
    [LogLevel.INFO]: colors.blue,
    [LogLevel.EVENT]: colors.magenta,
    [LogLevel.SUCCESS]: colors.green,
    [LogLevel.WARNING]: colors.yellow,
    [LogLevel.ERROR]: colors.red
  }[level];

  const categoryColor = logConfig.colored ? color : '';
  const resetColor = logConfig.colored ? colors.reset : '';

  let logMsg = `${categoryColor}[${timestamp}] ${levelIcons[level]} [${levelNames[level]}] [${category}] ${message}${resetColor}`;

  if (data && currentLogLevel <= LogLevel.DEBUG) {
    logMsg += '\n' + JSON.stringify(data, null, 2);
  }

  console.log(logMsg);
}

/**
 * 记录事件日志
 */
function logEvent(event, context) {
  const { index, elapsed } = context;

  switch (event.type) {
    case 'thinking':
      if (streamConfig.showThinking) {
        log(LogLevel.EVENT, 'THINKING', `思考过程 #${index}`, {
          content: event.content?.substring(0, 100) || '',
          elapsed: `${elapsed}s`
        });
      }
      break;

    case 'tool_start':
      if (streamConfig.showTools) {
        log(LogLevel.EVENT, 'TOOL', `🔧 工具调用 #${index}: ${event.tool}`, {
          command: event.command?.substring(0, 100) || '',
          elapsed: `${elapsed}s`
        });
      }
      break;

    case 'tool_output':
      if (streamConfig.showTools && currentLogLevel <= LogLevel.DEBUG) {
        const output = event.output?.substring(0, 200) || '';
        log(LogLevel.DEBUG, 'TOOL', `📤 工具输出 #${index}`, {
          output: output + (event.output?.length > 200 ? '...' : ''),
          truncated: event.output?.length > 200,
          elapsed: `${elapsed}s`
        });
      }
      break;

    case 'tool_end':
      if (streamConfig.showTools) {
        const status = event.exitCode === 0 ? '✅ 成功' : '❌ 失败';
        log(LogLevel.EVENT, 'TOOL', `${status} #${index}: ${event.tool}`, {
          exitCode: event.exitCode,
          elapsed: `${elapsed}s`
        });
      }
      break;

    case 'assistant':
      log(LogLevel.SUCCESS, 'ASSISTANT', `💬 Claude 回复 #${index}`, {
        length: event.content?.length || 0,
        preview: event.content?.substring(0, 80) || '',
        elapsed: `${elapsed}s`
      });
      break;

    case 'error':
      log(LogLevel.ERROR, 'ERROR', `❌ 错误 #${index}`, {
        error: event.message || event.error,
        elapsed: `${elapsed}s`
      });
      break;

    default:
      log(LogLevel.DEBUG, 'EVENT', `未知事件 #${index}: ${event.type}`, {
        elapsed: `${elapsed}s`
      });
  }
}

// ==================== 消息格式化 ====================

/**
 * 获取工具图标
 */
function getToolIcon(tool) {
  const icons = {
    'Bash': '🖥️',
    'Editor': '📝',
    'Browser': '🌐',
    'Computer': '💻',
    'Unknown': '🔧'
  };
  return icons[tool] || icons['Unknown'];
}

/**
 * 截断输出
 */
function truncateOutput(output, maxLength) {
  if (!output || output.length <= maxLength) return output || '';
  return output.substring(0, maxLength) + `\n... (已截断，共 ${output.length} 字符)`;
}

/**
 * 提取 thinking 内容（从 assistant 事件中）
 */
function extractThinkingFromAssistant(event) {
  const thinkingParts = event.message?.content
    ?.filter(c => c.type === 'thinking')
    ?.map(c => c.thinking)
    ?.join('\n') || '';

  if (thinkingParts && thinkingParts.length > 200) {
    return thinkingParts.substring(0, 200) + '\n...(已截断)';
  }

  return thinkingParts;
}

/**
 * 检查是否是包含 thinking 的 result 消息
 */
function isResultWithThinking(event) {
  if (event.type !== 'assistant') return false;

  const hasText = event.message?.content?.some(c => c.type === 'text');
  const hasThinking = event.message?.content?.some(c => c.type === 'thinking');

  // 如果同时有文本和 thinking，说明是 result 消息
  return hasText && hasThinking;
}

/**
 * 构建钉钉消息对象
 */
function buildMessage(content, title = 'Claude助手') {
  if (streamConfig.useMarkdown) {
    return {
      msgtype: 'markdown',
      markdown: {
        title: title,
        text: content
      }
    };
  } else {
    return {
      msgtype: 'text',
      text: {
        content: content
      }
    };
  }
}

/**
 * 格式化事件消息（优化版）
 */
function formatEventMessage(event, context) {
  const { index, elapsed } = context;

  // 时间后缀
  const timeStr = streamConfig.showTime ? `\n⏱️ ${elapsed}s` : '';

  // ==================== System 事件 ====================
  if (event.type === 'system') {
    // System 事件不显示给用户（技术细节）
    return null;
  }

  // ==================== Thinking 事件 ====================
  if (event.type === 'thinking') {
    if (!streamConfig.showThinking) return null;

    const thinkingContent = event.content || '';
    const truncated = thinkingContent.length > 200
      ? thinkingContent.substring(0, 200) + '\n...(已截断)'
      : thinkingContent;

    return buildMessage(`💭 思考中...\n\n${truncated}${timeStr}`, '思考中');
  }

  // ==================== Tool Start 事件 ====================
  if (event.type === 'tool_start') {
    if (!streamConfig.showTools) return null;

    const toolIcon = getToolIcon(event.tool);
    const command = event.command || '';

    return buildMessage(`${toolIcon} 执行工具：${event.tool}\n\n命令：\n\`\`\`\n${command}\n\`\`\`${timeStr}`, '执行工具');
  }

  // ==================== Tool Output 事件 ====================
  if (event.type === 'tool_output') {
    if (!streamConfig.showTools) return null;

    const output = event.output || '';
    const truncated = truncateOutput(output, streamConfig.maxOutputLength);
    const isTruncated = output.length > streamConfig.maxOutputLength;

    return buildMessage(`📤 输出：\n\n\`\`\`\n${truncated}\n\`\`\`\n\n${isTruncated ? `(已截断，共 ${output.length} 字符)` : ''}${timeStr}`, '工具输出');
  }

  // ==================== Tool End 事件 ====================
  if (event.type === 'tool_end') {
    if (!streamConfig.showTools) return null;

    // 成功时跳过，失败时显示错误
    if (event.exitCode === 0) {
      return null;  // 成功不显示
    }

    // 失败时显示错误信息
    return buildMessage(`❌ 工具失败：${event.tool}\n退出码：${event.exitCode}${timeStr}`, '工具失败');
  }

  // ==================== Assistant 事件 ====================
  if (event.type === 'assistant') {
    // 检查是否只包含 thinking（没有文本内容）
    const hasText = event.message?.content?.some(c => c.type === 'text');
    const hasThinking = event.message?.content?.some(c => c.type === 'thinking');

    // 如果只有 thinking，显示为思考过程
    if (!hasText && hasThinking) {
      const thinkingContent = extractThinkingFromAssistant(event);
      if (thinkingContent) {
        return buildMessage(`💭 思考中...\n\n${thinkingContent}${timeStr}`, '思考中');
      }
      return null;
    }

    // 如果同时有文本和 thinking（result 消息），只显示文本，过滤 thinking
    if (hasText && hasThinking) {
      const textParts = event.message?.content
        ?.filter(c => c.type === 'text')
        ?.map(c => c.text)
        ?.join('\n') || '';

      if (textParts.trim()) {
        return buildMessage(`💬 回复：\n\n${textParts}${timeStr}`, 'Claude回复');
      }
      return null;
    }

    // 普通的 assistant 事件（只有文本）
    const textParts = event.message?.content
      ?.filter(c => c.type === 'text')
      ?.map(c => c.text)
      ?.join('\n') || '';

    if (textParts.trim()) {
      return buildMessage(`💬 回复：\n\n${textParts}${timeStr}`, 'Claude回复');
    }

    // 没有内容，跳过
    return null;
  }

  // ==================== 其他事件 ====================
  // 不发送其他类型的事件
  return null;
}

// ==================== 钉钉 Stream 集成 ====================

/**
 * 初始化钉钉 Stream 客户端
 */
async function initDingTalkStream() {
  if (!DWClient || !TOPIC_ROBOT) {
    console.log('[DingTalk] SDK 未安装，跳过初始化');
    return false;
  }

  try {
    // 从配置文件读取
    const configPath = path.join(__dirname, '.claude-connector.json');
    let config = {};

    try {
      config = require(configPath);
    } catch (e) {
      console.log('[DingTalk] 配置文件不存在');
    }

    const { clientId, clientSecret } = config.dingtalk || {};

    if (!clientId || !clientSecret) {
      console.log('[DingTalk] 未配置 clientId 或 clientSecret');
      console.log('[DingTalk] 请在 .claude-connector.json 中添加：');
      console.log('  {');
      console.log('    "dingtalk": {');
      console.log('      "clientId": "your-client-id",');
      console.log('      "clientSecret": "your-client-secret"');
      console.log('    }');
      console.log('  }');
      return false;
    }

    // 创建 Stream 客户端
    console.log('[DingTalk] 正在连接...');
    dingtalkClient = new DWClient({
      clientId,
      clientSecret
    });

    // 监听连接成功
    dingtalkClient.on('connected', () => {
      console.log('[DingTalk] ✅ WebSocket 连接成功');
    });

    // 监听断开
    dingtalkClient.on('disconnected', () => {
      console.log('[DingTalk] 🔌 连接断开');
    });

    // 监听错误
    dingtalkClient.on('error', (error) => {
      console.error('[DingTalk] ❌ 错误:', error.message);
    });

    // 注册机器人消息监听器
    dingtalkClient.registerCallbackListener(TOPIC_ROBOT, async (message) => {
      console.log('[DingTalk] 📩 收到消息');
      await handleDingTalkMessage(message);
    });

    // 连接钉钉
    await dingtalkClient.connect();
    console.log('[DingTalk] ✅ 初始化成功');
    return true;

  } catch (error) {
    console.error('[DingTalk] ❌ 初始化失败:', error.message);
    console.error(error);
    return false;
  }
}

/**
 * 流式发送事件到钉钉
 */
async function streamEventToDingTalk(event, sessionWebhook, context) {
  const { index, elapsed } = context;

  // 🔴 强制输出：事件类型（不受日志级别限制）
  console.log(`[DEBUG-STREAM] 📡 收到事件 #${index}: ${event.type}`);

  // 调试模式：直接输出原始事件
  if (streamConfig.debugRawEvents) {
    const rawMessage = {
      msgtype: 'text',
      text: {
        content: `🔍 [调试 #${index}] ${event.type}\n\`\`\`\n${JSON.stringify(event, null, 2)}\n\`\`\`\n⏱️ ${elapsed}s`
      }
    };

    try {
      await rateLimiter.waitForSlot();
      await sendToDingTalk(sessionWebhook, rawMessage);
      console.log(`[DEBUG-STREAM] 📤 已发送原始事件 #${index}`);
    } catch (error) {
      console.error(`[DEBUG-STREAM] ❌ 发送失败 #${index}:`, error.message);
    }
    return;
  }

  // 正常模式：格式化消息
  const message = formatEventMessage(event, context);
  if (!message) {
    console.log(`[DEBUG-STREAM] ⏭️  跳过事件 #${index} (${event.type})`);
    return;
  }

  // 🔴 强制输出：即将发送消息
  console.log(`[DEBUG-STREAM] 📤 准备发送消息 #${index} (${event.type})`);

  // 记录日志
  logEvent(event, context);

  try {
    // 速率限制
    await rateLimiter.waitForSlot();

    // 发送到钉钉
    await sendToDingTalk(sessionWebhook, message);

    log(LogLevel.INFO, 'DINGTALK', `📤 已发送消息 #${index} (${event.type})`, {
      elapsed: `${elapsed}s`
    });
  } catch (error) {
    log(LogLevel.ERROR, 'DINGTALK', `❌ 发送失败 #${index}`, {
      error: error.message
    });
  }
}

/**
 * 处理钉钉消息（支持流式响应）
 */
async function handleDingTalkMessage(message) {
  // message 是 DWClientDownStream 格式
  const { headers, data } = message;
  const { messageId, topic } = headers;

  // 消息去重
  if (messageId && processedMessages.has(messageId)) {
    console.log('[DingTalk] ⚠️  消息已处理，跳过');
    return { status: 'SUCCESS' };
  }
  if (messageId) {
    processedMessages.add(messageId);
    // 限制缓存大小（最多保留 1000 个）
    if (processedMessages.size > 1000) {
      const first = processedMessages.values().next().value;
      processedMessages.delete(first);
    }
  }

  let eventCount = 0;
  const allEvents = [];  // 记录所有事件用于调试

  try {
    // 解析机器人消息数据
    const robotMessage = JSON.parse(data);
    const {
      conversationId,
      senderNick,
      msgId,
      msgtype,
      text,
      sessionWebhook
    } = robotMessage;

    log(LogLevel.INFO, 'DINGTALK', `💬 收到消息: ${senderNick}`, {
      content: text?.content?.substring(0, 50) || '(空消息)',
      conversationId
    });

    // 只处理文本消息
    if (msgtype !== 'text') {
      log(LogLevel.WARNING, 'DINGTALK', `⚠️ 不支持的消息类型: ${msgtype}`);
      return { status: 'SUCCESS' };
    }

    // 提取消息内容
    const messageContent = text?.content?.trim() || '';

    if (!messageContent) {
      log(LogLevel.WARNING, 'DINGTALK', '⚠️ 消息内容为空');
      return { status: 'SUCCESS' };
    }

    // 检查 connector 是否已初始化
    if (!connector || !connector.connected) {
      log(LogLevel.ERROR, 'DINGTALK', '⚠️ Claude 未连接');
      await sendToDingTalk(sessionWebhook,
        buildMessage('⚠️ Claude Code CLI 未连接，请先检查配置文件\n\n配置路径: .claude-connector.json\n\n需要配置:\n- claudeCmdPath\n- workDir\n- gitBinPath', '连接错误')
      );
      return { status: 'SUCCESS' };
    }

    // 检查是否有该会话的 sessionId
    let sessionId = sessionMap.get(conversationId);
    const isResume = !!sessionId;

    log(LogLevel.INFO, 'DINGTALK', `📝 会话信息`, {
      conversationId,
      sessionId: sessionId || '新会话',
      mode: streamConfig.enabled ? '流式' : '非流式'
    });

    // 更新 sessionMap
    if (!isResume && sessionId) {
      sessionMap.set(conversationId, sessionId);
    }

    // 流式处理标志
    let messageCount = 0;
    let finalResponse = '';
    const startTime = Date.now();

    await new Promise((resolve, reject) => {
      const options = {
        onEvent: async (event) => {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const context = {
            index: ++messageCount,
            elapsed
          };

          // 调试：记录所有事件
          // 🔴 强制输出完整的原始事件 JSON（不受日志级别限制）
          console.log(`\n${colors.cyan}[DEBUG-EVENT]${colors.reset} 📡 收到事件 #${messageCount}: ${event.type}`);
          console.log(JSON.stringify(event, null, 2));
          console.log('');  // 空行分隔

          // 简化的事件日志
          if (currentLogLevel <= LogLevel.DEBUG) {
            log(LogLevel.DEBUG, 'EVENT', `📡 收到事件 #${messageCount}: ${event.type}`, {
              eventType: event.type,
              hasMessage: !!event.message,
              hasContent: !!event.content,
              elapsed: `${elapsed}s`
            });
          }

          // 捕获真实的 sessionId（新会话时）
          if (!isResume && event.type === 'system' && event.session_id) {
            sessionId = event.session_id;
            sessionMap.set(conversationId, sessionId);
            log(LogLevel.INFO, 'SESSION', `🆔 新会话ID: ${sessionId}`);
          }

          // 流式发送
          if (streamConfig.enabled) {
            await streamEventToDingTalk(event, sessionWebhook, context);
          } else {
            // 非流式模式：只累积 assistant 消息
            if (event.type === 'assistant') {
              const text = event.message?.content
                ?.filter(c => c.type === 'text')
                ?.map(c => c.text)
                ?.join('') || '';
              finalResponse += text;
            }
          }
        },
        onComplete: async (exitCode) => {
          const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

          log(LogLevel.SUCCESS, 'SESSION', `✅ Claude 完成`, {
            exitCode,
            totalTime: `${totalTime}s`,
            messageCount,
            mode: streamConfig.enabled ? '流式' : '非流式'
          });

          // 非流式模式：发送完整回复
          if (!streamConfig.enabled && finalResponse) {
            await sendToDingTalk(sessionWebhook,
              buildMessage(finalResponse || '🤔 我思考了一下，但没有生成回复', 'Claude回复')
            );
          }

          // 流式模式：发送完成提示
          if (streamConfig.enabled) {
            await sendToDingTalk(sessionWebhook,
              buildMessage(`\n✅ 处理完成！\n\n共发送 ${messageCount} 条消息\n总耗时: ${totalTime}s`, '处理完成')
            );
          }

          resolve();
        },
        onError: async (err) => {
          log(LogLevel.ERROR, 'SESSION', '❌ Claude 错误', {
            error: err.message
          });

          // 发送错误提示
          await sendToDingTalk(sessionWebhook,
            buildMessage(`❌ 处理失败\n\n错误: ${err.message}\n\n请重试或联系管理员`, '处理失败')
          );

          reject(err);
        }
      };

      try {
        if (isResume) {
          connector.continueSession(sessionId, messageContent, options);
        } else {
          connector.startSession(messageContent, options);
        }
      } catch (error) {
        reject(error);
      }
    });

    log(LogLevel.SUCCESS, 'DINGTALK', `✅ 消息处理完成`, {
      messageCount,
      conversationId
    });

    return { status: 'SUCCESS' };

  } catch (error) {
    log(LogLevel.ERROR, 'DINGTALK', '❌ 处理消息失败', {
      error: error.message,
      stack: error.stack
    });

    return {
      status: 'LATER',
      message: error.message
    };
  }
}

/**
 * 发送消息到钉钉（使用 sessionWebhook）
 */
async function sendToDingTalk(sessionWebhook, message) {
  if (!sessionWebhook) {
    console.error('[DingTalk] sessionWebhook 为空');
    return;
  }

  const axios = require('axios').default;

  try {
    await axios.post(sessionWebhook, message);
    console.log('[DingTalk] 消息已通过 webhook 发送');
  } catch (error) {
    console.error('[DingTalk] 发送消息失败:', error.message);
    throw error;
  }
}

// ==================== 原 Web API ====================

/**
 * API: 连接到 Claude Code
 */
app.post('/api/connect', async (req, res) => {
  try {
    const options = req.body;

    connector = new ClaudeConnector(options);
    const result = await connector.connect();

    res.json({
      success: result.success,
      version: result.version,
      error: result.error
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * API: 获取连接状态
 */
app.get('/api/status', (req, res) => {
  res.json({
    connected: connector?.connected || false,
    activeSessions: connector?.getActiveSessions() || [],
    currentSessionId,
    dingtalk: {
      enabled: !!dingtalkClient,
      connected: dingtalkClient?.connected || false,
      activeSessions: Array.from(sessionMap.keys())
    }
  });
});

/**
 * API: 发送消息（开启或继续会话）
 */
app.post('/api/message', async (req, res) => {
  if (!connector || !connector.connected) {
    return res.status(400).json({
      success: false,
      error: '未连接，请先调用 /api/connect'
    });
  }

  const { message, sessionId, systemPrompt } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({
      success: false,
      error: '消息不能为空'
    });
  }

  try {
    const events = [];
    const isResume = !!sessionId;

    return new Promise((resolve, reject) => {
      try {
        let result;

        if (isResume) {
          result = connector.continueSession(sessionId, message, {
            systemPrompt,
            onEvent: (event) => {
              events.push(event);
              console.log('[Web Server] Event:', event.type, event);
            },
            onComplete: (exitCode) => {
              console.log('[Web Server] Process completed, exit code:', exitCode);
              resolve({
                success: true,
                sessionId: sessionId,
                isResume,
                events: events,
                exitCode,
                processId: result?.process?.pid
              });
            },
            onError: (err) => {
              console.error('[Web Server] Error:', err);
              resolve({
                success: false,
                error: err.message,
                events
              });
            }
          });
        } else {
          result = connector.startSession(message, {
            systemPrompt,
            onEvent: (event) => {
              events.push(event);
              console.log('[Web Server] Event:', event.type, event);

              if (event.type === 'system' && event.session_id) {
                currentSessionId = event.session_id;
                console.log('[Web Server] Captured session ID:', currentSessionId);
              }
            },
            onComplete: (exitCode) => {
              console.log('[Web Server] Process completed, exit code:', exitCode);
              resolve({
                success: true,
                sessionId: currentSessionId,
                isResume,
                events: events,
                exitCode,
                processId: result?.process?.pid
              });
            },
            onError: (err) => {
              console.error('[Web Server] Error:', err);
              resolve({
                success: false,
                error: err.message,
                events
              });
            }
          });
        }
      } catch (error) {
        reject(error);
      }
    }).then(result => {
      res.json(result);
    }).catch(error => {
      res.status(500).json({
        success: false,
        error: error.message
      });
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * API: 中断当前会话
 */
app.post('/api/interrupt', (req, res) => {
  if (currentSessionId && connector) {
    const success = connector.interruptSession(currentSessionId);
    if (success) {
      currentSessionId = null;
    }
    res.json({ success });
  } else {
    res.json({ success: false, error: '没有活动会话' });
  }
});

/**
 * API: 重置会话
 */
app.post('/api/reset', (req, res) => {
  if (currentSessionId && connector) {
    connector.interruptSession(currentSessionId);
  }
  currentSessionId = null;
  res.json({ success: true });
});

/**
 * API: 获取钉钉状态
 */
app.get('/api/dingtalk/status', (req, res) => {
  res.json({
    enabled: !!dingtalkClient,
    connected: dingtalkClient?.connected || false,
    activeSessions: Array.from(sessionMap.entries()).map(([convId, sessionId]) => ({
      conversationId: convId,
      sessionId
    }))
  });
});

/**
 * API: 手动发送消息到钉钉（测试用）
 */
app.post('/api/dingtalk/send', async (req, res) => {
  const { conversationId, message } = req.body;

  if (!dingtalkClient) {
    return res.status(400).json({
      success: false,
      error: '钉钉未启用'
    });
  }

  if (!conversationId || !message) {
    return res.status(400).json({
      success: false,
      error: '缺少 conversationId 或 message'
    });
  }

  try {
    await sendToDingTalk(conversationId, message);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== 启动服务器 ====================

// 启动服务器
app.listen(PORT, async () => {
  console.log('\n========================================');
  console.log('  Claude Connector Web Server');
  console.log('  with DingTalk Stream Integration');
  console.log('========================================');
  console.log(`\n🌐 Web 服务器运行在: http://localhost:${PORT}`);

  // 自动初始化 Claude 连接
  try {
    console.log('[Claude] 正在初始化连接...');
    const configPath = path.join(__dirname, '.claude-connector.json');
    let config = {};

    try {
      config = require(configPath);
    } catch (e) {
      console.log('[Claude] 配置文件不存在，跳过自动连接');
    }

    if (config.claudeCmdPath) {
      connector = new ClaudeConnector(config);
      const result = await connector.connect();

      if (result.success) {
        console.log('[Claude] ✅ 连接成功');
        if (result.version) {
          console.log(`[Claude] 版本: ${result.version}`);
        }
      } else {
        console.log('[Claude] ⚠️  连接失败:', result.error);
        connector = null;
      }
    } else {
      console.log('[Claude] ⚠️  未配置 claudeCmdPath');
    }
  } catch (error) {
    console.error('[Claude] ❌ 初始化失败:', error.message);
    connector = null;
  }

  // 初始化钉钉 Stream
  const dingtalkEnabled = await initDingTalkStream();
  if (dingtalkEnabled) {
    console.log('✅ 钉钉 Stream 模式已启用\n');
  } else {
    console.log('⚠️  钉钉未配置或配置失败，仅 Web 模式可用\n');
  }

  console.log('按 Ctrl+C 停止服务器\n');
});

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n正在关闭服务器...');

  // 关闭 Claude 连接
  if (connector) {
    const sessions = connector.getActiveSessions();
    sessions.forEach(sid => connector.interruptSession(sid));
    console.log('[Claude] 所有会话已中断');
  }

  // 关闭钉钉连接
  if (dingtalkClient) {
    try {
      await dingtalkClient.close();
      console.log('[DingTalk] Stream 客户端已关闭');
    } catch (error) {
      console.error('[DingTalk] 关闭失败:', error.message);
    }
  }

  process.exit(0);
});
