/**
 * 钉钉 Webhook 服务 - 快速原型
 * 
 * 功能：
 * 1. 接收钉钉消息回调
 * 2. 调用 Claude Connector 处理
 * 3. 回复钉钉消息
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const url = require('url');
const ClaudeConnector = require('./claude-connector');
const { SessionStore } = require('./session-store');

// 配置
const CONFIG = {
  port: process.env.PORT || 3001,
  host: process.env.HOST || '0.0.0.0',
  
  // 钉钉配置（从环境变量读取）
  dingtalk: {
    appKey: process.env.DINGTALK_APP_KEY || '',
    appSecret: process.env.DINGTALK_APP_SECRET || '',
    agentId: process.env.DINGTALK_AGENT_ID || '',
  },
  
  // Claude 配置
  claude: {
    path: process.env.CLAUDE_PATH || 'claude',
    workingDir: process.env.WORKING_DIR || process.cwd(),
  },
  
  // 会话存储路径
  sessionFile: process.env.SESSION_FILE || './data/dingtalk-sessions.json',
};

// 初始化
const connector = new ClaudeConnector({
  claudePath: CONFIG.claude.path,
  workingDir: CONFIG.claude.workingDir,
});
const sessionStore = new SessionStore(CONFIG.sessionFile);

// 钉钉 access token 缓存
let accessTokenCache = {
  token: null,
  expiresAt: 0,
};

/**
 * 获取钉钉 access token
 */
