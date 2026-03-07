/**
 * QQ 机器人客户端 - 自定义实现
 *
 * 基于 QQ 机器人官方 API 开发
 * 参考: https://bot.q.qq.com/wiki/
 *
 * 不依赖 qq-bot-sdk，完全自主实现
 */

const EventEmitter = require('events');
const WebSocket = require('ws');
const https = require('https');

/**
 * Intents 常量定义
 */
const Intents = {
  GUILDS: 1 << 0,
  GUILD_MEMBERS: 1 << 1,
  GUILD_MESSAGES: 1 << 9,
  GUILD_MESSAGE_REACTIONS: 1 << 10,
  DIRECT_MESSAGE: 1 << 12,
  FORUMS_EVENT: 1 << 18,
  AUDIO_ACTION: 1 << 29,
  AT_MESSAGES: 1 << 25,
  INTERACTION: 1 << 26,
  MESSAGE_AUDIT: 1 << 27,
  PUBLIC_GUILD_MESSAGES: 1 << 30,

  DEFAULTS: (
    (1 << 0) | // GUILDS
    (1 << 1) | // GUILD_MEMBERS
    (1 << 9) | // GUILD_MESSAGES
    (1 << 10) | // GUILD_MESSAGE_REACTIONS
    (1 << 12) | // DIRECT_MESSAGE
    (1 << 25) | // AT_MESSAGES
    (1 << 26) | // INTERACTION
    (1 << 27) | // MESSAGE_AUDIT
    (1 << 29) | // AUDIO_ACTION
    (1 << 30)   // PUBLIC_GUILD_MESSAGES
  ),
};

class QQBotClient extends EventEmitter {
  constructor(options = {}) {
    super();

    this.appId = options.appId;
    this.clientSecret = options.clientSecret;
    this.sandbox = options.sandbox || false;
    this.intents = options.intents;

    // API 基础地址
    this.apiBase = this.sandbox
      ? 'https://sandbox.api.sgroup.qq.com'
      : 'https://api.sgroup.qq.com';

    // Token 管理
    this.accessToken = null;
    this.tokenExpireTime = null;

    // WebSocket
    this.ws = null;
    this.isReady = false;
    this.heartbeatInterval = null;
    this.heartbeatTime = 30000;

    // 会话记录
    this.sessionID = null;
    this.seq = 0;

    // 调试模式
    this.debug = options.debug || false;

    // 自动重连
    this.autoReconnect = options.autoReconnect !== false;
    this.reconnectTimer = null;

    // 最大重试次数
    this.maxRetry = options.maxRetry || 3;
  }

  /**
   * 连接到 QQ 服务器
   */
  async connect() {
    try {
      this.debugLog('🔐 正在获取 Access Token...');

      // 1. 获取 Access Token
      await this.getAccessToken();

      this.debugLog('✅ Access Token 获取成功');

      this.debugLog('🔌 正在获取 WebSocket 地址...');

      // 2. 获取 WebSocket 地址
      const wsInfo = await this.getWebSocketInfo();

      this.debugLog(`✅ 获取到 WebSocket 地址: ${wsInfo.url}`);

      // 3. 连接 WebSocket
      await this.connectWebSocket(wsInfo.url);

      return this;

    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * 获取 Access Token
   */
  async getAccessToken() {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        appId: this.appId,
        clientSecret: this.clientSecret
      });

      const options = {
        hostname: 'bots.qq.com',
        port: 443,
        path: '/app/getAppAccessToken',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const result = JSON.parse(data);

            if (res.statusCode !== 200) {
              reject(new Error(`获取 Access Token 失败 (${res.statusCode}): ${JSON.stringify(result)}`));
              return;
            }

            if (result.access_token) {
              this.accessToken = result.access_token;
              this.tokenExpireTime = Date.now() + (parseInt(result.expires_in) * 1000);
              resolve();
            } else {
              reject(new Error(`响应中没有 access_token: ${JSON.stringify(result)}`));
            }
          } catch (error) {
            reject(new Error(`解析响应失败: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`请求失败: ${error.message}`));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * 获取 WebSocket 连接信息
   */
  async getWebSocketInfo() {
    return new Promise((resolve, reject) => {
      const url = new URL('/gateway/bot', this.apiBase);

      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'GET',
        headers: {
          'Authorization': `QQBot ${this.accessToken}`,
          'User-Agent': 'BotNodeSDK/v2.0.0',
          'Accept': '*/*'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const result = JSON.parse(data);

            if (res.statusCode !== 200) {
              reject(new Error(`获取 WebSocket 地址失败 (${res.statusCode}): ${JSON.stringify(result)}`));
              return;
            }

            resolve(result);
          } catch (error) {
            reject(new Error(`解析响应失败: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`请求失败: ${error.message}`));
      });

