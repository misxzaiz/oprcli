/**
 * Claude Connector Web Server
 *
 * 简单的 Web 界面用于测试 Claude Code 对话功能
 *
 * 运行方式：
 * node web-server.js
 * 然后访问：http://localhost:3000
 */

const express = require('express');
const path = require('path');
const ClaudeConnector = require('./claude-connector');

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
    currentSessionId
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
    const isResume = !!sessionId;  // 使用客户端传来的 sessionId

    // 使用 Promise 等待会话完成
    return new Promise((resolve, reject) => {
      try {
        let result;

        if (isResume) {
          // 继续会话
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
                sessionId: sessionId,  // 返回客户端传来的 sessionId
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
          // 开启新会话
          result = connector.startSession(message, {
            systemPrompt,
            onEvent: (event) => {
              events.push(event);
              console.log('[Web Server] Event:', event.type, event);

              // 捕获真实的 sessionId（修复：session_id 在 event 上，不是 extra 里）
              if (event.type === 'system' && event.session_id) {
                currentSessionId = event.session_id;
                console.log('[Web Server] Captured session ID:', currentSessionId);
              }
            },
            onComplete: (exitCode) => {
              console.log('[Web Server] Process completed, exit code:', exitCode);
              resolve({
                success: true,
                sessionId: currentSessionId,  // 返回新会话的 sessionId
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

// 启动服务器
app.listen(PORT, () => {
  console.log('\n========================================');
  console.log('  Claude Connector Web Server');
  console.log('========================================');
  console.log(`\n服务器运行在: http://localhost:${PORT}`);
  console.log('按 Ctrl+C 停止服务器\n');
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...');
  if (connector) {
    const sessions = connector.getActiveSessions();
    sessions.forEach(sid => connector.interruptSession(sid));
  }
  process.exit(0);
});
