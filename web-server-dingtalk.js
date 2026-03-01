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
 * 处理钉钉消息
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

    console.log(`[DingTalk] 💬 ${senderNick}: ${text?.content?.substring(0, 50) || '(空消息)'}...`);

    // 只处理文本消息
    if (msgtype !== 'text') {
      console.log(`[DingTalk] ⚠️  不支持的消息类型: ${msgtype}`);
      return { status: 'SUCCESS' };
    }

    // 提取消息内容
    const messageContent = text?.content?.trim() || '';

    if (!messageContent) {
      console.log('[DingTalk] ⚠️  消息内容为空');
      return { status: 'SUCCESS' };
    }

    // 检查 connector 是否已初始化
    if (!connector || !connector.connected) {
      console.log('[DingTalk] ⚠️  Claude 未连接');
      await sendToDingTalk(sessionWebhook, {
        msgtype: 'text',
        text: {
          content: '⚠️ Claude Code CLI 未连接，请先检查配置文件\n\n配置路径: .claude-connector.json\n\n需要配置:\n- claudeCmdPath\n- workDir\n- gitBinPath'
        }
      });
      return { status: 'SUCCESS' };
    }

    // 检查是否有该会话的 sessionId
    let sessionId = sessionMap.get(conversationId);
    const isResume = !!sessionId;

    console.log(`[DingTalk] 📝 会话: ${conversationId}, Claude Session: ${sessionId || '新会话'}`);

    // 调用 Claude
    let claudeResponse = '';

    await new Promise((resolve, reject) => {
      const options = {
        onEvent: (event) => {
          // 处理 assistant 消息
          if (event.type === 'assistant') {
            const text = event.message.content
              .filter(c => c.type === 'text')
              .map(c => c.text)
              .join('');
            claudeResponse += text;
          }

          // 捕获真实的 sessionId（新会话时）
          if (!isResume && event.type === 'system' && event.session_id) {
            sessionId = event.session_id;
            sessionMap.set(conversationId, sessionId);
            console.log(`[DingTalk] 🆔 新会话ID: ${sessionId}`);
          }
        },
        onComplete: (exitCode) => {
          console.log(`[DingTalk] ✅ Claude 完成，退出码: ${exitCode}`);
          resolve();
        },
        onError: (err) => {
          console.error('[DingTalk] ❌ Claude 错误:', err);
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

    // 发送回复到钉钉（使用 sessionWebhook）
    const responseText = claudeResponse || '🤔 我思考了一下，但没有生成回复';
    await sendToDingTalk(sessionWebhook, {
      msgtype: 'text',
      text: {
        content: responseText
      }
    });

    console.log(`[DingTalk] ✅ 回复已发送 (${responseText.length} 字符)`);

    return { status: 'SUCCESS' };

  } catch (error) {
    console.error('[DingTalk] ❌ 处理消息失败:', error);
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
