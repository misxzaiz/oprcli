/**
 * 统一 AI CLI 连接器服务器
 *
 * 支持多个 AI CLI 工具：
 * - Claude Code
 * - IFlow
 *
 * 功能：
 * - Web API 接口
 * - 钉钉机器人集成
 * - 流式事件处理
 * - 会话管理
 */

// 首先加载环境变量
require('dotenv').config()

const express = require('express')
const config = require('./utils/config')
const Logger = require('./integrations/logger')
const RateLimiter = require('./utils/rate-limiter')
const DingTalkIntegration = require('./integrations/dingtalk')
const MessageFormatter = require('./utils/message-formatter')
const ClaudeConnector = require('./connectors/claude-connector')
const IFlowConnector = require('./connectors/iflow-connector')
const { simpleHash } = require('./utils/string-helper')
const SchedulerModule = require('./scheduler')

class UnifiedServer {
  // 命令配置表
  static COMMANDS = {
    'claude': { type: 'switch', provider: 'claude' },
    'iflow': { type: 'switch', provider: 'iflow' },
    'end': { type: 'interrupt' },
    '停止': { type: 'interrupt' },
    'stop': { type: 'interrupt' },
    'status': { type: 'status' },
    '状态': { type: 'status' },
    'help': { type: 'help' },
    '帮助': { type: 'help' },

    // 定时任务命令
    'tasks': { type: 'tasks_list' },
    'tasks status': { type: 'tasks_status' },
    'tasks reload': { type: 'tasks_reload' },
    'tasks run': { type: 'tasks_run', hasArg: true },
    'tasks enable': { type: 'tasks_enable', hasArg: true },
    'tasks disable': { type: 'tasks_disable', hasArg: true }
  }

  constructor() {
    this.app = express()
    this.logger = new Logger(config.logging)
    this.rateLimiter = new RateLimiter(5, 1000)
    this.dingtalk = new DingTalkIntegration(config.dingtalk, this.logger, this.rateLimiter)
    this.messageFormatter = new MessageFormatter(config.streaming, this.logger)

    // 多模型支持
    this.connectors = new Map()  // 'claude' | 'iflow' -> connector instance
    this.defaultProvider = config.provider

    // 定时任务模块
    this.scheduler = null

    this._setupMiddleware()
    this._setupRoutes()
  }

  _setupMiddleware() {
    this.app.use(express.json())
    this.app.use(express.urlencoded({ extended: true }))
  }

  _setupRoutes() {
    this.app.post('/api/connect', this.handleConnect.bind(this))
    this.app.get('/api/status', this.handleStatus.bind(this))
    this.app.post('/api/message', this.handleMessage.bind(this))
    this.app.post('/api/interrupt', this.handleInterrupt.bind(this))
    this.app.post('/api/reset', this.handleReset.bind(this))
    this.app.get('/api/dingtalk/status', this.handleDingTalkStatus.bind(this))

    // 内部 API：定时任务管理（仅允许本地访问）
    this.app.post('/api/tasks/reload', this.handleTasksReload.bind(this))
  }

  async handleConnect(req, res) {
    // Connectors 已经在 start() 时初始化，这里返回状态
    const providers = []
    const versions = {}

    for (const [provider, connector] of this.connectors.entries()) {
      if (connector?.connected) {
        providers.push(provider)
        // 尝试获取版本信息（如果 connector 有）
        if (connector.version) {
          versions[provider] = connector.version
        }
      }
    }

    if (providers.length === 0) {
      return res.status(503).json({
        success: false,
        error: '没有可用的 connectors'
      })
    }

    res.json({
      success: true,
      providers,
      defaultProvider: this.defaultProvider,
      versions
    })
  }

  async handleStatus(req, res) {
    // 收集所有 connectors 的状态
    const connectorsStatus = {}
    for (const [provider, connector] of this.connectors.entries()) {
      connectorsStatus[provider] = {
        connected: connector?.connected || false,
        activeSessions: connector?.getActiveSessions() || []
      }
    }

    res.json({
      defaultProvider: this.defaultProvider,
      connectors: connectorsStatus,
      dingtalk: {
        enabled: config.dingtalk.enabled,
        connected: this.dingtalk.client?.connected || false,
        activeSessions: this.dingtalk.getActiveSessions()
      }
    })
  }