      req.end();
    });
  }

  /**
   * 连接 WebSocket
   */
  async connectWebSocket(wsUrl) {
    return new Promise((resolve, reject) => {
      this.debugLog('🔌 正在连接 WebSocket...');

      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        this.debugLog('✅ WebSocket 连接已建立');
        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (error) => {
        this.debugLog('❌ WebSocket 错误:', error.message);
        this.emit('error', error);
        reject(error);
      });

      this.ws.on('close', (code, reason) => {
        this.debugLog(`⚠️ WebSocket 连接已关闭 (code: ${code})`);
        this.isReady = false;
        this.stopHeartbeat();
        this.emit('disconnected', { code, reason: reason.toString() });

        if (this.autoReconnect && code !== 1000) {
          this.scheduleReconnect();
        }
      });
    });
  }

  /**
   * 处理收到的消息
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data);

      if (message.s !== undefined) {
        this.seq = message.s;
      }

      this.debugLog(`📩 收到: op=${message.op}, t=${message.t || 'N/A'}`);

      switch (message.op) {
        case 0: // DISPATCH
          this.handleEvent(message);
          break;

        case 1: // HEARTBEAT
          this.debugLog('💓 心跳');
          break;

        case 10: // HELLO
          this.debugLog('📩 收到 HELLO 消息');
          if (message.d && message.d.heartbeat_interval) {
            this.heartbeatTime = message.d.heartbeat_interval;
          }
          this.authenticate();
          break;

        case 11: // HEARTBEAT_ACK
          this.debugLog('💓 心跳确认');
          break;

        default:
          this.debugLog(`📩 操作码: ${message.op}`);
      }

    } catch (error) {
      this.debugLog('❌ 处理消息失败:', error.message);
      this.emit('error', error);
    }
  }

  /**
   * 鉴权
   */
  authenticate() {
    this.debugLog('🔐 正在鉴权...');

    const intents = this.intents || Intents.DEFAULTS;

    const payload = {
      op: 2,
      d: {
        token: `QQBot ${this.accessToken}`,
        intents: intents,
        shard: [0, 1],
        properties: {
          $os: 'linux',
          $browser: 'chrome',
          $device: 'pc'
        }
      }
    };

    this.debugLog('📤 发送鉴权消息');

    this.ws.send(JSON.stringify(payload));
  }

  /**
   * 处理事件
   */
  handleEvent(message) {
    const eventType = message.t;
    const eventData = message.d;

    this.debugLog(`📩 [EVENT] ${eventType}`);

    if (!eventType) {
      return;
    }

    switch (eventType) {
      case 'READY':
        this.sessionID = eventData.session_id;
        this.isReady = true;
        this.emit('ready', eventData);
        this.startHeartbeat();
        break;

      case 'MESSAGE_CREATE':
        this.emit('message', eventData);
        break;

      case 'AT_MESSAGE_CREATE':
        this.emit('at_message', eventData);
        break;

      case 'DIRECT_MESSAGE_CREATE':
        this.emit('direct_message', eventData);
        break;

      case 'C2C_MESSAGE_CREATE':
        this.emit('c2c_message', eventData);
        break;

      case 'GROUP_AT_MESSAGE_CREATE':
        this.emit('group_at_message', eventData);
        break;

      case 'GUILD_CREATE':
        this.emit('guild_create', eventData);
        break;

      case 'GUILD_MEMBER_ADD':
        this.emit('guild_member_add', eventData);
        break;

      case 'INTERACTION_CREATE':
        this.emit('interaction', eventData);
        break;

      default:
        this.emit(eventType.toLowerCase(), eventData);
    }
  }

  /**
   * 开始心跳
   */
  startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatTime);
  }

  /**
   * 停止心跳
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * 发送心跳
   */
  sendHeartbeat() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const payload = {
        op: 1,
        d: this.seq
      };
      this.ws.send(JSON.stringify(payload));
    }
  }

  /**
   * 计划重连
   */
  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.emit('reconnecting');

    this.reconnectTimer = setTimeout(async () => {
      try {
        this.debugLog('🔄 尝试重新连接...');
        await this.connect();
      } catch (error) {
        this.debugLog('❌ 重连失败:', error.message);
        if (this.autoReconnect) {
          this.scheduleReconnect();
        }
      }
    }, 5000);
  }

  /**
   * 发送消息到频道
   */
  async sendMessage(channelId, content, options = {}) {
    return this.sendWithRetry(() => this._sendMessage(channelId, content, options));
  }

  /**
   * 内部发送消息实现
   */
  async _sendMessage(channelId, content, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(`/channels/${channelId}/messages`, this.apiBase);

      const postData = {
        content: content
      };

      if (options.msgId) {
        postData.msg_id = options.msgId;
      }
      if (options.image) {
        postData.image = options.image;
      }
      if (options.messageReference) {
        postData.message_reference = options.messageReference;
      }
      if (options.eventId) {
        postData.event_id = options.eventId;
      }

      const postDataStr = JSON.stringify(postData);

      const reqOptions = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Authorization': `QQBot ${this.accessToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postDataStr)
        }
      };

      this.debugLog(`📤 发送消息到频道 ${channelId}`);

      const req = https.request(reqOptions, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const result = JSON.parse(data);

            if (res.statusCode === 200 || res.statusCode === 201) {
              this.debugLog(`✅ 消息发送成功`);
              resolve(result);
            } else {
              this.debugLog(`⚠️ 发送失败 (${res.statusCode}): ${JSON.stringify(result)}`);
              reject(new Error(`发送消息失败 (${res.statusCode}): ${result.message || '未知错误'}`));
            }
          } catch (error) {
            this.debugLog(`❌ 解析响应失败: ${error.message}`);
            reject(new Error(`解析响应失败: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        this.debugLog(`❌ 发送消息请求失败: ${error.message}`);
        reject(error);
      });

      req.write(postDataStr);
      req.end();
    });
  }

  /**
   * 发送私信
   */
  async sendDirectMessage(guildId, content, options = {}) {
    return this.sendWithRetry(() => this._sendDirectMessage(guildId, content, options));
  }

  /**
   * 内部发送私信实现
   */
  async _sendDirectMessage(guildId, content, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(`/dms/${guildId}/messages`, this.apiBase);

      const postData = {
        content: content
      };

      if (options.msgId) {
        postData.msg_id = options.msgId;
      }
      if (options.image) {
        postData.image = options.image;
      }
      if (options.messageReference) {
        postData.message_reference = options.messageReference;
      }
      if (options.eventId) {
        postData.event_id = options.eventId;
      }

      const postDataStr = JSON.stringify(postData);

      const reqOptions = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Authorization': `QQBot ${this.accessToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postDataStr)
        }
      };

      this.debugLog(`📤 发送私信到频道 ${guildId}`);

      const req = https.request(reqOptions, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const result = JSON.parse(data);

            if (res.statusCode === 200 || res.statusCode === 201) {
              this.debugLog(`✅ 私信发送成功`);
              resolve(result);
            } else {
              this.debugLog(`⚠️ 发送失败 (${res.statusCode}): ${JSON.stringify(result)}`);
              reject(new Error(`发送私信失败 (${res.statusCode}): ${result.message || '未知错误'}`));
            }
          } catch (error) {
            this.debugLog(`❌ 解析响应失败: ${error.message}`);
            reject(new Error(`解析响应失败: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        this.debugLog(`❌ 发送私信请求失败: ${error.message}`);
        reject(error);
      });

      req.write(postDataStr);
      req.end();
    });
  }

  /**
   * 发送 C2C 私信（新版 QQ 机器人）
   */
  async sendC2CMessage(openId, content, options = {}) {
    return this.sendWithRetry(() => this._sendC2CMessage(openId, content, options));
  }

  /**
   * 内部发送 C2C 私信实现
   */
  async _sendC2CMessage(openId, content, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(`/v2/users/${openId}/messages`, this.apiBase);

      const postData = {
        content: content
      };

      if (options.msgId) {
        postData.msg_id = options.msgId;
      }
      if (options.image) {
        postData.image = options.image;
      }
      if (options.messageReference) {
        postData.message_reference = options.messageReference;
      }
      if (options.eventId) {
        postData.event_id = options.eventId;
      }

      const postDataStr = JSON.stringify(postData);

      const reqOptions = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Authorization': `QQBot ${this.accessToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postDataStr)
        }
      };

      this.debugLog(`📤 发送 C2C 私信到 ${openId}`);

      const req = https.request(reqOptions, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const result = JSON.parse(data);

            if (res.statusCode === 200 || res.statusCode === 201) {
              this.debugLog(`✅ C2C 私信发送成功`);
              resolve(result);
            } else {
              this.debugLog(`⚠️ 发送失败 (${res.statusCode}): ${JSON.stringify(result)}`);
              reject(new Error(`发送 C2C 私信失败 (${res.statusCode}): ${result.message || '未知错误'}`));
            }
          } catch (error) {
            this.debugLog(`❌ 解析响应失败: ${error.message}`);
            reject(new Error(`解析响应失败: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        this.debugLog(`❌ 发送 C2C 私信请求失败: ${error.message}`);
        reject(error);
      });

      req.write(postDataStr);
      req.end();
    });
  }

  /**
   * 带重试的发送（使用指数退避，参考钉钉）
   */
  async sendWithRetry(sendFn, retries = this.maxRetry) {
    for (let i = 0; i < retries; i++) {
      try {
        return await sendFn();
      } catch (error) {
        if (i === retries - 1) {
          throw error;
        }
        // 指数退避：1s, 2s, 4s（最大5s）
        const waitTime = Math.min(1000 * Math.pow(2, i), 5000);
        this.debugLog(`⚠️ 发送失败，${waitTime}ms 后重试 (${i + 1}/${retries})...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  /**
   * 断开连接
   */
  async disconnect() {
    this.autoReconnect = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close(1000, 'Normal closure');
      this.ws = null;
    }

    this.isReady = false;
  }

  /**
   * 调试日志
   */
  debugLog(message) {
    if (this.debug) {
      console.log(`[QQBot] ${message}`);
    }
  }
}

module.exports = QQBotClient;
