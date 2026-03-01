/**
 * 钉钉 Stream 模式服务 - 无需公网 IP
 * 
 * 使用官方 dingtalk-stream-sdk-nodejs
 * 支持机器人接收消息、事件订阅
 */

require('dotenv').config();

const { DWClient, TOPIC_ROBOT } = require('dingtalk-stream');
const https = require('https');
const ClaudeConnector = require('./claude-connector');
const { SessionStore } = require('./session-store');

// 配置
const CONFIG = {
  // 钉钉配置（从 .env 读取）
  dingtalk: {
    clientId: process.env.DINGTALK_CLIENT_ID || '',
    clientSecret: process.env.DINGTALK_CLIENT_SECRET || '',
    agentId: process.env.DINGTALK_AGENT_ID || '',
  },
  
  // Claude 配置
  claude: {
    path: 'claude',
    workingDir: process.cwd(),
  },
  
  // 会话存储路径
  sessionFile: './data/dingtalk-sessions.json',
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
    const reqUrl = `https://oapi.dingtalk.com/gettoken?appkey=${CONFIG.dingtalk.clientId}&appsecret=${CONFIG.dingtalk.clientSecret}`;
    
    https.get(reqUrl, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.errcode === 0) {
            accessTokenCache.token = result.access_token;
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
 * 发送钉钉消息（单聊）
 */
async function sendDingTalkMessage(userId, message) {
  try {
    const token = await getAccessToken();
    const chunks = splitMessage(message, 2000);
    
    for (const chunk of chunks) {
      await sendSingleMessage(token, userId, chunk);
      await sleep(100);
    }
  } catch (err) {
    console.error('[钉钉] 发送消息失败:', err.message);
  }
}

/**
 * 发送群聊消息
 */
async function sendGroupMessage(chatId, message, atUserIds = []) {
  try {
    const token = await getAccessToken();
    const chunks = splitMessage(message, 2000);
    
    for (const chunk of chunks) {
      await sendGroupSingleMessage(token, chatId, chunk, atUserIds);
      await sleep(100);
    }
  } catch (err) {
    console.error('[钉钉] 发送群消息失败:', err.message);
  }
}

/**
 * 通过 sessionWebhook 发送消息（最简单的方式）
 */
async function sendBySessionWebhook(webhookUrl, message) {
  return new Promise((resolve, reject) => {
    const url = new URL(webhookUrl);
    const chunks = splitMessage(message, 2000);

    // 只发送第一段，后续分段需要额外处理
    const postData = JSON.stringify({
      msgtype: 'text',
      text: {
        content: chunks[0]
      }
    });

    console.log(`[Webhook] URL: ${url.hostname}${url.pathname}`);
    console.log(`[Webhook] 发送内容长度: ${chunks[0].length} 字符`);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
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
          console.log('[Webhook] 响应状态:', res.statusCode);
          console.log('[Webhook] 响应内容:', JSON.stringify(result));

          if (result.errcode === 0 || result.errmsg === 'ok') {
            console.log('[Webhook] ✅ 发送成功');
          } else {
            console.error('[Webhook] ❌ 发送失败:', result);
          }

          resolve(result);
        } catch (err) {
          console.error('[Webhook] ❌ 解析响应失败:', err.message);
          console.error('[Webhook] 原始响应:', data);
          reject(err);
        }
      });
    });

    req.on('error', (err) => {
      console.error('[Webhook] ❌ 请求错误:', err.message);
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * 发送单条单聊消息
 */
function sendSingleMessage(token, userId, content) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      agent_id: CONFIG.dingtalk.agentId,
      userid_list: userId,
      msg: {
        msgtype: 'text',
        text: { content }
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
          result.errcode === 0 ? resolve(result) : reject(new Error(result.errmsg));
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
 * 发送单条群聊消息
 */
function sendGroupSingleMessage(token, chatId, content, atUserIds = []) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      msgtype: 'text',
      text: {
        content,
        atUserIds: atUserIds.length > 0 ? atUserIds : undefined
      }
    });

    const options = {
      hostname: 'api.dingtalk.com',
      path: `/v1.0/robot/oToMessages/batchSend?access_token=${token}`,
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
          resolve(result);
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
async function processMessage(conversationId, content, senderId, isGroup = false) {
  console.log(`[消息] conversationId=${conversationId}, sender=${senderId}, isGroup=${isGroup}`);
  console.log(`[内容] ${content}`);
  
  const existingSessionId = sessionStore.get(conversationId);
  let response = '';
  
  try {
    const status = await connector.connect();
    console.log('[Claude] 连接状态:', status);
    
    const events = [];

    // 使用 Promise 等待进程完成
    const waitForComplete = new Promise((resolve) => {
      const options = {
        onEvent: (event) => {
          events.push(event);
          // 详细日志：前3个事件打印完整内容，之后只打印类型
          if (events.length <= 3) {
            console.log('[Claude 事件]', JSON.stringify(event, null, 2));
          } else {
            console.log('[Claude 事件]', event.type || event);
          }
        },
        onError: (error) => {
          console.error('[Claude] 错误:', error);
        },
        onComplete: (code) => {
          console.log('[Claude] 进程结束, exit code:', code);
          resolve();
        }
      };
      
      if (existingSessionId) {
        connector.continueSession(existingSessionId, content, options);
      } else {
        connector.startSession(content, options);
      }
    });
    
    // 等待 Claude 完成响应
    await waitForComplete;
    
    response = extractResponse(events);
    console.log('[响应] 长度:', response.length, '字符');
    
    const newSessionId = extractSessionId(events);
    if (newSessionId && newSessionId !== existingSessionId) {
      sessionStore.set(conversationId, newSessionId);
      console.log(`[会话] 保存: ${conversationId} -> ${newSessionId}`);
    }
    
  } catch (err) {
    console.error('[处理] 错误:', err);
    response = `处理失败: ${err.message}`;
  }
  
  return response;
}

/**
 * 从事件中提取响应文本（改进版）
 */
function extractResponse(events) {
  console.log(`[提取] 开始分析 ${events.length} 个事件`);

  const result = [];
  let hasAssistantContent = false;

  // 方法1：从 assistant 事件提取（完整响应）
  for (const event of events) {
    if (event.type === 'assistant') {
      console.log('[提取] 找到 assistant 事件');

      // 尝试多种可能的结构
      if (event.message?.content && Array.isArray(event.message.content)) {
        hasAssistantContent = true;
        for (const block of event.message.content) {
          if (block.type === 'text' && block.text) {
            result.push(block.text);
          }
        }
        console.log(`[提取] 从 message.content 提取到 ${result.join('').length} 字符`);
      }

      // 可能的其他结构
      if (result.length === 0 && event.content) {
        if (typeof event.content === 'string') {
          hasAssistantContent = true;
          result.push(event.content);
          console.log(`[提取] 从 event.content 提取到 ${event.content.length} 字符`);
        } else if (Array.isArray(event.content)) {
          hasAssistantContent = true;
          for (const block of event.content) {
            if (typeof block === 'string') result.push(block);
            if (block?.text) result.push(block.text);
          }
          console.log(`[提取] 从 event.content[] 提取到 ${result.join('').length} 字符`);
        }
      }

      // 检查直接文本字段
      if (result.length === 0 && event.text) {
        hasAssistantContent = true;
        result.push(event.text);
        console.log(`[提取] 从 event.text 提取到 ${event.text.length} 字符`);
      }
    }
  }

  // 如果已经从 assistant 事件提取了内容
  if (hasAssistantContent) {
    const final = result.join('').trim();
    console.log(`[提取] Assistant 模式提取完成，总长度: ${final.length}`);
    return final || '（无响应）';
  }

  // 方法2：从流式事件提取（content_block_delta）
  console.log('[提取] 尝试从流式事件提取');
  for (const event of events) {
    if (event.type === 'content_block_delta' && event.delta?.text) {
      result.push(event.delta.text);
    }
    if (event.type === 'result' && typeof event.result === 'string') {
      result.push(event.result);
    }
    if (typeof event.content === 'string') result.push(event.content);
    if (typeof event.text === 'string') result.push(event.text);
  }

  const final = result.join('').trim();
  console.log(`[提取] 流式模式提取完成，总长度: ${final.length}`);

  if (!final) {
    console.warn('[提取] 警告：未能提取到任何响应内容');
    console.warn('[提取] 事件类型列表:', events.map(e => e.type));
  }

  return final || '（无响应）';
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
 * sleep 工具
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 消息去重缓存（防止钉钉重试导致重复处理）
const processedMsgIds = new Set();
const MAX_CACHE_SIZE = 1000;

// ============ Stream 客户端 ============

async function startStreamClient() {
  // 检查配置
  if (!CONFIG.dingtalk.clientId || !CONFIG.dingtalk.clientSecret) {
    console.error('错误: 请设置环境变量 DINGTALK_CLIENT_ID 和 DINGTALK_CLIENT_SECRET');
    console.error('或者 DINGTALK_APP_KEY 和 DINGTALK_APP_SECRET');
    process.exit(1);
  }

  console.log('========================================');
  console.log('  钉钉 Claude Bot (Stream 模式)');
  console.log('========================================');
  console.log(`  Client ID: ${CONFIG.dingtalk.clientId.substring(0, 8)}...`);
  console.log(`  Agent ID: ${CONFIG.dingtalk.agentId || '未设置'}`);
  console.log(`  会话数: ${sessionStore.size}`);
  console.log('========================================');
  console.log('');

  // 创建 Stream 客户端
  const client = new DWClient({
    clientId: CONFIG.dingtalk.clientId,
    clientSecret: CONFIG.dingtalk.clientSecret,
    debug: false,
  });

  // 注册机器人消息回调
  client.registerCallbackListener(TOPIC_ROBOT, async (res) => {
    try {
      console.log('[Stream] 收到机器人消息:', JSON.stringify(res, null, 2));
      
      // 解析消息 - data 是 JSON 字符串，需要先 parse
      let message = res.data || res;
      if (typeof message === 'string') {
        message = JSON.parse(message);
      }
      
      // 消息去重检查
      const msgId = message.msgId || res.headers?.messageId;
      if (msgId && processedMsgIds.has(msgId)) {
        console.log(`[去重] 消息已处理过，忽略: ${msgId}`);
        return;
      }
      if (msgId) {
        processedMsgIds.add(msgId);
        // 限制缓存大小
        if (processedMsgIds.size > MAX_CACHE_SIZE) {
          const first = processedMsgIds.values().next().value;
          processedMsgIds.delete(first);
        }
      }
      
      const senderId = message.senderId || message.senderStaffId || message.senderId;
      const conversationId = message.conversationId || senderId;
      const content = message.text?.content || message.content?.text || message.content || '';
      const chatId = message.chatId || message.openThreadId;
      const isGroup = message.conversationType === '2';
      const atUserIds = message.atUserIds || [];
      
      console.log(`[解析] senderId=${senderId}, conversationId=${conversationId}, content=${content}`);
      
      if (!content) {
        console.log('[Stream] 空消息，忽略');
        return;
      }
      
      // 处理消息
      const reply = await processMessage(conversationId, content, senderId, isGroup);

      console.log(`[发送] 准备发送回复，长度: ${reply.length} 字符`);
      console.log(`[发送] 前100字符预览: ${reply.substring(0, 100)}...`);

      // 发送回复 - 使用 sessionWebhook 更简单
      if (message.sessionWebhook) {
        console.log('[发送] 使用 sessionWebhook 方式');
        await sendBySessionWebhook(message.sessionWebhook, reply);
      } else if (isGroup && chatId) {
        console.log(`[发送] 使用群聊方式，chatId: ${chatId}`);
        await sendGroupMessage(chatId, reply, atUserIds);
      } else {
        console.log(`[发送] 使用单聊方式，senderId: ${senderId}`);
        await sendDingTalkMessage(senderId, reply);
      }

      console.log('[发送] 消息发送完成');
      
    } catch (err) {
      console.error('[Stream] 处理消息错误:', err);
    }
  });

  // 启动客户端
  try {
    await client.connect();
    console.log('[Stream] 已连接，等待消息...');
    console.log('');
  } catch (err) {
    console.error('[Stream] 连接失败:', err);
    process.exit(1);
  }
}

// 启动
startStreamClient();

// 导出模块
module.exports = { 
  processMessage, 
  sendDingTalkMessage,
  sendGroupMessage,
  SessionStore 
};