  async handleMessage(req, res) {
    // 从 connectors Map 中获取默认连接器
    const connector = this.connectors.get(this.defaultProvider)
    if (!connector?.connected) {
      return res.status(400).json({ success: false, error: '未连接，请先调用 /api/connect' })
    }

    const { message, sessionId } = req.body
    if (!message?.trim()) {
      return res.status(400).json({ success: false, error: '消息不能为空' })
    }

    try {
      const events = []
      const isResume = !!sessionId

      await new Promise((resolve, reject) => {
        const options = {
          onEvent: (event) => {
            events.push(event)
            this.logger.debug('EVENT', `收到事件: ${event.type}`)
          },
          onComplete: (exitCode) => {
            this.logger.success('SESSION', `完成，退出码: ${exitCode}`)
            resolve({
              success: true,
              sessionId: sessionId || this.currentSessionId,
              isResume,
              events,
              exitCode
            })
          },
          onError: (error) => {
            this.logger.error('SESSION', '错误', { error: error.message })
            resolve({ success: false, error: error.message, events })
          }
        }

        if (isResume) {
          connector.continueSession(sessionId, message, options)
        } else {
          const result = connector.startSession(message, options)
          this.currentSessionId = result.sessionId
        }
      })

      res.json({ success: true })
    } catch (error) {
      res.status(500).json({ success: false, error: error.message })
    }
  }

  handleInterrupt(req, res) {
    // 中断所有 connectors 的所有活动会话
    let totalInterrupted = 0

    for (const [provider, connector] of this.connectors.entries()) {
      if (connector?.connected) {
        const sessions = connector.getActiveSessions()
        sessions.forEach(sessionId => {
          connector.interruptSession(sessionId)
          totalInterrupted++
        })
      }
    }

    // 清空所有会话映射
    this.dingtalk.clearSessions()

    res.json({
      success: true,
      message: `已中断 ${totalInterrupted} 个会话`
    })
  }

  handleReset(req, res) {
    // 中断所有活动会话
    for (const [provider, connector] of this.connectors.entries()) {
      if (connector?.connected) {
        const sessions = connector.getActiveSessions()
        sessions.forEach(sessionId => {
          connector.interruptSession(sessionId)
        })
      }
    }

    // 清空所有会话映射
    this.dingtalk.clearSessions()

    res.json({ success: true })
  }

  handleDingTalkStatus(req, res) {
    res.json({
      enabled: config.dingtalk.enabled,
      connected: this.dingtalk.client?.connected || false,
      activeSessions: this.dingtalk.getActiveSessions()
    })
  }

