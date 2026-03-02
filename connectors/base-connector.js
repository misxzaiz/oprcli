/**
 * AI CLI 连接器抽象基类
 *
 * 所有连接器必须实现以下方法：
 * - _connectInternal(): 内部连接逻辑
 * - _startSessionInternal(): 启动会话逻辑
 * - _continueSessionInternal(): 继续会话逻辑
 * - _interruptSessionInternal(): 中断会话逻辑
 */
class BaseConnector {
  constructor(options = {}) {
    this.workDir = options.workDir || process.cwd()
    this.connected = false
    this.version = null
    this.activeSessions = new Map() // sessionId -> { process, ... }
  }

  // ==================== 公共接口 ====================

  /**
   * 连接到 CLI
   * @param {Object} options - 连接选项
   * @returns {Promise<{success: boolean, version?: string, error?: string}>}
   */
  async connect(options = {}) {
    if (this.connected) {
      return { success: true, version: this.version }
    }

    try {
      const result = await this._connectInternal(options)
      if (result.success) {
        this.connected = true
        this.version = result.version
      }
      return result
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 启动新会话
   * @param {string} message - 用户消息
   * @param {Object} options - 会话选项
   * @returns {Promise<{sessionId?: string, error?: string}>}
   */
  async startSession(message, options = {}) {
    this._ensureConnected()
    return this._startSessionInternal(message, options)
  }

  /**
   * 继续已有会话
   * @param {string} sessionId - 会话ID
   * @param {string} message - 用户消息
   * @param {Object} options - 会话选项
   * @returns {Promise<void>}
   */
  async continueSession(sessionId, message, options = {}) {
    this._ensureConnected()
    return this._continueSessionInternal(sessionId, message, options)
  }

  /**
   * 中断会话
   * @param {string} sessionId - 会话ID
   * @returns {boolean}
   */
  interruptSession(sessionId) {
    const session = this.activeSessions.get(sessionId)
    if (!session) return false

    const success = this._interruptSessionInternal(sessionId)
    if (success) {
      this.activeSessions.delete(sessionId)
    }
    return success
  }

  /**
   * 获取活动会话列表
   * @returns {string[]}
   */
  getActiveSessions() {
    return Array.from(this.activeSessions.keys())
  }

  /**
   * 设置 sessionId 更新回调
   * 当检测到真实的 sessionId 时调用（用于 IFlow 等）
   * @param {Function} callback - (realSessionId) => void
   */
  onSessionIdUpdate(callback) {
    this.sessionIdUpdateCallback = callback
  }

  // ==================== 抽象方法（子类必须实现）====================

  async _connectInternal(options) {
    throw new Error('_connectInternal must be implemented')
  }

  async _startSessionInternal(message, options) {
    throw new Error('_startSessionInternal must be implemented')
  }

  async _continueSessionInternal(sessionId, message, options) {
    throw new Error('_continueSessionInternal must be implemented')
  }

  _interruptSessionInternal(sessionId) {
    throw new Error('_interruptSessionInternal must be implemented')
  }

  // ==================== 工具方法 ====================

  _ensureConnected() {
    if (!this.connected) {
      throw new Error('Not connected. Call connect() first.')
    }
  }

  _registerSession(sessionId, sessionData) {
    this.activeSessions.set(sessionId, sessionData)
  }

  _unregisterSession(sessionId) {
    this.activeSessions.delete(sessionId)
  }

  _getSession(sessionId) {
    return this.activeSessions.get(sessionId)
  }
}

module.exports = BaseConnector
