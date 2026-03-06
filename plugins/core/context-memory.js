const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * 上下文记忆系统
 * 负责跨会话保存和管理上下文信息
 */
class ContextMemory {
  constructor(logger) {
    this.logger = logger;
    this.dbPath = path.join(__dirname, '../../memory/context.db');
    this.memory = new Map();
    this.initialized = false;
  }

  /**
   * 初始化
   */
  async init() {
    try {
      await this.load();

      // 定期清理过期记忆
      this.startCleanupTask();

      this.initialized = true;
      this.logger.success('MEMORY', `✓ 上下文记忆已加载 (${this.memory.size} 条)`);
      return true;
    } catch (error) {
      this.logger.error('MEMORY', '上下文记忆初始化失败', error);
      throw error;
    }
  }

  /**
   * 加载记忆
   */
  async load() {
    try {
      const content = await fs.readFile(this.dbPath, 'utf-8');
      const data = JSON.parse(content);

      this.memory = new Map(Object.entries(data));

      // 清理过期记忆
      await this.cleanup();

      this.logger.debug('MEMORY', `已加载 ${this.memory.size} 条记忆`);
    } catch (error) {
      this.logger.warning('MEMORY', '记忆数据库不存在，创建新的');
      this.memory = new Map();
    }
  }

  /**
   * 保存记忆
   */
  async save() {
    try {
      // 确保目录存在
      const memoryDir = path.dirname(this.dbPath);
      await fs.mkdir(memoryDir, { recursive: true });

      // 转换 Map 为对象
      const data = Object.fromEntries(this.memory);

      // 保存到文件
      await fs.writeFile(
        this.dbPath,
        JSON.stringify(data, null, 2),
        'utf-8'
      );

      this.logger.debug('MEMORY', '✓ 记忆已保存');
    } catch (error) {
      this.logger.error('MEMORY', '保存记忆失败', error);
      throw error;
    }
  }

  /**
   * 兼容 server.js 关闭流程中的 saveAll 调用
   */
  async saveAll() {
    return await this.save();
  }

  /**
   * 保存上下文
   * @param {string} key - 键
   * @param {any} value - 值
   * @param {Object} options - 选项
   * @param {number} options.ttl - 过期时间（毫秒）
   * @param {Object} options.metadata - 元数据
   */
  async set(key, value, options = {}) {
    try {
      const entry = {
        value,
        timestamp: Date.now(),
        expiresAt: options.ttl ? Date.now() + options.ttl : null,
        metadata: options.metadata || {}
      };

      this.memory.set(key, entry);

      await this.save();

      this.logger.debug('MEMORY', `✓ 记忆已保存: ${key}`);
      return true;
    } catch (error) {
      this.logger.error('MEMORY', `保存记忆失败: ${key}`, error);
      throw error;
    }
  }

