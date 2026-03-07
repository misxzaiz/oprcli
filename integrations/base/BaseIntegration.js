/**
 * BaseIntegration - 集成模块抽象基类
 *
 * 提供所有集成平台的公共功能：
 * - 会话管理
 * - 消息去重
 * - 发送重试
 * - 限流控制
 * - 统计信息
 * - 持久化
 *
 * 子类需要实现：
 * - init()
 * - connect()
 * - disconnect()
 * - send()
 */

const EventEmitter = require('events');
const BoundedMap = require('../../utils/bounded-map');
const { createSessionPersistence } = require('../../utils/session-persistence');

class BaseIntegration extends EventEmitter {
  constructor(config, logger, rateLimiter) {
    super();

    this.config = config;
    this.logger = logger;
    this.rateLimiter = rateLimiter;

    // ==================== 会话状态管理 ====================
    // conversationId -> { sessionId, provider, startTime }
    this.conversations = new Map();

    // ==================== 消息去重 ====================
    // 使用 BoundedMap 限制大小，防止内存泄漏
    this.processedMessages = new BoundedMap(1000, {
      evictionPolicy: 'fifo',
      onEvict: (key) => {
        this.logger.debug('BASE', `Processed message evicted: ${key}`);
      }
    });

    // ==================== 持久化 ====================
    this.sessionStore = null;
    this.enableSessionPersistence = config.enableSessionPersistence !== false;

    // ==================== 自动清理配置 ====================
    this.cleanupConfig = {
      enabled: config.enableAutoCleanup !== false,
      interval: 5 * 60 * 1000, // 5分钟
      messageAgeLimit: 60 * 60 * 1000, // 1小时
      sessionAgeLimit: 24 * 60 * 60 * 1000 // 24小时
    };

    this.cleanupTimer = null;

    // ==================== 统计信息 ====================
    this.stats = {
      messagesReceived: 0,
      messagesProcessed: 0,
      messagesDuplicate: 0,
      messagesSent: 0,
      messagesFailed: 0,
      sessionsCreated: 0,
      sessionsRestored: 0,
      startTime: Date.now()
    };
  }

  /**
   * 初始化（子类需要重写）
   */
  async init() {
    this.logger.info('BASE', '初始化集成模块...');

    // 初始化会话持久化
    if (this.enableSessionPersistence) {
      await this.initSessionPersistence();
    }

    // 启动自动清理
    if (this.cleanupConfig.enabled) {
      this.startAutoCleanup();
    }

    return true;
  }

  /**
   * 初始化会话持久化
   */
  async initSessionPersistence() {
    try {
      this.sessionStore = await createSessionPersistence({
        logger: this.logger
      });
      await this.restoreSessions();

      if (this.conversations.size > 0) {
        this.logger.info('BASE', `已恢复 ${this.conversations.size} 个历史会话`);
        this.stats.sessionsRestored = this.conversations.size;
      }
    } catch (error) {
      this.logger.warning('BASE', `会话持久化初始化失败: ${error.message}`);
    }
  }

  /**
   * 恢复历史会话
   */
  async restoreSessions() {
    if (!this.sessionStore) return;

    try {
      const records = await this.sessionStore.loadAll();
      for (const record of records) {
        if (!record.conversationId) continue;
        this.conversations.set(record.conversationId, {
          sessionId: record.sessionId || null,
          provider: record.provider || null,
          startTime: record.startTime || Date.now()
        });
      }
    } catch (error) {
      this.logger.warning('BASE', `恢复历史会话失败: ${error.message}`);
    }
  }

  // ==================== 抽象方法（子类必须实现） ====================

  /**
   * 连接到平台（子类必须实现）
   */
  async connect() {
    throw new Error('子类必须实现 connect() 方法');
  }

  /**
   * 断开连接（子类必须实现）
   */
  async disconnect() {
    throw new Error('子类必须实现 disconnect() 方法');
  }

  /**
   * 发送消息（子类必须实现）
   */
  async send(target, message) {
    throw new Error('子类必须实现 send() 方法');
  }

  // ==================== 会话状态管理 ====================