  /**
   * 内部 API：重新加载定时任务配置
   * 仅允许本地访问（127.0.0.1 或 ::1）
   */
  async handleTasksReload(req, res) {
    // 安全检查：仅允许本地访问
    const clientIp = req.ip || req.connection.remoteAddress
    const isLocalhost =
      clientIp === '127.0.0.1' ||
      clientIp === '::1' ||
      clientIp === '::ffff:127.0.0.1'

    if (!isLocalhost) {
      this.logger.warning('API', `拒绝非本地访问: ${clientIp}`)
      return res.status(403).json({
        success: false,
        error: 'Forbidden: 仅允许本地访问'
      })
    }

    // 检查 scheduler 是否可用
    if (!this.scheduler || !this.scheduler.taskManager) {
      return res.status(503).json({
        success: false,
        error: '定时任务管理器未初始化'
      })
    }

    try {
      this.logger.info('API', '重新加载定时任务配置')

      // 执行重新加载
      await this.scheduler.taskManager.reload()

      const status = this.scheduler.getStatus()
      res.json({
        success: true,
        message: '任务配置已重新加载',
        tasks: status.totalTasks,
        enabledTasks: status.enabledTasks,
        scheduledJobs: status.scheduledJobs
      })
    } catch (error) {
      this.logger.error('API', '重新加载失败', { error: error.message })
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  }

  _createConnector(options) {
    switch (config.provider) {
      case 'claude':
        return new ClaudeConnector(options)
      case 'iflow':
        return new IFlowConnector(options)
      default:
        throw new Error(`Unknown provider: ${config.provider}`)
    }
  }

  async _initializeAllConnectors() {
    const availableProviders = []
    const errors = []

    // 并行初始化任务列表
    const initTasks = []

    // 准备 Claude 初始化任务
    if (config.claude.cmdPath && config.claude.workDir) {
      initTasks.push(this._initConnector('claude', ClaudeConnector))
    }

    // 准备 IFlow 初始化任务
    if (config.iflow.workDir) {
      initTasks.push(this._initConnector('iflow', IFlowConnector))
    }

    // 并行执行所有初始化任务
    if (initTasks.length > 0) {
      this.logger.info('CONNECTOR', `并行初始化 ${initTasks.length} 个模型...`)
      const results = await Promise.all(initTasks)

      // 收集结果
      results.forEach(result => {
        if (result.success) {
          this.connectors.set(result.provider, result.connector)
          availableProviders.push(result.provider)
          this.logger.success('CONNECTOR', `${result.provider.toUpperCase()} 初始化成功 (版本: ${result.version || 'unknown'})`)
        } else {
          errors.push(result.error)
        }
      })
    }

    // 如果有错误，记录警告
    if (errors.length > 0) {
      this.logger.warning('CONNECTOR', '部分模型初始化失败', { errors })
    }

    return availableProviders
  }

  /**
   * 通用连接器初始化方法
   * @param {string} provider - 提供商名称 ('claude' | 'iflow')
   * @param {class} ConnectorClass - 连接器类
   * @returns {Promise<Object>} { success, provider, connector?, version?, error? }
   */
  async _initConnector(provider, ConnectorClass) {
    const providerName = provider.toUpperCase()
    try {
      this.logger.info('CONNECTOR', `正在初始化 ${providerName}...`)
      const options = config.getConnectorOptions(provider)
      const connector = new ConnectorClass(options)
      const result = await connector.connect()

      if (result.success) {
        return {
          success: true,
          provider,
          connector,
          version: result.version
        }
      }
      return {
        success: false,
        error: `${providerName}: ${result.error}`
      }
    } catch (error) {
      this.logger.warning('CONNECTOR', `${providerName} 初始化失败`, { error: error.message })
      return {
        success: false,
        error: `${providerName}: ${error.message}`
      }
    }
  }

  // ==================== 命令处理 ====================

  /**
   * 解析用户命令
   * 支持多词命令，使用最长匹配原则
   * @param {string} content - 用户输入内容
   * @returns {Object|null} 命令对象 { type, provider?, arg? }
   */
  _parseCommand(content) {
    const trimmed = content.trim()
    const parts = trimmed.split(/\s+/)

    // 🔥 从最长到最短尝试匹配（最长匹配原则）
    // 例如：'tasks run 1' -> 先尝试 'tasks run'，再尝试 'tasks'
    for (let i = Math.min(parts.length, 3); i >= 1; i--) {
      const candidate = parts.slice(0, i).join(' ').toLowerCase()
      const cmdConfig = UnifiedServer.COMMANDS[candidate]

      if (cmdConfig) {
        // 提取参数（剩余部分）
        const arg = parts.length > i ? parts.slice(i).join(' ') : null

        return {
          ...cmdConfig,
          original: candidate,
          arg
        }
      }
    }

    return null
  }

  async _handleCommand(command, conversationId, sessionWebhook) {
    switch (command.type) {
      case 'switch':
        return await this._handleSwitch(command.provider, conversationId, sessionWebhook)

      case 'interrupt':
        return await this._handleInterrupt(conversationId, sessionWebhook)

      case 'status':
        return await this._handleStatus(conversationId, sessionWebhook)

      case 'help':
        return await this._handleHelp(sessionWebhook)

      // 定时任务命令
      case 'tasks_list':
        return await this._handleTasksList(conversationId, sessionWebhook)

      case 'tasks_status':
        return await this._handleTasksStatus(conversationId, sessionWebhook)

      case 'tasks_reload':
        return await this._handleTasksReload(conversationId, sessionWebhook)

      case 'tasks_run':
        return await this._handleTasksRun(command.arg, conversationId, sessionWebhook)

      case 'tasks_enable':
        return await this._handleTasksEnable(command.arg, conversationId, sessionWebhook)

      case 'tasks_disable':
        return await this._handleTasksDisable(command.arg, conversationId, sessionWebhook)

      default:
        this.logger.warning('COMMAND', `未知命令类型: ${command.type}`)
        return { status: 'SUCCESS' }
    }
  }

  async _handleSwitch(provider, conversationId, sessionWebhook) {
    // 检查 connector 是否可用
    const connector = this.connectors.get(provider)
    if (!connector || !connector.connected) {
      const availableProviders = Array.from(this.connectors.keys()).map(p => p.toUpperCase()).join(', ')
      await this._sendReply(sessionWebhook,
        `❌ ${provider.toUpperCase()} 模型不可用\n\n` +
        `💡 可用模型：${availableProviders || '无'}`
      )
      return { status: 'SUCCESS' }
    }

    // 中断当前任务（如果有）
    const currentSession = this.dingtalk.getSession(conversationId)
    if (currentSession?.sessionId) {
      const currentConnector = this.connectors.get(currentSession.provider)
      if (currentConnector) {
        currentConnector.interruptSession(currentSession.sessionId)
        this.logger.info('PROVIDER', `中断旧任务: ${currentSession.sessionId}`)
      }
    }

    // 切换模型（清空旧 sessionId，保留 provider）
    this.dingtalk.setSession(conversationId, null, provider)

    const availableProviders = Array.from(this.connectors.keys()).map(p => p.toUpperCase()).join(', ')
    await this._sendReply(sessionWebhook,
      `✅ 已切换到 ${provider.toUpperCase()} 模型\n\n` +
      `💡 可用模型：${availableProviders}`
    )

    this.logger.info('PROVIDER', `会话 ${conversationId} 切换到 ${provider}`)
    return { status: 'SUCCESS' }
  }

  async _handleInterrupt(conversationId, sessionWebhook) {
    const session = this.dingtalk.getSession(conversationId)

    if (!session?.sessionId) {
      await this._sendReply(sessionWebhook, '⚠️ 没有运行中的任务')
      return { status: 'SUCCESS' }
    }

    const connector = this.connectors.get(session.provider)

    if (connector) {
      connector.interruptSession(session.sessionId)
      this.dingtalk.deleteSession(conversationId)
      await this._sendReply(sessionWebhook, '✅ 任务已中断')
      this.logger.info('PROVIDER', `会话 ${conversationId} 任务已中断`)
    } else {
      await this._sendReply(sessionWebhook, '❌ 无法中断任务：模型不可用')
    }

    return { status: 'SUCCESS' }
  }

  async _handleStatus(conversationId, sessionWebhook) {
    const session = this.dingtalk.getSession(conversationId)
    const provider = session?.provider || this.defaultProvider
    const sessionId = session?.sessionId || null
    const availableProviders = Array.from(this.connectors.entries())
      .filter(([_, conn]) => conn.connected)
      .map(([p, _]) => p.toUpperCase())
      .join(', ')

    const status = {
      当前模型: provider.toUpperCase(),
      会话状态: sessionId ? '运行中' : '空闲',
      可用模型: availableProviders || '无'
    }

    const statusText = `📊 系统状态\n\n${Object.entries(status).map(([k, v]) => `• ${k}：${v}`).join('\n')}`
    await this._sendReply(sessionWebhook, statusText)

    return { status: 'SUCCESS' }
  }

  async _handleHelp(sessionWebhook) {
    const availableProviders = Array.from(this.connectors.entries())
      .filter(([_, conn]) => conn.connected)
      .map(([p, _]) => p.toUpperCase())
      .join(', ')

    const schedulerEnabled = this.scheduler?.enabled || false

    const help = `📖 命令帮助

🤖 模型切换：
  • claude  - 切换到 Claude 模型
  • iflow  - 切换到 IFlow 模型

🛑 任务控制：
  • end / 停止 / stop  - 中断当前任务

📅 定时任务${schedulerEnabled ? '' : ' (未启用)'}：
  • tasks  - 查看任务列表
  • tasks status  - 查看任务状态
  • tasks reload  - 重载任务配置
  • tasks run <id>  - 手动执行任务
  • tasks enable <id>  - 启用任务
  • tasks disable <id>  - 禁用任务

ℹ️ 信息查询：
  • status / 状态  - 查看当前状态
  • help / 帮助  - 显示此帮助

💡 可用模型：${availableProviders || '无'}`

    await this._sendReply(sessionWebhook, help.trim())
    return { status: 'SUCCESS' }
  }

  async _sendReply(sessionWebhook, text) {
    const message = {
      msgtype: 'text',
      text: { content: text }
    }

    try {
      await this.dingtalk.send(sessionWebhook, message)
      this.logger.debug('DINGTALK', '回复已发送', { length: text.length })
    } catch (error) {
      this.logger.error('DINGTALK', '回复发送失败', { error: error.message })
    }
  }

  // ==================== 定时任务命令处理 ====================

  async _handleTasksList(conversationId, sessionWebhook) {
    if (!this.scheduler || !this.scheduler.enabled) {
      await this._sendReply(sessionWebhook, '⚠️ 定时任务功能未启用')
      return { status: 'SUCCESS' }
    }

    const status = this.scheduler.getStatus()

    if (status.tasks.length === 0) {
      await this._sendReply(sessionWebhook, '📋 暂无定时任务')
      return { status: 'SUCCESS' }
    }

    const lines = ['📋 定时任务列表\n']
    status.tasks.forEach(task => {
      const enabled = task.enabled ? '✅' : '❌'
      const scheduled = task.scheduled ? '运行中' : '已停止'
      lines.push(`\n${enabled} ${task.name}`)
      lines.push(`   ID: ${task.id}`)
      lines.push(`   调度: ${task.schedule}`)
      lines.push(`   模型: ${task.provider}`)
      lines.push(`   状态: ${scheduled}`)
    })

    lines.push('\n💡 命令：')
    lines.push('• tasks status - 查看详细状态')
    lines.push('• tasks run <id> - 手动执行任务')
    lines.push('• tasks enable <id> - 启用任务')
    lines.push('• tasks disable <id> - 禁用任务')

    await this._sendReply(sessionWebhook, lines.join('\n'))
    return { status: 'SUCCESS' }
  }

  async _handleTasksStatus(conversationId, sessionWebhook) {
    if (!this.scheduler) {
      await this._sendReply(sessionWebhook, '⚠️ 定时任务管理器未初始化')
      return { status: 'SUCCESS' }
    }

    const status = this.scheduler.getStatus()

    const lines = [
      '📊 定时任务状态',
      `\n功能状态: ${status.enabled ? '✅ 已启用' : '❌ 已禁用'}`,
      `配置文件: ${status.configPath}`,
      `总任务数: ${status.totalTasks}`,
      `启用任务: ${status.enabledTasks}`,
      `运行中任务: ${status.scheduledJobs}`
    ]

    await this._sendReply(sessionWebhook, lines.join('\n'))
    return { status: 'SUCCESS' }
  }

  async _handleTasksReload(conversationId, sessionWebhook) {
    if (!this.scheduler) {
      await this._sendReply(sessionWebhook, '⚠️ 定时任务管理器未初始化')
      return { status: 'SUCCESS' }
    }

    try {
      await this.scheduler.taskManager.reload()
      await this._sendReply(sessionWebhook, '✅ 任务配置已重载')
    } catch (error) {
      await this._sendReply(sessionWebhook, `❌ 重载失败: ${error.message}`)
    }

    return { status: 'SUCCESS' }
  }

  async _handleTasksRun(taskId, conversationId, sessionWebhook) {
    if (!this.scheduler || !this.scheduler.enabled) {
      await this._sendReply(sessionWebhook, '⚠️ 定时任务功能未启用')
      return { status: 'SUCCESS' }
    }

    if (!taskId) {
      await this._sendReply(sessionWebhook, '❌ 请指定任务 ID：tasks run <id>')
      return { status: 'SUCCESS' }
    }

    try {
      const result = await this.scheduler.taskManager.runTask(taskId)

      if (result.success) {
        await this._sendReply(sessionWebhook,
          `✅ 任务执行完成\n耗时: ${result.elapsed}s`
        )
      } else {
        await this._sendReply(sessionWebhook,
          `❌ 任务执行失败: ${result.error}`
        )
      }
    } catch (error) {
      await this._sendReply(sessionWebhook,
        `❌ 执行失败: ${error.message}`
      )
    }

    return { status: 'SUCCESS' }
  }

  async _handleTasksEnable(taskId, conversationId, sessionWebhook) {
    if (!this.scheduler || !this.scheduler.enabled) {
      await this._sendReply(sessionWebhook, '⚠️ 定时任务功能未启用')
      return { status: 'SUCCESS' }
    }

    if (!taskId) {
      await this._sendReply(sessionWebhook, '❌ 请指定任务 ID：tasks enable <id>')
      return { status: 'SUCCESS' }
    }

    try {
      this.scheduler.taskManager.enableTask(taskId)
      await this._sendReply(sessionWebhook, `✅ 任务已启用: ${taskId}`)
    } catch (error) {
      await this._sendReply(sessionWebhook, `❌ 启用失败: ${error.message}`)
    }

    return { status: 'SUCCESS' }
  }

  async _handleTasksDisable(taskId, conversationId, sessionWebhook) {
    if (!this.scheduler || !this.scheduler.enabled) {
      await this._sendReply(sessionWebhook, '⚠️ 定时任务功能未启用')
      return { status: 'SUCCESS' }
    }

    if (!taskId) {
      await this._sendReply(sessionWebhook, '❌ 请指定任务 ID：tasks disable <id>')
      return { status: 'SUCCESS' }
    }

    try {
      this.scheduler.taskManager.disableTask(taskId)
      await this._sendReply(sessionWebhook, `✅ 任务已禁用: ${taskId}`)
    } catch (error) {
      await this._sendReply(sessionWebhook, `❌ 禁用失败: ${error.message}`)
    }

    return { status: 'SUCCESS' }
  }

  /**
   * 计算内容哈希，用于检测重复
   * 使用统一的哈希工具函数
   * @param {string} content - 要哈希的内容
   * @returns {string|null} 哈希值
   */
  _hashContent(content) {
    return simpleHash(content)
  }

  async start() {
    // 验证配置
    const validation = config.validate()
    if (!validation.valid) {
      console.error('❌ 配置错误:')
      validation.errors.forEach(err => console.error(`  - ${err}`))
      process.exit(1)
    }

    // 初始化所有可用的 connectors
    try {
      const availableProviders = await this._initializeAllConnectors()

      if (availableProviders.length === 0) {
        this.logger.error('CONNECTOR', '没有可用的 AI 模型')
        process.exit(1)
      }

      this.logger.success('CONNECTOR', `已初始化 ${availableProviders.length} 个模型: ${availableProviders.map(p => p.toUpperCase()).join(', ')}`)
      this.logger.info('CONNECTOR', `默认模型: ${this.defaultProvider.toUpperCase()}`)
    } catch (error) {
      this.logger.error('CONNECTOR', `初始化失败: ${error.message}`)
      process.exit(1)
    }

    // 初始化钉钉（在连接之前注册消息处理器）
    const dingtalkEnabled = await this.dingtalk.init(this.handleDingTalkMessage.bind(this))
    if (dingtalkEnabled) {
      this.logger.success('DINGTALK', '钉钉集成已启动')
    }

    // 启动定时任务模块
    this.scheduler = new SchedulerModule(this, this.logger)
    await this.scheduler.start()

    // 启动 HTTP 服务器（仅在端口配置时）
    if (config.port) {
      this.app.listen(config.port, () => {
        console.log('\n========================================')
        console.log('  Unified AI CLI Connector Server')
        console.log('========================================')
        console.log(`\n🌐 服务器运行在: http://localhost:${config.port}`)
        console.log(`🤖 提供商: ${config.provider.toUpperCase()}`)
        console.log(`📱 钉钉: ${dingtalkEnabled ? '✅ 已启用' : '❌ 未启用'}`)
        console.log('\n按 Ctrl+C 停止服务器\n')
      })
    } else {
      console.log('\n========================================')
      console.log('  Unified AI CLI Connector Server')
      console.log('========================================')
      console.log(`\n🤖 提供商: ${config.provider.toUpperCase()}`)
      console.log(`📱 钉钉: ${dingtalkEnabled ? '✅ 已启用' : '❌ 未启用'}`)
      console.log(`🌐 API: 未启用（未配置端口）`)
      console.log('\n按 Ctrl+C 停止服务器\n')
    }
  }

  async handleDingTalkMessage(message) {
    const timestamp = new Date().toISOString()
    this.logger.success('DINGTALK', '========== 钉钉消息接收 ==========')
    this.logger.success('DINGTALK', `时间戳: ${timestamp}`)

    const { headers, data } = message
    const { messageId } = headers

    // 🔍 MessageID 和去重信息（直接输出字符串，避免对象不显示）
    this.logger.success('DINGTALK', `MessageID: ${messageId || 'null'}`)
    this.logger.success('DINGTALK', `已处理消息数: ${this.dingtalk.processedMessages.size}`)

    const isProcessed = messageId ? this.dingtalk.isProcessed(messageId) : null
    if (messageId) {
      const status = isProcessed ? '✅ 已处理，跳过' : '❌ 未处理，继续'
      this.logger.success('DINGTALK', `去重: ${status}`)
    } else {
      this.logger.warning('DINGTALK', '⚠️  MessageID 为空，无法去重！')
    }

    // 消息去重
    if (messageId && isProcessed) {
      this.logger.warning('DINGTALK', '⚠️  消息已处理，跳过')
      return { status: 'SUCCESS' }
    }

    if (messageId) {
      this.dingtalk.markAsProcessed(messageId)
      this.logger.success('DINGTALK', '✅ 标记为已处理')
    }

    try {
      const robotMessage = JSON.parse(data)
      this.logger.debug('DINGTALK', '解析后的消息', { message: robotMessage })

      const { conversationId, senderNick, text, msgtype, sessionWebhook } = robotMessage

      this.logger.success('DINGTALK', `收到消息: ${senderNick}`)
      this.logger.debug('DINGTALK', '消息详情', {
        conversationId,
        senderNick,
        msgtype,
        hasText: !!text,
        hasSessionWebhook: !!sessionWebhook
      })

      if (msgtype !== 'text') {
        this.logger.warning('DINGTALK', `不支持的消息类型: ${msgtype}`)
        return { status: 'SUCCESS' }
      }

      const messageContent = text?.content?.trim()
      if (!messageContent) {
        this.logger.warning('DINGTALK', '消息内容为空')
        return { status: 'SUCCESS' }
      }

      this.logger.info('DINGTALK', `消息内容: ${messageContent.substring(0, 50)}...`)

      // 🎯 检查是否是命令
      const command = this._parseCommand(messageContent)
      if (command) {
        this.logger.info('COMMAND', `识别到命令: ${command.type}${command.provider ? ` -> ${command.provider}` : ''}`)
        return await this._handleCommand(command, conversationId, sessionWebhook)
      }

      // 🤖 获取当前会话使用的 provider
      const session = this.dingtalk.getSession(conversationId)
      const provider = session?.provider || this.defaultProvider
      const sessionId = session?.sessionId || null
      const connector = this.connectors.get(provider)

      this.logger.debug('DINGTALK', '使用模型', { provider })

      // 🔍 检查 connector 状态
      if (!connector || !connector.connected) {
        this.logger.error('DINGTALK', `Connector ${provider} 未连接`)
        await this._sendReply(sessionWebhook,
          `❌ ${provider.toUpperCase()} 模型不可用\n\n` +
          `💡 输入 help 查看可用模型`
        )
        return { status: 'SUCCESS' }
      }

      // 🔍 会话管理详细日志
      this.logger.success('SESSION', '========== 会话管理诊断 ==========')
      this.logger.success('SESSION', `ConversationID: ${conversationId}`)
      this.logger.success('SESSION', `Provider: ${provider}`)

      const sessionMapSize = this.dingtalk.conversations.size
      this.logger.success('SESSION', `SessionMap 大小: ${sessionMapSize}`)

      if (sessionMapSize > 0) {
        this.logger.success('SESSION', 'SessionMap 内容:', {
          entries: Array.from(this.dingtalk.conversations.entries())
        })
      }

      const isResume = !!sessionId

      this.logger.success('SESSION', `检索到的 SessionID: ${sessionId || 'null'}`)
      this.logger.success('SESSION', `会话模式: ${isResume ? '继续会话' : '新会话'}`)
      this.logger.success('SESSION', '====================================')

      // ⭐ 设置 sessionId 更新回调（用于 Claude 和 IFlow）
      connector.onSessionIdUpdate((realSessionId) => {
        this.dingtalk.setSession(conversationId, realSessionId, provider)
        this.logger.success('SESSION', '✅ 通过回调保存 SessionID', {
          conversationId,
          sessionId: realSessionId,
          sessionMapSize: this.dingtalk.conversations.size
        })
      })

      let messageCount = 0
      let sentMessageCount = 0  // 实际发送的消息数
      const startTime = Date.now()

      // 🔍 用于去重的状态
      let assistantContent = null  // assistant 的内容
      let assistantHash = null     // 内容哈希
      let sessionEndSent = false   // session_end 是否已发送

      this.logger.info('DINGTALK', `开始调用 ${isResume ? 'continueSession' : 'startSession'}...`)

      await new Promise((resolve, reject) => {
        const options = {
          onEvent: async (event) => {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
            const context = { index: ++messageCount, elapsed, sentIndex: sentMessageCount + 1 }

            // 🔍 详细事件日志
            this.logger.info('EVENT', `#${messageCount} [${event.type}]`)

            // 🎯 session_end 去重：只发送一次
            if (event.type === 'session_end') {
              if (sessionEndSent) {
                this.logger.warning('EVENT', '⚠️  session_end 事件已发送，跳过重复')
                return
              }
              sessionEndSent = true
              this.logger.info('EVENT', '✅ 首次 session_end 事件，正常处理')
            }

            // 打印事件内容（用于诊断重复）
            if (event.type === 'assistant') {
              const text = event.message?.content
                ?.filter(c => c.type === 'text')
                ?.map(c => c.text)
                ?.join('') || ''
              this.logger.info('EVENT', `Assistant 内容: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}" (${text.length} 字符)`)

              // 保存 assistant 内容用于去重检测
              assistantContent = text
              assistantHash = this._hashContent(text)
            }
            else if (event.type === 'result') {
              const result = event.result || ''
              this.logger.info('EVENT', `Result 内容: "${result.substring(0, 100)}${result.length > 100 ? '...' : ''}" (${result.length} 字符)`)

              // 🔍 检测是否与 assistant 重复
              if (config.streaming.deduplicateResult && assistantContent) {
                const resultHash = this._hashContent(result)

                if (assistantHash === resultHash) {
                  this.logger.warning('EVENT', `⚠️  Result 与 Assistant 内容相同，跳过发送`)
                  this.logger.info('EVENT', `  Assistant 哈希: ${assistantHash}`)
                  this.logger.info('EVENT', `  Result 哈希: ${resultHash}`)
                  return  // ← 跳过此事件，不发送
                } else {
                  this.logger.info('EVENT', `✅ Result 与 Assistant 内容不同，正常发送`)
                }
              }
            }
            else if (event.type === 'thinking') {
              const content = event.content?.substring(0, 100) || ''
              this.logger.debug('EVENT', `Thinking: "${content}..."`)
            }
            else if (event.type === 'tool_start') {
              this.logger.debug('EVENT', `工具开始: ${event.tool}`)
            }
            else if (event.type === 'tool_output') {
              const output = event.output?.substring(0, 100) || ''
              this.logger.debug('EVENT', `工具输出: "${output}..."`)
            }

            // 捕获 sessionId
            if (!isResume && event.type === 'system' && event.extra?.session_id) {
              sessionId = event.extra.session_id
              this.dingtalk.setSession(conversationId, sessionId, provider)
              this.logger.success('SESSION', '✅ 保存 SessionID 到 SessionMap', {
                conversationId,
                sessionId,
                sessionMapSize: this.dingtalk.conversations.size
              })
            }

            // 流式发送
            if (config.streaming.enabled) {
              const formatted = this.messageFormatter.formatEvent(event, context)
              if (formatted) {
                sentMessageCount++
                this.logger.info('DINGTALK', `✅ 发送消息 #${sentMessageCount}/${messageCount} (${formatted.msgtype})`)
                try {
                  await this.dingtalk.send(sessionWebhook, formatted)
                  this.logger.debug('DINGTALK', `发送成功`)
                } catch (error) {
                  this.logger.error('DINGTALK', '发送失败', { error: error.message })
                }
              } else {
                this.logger.debug('EVENT', `事件 ${event.type} 未格式化（跳过）`)
              }
            }
          },
          onComplete: async (exitCode) => {
            const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
            this.logger.success('SESSION', `✅ 完成，退出码: ${exitCode}, 耗时: ${totalTime}s, 事件数: ${messageCount}, 发送数: ${sentMessageCount}`)

            // 🎯 发送完成消息到钉钉（如果配置启用且还未发送）
            if (config.streaming.showCompletionSummary && !sessionEndSent) {
              try {
                this.logger.info('DINGTALK', '准备发送完成消息（onComplete）')
                const context = { index: messageCount, elapsed: totalTime }
                const completionEvent = {
                  type: 'session_end',
                  exitCode: exitCode
                }
                const formatted = this.messageFormatter.formatEvent(completionEvent, context)

                if (formatted && sessionWebhook) {
                  await this.dingtalk.send(sessionWebhook, formatted)
                  this.logger.success('DINGTALK', '✅ 完成消息已发送（onComplete）')
                }
              } catch (error) {
                this.logger.error('DINGTALK', '发送完成消息失败', { error: error.message })
              }
            } else if (sessionEndSent) {
              this.logger.info('DINGTALK', 'ℹ️  session_end 已在 onEvent 中发送，跳过 onComplete 中的发送')
            } else if (!config.streaming.showCompletionSummary) {
              this.logger.info('DINGTALK', 'ℹ️  完成总结已禁用，不发送')
            }

            resolve()
          },
          onError: (error) => {
            this.logger.error('SESSION', '❌ 错误', { error: error.message, stack: error.stack })
            reject(error)
          }
        }

        if (isResume) {
          this.logger.debug('DINGTALK', `调用 continueSession: ${sessionId}`)
          connector.continueSession(sessionId, messageContent, options)
        } else {
          this.logger.debug('DINGTALK', '调用 startSession')
          connector.startSession(messageContent, options)
        }

        this.logger.info('DINGTALK', '✅ Session 方法已调用，等待事件...')
      })

      return { status: 'SUCCESS' }
    } catch (error) {
      this.logger.error('DINGTALK', '处理失败', { error: error.message })
      return { status: 'LATER', message: error.message }
    }
  }

  async shutdown() {
    this.logger.info('SERVER', '正在关闭...')

    // 停止定时任务
    if (this.scheduler) {
      this.scheduler.stop()
    }

    if (this.connector) {
      const sessions = this.connector.getActiveSessions()
      sessions.forEach(sid => this.connector.interruptSession(sid))
      this.logger.info('CONNECTOR', '所有会话已中断')
    }

    await this.dingtalk.close()
    process.exit(0)
  }
}

// 启动服务器
const server = new UnifiedServer()
server.start().catch(error => {
  console.error('启动失败:', error)
  process.exit(1)
})

// 优雅关闭
process.on('SIGINT', () => server.shutdown())
process.on('SIGTERM', () => server.shutdown())

module.exports = UnifiedServer