async function getAccessToken() {
  if (accessTokenCache.token && Date.now() < accessTokenCache.expiresAt) {
    return accessTokenCache.token;
  }

  return new Promise((resolve, reject) => {
    const reqUrl = `https://oapi.dingtalk.com/gettoken?appkey=${CONFIG.dingtalk.appKey}&appsecret=${CONFIG.dingtalk.appSecret}`;
    
    https.get(reqUrl, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.errcode === 0) {
            accessTokenCache.token = result.access_token;
            // 提前5分钟过期
            accessTokenCache.expiresAt = Date.now() + (result.expires_in - 300) * 1000;
            resolve(result.access_token);
          } else {
            reject(new Error(`获取token失败: ${result.errmsg}`));
          }
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

/**
 * 发送钉钉消息
 * @param {string} conversationId - 会话ID
 * @param {string} message - 消息内容
 */
async function sendDingTalkMessage(conversationId, message) {
  try {
    const token = await getAccessToken();
    
    // 消息分片（钉钉限制2048字节）
    const chunks = splitMessage(message, 2000);
    
    for (const chunk of chunks) {
      await sendSingleMessage(token, conversationId, chunk);
      // 避免频率限制
      await sleep(100);
    }
  } catch (err) {
    console.error('[钉钉] 发送消息失败:', err.message);
  }
}

/**
 * 发送单条消息
 */
function sendSingleMessage(token, conversationId, content) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      agent_id: CONFIG.dingtalk.agentId,
      userid_list: conversationId, // 单聊用userid，群聊用chatid
      msg: {
        msgtype: 'text',
        text: {
          content: content
        }
      }
    });

    const options = {
      hostname: 'oapi.dingtalk.com',
      path: `/topapi/message/corpconversation/asyncsend_v2?access_token=${token}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.errcode === 0) {
            resolve(result);
          } else {
            reject(new Error(result.errmsg));
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * 消息分片
 */
function splitMessage(message, maxSize) {
  if (Buffer.byteLength(message, 'utf-8') <= maxSize) {
    return [message];
  }

  const chunks = [];
  let current = '';
  
  for (const char of message) {
    if (Buffer.byteLength(current + char, 'utf-8') > maxSize) {
      chunks.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  
  if (current) chunks.push(current);
  return chunks;
}

/**
 * 处理钉钉消息
 */
async function processMessage(conversationId, content, senderId) {
  console.log(`[钉钉] 收到消息: conversationId=${conversationId}, sender=${senderId}, content=${content}`);
  
  // 获取已有会话
  const existingSessionId = sessionStore.get(conversationId);
  
  let response = '';
  
  try {
    // 连接 Claude（如果未连接）
    const status = await connector.connect();
    console.log('[Claude] 连接状态:', status);
    
    // 收集响应
    const events = [];
    
    const options = {
      onEvent: (event) => {
        events.push(event);
      },
      onError: (error) => {
        console.error('[Claude] 错误:', error);
      }
    };
    
    if (existingSessionId) {
      // 继续会话
      await connector.continueSession(existingSessionId, content, options);
    } else {
      // 新会话
      await connector.startSession(content, options);
    }
    
    // 提取响应文本
    response = extractResponse(events);
    
    // 保存会话 ID
    const newSessionId = extractSessionId(events);
    if (newSessionId && newSessionId !== existingSessionId) {
      sessionStore.set(conversationId, newSessionId);
      console.log(`[会话] 保存映射: ${conversationId} -> ${newSessionId}`);
    }
    
  } catch (err) {
    console.error('[处理] 错误:', err);
    response = `处理失败: ${err.message}`;
  }
  
  return response;
}

/**
 * 从事件中提取响应文本
 */
function extractResponse(events) {
  const result = [];
  
  for (const event of events) {
    if (event.type === 'assistant' || event.type === 'content_block_delta') {
      if (event.message?.content) {
        result.push(event.message.content);
      }
      if (event.delta?.text) {
        result.push(event.delta.text);
      }
    }
    // 兼容其他格式
    if (event.content) {
      result.push(event.content);
    }
    if (event.text) {
      result.push(event.text);
    }
  }
  
  return result.join('').trim() || '（无响应）';
}

/**
 * 从事件中提取会话 ID
 */
function extractSessionId(events) {
  for (const event of events) {
    if (event.session_id) return event.session_id;
    if (event.sessionId) return event.sessionId;
    if (event.data?.session_id) return event.data.session_id;
  }
  return null;
}

/**
 * 解析钉钉回调消息
 */
function parseDingTalkMessage(body) {
  // 钉钉消息格式
  return {
    conversationId: body.conversationId || body.chatid || body.senderId,
    senderId: body.senderId || body.userid,
    content: body.content || body.text?.content || '',
    msgType: body.msgtype || 'text',
  };
}

/**
 * 解析表单数据
 */
function parseFormData(body) {
  const data = {};
  const pairs = body.split('&');
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key) {
      data[decodeURIComponent(key)] = decodeURIComponent(value || '');
    }
  }
  return data;
}

/**
 * 验证钉钉签名
 */
function verifySignature(timestamp, appSecret, sign) {
  const token = appSecret;
  const stringToSign = timestamp + '\n' + token;
  const hmac = crypto.createHmac('sha256', appSecret);
  hmac.update(stringToSign);
  const expectedSign = hmac.digest('base64');
  return sign === expectedSign;
}

/**
 * sleep 工具
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ HTTP 服务器 ============

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // 健康检查
  if (parsedUrl.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      sessions: sessionStore.size,
      timestamp: new Date().toISOString()
    }));
    return;
  }
  
  // 钉钉消息回调
  if (parsedUrl.pathname === '/dingtalk/callback' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        // 尝试解析 JSON
        let data;
        try {
          data = JSON.parse(body);
        } catch {
          // 可能是表单格式
          data = parseFormData(body);
        }
        
        console.log('[回调] 收到数据:', JSON.stringify(data, null, 2));
        
        // 1. 先快速响应（钉钉5秒超时）
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        
        // 2. 异步处理消息
        const { conversationId, senderId, content } = parseDingTalkMessage(data);
        
        if (content) {
          setImmediate(async () => {
            try {
              const reply = await processMessage(conversationId, content, senderId);
              await sendDingTalkMessage(conversationId, reply);
            } catch (err) {
              console.error('[异步处理] 未捕获错误:', err);
            }
          });
        }
        
      } catch (err) {
        console.error('[回调] 处理错误:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  
  // 查看会话列表（调试用）
  if (parsedUrl.pathname === '/sessions') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(sessionStore.getAll(), null, 2));
    return;
  }
  
  // 清空会话（调试用）
  if (parsedUrl.pathname === '/sessions/clear' && req.method === 'POST') {
    sessionStore.clear();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: '会话已清空' }));
    return;
  }
  
  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

// 启动服务器
server.listen(CONFIG.port, CONFIG.host, () => {
  console.log('========================================');
  console.log('  钉钉 Claude Bot 服务已启动');
  console.log('========================================');
  console.log(`  端口: ${CONFIG.port}`);
  console.log(`  回调地址: http://your-domain:${CONFIG.port}/dingtalk/callback`);
  console.log(`  健康检查: http://localhost:${CONFIG.port}/health`);
  console.log(`  会话列表: http://localhost:${CONFIG.port}/sessions`);
  console.log('========================================');
  console.log('');
  console.log('请配置钉钉机器人消息接收地址');
  console.log('');
});

// 导出模块
module.exports = { 
  processMessage, 
  sendDingTalkMessage,
  SessionStore 
};
