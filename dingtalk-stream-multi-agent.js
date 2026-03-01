/**
 * 钉钉 Stream 模式服务 - 多 Agent 版本
 *
 * 支持动态切换不同的 AI 后端（Claude Code、DeepSeek、OpenAI 等）
 * 支持工具调用
 */

require('dotenv').config();

const { DWClient, TOPIC_ROBOT } = require('dingtalk-stream');
const https = require('https');
const { createManager } = require('./agents');
const { SessionStore } = require('./session-store');

// 配置
const CONFIG = {
  dingtalk: {
    clientId: process.env.DINGTALK_CLIENT_ID || '',
    clientSecret: process.env.DINGTALK_CLIENT_SECRET || '',
    agentId: process.env.DINGTALK_AGENT_ID || '',
  },

  sessionFile: './data/dingtalk-sessions.json',
};

// 初始化
let agentManager = null;
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
 * 发送钉钉消息
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
 * 通过 sessionWebhook 发送消息
 */
async function sendBySessionWebhook(webhookUrl, message) {
  return new Promise((resolve, reject) => {
    const url = new URL(webhookUrl);
    const chunks = splitMessage(message, 2000);

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
 * 解析用户命令（支持切换 Agent）
 */
function parseCommand(content) {
  // 命令格式：/agent <id>
  const agentMatch = content.match(/^\/agent\s+(\w+)/);
  if (agentMatch) {
    return {
      type: 'switch_agent',
      agentId: agentMatch[1]
    };
  }

  // 命令格式：/agents
  if (content.trim() === '/agents') {
    return {
      type: 'list_agents'
    };
  }

  // 命令格式：/help
  if (content.trim() === '/help') {
    return {
      type: 'help'
    };
  }

  return null;
}

/**
 * 处理钉钉消息（多 Agent 版本）
 */
async function processMessage(conversationId, content, senderId, isGroup = false) {
  console.log(`[消息] conversationId=${conversationId}, sender=${senderId}, isGroup=${isGroup}`);
  console.log(`[内容] ${content}`);

  try {
    // 检查是否是命令
    const command = parseCommand(content);

    if (command) {
      return await handleCommand(command, conversationId);
    }

    // 普通聊天消息
    const sessionId = sessionStore.get(conversationId);
    const response = await agentManager.chat(content, {
      sessionId,
      tools: true  // 启用工具
    });

    // 保存会话 ID
    if (response.sessionId) {
      sessionStore.set(conversationId, response.sessionId);
    }

    return response.response;

  } catch (err) {
    console.error('[处理] 错误:', err);
    return `处理失败: ${err.message}`;
  }
}

/**
 * 处理命令
 */
async function handleCommand(command, conversationId) {
  const currentAgent = agentManager.getCurrentAgent();

  switch (command.type) {
    case 'list_agents':
      const agents = agentManager.listAgents();
      let text = '📋 可用的 Agent:\n\n';
      agents.forEach(agent => {
        const status = agent.connected ? '✅' : '❌';
        const current = agent.current ? ' [当前]' : '';
        text += `${status} **${agent.id}**: ${agent.name}${current}\n`;
      });
      text += `\n使用 "/agent <id>" 切换 Agent`;
      return text;

    case 'switch_agent':
      try {
        agentManager.switchAgent(command.agentId);
        const newAgent = agentManager.getCurrentAgent();
        return `✅ 已切换到 Agent: ${newAgent.name} (${command.agentId})`;
      } catch (error) {
        return `❌ 切换失败: ${error.message}\n\n使用 /agents 查看可用 Agent`;
      }

    case 'help':
      return `🤖 钉钉 AI 助手命令：

**/agents** - 列出所有可用的 Agent
**/agent <id>** - 切换到指定的 Agent
**/help** - 显示帮助信息

当前使用: ${currentAgent.name}

💬 直接发送消息即可开始对话`;

    default:
      return '未知命令';
  }
}

/**
 * sleep 工具
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 消息去重缓存
const processedMsgIds = new Set();
const MAX_CACHE_SIZE = 1000;

// 并发控制
const MAX_CONCURRENT_MESSAGES = 3; // 最多同时处理3条消息
let activeMessageCount = 0;
const messageQueue = [];

/**
 * 消息队列处理器
 */
async function processWithQueue(res) {
  // 如果还有空位，立即处理
  if (activeMessageCount < MAX_CONCURRENT_MESSAGES) {
    activeMessageCount++;
    const startTime = Date.now();
    console.log(`[队列] 开始处理消息，活跃: ${activeMessageCount}/${MAX_CONCURRENT_MESSAGES}`);

    try {
      await processMessageAsync(res);
      const elapsed = Date.now() - startTime;
      console.log(`[队列] 消息处理完成，耗时: ${elapsed}ms`);
    } finally {
      activeMessageCount--;

      // 处理队列中的下一条消息
      if (messageQueue.length > 0) {
        const next = messageQueue.shift();
        console.log(`[队列] 从队列中取下一条消息，剩余: ${messageQueue.length}`);
        processWithQueue(next);
      }
    }
  } else {
    // 队列已满，加入等待队列
    console.log(`[队列] ⚠️  消息排队，当前活跃: ${activeMessageCount}, 队列: ${messageQueue.length}`);
    messageQueue.push(res);
  }
}

// ============ Stream 客户端 ============

async function startStreamClient() {
  // 检查配置
  if (!CONFIG.dingtalk.clientId || !CONFIG.dingtalk.clientSecret) {
    console.error('错误: 请设置环境变量 DINGTALK_CLIENT_ID 和 DINGTALK_CLIENT_SECRET');
    process.exit(1);
  }

  console.log('========================================');
  console.log('  钉钉 Claude Bot (多 Agent 模式)');
  console.log('========================================');

  // 初始化 Agent Manager
  console.log('初始化 Agent 系统...');
  agentManager = await createManager();
  console.log('');

  // 显示可用的 Agent
  const agents = agentManager.listAgents();
  console.log(`  已加载 ${agents.length} 个 Agent:`);
  agents.forEach(agent => {
    const status = agent.connected ? '✅' : '❌';
    const current = agent.current ? ' [默认]' : '';
    console.log(`    ${status} ${agent.id}: ${agent.name}${current}`);
  });

  console.log('');
  console.log(`  Client ID: ${CONFIG.dingtalk.clientId.substring(0, 8)}...`);
  console.log(`  Agent ID: ${CONFIG.dingtalk.agentId || '未设置'}`);
  console.log(`  会话数: ${sessionStore.size}`);
  console.log('========================================');
  console.log('');

  // 创建 Stream 客户端
  const client = new DWClient({
    clientId: CONFIG.dingtalk.clientId,
    clientSecret: CONFIG.dingtalk.clientSecret,
    debug: true,  // ✅ 启用调试模式
  });

  console.log('[配置] SDK Debug 模式已启用');

  // 监听连接状态
  client.on('connected', () => {
    console.log('[Stream] ✅ 连接已建立');
  });

  client.on('disconnected', () => {
    console.error('[Stream] ❌ 连接已断开');
  });

  client.on('error', (err) => {
    console.error('[Stream] ❌ 发生错误:', err.message);
  });

  // 注册机器人消息回调
  client.registerCallbackListener(TOPIC_ROBOT, (res) => {
    // ✅ 使用队列处理，不阻塞且控制并发
    processWithQueue(res);
  });

  // 异步处理消息函数
  async function processMessageAsync(res) {
    try {
      console.log('[Stream] ⭐ 收到机器人消息');
      console.log('[Stream] 完整数据:', JSON.stringify(res, null, 2));

      // 解析消息
      let message = res.data || res;
      if (typeof message === 'string') {
        message = JSON.parse(message);
      }

      // 消息去重
      const msgId = message.msgId || res.headers?.messageId;
      if (msgId && processedMsgIds.has(msgId)) {
        console.log(`[去重] 消息已处理过，忽略: ${msgId}`);
        return;
      }
      if (msgId) {
        processedMsgIds.add(msgId);
        if (processedMsgIds.size > MAX_CACHE_SIZE) {
          const first = processedMsgIds.values().next().value;
          processedMsgIds.delete(first);
        }
      }

      const senderId = message.senderId || message.senderStaffId;
      const conversationId = message.conversationId || senderId;
      const content = message.text?.content || message.content?.text || message.content || '';

      console.log(`[解析] senderId=${senderId}, content=${content}`);

      if (!content) {
        console.log('[Stream] 空消息，忽略');
        return;
      }

      // ⚠️ 这个 await 现在不会阻塞新消息的接收
      const reply = await processMessage(conversationId, content, senderId);

      console.log(`[发送] 准备发送回复，长度: ${reply.length} 字符`);
      console.log(`[发送] 前100字符预览: ${reply.substring(0, 100)}...`);

      // 发送回复
      if (message.sessionWebhook) {
        console.log('[发送] 使用 sessionWebhook 方式');
        await sendBySessionWebhook(message.sessionWebhook, reply);
      } else {
        console.log(`[发送] 使用单聊方式，senderId: ${senderId}`);
        await sendDingTalkMessage(senderId, reply);
      }

      console.log('[发送] 消息发送完成');

    } catch (err) {
      console.error('[Stream] 处理消息错误:', err);
    }
  }

  // 启动客户端
  try {
    await client.connect();
    console.log('[Stream] ✅ 已连接到钉钉服务器');
    console.log('[Stream] 等待消息中...');
    console.log('');
    console.log('💬 发送 /help 查看命令列表');
    console.log('💬 发送任何消息测试连接');
    console.log('');
    console.log('========================================');
    console.log('🔍 调试模式已启用，所有消息将显示');
    console.log('========================================');
    console.log('');

    // 定期心跳检测（每30秒）
    setInterval(() => {
      console.log(`[心跳] ${new Date().toLocaleTimeString()} - 连接正常`);
    }, 30000);

  } catch (err) {
    console.error('[Stream] ❌ 连接失败:', err);
    console.error('');
    console.error('可能的原因：');
    console.error('1. Client ID 或 Client Secret 错误');
    console.error('2. 网络连接问题');
    console.error('3. 钉钉服务暂时不可用');
    process.exit(1);
  }
}

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n收到退出信号，正在清理...');

  if (agentManager) {
    agentManager.cleanup();
  }

  console.log('清理完成，退出');
  process.exit(0);
});

// 启动
startStreamClient();