  /**
   * 设置会话
   * @param {string} conversationId - 会话 ID
   * @param {string} sessionId - AI 会话 ID
   * @param {string} provider - 提供商
   */
  setSession(conversationId, sessionId, provider) {
    const now = Date.now();
    this.conversations.set(conversationId, {
      sessionId,
      provider,
      startTime: now
    });

    this.stats.sessionsCreated++;

    // 持久化
    this._persistSession(conversationId, {
      sessionId,
      provider,
      startTime: now,
      updatedAt: now
    });

    this.logger.debug('BASE', `✅ 会话已设置: ${conversationId} -> ${sessionId} (${provider})`);
  }

  /**
   * 获取会话
   */
  getSession(conversationId) {
    return this.conversations.get(conversationId) || null;
  }

  /**
   * 获取会话 ID
   */
  getSessionId(conversationId) {
    const session = this.conversations.get(conversationId);
    return session ? session.sessionId : null;
  }

  /**
   * 获取提供商
   */
  getProvider(conversationId) {
    const session = this.conversations.get(conversationId);
    return session ? session.provider : null;
  }

  /**
   * 删除会话
   */
  deleteSession(conversationId) {
    const deleted = this.conversations.delete(conversationId);
    this._deletePersistedSession(conversationId);
    this.logger.debug('BASE', `🗑️ 会话已删除: ${conversationId}`);
    return deleted;
  }

  /**
   * 检查是否有活动会话
   */
  hasSession(conversationId) {
    return this.conversations.has(conversationId);
  }

  /**
   * 获取所有活动会话
   */
  getActiveSessions() {
    return Array.from(this.conversations.entries()).map(([convId, session]) => ({
      conversationId: convId,
      sessionId: session.sessionId,
      provider: session.provider,
      startTime: session.startTime
    }));
  }

  /**
   * 清除所有会话
   */
  clearSessions() {
    this.conversations.clear();
    this._clearPersistedSessions();
    this.logger.debug('BASE', `🗑️ 所有会话已清除`);
  }

  // ==================== 消息去重 ====================

  /**
   * 检查消息是否已处理
   */
  isProcessed(messageId) {
    return this.processedMessages.has(messageId);
  }

  /**
   * 标记消息为已处理
   */
  markAsProcessed(messageId) {
    const now = Date.now();
    this.processedMessages.set(messageId, now);
  }

  // ==================== 发送重试机制 ====================

