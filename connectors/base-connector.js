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

    // 可选的 Logger 实例（向后兼容）
    this.logger = options.logger || null
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

  // ==================== 共享工具方法 ====================

  /**
   * 生成临时会话 ID
   * @returns {string}
   */
  _generateTempId() {
    return `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 终止子进程（平台相关）
   * @param {Object} child - 子进程对象
   */
  _terminateProcess(child) {
    const { spawn } = require('child_process')

    if (process.platform === 'win32') {
      spawn('taskkill', ['/F', '/T', '/PID', child.pid.toString()], {
        stdio: 'ignore'
      })
    } else {
      child.kill('SIGTERM')
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL')
        }
      }, 500).unref()
    }
  }

  /**
   * 检查是否为 Windows 平台
   * @returns {boolean}
   */
  _isWindows() {
    return process.platform === 'win32'
  }

  /**
   * 通用的命令测试方法
   * @param {string} command - 命令
   * @param {string[]} args - 参数
   * @param {Object} options - spawn 选项
   * @returns {Promise<string|null>} 版本号或 null
   */
  async _testCommandGeneric(command, args = [], options = {}) {
    const { spawn } = require('child_process')

    return new Promise((resolve) => {
      const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        ...options
      })

      let output = ''
      child.stdout.on('data', (data) => { output += data.toString() })
      child.stderr.on('data', (data) => { output += data.toString() })

      child.on('close', (code) => {
        if (code === 0 || output.trim()) {
          const versionMatch = output.match(/(\d+\.\d+\.\d+)/)
          resolve(versionMatch ? versionMatch[1] : output.trim() || 'unknown')
        } else {
          resolve(null)
        }
      })

      child.on('error', () => {
        resolve(null)
      })
    })
  }

  // ==================== 定时任务工具支持 ====================

  /**
   * 获取定时任务相关工具定义（子类可调用）
   * @returns {Object} 工具定义
   */
  static getSchedulerTools() {
    return {
      add_task: {
        name: 'add_task',
        description: '添加新的定时任务。适用于周期性需求，如每天提醒、每周报告等。',
        input_schema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: '任务唯一标识符（建议使用 kebab-case，如 daily-weather）'
            },
            name: {
              type: 'string',
              description: '任务名称（中文描述）'
            },
            schedule: {
              type: 'string',
              description: 'Cron 表达式（分 时 日 月 周）。示例：0 9 * * *（每天9点）、0 */6 * * *（每6小时）'
            },
            message: {
              type: 'string',
              description: '任务描述或完整的工作指令（可以包含通知方式等细节）'
            },
            provider: {
              type: 'string',
              description: '使用的提供商（claude 或 iflow），默认使用当前提供商',
              enum: ['claude', 'iflow']
            }
          },
          required: ['id', 'name', 'schedule', 'message']
        }
      },

      run_task: {
        name: 'run_task',
        description: '立即执行指定的定时任务（不等待调度时间）',
        input_schema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: '要执行的任务ID'
            }
          },
          required: ['id']
        }
      },

      remove_task: {
        name: 'remove_task',
        description: '删除指定的定时任务',
        input_schema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: '要删除的任务ID'
            }
          },
          required: ['id']
        }
      }
    }
  }

  /**
   * 处理 Agent 调用的定时任务工具
   * @param {string} toolName - 工具名称
   * @param {Object} toolInput - 工具参数
   * @returns {Promise<Object>} 执行结果
   */
  async handleSchedulerTool(toolName, toolInput) {
    // 需要子类提供 this.server 和 this.provider
    if (!this.server || !this.server.scheduler) {
      return {
        error: '定时任务功能未初始化'
      }
    }

    if (!this.server.scheduler.enabled) {
      return {
        error: '定时任务功能未启用。请在 scheduler/tasks.json 中设置 enabled: true'
      }
    }

    const taskManager = this.server.scheduler.taskManager

    try {
      switch (toolName) {
        case 'add_task':
          const addResult = await taskManager.addTask(toolInput)
          if (addResult.success) {
            return {
              success: true,
              message: `✅ 任务 "${addResult.task.name}" 已创建`,
              task: addResult.task
            }
          } else {
            return {
              success: false,
              error: addResult.error
            }
          }

        case 'run_task':
          const runResult = await taskManager.runTask(toolInput.id)
          if (runResult.success) {
            return {
              success: true,
              message: `✅ 任务执行完成，耗时: ${runResult.elapsed}秒`,
              elapsed: runResult.elapsed,
              result: runResult.result
            }
          } else {
            return {
              success: false,
              error: runResult.error
            }
          }

        case 'remove_task':
          const removeResult = await taskManager.removeTask(toolInput.id)
          if (removeResult.success) {
            return {
              success: true,
              message: removeResult.message
            }
          } else {
            return {
              success: false,
              error: removeResult.error
            }
          }

        default:
          return {
            error: `未知工具: ${toolName}`
          }
      }
    } catch (error) {
      return {
        success: false,
        error: `工具执行失败: ${error.message}`
      }
    }
  }
}

module.exports = BaseConnector