  /**
   * 获取上下文
   * @param {string} key - 键
   * @returns {any} 值，如果不存在或已过期返回 null
   */
  async get(key) {
    try {
      const entry = this.memory.get(key);

      if (!entry) {
        return null;
      }

      // 检查是否过期
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        await this.delete(key);
        return null;
      }

      return entry.value;
    } catch (error) {
      this.logger.error('MEMORY', `获取记忆失败: ${key}`, error);
      return null;
    }
  }

  /**
   * 检查键是否存在
   */
  async has(key) {
    const value = await this.get(key);
    return value !== null;
  }

  /**
   * 删除上下文
   */
  async delete(key) {
    try {
      const deleted = this.memory.delete(key);

      if (deleted) {
        await this.save();
        this.logger.debug('MEMORY', `✓ 记忆已删除: ${key}`);
      }

      return deleted;
    } catch (error) {
      this.logger.error('MEMORY', `删除记忆失败: ${key}`, error);
      return false;
    }
  }

  /**
   * 清空所有记忆
   */
  async clear() {
    try {
      this.memory.clear();
      await this.save();

      this.logger.warning('MEMORY', '✓ 所有记忆已清空');
      return true;
    } catch (error) {
      this.logger.error('MEMORY', '清空记忆失败', error);
      return false;
    }
  }

  /**
   * 保存会话上下文
   * @param {string} sessionId - 会话 ID
   * @param {Object} context - 上下文对象
   */
  async saveSession(sessionId, context) {
    try {
      await this.set(`session:${sessionId}`, context, {
        ttl: 7 * 24 * 60 * 60 * 1000, // 7天
        metadata: { type: 'session', sessionId }
      });

      this.logger.debug('MEMORY', `✓ 会话已保存: ${sessionId}`);
      return true;
    } catch (error) {
      this.logger.error('MEMORY', `保存会话失败: ${sessionId}`, error);
      throw error;
    }
  }

  /**
   * 获取会话上下文
   * @param {string} sessionId - 会话 ID
   */
  async getSession(sessionId) {
    try {
      return await this.get(`session:${sessionId}`);
    } catch (error) {
      this.logger.error('MEMORY', `获取会话失败: ${sessionId}`, error);
      return null;
    }
  }

  /**
   * 删除会话上下文
   */
  async deleteSession(sessionId) {
    return await this.delete(`session:${sessionId}`);
  }

  /**
   * 保存共享上下文
   * @param {string} key - 键
   * @param {any} value - 值
   */
  async saveSharedContext(key, value) {
    try {
      await this.set(`shared:${key}`, value, {
        metadata: { type: 'shared', key }
      });

      this.logger.debug('MEMORY', `✓ 共享上下文已保存: ${key}`);
      return true;
    } catch (error) {
      this.logger.error('MEMORY', `保存共享上下文失败: ${key}`, error);
      throw error;
    }
  }

  /**
   * 获取共享上下文
   * @param {string} key - 键
   */
  async getSharedContext(key) {
    try {
      return await this.get(`shared:${key}`);
    } catch (error) {
      this.logger.error('MEMORY', `获取共享上下文失败: ${key}`, error);
      return null;
    }
  }

  /**
   * 保存用户偏好
   */
  async saveUserPreference(userId, preference, value) {
    const key = `user:${userId}:preference:${preference}`;
    return await this.set(key, value, {
      metadata: { type: 'preference', userId, preference }
    });
  }

  /**
   * 获取用户偏好
   */
  async getUserPreference(userId, preference) {
    const key = `user:${userId}:preference:${preference}`;
    return await this.get(key);
  }

  /**
   * 搜索记忆
   * @param {string} pattern - 搜索模式
   * @returns {Array} 匹配的记忆列表
   */
  async search(pattern) {
    try {
      const results = [];
      const lowerPattern = pattern.toLowerCase();

      for (const [key, entry] of this.memory.entries()) {
        // 检查键是否匹配
        if (key.toLowerCase().includes(lowerPattern)) {
          results.push({
            key,
            value: entry.value,
            timestamp: entry.timestamp,
            expiresAt: entry.expiresAt
          });
          continue;
        }

        // 检查值是否匹配
        const valueStr = JSON.stringify(entry.value).toLowerCase();
        if (valueStr.includes(lowerPattern)) {
          results.push({
            key,
            value: entry.value,
            timestamp: entry.timestamp,
            expiresAt: entry.expiresAt
          });
        }
      }

      this.logger.debug('MEMORY', `✓ 搜索完成: 找到 ${results.length} 条匹配`);
      return results;
    } catch (error) {
      this.logger.error('MEMORY', `搜索失败: ${pattern}`, error);
      return [];
    }
  }

  /**
   * 列出所有记忆
   * @param {Function} filter - 过滤函数
   */
  async list(filter = null) {
    try {
      const items = [];

      for (const [key, entry] of this.memory.entries()) {
        if (!filter || filter(entry)) {
          items.push({
            key,
            value: entry.value,
            timestamp: entry.timestamp,
            expiresAt: entry.expiresAt,
            metadata: entry.metadata
          });
        }
      }

      return items;
    } catch (error) {
      this.logger.error('MEMORY', '列出记忆失败', error);
      return [];
    }
  }

  /**
   * 按类型列出记忆
   */
  async listByType(type) {
    return await this.list(entry => entry.metadata && entry.metadata.type === type);
  }

  /**
   * 清理过期记忆
   */
  async cleanup() {
    try {
      const now = Date.now();
      let cleaned = 0;

      for (const [key, entry] of this.memory.entries()) {
        if (entry.expiresAt && now > entry.expiresAt) {
          this.memory.delete(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        await this.save();
        this.logger.info('MEMORY', `✓ 已清理 ${cleaned} 条过期记忆`);
      }

      return cleaned;
    } catch (error) {
      this.logger.error('MEMORY', '清理过期记忆失败', error);
      return 0;
    }
  }

  /**
   * 启动定期清理任务
   */
  startCleanupTask() {
    // 避免重复启动
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
    }

    // 每小时清理一次
    this._cleanupTimer = setInterval(async () => {
      await this.cleanup();
    }, 60 * 60 * 1000);

    this.logger.debug('MEMORY', '✓ 定期清理任务已启动');
  }

  /**
   * 停止定期清理任务
   */
  stopCleanupTask() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
      this.logger.debug('MEMORY', '✓ 定期清理任务已停止');
    }
  }

  /**
   * 生成唯一 ID
   */
  generateId() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const now = Date.now();
    let expired = 0;
    let typeStats = {};

    for (const [key, entry] of this.memory.entries()) {
      // 统计过期数量
      if (entry.expiresAt && now > entry.expiresAt) {
        expired++;
      }

      // 统计类型
      const type = entry.metadata.type || 'unknown';
      typeStats[type] = (typeStats[type] || 0) + 1;
    }

    return {
      total: this.memory.size,
      expired,
      active: this.memory.size - expired,
      types: typeStats,
      dbPath: this.dbPath
    };
  }

  /**
   * 导出记忆
   */
  async export() {
    const data = Object.fromEntries(this.memory);
    return JSON.stringify(data, null, 2);
  }

  /**
   * 导入记忆
   */
  async import(dataString) {
    try {
      const data = JSON.parse(dataString);

      // 合并记忆
      for (const [key, value] of Object.entries(data)) {
        this.memory.set(key, value);
      }

      await this.save();

      this.logger.success('MEMORY', `✓ 记忆导入成功 (${Object.keys(data).length} 条)`);
      return true;
    } catch (error) {
      this.logger.error('MEMORY', '记忆导入失败', error);
      throw error;
    }
  }
}

module.exports = ContextMemory;
