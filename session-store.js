/**
 * 会话存储模块 - 持久化钉钉会话与 Claude 会话的映射关系
 */

const fs = require('fs');
const path = require('path');

class SessionStore {
  /**
   * @param {string} filePath - 存储文件路径
   */
  constructor(filePath = './data/sessions.json') {
    this.filePath = filePath;
    this.data = { sessions: {}, metadata: {} };
    this.load();
  }

  /**
   * 加载会话数据
   */
  load() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(content);
      }
    } catch (err) {
      console.warn('[SessionStore] 加载失败，使用空数据:', err.message);
      this.data = { sessions: {}, metadata: {} };
    }
  }

  /**
   * 保存会话数据
   */
  save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (err) {
      console.error('[SessionStore] 保存失败:', err.message);
    }
  }

  /**
   * 获取 Claude 会话 ID
   * @param {string} conversationId - 钉钉会话 ID
   * @returns {string|null}
   */
  get(conversationId) {
    return this.data.sessions[conversationId] || null;
  }

  /**
   * 设置会话映射
   * @param {string} conversationId - 钉钉会话 ID
   * @param {string} claudeSessionId - Claude 会话 ID
   */
  set(conversationId, claudeSessionId) {
    this.data.sessions[conversationId] = claudeSessionId;
    this.data.metadata[conversationId] = {
      updatedAt: new Date().toISOString()
    };
    this.save();
  }

  /**
   * 删除会话映射
   * @param {string} conversationId - 钉钉会话 ID
   */
  delete(conversationId) {
    delete this.data.sessions[conversationId];
    delete this.data.metadata[conversationId];
    this.save();
  }

  /**
   * 获取所有会话
   * @returns {Object}
   */
  getAll() {
    return { ...this.data.sessions };
  }

  /**
   * 清空所有会话
   */
  clear() {
    this.data = { sessions: {}, metadata: {} };
    this.save();
  }

  /**
   * 获取会话数量
   * @returns {number}
   */
  get size() {
    return Object.keys(this.data.sessions).length;
  }
}

module.exports = { SessionStore };