  /**
   * 带重试机制的发送
   * @param {Function} sendFn - 发送函数
   * @param {number} maxRetries - 最大重试次数
   */
  async sendWithRetry(sendFn, maxRetries = 3) {
    // 等待限流
    await this.rateLimiter.waitForSlot();

    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await sendFn();

        if (attempt > 1) {
          this.logger.success('BASE', `消息发送成功（第${attempt}次尝试）`);
        }

        this.stats.messagesSent++;
        return result;
      } catch (error) {
        lastError = error;
        const isLastAttempt = attempt === maxRetries;

        if (!isLastAttempt) {
          // 指数退避
          const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          this.logger.warning('BASE',
            `发送失败，${waitTime}ms后重试（${attempt}/${maxRetries}）`,
            { error: error.message }
          );
          await this.sleep(waitTime);
        } else {
          this.logger.error('BASE',
            `发送失败，已达最大重试次数（${maxRetries}）`,
            { error: error.message }
          );
        }
      }
    }

    this.stats.messagesFailed++;
    throw lastError;
  }

  /**
   * 辅助方法：休眠
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ==================== 自动清理 ====================

  /**
   * 启动自动清理
   */
  startAutoCleanup() {
    if (this.cleanupTimer) {
      this.logger.debug('BASE', '⚠️ 自动清理定时器已在运行');
      return;
    }

    this.cleanupTimer = setInterval(() => {
      this.performCleanup().catch(error => {
        this.logger.error('BASE', `自动清理失败: ${error.message}`);
      });
    }, this.cleanupConfig.interval);

    this.logger.debug('BASE', `✅ 自动清理已启动（间隔：${this.cleanupConfig.interval / 1000}秒）`);
  }

  /**
   * 停止自动清理
   */
  stopAutoCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      this.logger.debug('BASE', '⏹️ 自动清理已停止');
    }
  }

  /**
   * 执行清理
   */
  async performCleanup() {
    const startTime = Date.now();
    const stats = {
      messagesCleaned: 0,
      sessionsCleaned: 0
    };

    try {
      // 清理过期的已处理消息
      stats.messagesCleaned = this.cleanExpiredMessages();

      // 清理过期的会话
      stats.sessionsCleaned = this.cleanExpiredSessions();

      const duration = Date.now() - startTime;

      // 如果清理了内容，记录日志
      if (stats.messagesCleaned > 0 || stats.sessionsCleaned > 0) {
        this.logger.info('BASE', '🧹 内存清理完成', {
          messagesCleaned: stats.messagesCleaned,
          sessionsCleaned: stats.sessionsCleaned,
          duration: `${duration}ms`,
          processedMessagesCount: this.processedMessages.size,
          conversationsCount: this.conversations.size
        });
      }

      return stats;
    } catch (error) {
      this.logger.error('BASE', `清理过程出错: ${error.message}`);
      throw error;
    }
  }

  /**
   * 清理过期的已处理消息
   */
  cleanExpiredMessages() {
    const now = Date.now();
    const messageAgeLimit = this.cleanupConfig.messageAgeLimit;
    let cleanedCount = 0;

    for (const [messageId, timestamp] of this.processedMessages.entries()) {
      if (now - timestamp > messageAgeLimit) {
        this.processedMessages.delete(messageId);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * 清理过期的会话
   */
  cleanExpiredSessions() {
    const now = Date.now();
    const sessionAgeLimit = this.cleanupConfig.sessionAgeLimit;
    let cleanedCount = 0;

    for (const [conversationId, session] of this.conversations.entries()) {
      if (now - session.startTime > sessionAgeLimit) {
        this.conversations.delete(conversationId);
        this._deletePersistedSession(conversationId);
        cleanedCount++;
        this.logger.debug('BASE', `🗑️ 清理过期会话: ${conversationId}`);
      }
    }

    return cleanedCount;
  }

  // ==================== 统计信息 ====================

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      currentProcessedMessages: this.processedMessages.size,
      currentConversations: this.conversations.size,
      uptime: Date.now() - this.stats.startTime
    };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      messagesReceived: 0,
      messagesProcessed: 0,
      messagesDuplicate: 0,
      messagesSent: 0,
      messagesFailed: 0,
      sessionsCreated: 0,
      sessionsRestored: 0,
      startTime: Date.now()
    };
  }

  // ==================== 持久化 ====================

  /**
   * 持久化会话
   */
  _persistSession(conversationId, sessionData) {
    if (!this.sessionStore) return;
    this.sessionStore.upsert({ conversationId, ...sessionData })
      .catch(error => {
        this.logger.warning('BASE', `会话持久化失败: ${conversationId}, ${error.message}`);
      });
  }

  /**
   * 删除持久化的会话
   */
  _deletePersistedSession(conversationId) {
    if (!this.sessionStore) return;
    this.sessionStore.delete(conversationId)
      .catch(error => {
        this.logger.warning('BASE', `删除持久化会话失败: ${conversationId}, ${error.message}`);
      });
  }

  /**
   * 清空所有持久化的会话
   */
  _clearPersistedSessions() {
    if (!this.sessionStore) return;
    this.sessionStore.clear()
      .catch(error => {
        this.logger.warning('BASE', `清空持久化会话失败: ${error.message}`);
      });
  }

  // ==================== 清理资源 ====================

  /**
   * 销毁集成模块
   */
  async destroy() {
    this.logger.info('BASE', '正在销毁集成模块...');

    // 停止自动清理
    this.stopAutoCleanup();

    // 清空会话
    this.conversations.clear();

    // 子类可以重写此方法添加额外的清理逻辑
    await this.cleanup();

    this.logger.info('BASE', '✅ 集成模块已销毁');
  }

  /**
   * 子类可以重写的清理方法
   */
  async cleanup() {
    // 子类实现
  }
}

module.exports = BaseIntegration;
