/**
 * QQ 机器人集成模块
 * 处理 QQ 机器人消息收发
 * 参考钉钉集成实现，使用connector系统
 */

const axios = require('axios');
const BoundedMap = require('../utils/bounded-map');

class QQBotIntegration {
  constructor(config, logger, rateLimiter) {
    this.config = config;
    this.logger = logger;
    this.rateLimiter = rateLimiter;
    this.client = null;

    // 统一的会话状态管理（与钉钉一致）
    this.conversations = new Map();

    // 消息去重
    this.processedMessages = new BoundedMap(1000, {
      evictionPolicy: 'fifo',
      onEvict: (key) => {
        this.logger.debug('QQBOT', `Processed message evicted: ${key}`);
      }
    });

    // 自动清理配置
    this.cleanupConfig = {
      enabled: true,
      interval: 5 * 60 * 1000,
      messageAgeLimit: 60 * 60 * 1000,
      sessionAgeLimit: 24 * 60 * 60 * 1000
    };

    this.cleanupTimer = null;
  }

  /**
   * 初始化
   */
  async init(messageHandler = null) {
    if (!this.config.enabled) {
      this.logger.warning('QQBOT', '未启用');
      return false;
    }

    this.logger.info('QQBOT', '开始初始化...');
    this.logger.debug('QQBOT', '配置信息', {
      appId: this.config.appId?.substring(0, 10) + '...',
      hasClientSecret: !!this.config.clientSecret
    });

    try {
      // 加载 QQ Bot 客户端
      let QQBotClient;
      try {
        QQBotClient = require('./qqbot/qqbot-client');
      } catch (e) {
        this.logger.error('QQBOT', '加载 QQBot 客户端失败');
        return false;
      }

      this.logger.debug('QQBOT', '创建 QQBot 实例');

      this.client = new QQBotClient({
        appId: this.config.appId,
        clientSecret: this.config.clientSecret,
        sandbox: this.config.sandbox || false,
        autoReconnect: true,
        debug: this.config.debug || false
      });

      this.logger.debug('QQBOT', '注册事件监听器');

      // 注册事件
      this._registerEvents(messageHandler);

      this.logger.info('QQBOT', '正在连接到 QQ 服务器...');
      await this.client.connect();

      this.logger.success('QQBOT', '初始化成功，客户端已连接');

      // 启动自动清理
      if (this.cleanupConfig.enabled) {
        this.startAutoCleanup();
        this.logger.info('QQBOT', '自动内存清理已启用');
      }

      return true;

    } catch (error) {
      this.logger.error('QQBOT', '初始化失败', {
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * 注册事件监听器
   */
  _registerEvents(messageHandler) {
    // 保存messageHandler引用
    this.messageHandler = messageHandler;

    // C2C 私信
    this.client.on('c2c_message', async (message) => {
      await this._handleMessage(message, 'c2c');
    });

    // 频道消息
    this.client.on('message', async (message) => {
      await this._handleMessage(message, 'channel');
    });

    // @机器人消息
    this.client.on('at_message', async (message) => {
      await this._handleMessage(message, 'at');
    });

    // 频道私信
    this.client.on('direct_message', async (message) => {
      await this._handleMessage(message, 'direct');
    });

    // 连接状态
    this.client.on('ready', () => {
      this.logger.success('QQBOT', '✅ QQ 机器人已就绪');
    });

    this.client.on('error', (error) => {
      this.logger.error('QQBOT', '连接错误', { error: error.message });
    });
  }

  /**
   * 处理消息
   */
  async _handleMessage(message, type) {
    const messageId = message.id;

    // 去重
    if (messageId && this.isProcessed(messageId)) {
      this.logger.debug('QQBOT', `消息已处理过，跳过: ${messageId}`);
      return;
    }

    if (messageId) {
      this.markAsProcessed(messageId);
    }

    const content = message.content?.trim();
    if (!content) return;

    const conversationId = this._getConversationId(message, type);

    this.logger.info('QQBOT', `[${type}] 收到消息: ${content}`);
    this.logger.debug('QQBOT', `[${type}] conversationId: ${conversationId}`);

    try {
      // 如果有messageHandler，使用它处理（像钉钉一样）
      if (this.messageHandler) {
        await this.messageHandler(message, type, conversationId);
        return;
      }

      // 没有handler时的降级处理
      this.logger.warning('QQBOT', '没有消息处理器');
    } catch (error) {
      this.logger.error('QQBOT', `[${type}] 处理失败: ${error.message}`);
    }
  }

  /**
   * 获取会话 ID
   */
  _getConversationId(message, type) {
    // C2C 私信
    if (type === 'c2c' && message.author?.user_openid) {
      return `c2c:${message.author.user_openid}`;
    }
    // 频道消息
    if (message.channel_id && message.author?.id) {
      return `channel:${message.channel_id}:${message.author.id}`;
    }
    // 频道私信
    if (message.guild_id && message.author?.id) {
      return `dms:${message.guild_id}:${message.author.id}`;
    }
    return `unknown:${message.id}`;
  }

  // ==================== 会话状态管理（与钉钉一致） ====================

  setSession(conversationId, sessionId, provider) {
    const now = Date.now();
    this.conversations.set(conversationId, {
      sessionId,
      provider,
      startTime: now
    });
  }

  getSession(conversationId) {
    return this.conversations.get(conversationId) || null;
  }

  deleteSession(conversationId) {
    return this.conversations.delete(conversationId);
  }

  hasSession(conversationId) {
    return this.conversations.has(conversationId);
  }

  isProcessed(messageId) {
    return this.processedMessages.has(messageId);
  }

  markAsProcessed(messageId) {
    this.processedMessages.set(messageId, Date.now());
  }

  // ==================== 自动清理（与钉钉一致） ====================

  startAutoCleanup() {
    if (this.cleanupTimer) return;

    this.cleanupTimer = setInterval(() => {
      this.performCleanup().catch(error => {
        this.logger.error('QQBOT', '自动清理失败', { error: error.message });
      });
    }, this.cleanupConfig.interval);
  }

  stopAutoCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  async performCleanup() {
    const now = Date.now();
    const messageAgeLimit = this.cleanupConfig.messageAgeLimit;
    const sessionAgeLimit = this.cleanupConfig.sessionAgeLimit;

    // 清理过期消息
    for (const [messageId, timestamp] of this.processedMessages.entries()) {
      if (now - timestamp > messageAgeLimit) {
        this.processedMessages.delete(messageId);
      }
    }

    // 清理过期会话
    for (const [conversationId, session] of this.conversations.entries()) {
      if (now - session.startTime > sessionAgeLimit) {
        this.conversations.delete(conversationId);
      }
    }
  }

  // ==================== 关闭 ====================

  async close() {
    this.stopAutoCleanup();
    if (this.client) {
      // qq-bot-sdk 的关闭方法
      this.logger.info('QQBOT', '客户端已关闭');
    }
  }
}

module.exports = QQBotIntegration;