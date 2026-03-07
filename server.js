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

// 首先加载环境变量（覆盖已存在的环境变量）
require('dotenv').config({ override: true })

const express = require('express')
const config = require('./utils/config')
const Logger = require('./integrations/logger')
const RateLimiter = require('./utils/message-rate-limiter')
const DingTalkIntegration = require('./integrations/dingtalk')
const QQBotIntegration = require('./integrations/qqbot')
const MessageFormatter = require('./utils/message-formatter')
const ClaudeConnector = require('./connectors/claude-connector')
const IFlowConnector = require('./connectors/iflow-connector')
const CodexConnector = require('./connectors/codex-connector')
const { simpleHash } = require('./utils/string-helper')
const SchedulerModule = require('./scheduler')

class UnifiedServer {
  // 命令配置表
  static COMMANDS = {
    'claude': { type: 'switch', provider: 'claude' },
    'iflow': { type: 'switch', provider: 'iflow' },
    'codex': { type: 'switch', provider: 'codex' },
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
    this.qqbot = new QQBotIntegration(config.qqbot, this.logger, this.rateLimiter)

    // 多模型支持
    this.connectors = new Map()  // 'claude' | 'iflow' -> connector instance
    this.defaultProvider = config.provider

    // 定时任务模块
    this.scheduler = null

    this._setupMiddleware()
  }

  _setupMiddleware() {
    // 基础中间件配置
    this.app.use(express.json({ limit: '10mb' }))
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }))
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
            reject(new Error(error.message))
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
    const totalInterrupted = this._interruptAllSessions()

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

  /**
   * API: 手动执行定时任务
   */
  async handleTasksRunApi(req, res) {
    const clientIp = req.ip || req.connection.remoteAddress
    const isLocalhost = clientIp === '127.0.0.1' ||
      clientIp === '::1' ||
      clientIp === '::ffff:127.0.0.1'

    if (!isLocalhost) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: 仅允许本地访问'
      })
    }

    const taskId = req.params.taskId
    if (!taskId) {
      return res.status(400).json({
        success: false,
        error: '请指定任务 ID'
      })
    }

    if (!this.scheduler || !this.scheduler.taskManager) {
      return res.status(503).json({
        success: false,
        error: '定时任务管理器未初始化'
      })
    }

    try {
      this.logger.info('API', `手动执行任务: ${taskId}`)
      const result = await this.scheduler.taskManager.runTask(taskId)
      res.json({
        success: result.success,
        elapsed: result.elapsed,
        error: result.error
      })
    } catch (error) {
      this.logger.error('API', '执行任务失败', { error: error.message })
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  }

  /**
   * 健康检查端点
   * 用于负载均衡器、容器编排系统等监控系统状态
   */
  async handleHealthCheck(req, res) {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: require('./package.json').version
    }

    // 检查 connectors 状态
    const connectorHealth = {}
    for (const [provider, connector] of this.connectors.entries()) {
      connectorHealth[provider] = {
        connected: connector?.connected || false,
        activeSessions: connector?.getActiveSessions()?.length || 0
      }
    }

    // 检查钉钉连接
    const dingtalkHealth = {
      enabled: config.dingtalk.enabled,
      connected: this.dingtalk.client?.connected || false,
      activeSessions: this.dingtalk.getActiveSessions()?.length || 0
    }

    // 如果有任何关键组件不可用，标记为 degraded
    const hasActiveConnectors = Object.values(connectorHealth).some(c => c.connected)
    if (!hasActiveConnectors) {
      health.status = 'degraded'
      health.connectors = connectorHealth
      return res.status(503).json(health)
    }

    health.connectors = connectorHealth
    health.dingtalk = dingtalkHealth

    // 添加内存使用情况
    health.memory = {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
    }

    res.json(health)
  }

  /**
   * 获取所有已连接的 providers
   * @returns {Array<string>} 已连接的 provider 列表
   * @private
   */
  _getConnectedProviders() {
    const providers = []
    for (const [provider, connector] of this.connectors.entries()) {
      if (connector?.connected) {
        providers.push(provider)
      }
    }
    return providers
  }

  /**
   * 获取所有已连接的 connectors 及其版本信息
   * @returns {Object} 包含 providers 和 versions 的对象
   * @private
   */
  _getConnectedProvidersInfo() {
    const providers = []
    const versions = {}
    for (const [provider, connector] of this.connectors.entries()) {
      if (connector?.connected) {
        providers.push(provider)
        if (connector.version) {
          versions[provider] = connector.version
        }
      }
    }
    return { providers, versions }
  }

  /**
   * 中断所有已连接 connector 的会话
   * @returns {number} 中断的会话总数
   * @private
   */
  _interruptAllSessions() {
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
    return totalInterrupted
  }

  /**
   * 获取所有 connector 的指标信息
   * @returns {Object} 包含 connectors 信息和活跃会话数的对象
   * @private
   */
  _getAllConnectorMetrics() {
    const connectors = {}
    let activeSessions = 0
    for (const [provider, connector] of this.connectors.entries()) {
      if (connector) {
        const sessions = connector.getActiveSessions() || []
        connectors[provider] = {
          connected: connector.connected || false,
          activeSessions: sessions.length,
          sessionIds: sessions
        }
        activeSessions += sessions.length
      }
    }
    return { connectors, activeSessions }
  }

  _createConnector(options) {
    switch (config.provider) {
      case 'claude':
        return new ClaudeConnector(options)
      case 'iflow':
        return new IFlowConnector(options)
      case 'codex':
        return new CodexConnector(options)
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

    // 准备 Codex 初始化任务
    if (config.codex.workDir) {
      initTasks.push(this._initConnector('codex', CodexConnector))
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
      const options = await config.getConnectorOptions(provider)
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
    // 🔥 移除可能存在的斜杠前缀（如 /help、/status 等）
    let trimmed = content.trim()

    // 调试日志：显示原始输入和处理后的结果
    this.logger.debug('COMMAND', `📥 原始输入: "${content}"`)
    this.logger.debug('COMMAND', `✂️ Trim后: "${trimmed}"`)

    if (trimmed.startsWith('/')) {
      trimmed = trimmed.substring(1).trim()
      this.logger.debug('COMMAND', `✂️ 移除斜杠后: "${trimmed}"`)
    }

    const parts = trimmed.split(/\s+/)
    this.logger.debug('COMMAND', `🔢 分割结果: [${parts.map(p => `"${p}"`).join(', ')}]`)

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

  async _handleCommand(command, conversationId, replyTarget, platform, originalMessage, type) {
    switch (command.type) {
      case 'switch':
        return await this._handleSwitch(command.provider, conversationId, replyTarget, platform, originalMessage, type)

      case 'interrupt':
        return await this._handleInterrupt(conversationId, replyTarget, platform, originalMessage, type)

      case 'status':
        return await this._handleStatus(conversationId, replyTarget, platform, originalMessage, type)

      case 'help':
        return await this._handleHelp(replyTarget, platform, originalMessage, type)

      // 定时任务命令
      case 'tasks_list':
        return await this._handleTasksList(conversationId, replyTarget, platform, originalMessage, type)

      case 'tasks_status':
        return await this._handleTasksStatus(conversationId, replyTarget, platform, originalMessage, type)

      case 'tasks_reload':
        return await this._handleTasksReload(conversationId, replyTarget, platform, originalMessage, type)

      case 'tasks_run':
        return await this._handleTasksRun(command.arg, conversationId, replyTarget, platform, originalMessage, type)

      case 'tasks_enable':
        return await this._handleTasksEnable(command.arg, conversationId, replyTarget, platform, originalMessage, type)

      case 'tasks_disable':
        return await this._handleTasksDisable(command.arg, conversationId, replyTarget, platform, originalMessage, type)

      default:
        this.logger.warning('COMMAND', `未知命令类型: ${command.type}`)
        return { status: 'SUCCESS' }
    }
  }

  async _handleSwitch(provider, conversationId, replyTarget, platform, originalMessage, type) {
    // 检查 connector 是否可用
    const connector = this.connectors.get(provider)
    if (!connector || !connector.connected) {
      const availableProviders = Array.from(this.connectors.keys()).map(p => p.toUpperCase()).join(', ')
      await platform.send(
        replyTarget,
        `❌ ${provider.toUpperCase()} 模型不可用\n\n💡 可用模型：${availableProviders || '无'}`,
        originalMessage,
        type
      )
      return { status: 'SUCCESS' }
    }

    // 中断当前任务（如果有）
    const currentSession = platform.getSession(conversationId)
    if (currentSession?.sessionId) {
      const currentConnector = this.connectors.get(currentSession.provider)
      if (currentConnector) {
        currentConnector.interruptSession(currentSession.sessionId)
        this.logger.info('PROVIDER', `中断旧任务: ${currentSession.sessionId}`)
      }
    }

    // 切换模型（清空旧 sessionId，保留 provider）
    platform.setSession(conversationId, null, provider)

    const availableProviders = Array.from(this.connectors.keys()).map(p => p.toUpperCase()).join(', ')
    await platform.send(
      replyTarget,
      `✅ 已切换到 ${provider.toUpperCase()} 模型\n\n💡 可用模型：${availableProviders}`,
      originalMessage,
      type
    )

    this.logger.info('PROVIDER', `会话 ${conversationId} 切换到 ${provider}`)
    return { status: 'SUCCESS' }
  }

  async _handleInterrupt(conversationId, replyTarget, platform, originalMessage, type) {
    const session = platform.getSession(conversationId)

    if (!session?.sessionId) {
      await platform.send(replyTarget, '⚠️ 没有运行中的任务', originalMessage, type)
      return { status: 'SUCCESS' }
    }

    const connector = this.connectors.get(session.provider)

    if (connector) {
      connector.interruptSession(session.sessionId)
      platform.deleteSession(conversationId)
      await platform.send(replyTarget, '✅ 任务已中断', originalMessage, type)
      this.logger.info('PROVIDER', `会话 ${conversationId} 任务已中断`)
    } else {
      await platform.send(replyTarget, '❌ 无法中断任务：模型不可用', originalMessage, type)
    }

    return { status: 'SUCCESS' }
  }

  async _handleStatus(conversationId, replyTarget, platform, originalMessage, type) {
    const session = platform.getSession(conversationId)
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
    await platform.send(replyTarget, statusText, originalMessage, type)

    return { status: 'SUCCESS' }
  }

  async _handleHelp(replyTarget, platform, originalMessage, type) {
    const availableProviders = Array.from(this.connectors.entries())
      .filter(([_, conn]) => conn.connected)
      .map(([p, _]) => p.toUpperCase())
      .join(', ')

    const schedulerEnabled = this.scheduler?.enabled || false

    const help = `📖 命令帮助

🤖 模型切换：
  • claude  - 切换到 Claude 模型
  • iflow  - 切换到 IFlow 模型
  • codex  - 切换到 Codex 模型

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

    await platform.send(replyTarget, help.trim(), originalMessage, type)
    return { status: 'SUCCESS' }
  }

  // ==================== 定时任务命令处理 ====================

  async _handleTasksList(conversationId, replyTarget, platform, originalMessage, type) {
    if (!this.scheduler || !this.scheduler.enabled) {
      await platform.send(replyTarget, '⚠️ 定时任务功能未启用', originalMessage, type)
      return { status: 'SUCCESS' }
    }

    const status = this.scheduler.getStatus()

    if (status.tasks.length === 0) {
      await platform.send(replyTarget, '📋 暂无定时任务', originalMessage, type)
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

    await platform.send(replyTarget, lines.join('\n'), originalMessage, type)
    return { status: 'SUCCESS' }
  }

  async _handleTasksStatus(conversationId, replyTarget, platform, originalMessage, type) {
    if (!this.scheduler) {
      await platform.send(replyTarget, '⚠️ 定时任务管理器未初始化', originalMessage, type)
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

    await platform.send(replyTarget, lines.join('\n'), originalMessage, type)
    return { status: 'SUCCESS' }
  }

  async _handleTasksReload(conversationId, replyTarget, platform, originalMessage, type) {
    if (!this.scheduler) {
      await platform.send(replyTarget, '⚠️ 定时任务管理器未初始化', originalMessage, type)
      return { status: 'SUCCESS' }
    }

    try {
      await this.scheduler.taskManager.reload()
      await platform.send(replyTarget, '✅ 任务配置已重载', originalMessage, type)
    } catch (error) {
      await platform.send(replyTarget, `❌ 重载失败: ${error.message}`, originalMessage, type)
    }

    return { status: 'SUCCESS' }
  }

  async _handleTasksRun(taskId, conversationId, replyTarget, platform, originalMessage, type) {
    if (!this.scheduler || !this.scheduler.enabled) {
      await platform.send(replyTarget, '⚠️ 定时任务功能未启用', originalMessage, type)
      return { status: 'SUCCESS' }
    }

    if (!taskId) {
      await platform.send(replyTarget, '❌ 请指定任务 ID：tasks run <id>', originalMessage, type)
      return { status: 'SUCCESS' }
    }

    try {
      const result = await this.scheduler.taskManager.runTask(taskId)

      if (result.success) {
        await platform.send(replyTarget,
          `✅ 任务执行完成\n耗时: ${result.elapsed}s`, originalMessage, type
        )
      } else {
        await platform.send(replyTarget,
          `❌ 任务执行失败: ${result.error}`, originalMessage, type
        )
      }
    } catch (error) {
      await platform.send(replyTarget,
        `❌ 执行失败: ${error.message}`, originalMessage, type
      )
    }

    return { status: 'SUCCESS' }
  }

  async _handleTasksEnable(taskId, conversationId, replyTarget, platform, originalMessage, type) {
    if (!this.scheduler || !this.scheduler.enabled) {
      await platform.send(replyTarget, '⚠️ 定时任务功能未启用', originalMessage, type)
      return { status: 'SUCCESS' }
    }

    if (!taskId) {
      await platform.send(replyTarget, '❌ 请指定任务 ID：tasks enable <id>', originalMessage, type)
      return { status: 'SUCCESS' }
    }

    try {
      this.scheduler.taskManager.enableTask(taskId)
      await platform.send(replyTarget, `✅ 任务已启用: ${taskId}`, originalMessage, type)
    } catch (error) {
      await platform.send(replyTarget, `❌ 启用失败: ${error.message}`, originalMessage, type)
    }

    return { status: 'SUCCESS' }
  }

  async _handleTasksDisable(taskId, conversationId, replyTarget, platform, originalMessage, type) {
    if (!this.scheduler || !this.scheduler.enabled) {
      await platform.send(replyTarget, '⚠️ 定时任务功能未启用', originalMessage, type)
      return { status: 'SUCCESS' }
    }

    if (!taskId) {
      await platform.send(replyTarget, '❌ 请指定任务 ID：tasks disable <id>', originalMessage, type)
      return { status: 'SUCCESS' }
    }

    try {
      this.scheduler.taskManager.disableTask(taskId)
      await platform.send(replyTarget, `✅ 任务已禁用: ${taskId}`, originalMessage, type)
    } catch (error) {
      await platform.send(replyTarget, `❌ 禁用失败: ${error.message}`, originalMessage, type)
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
    const dingtalkEnabled = await this.dingtalk.connect(this.handleDingTalkMessage.bind(this))
    if (dingtalkEnabled) {
      this.logger.success('DINGTALK', '钉钉集成已启动')
    }

    // 启动 QQ Bot 集成（传入messageHandler，像钉钉一样）
    const qqbotEnabled = await this.qqbot.connect(this.handleQQBotMessage.bind(this))
    if (qqbotEnabled) {
      this.logger.success('QQBOT', 'QQ Bot 集成已启动')
    }

    // 启动定时任务模块
    this.scheduler = new SchedulerModule(this, this.logger)
    await this.scheduler.start()

    // 启动 HTTP 服务器（仅在端口配置时）
    if (config.port) {
      this.app.listen(config.port, () => {
        this.logger.log('\n========================================')
        this.logger.log('  Unified AI CLI Connector Server')
        this.logger.log('========================================')
        this.logger.log(`\n🌐 服务器运行在: http://localhost:${config.port}`)
        this.logger.log(`🤖 提供商: ${config.provider.toUpperCase()}`)
        this.logger.log(`📱 钉钉: ${dingtalkEnabled ? '✅ 已启用' : '❌ 未启用'}`)
        this.logger.log('\n按 Ctrl+C 停止服务器\n')
      })
    } else {
      this.logger.log('\n========================================')
      this.logger.log('  Unified AI CLI Connector Server')
      this.logger.log('========================================')
      this.logger.log(`\n🤖 提供商: ${config.provider.toUpperCase()}`)
      this.logger.log(`📱 钉钉: ${dingtalkEnabled ? '✅ 已启用' : '❌ 未启用'}`)
      this.logger.log(`🌐 API: 未启用（未配置端口）`)
      this.logger.log('\n按 Ctrl+C 停止服务器\n')
    }
  }

  // ==================== 统一的平台消息处理 ====================

  /**
   * 统一的平台消息处理函数
   * @param {BasePlatformIntegration} platform - 平台集成实例
   * @param {object} rawMessage - 原始消息
   * @param {string} conversationId - 会话ID
   * @param {object} replyTarget - 回复目标
   * @param {object} extra - 额外参数 { type }
   * @returns {Promise<{status: string, message?: string}>}
   */
  async _handlePlatformMessage(platform, rawMessage, conversationId, replyTarget, extra = {}) {
    const platformName = platform.constructor.name.replace('Integration', '').toUpperCase()
    const { type } = extra

    try {
      // 1. 提取消息内容
      const content = platform.extractContent(rawMessage)
      if (!content) {
        this.logger.warning(platformName, '消息内容为空')
        return { status: 'SUCCESS' }
      }

      this.logger.success(platformName, `📨 原始消息: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`)

      // 2. 解析命令
      const command = this._parseCommand(content)
      if (command) {
        this.logger.success('COMMAND', `✅ 识别到命令: ${command.type}${command.provider ? ` -> ${command.provider}` : ''}`)
        return await this._handleCommand(command, conversationId, replyTarget, platform, rawMessage, type)
      }

      // 3. 获取会话
      let session = platform.getSession(conversationId)
      let provider = session?.provider || this.defaultProvider
      let sessionId = session?.sessionId || null

      this.logger.debug(platformName, '使用模型', { provider, hasSessionId: !!sessionId })

      // 4. 获取connector
      const connector = this.connectors.get(provider)
      if (!connector || !connector.connected) {
        const errorMsg = `❌ ${provider.toUpperCase()} 模型不可用\n\n💡 输入 help 查看可用模型`
        await platform.send(replyTarget, errorMsg, rawMessage, type)
        return { status: 'SUCCESS' }
      }

      // 5. 调用agent
      await new Promise((resolve, reject) => {
        const options = {
          onEvent: async (event) => {
            try {
              // 只处理核心事件
              if (event.type === 'assistant' || event.type === 'result') {
                const text = this._extractTextFromEvent(event)
                if (text) {
                  this.logger.info(platformName, `📤 发送回复 (${text.length} 字符)`)
                  await platform.send(replyTarget, text, rawMessage, type)
                }
              } else if (event.type === 'system' && event.extra?.session_id) {
                sessionId = event.extra.session_id
                platform.setSession(conversationId, sessionId, provider)
                this.logger.success('SESSION', `✅ 保存SessionID: ${sessionId}`)
              }
            } catch (error) {
              this.logger.error(platformName, `onEvent 处理失败: ${error.message}`)
              // 不抛出异常，让会话继续
            }
          },
          onComplete: (exitCode) => {
            this.logger.success(platformName, `✅ 会话完成，退出码: ${exitCode}`)
            resolve()
          },
          onError: (error) => {
            this.logger.error(platformName, `❌ 会话错误: ${error.message}`)
            reject(error)
          }
        }

        if (sessionId) {
          this.logger.debug(platformName, `调用 continueSession: ${sessionId}`)
          connector.continueSession(sessionId, content, options)
        } else {
          this.logger.debug(platformName, '调用 startSession')
          connector.startSession(content, options)
        }
      })

      return { status: 'SUCCESS' }
    } catch (error) {
      this.logger.error(platformName, `❌ 处理失败: ${error.message}`)
      return { status: 'LATER', message: error.message }
    }
  }

  /**
   * 从事件中提取文本
   * @param {object} event - 事件对象
   * @returns {string}
   */
  _extractTextFromEvent(event) {
    // 方式1: event.message.content 数组格式
    if (event.message?.content && Array.isArray(event.message.content)) {
      return event.message.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('')
    }

    // 方式2: event.result 字符串格式
    if (event.result) {
      return event.result
    }

    return ''
  }

  /**
   * 统一的命令处理
   * @param {object} command - 命令对象
   * @param {string} conversationId - 会话ID
   * @param {object} replyTarget - 回复目标
   * @param {BasePlatformIntegration} platform - 平台集成实例
   * @returns {Promise<{status: string}>}
   */
  // ==================== 钉钉消息处理 ====================

  async handleDingTalkMessage(message) {
    const timestamp = new Date().toISOString()
    this.logger.success('DINGTALK', '========== 钉钉消息接收 ==========')
    this.logger.success('DINGTALK', `时间戳: ${timestamp}`)

    const { headers } = message
    const { messageId } = headers

    this.logger.success('DINGTALK', `MessageID: ${messageId || 'null'}`)

    // 消息去重（基类会处理）
    if (messageId && this.dingtalk.isProcessed(messageId)) {
      this.logger.warning('DINGTALK', '⚠️  消息已处理，跳过')
      return { status: 'SUCCESS' }
    }

    // 标记为已处理
    if (messageId) {
      this.dingtalk.markAsProcessed(messageId)
    }

    // 获取回复目标
    const conversationId = this.dingtalk.getConversationId(message)
    const replyTarget = this.dingtalk.getReplyTarget(message)

    // 调用统一处理函数
    return this._handlePlatformMessage(this.dingtalk, message, conversationId, replyTarget)
  }

  /**
   * 启动内存监控
   * 定期记录内存使用情况，帮助发现内存泄漏
   * @private
   */
  _startMemoryMonitor() {
    // 检查是否启用内存监控
    const enabled = process.env.MEMORY_MONITOR_ENABLED !== 'false'
    const intervalMs = parseInt(process.env.MEMORY_MONITOR_INTERVAL || '300000', 10) // 默认5分钟

    if (!enabled) {
      this.logger.debug('SERVER', '内存监控已禁用')
      return
    }

    this.memoryMonitorInterval = setInterval(() => {
      const memUsage = process.memoryUsage()
      const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024)
      const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024)
      const rssMB = Math.round(memUsage.rss / 1024 / 1024)
      const externalMB = Math.round(memUsage.external / 1024 / 1024)

      // 计算堆内存使用率
      const heapUsagePercent = ((heapUsedMB / heapTotalMB) * 100).toFixed(1)

      // 记录内存使用情况
      this.logger.info('MEMORY', `内存使用情况`, {
        heap: `${heapUsedMB}MB / ${heapTotalMB}MB (${heapUsagePercent}%)`,
        rss: `${rssMB}MB`,
        external: `${externalMB}MB`,
        arrayBuffers: `${Math.round(memUsage.arrayBuffers / 1024 / 1024)}MB`
      })

      // 内存使用率超过 80% 时发出警告
      if (parseFloat(heapUsagePercent) > 80) {
        this.logger.warning('MEMORY', `⚠️ 内存使用率过高: ${heapUsagePercent}%`, {
          heap: `${heapUsedMB}MB / ${heapTotalMB}MB`,
          recommendation: '建议检查内存泄漏或增加堆内存限制'
        })
      }
    }, intervalMs)

    this.logger.info('SERVER', `✓ 内存监控已启动 (间隔: ${intervalMs}ms)`)
  }

  async shutdown() {
    this.logger.info('SERVER', '正在优雅关闭...')

    try {
      // 🆕 停止内存监控
      if (this.memoryMonitorInterval) {
        clearInterval(this.memoryMonitorInterval)
        this.logger.info('SERVER', '✓ 内存监控已停止')
      }

      // 停止定时任务
      if (this.scheduler) {
        this.scheduler.stop()
        this.logger.info('SCHEDULER', '✓ 定时任务已停止')
      }

      // 中断所有活跃会话
      if (this.connectors) {
        for (const [provider, connector] of this.connectors.entries()) {
          try {
            const sessions = connector.getActiveSessions ? connector.getActiveSessions() : []
            if (Array.isArray(sessions) && sessions.length > 0) {
              sessions.forEach(sid => {
                if (connector.interruptSession) {
                  connector.interruptSession(sid)
                }
              })
              this.logger.info('CONNECTOR', `✓ ${provider} 会话已中断: ${sessions.length} 个`)
            }

            // 关闭连接器
            if (connector.close) {
              await connector.close()
            }
          } catch (error) {
            this.logger.warning('CONNECTOR', `${provider} 关闭失败: ${error.message}`)
          }
        }
      }

      // 关闭钉钉连接
      await this.dingtalk.close()
      this.logger.info('DINGTALK', '✓ 钉钉连接已关闭')

      this.logger.success('SERVER', '✓ 服务器已安全关闭')

      // 🆕 添加短暂延迟确保日志输出
      await new Promise(resolve => setTimeout(resolve, 100))

      process.exit(0)
    } catch (error) {
      this.logger.error('SERVER', `关闭过程中出错: ${error.message}`)
      process.exit(1)
    }
  }

  // ==================== QQ Bot 消息处理 ====================

  /**
   * 处理 QQ Bot 消息
   * @param {Object} message - QQ 消息对象
   * @param {string} type - 消息类型 (channel/at/direct/c2c)
   * @param {string} conversationId - 会话 ID
   */
  async handleQQBotMessage(message, type, conversationId) {
    const timestamp = new Date().toISOString()
    this.logger.success('QQBOT', '========== QQ 消息接收 ==========')
    this.logger.success('QQBOT', `时间戳: ${timestamp}`)
    this.logger.success('QQBOT', `消息类型: ${type}`)
    this.logger.success('QQBOT', `会话 ID: ${conversationId}`)

    // QQ的消息去重已在集成模块中处理
    // 调用统一处理函数
    return this._handlePlatformMessage(
      this.qqbot,
      message,
      conversationId,
      message,  // QQ需要原始消息作为回复目标
      { type }  // 传递type参数
    )
  }

  /**
   * 发送 QQ Bot 回复
   */
  async _sendQQBotReply(originalMessage, type, content) {
    try {
      // 根据消息类型构造不同的回复选项
      // C2C 私信的 msg_id 参数要求严格，需要使用正确的消息 ID
      let replyOptions = {}
      
      if (type === 'c2c') {
        // C2C 私信：使用 message.id 作为被动回复的 msg_id
        // 如果 msg_id 无效，API 会返回 40034024 错误
        replyOptions = {
          msgId: undefined
        }
      } else {
        // 频道消息和私信
        replyOptions = {
          msgId: originalMessage?.id,
          eventId: originalMessage?.event_id
        }
      }

      switch (type) {
        case 'channel':
        case 'at':
          await this.qqbot.client.sendMessage(originalMessage.channel_id, content, replyOptions)
          break
        case 'direct':
          await this.qqbot.client.sendDirectMessage(originalMessage.guild_id, content, replyOptions)
          break
        case 'c2c':
          await this.qqbot.client.sendC2CMessage(originalMessage.author.user_openid, content, replyOptions)
          break
      }
    } catch (error) {
      this.logger.error('QQBOT', `发送回复失败: ${error.message}`)
    }
  }

  /**
   * 上传文件到 QQ 并发送
   * @private
   * @param {object} originalMessage - 原始消息对象
   * @param {string} type - 消息类型 (channel/at/direct/c2c)
   * @param {string} filePath - 本地文件路径
   * @param {string} fileType - 文件类型 (image/audio/video/file)
   * @param {string} caption - 说明文字
   * @returns {Promise<{url: string, type: string}>}
   */
  async _uploadAndSendFile(originalMessage, type, filePath, fileType, caption = '') {
    const FileHelper = require('./utils/file-helper')

    // 1. 验证文件
    try {
      FileHelper.validateFile(filePath)
    } catch (error) {
      throw new Error(`文件验证失败: ${error.message}`)
    }

    // 2. 检查文件大小（QQ 限制 100MB）
    const maxSize = 100 * 1024 * 1024 // 100MB
    if (FileHelper.isFileSizeExceeded(filePath, maxSize)) {
      const stats = FileHelper.validateFile(filePath)
      const fileSize = FileHelper.formatFileSize(stats.size)
      throw new Error(`文件大小超过限制（${fileSize} > 100MB）`)
    }

    // 3. 自动检测文件类型（如果未指定）
    const detectedType = FileHelper.detectFileType(filePath)
    const finalFileType = fileType || detectedType

    this.logger.info('QQBOT', `文件类型: ${finalFileType}, 文件大小: ${FileHelper.formatFileSize(FileHelper.validateFile(filePath).size)}`)

    // 4. 确定频道 ID
    let channelId
    switch (type) {
      case 'channel':
      case 'at':
        channelId = originalMessage.channel_id
        break
      case 'direct':
        channelId = originalMessage.dms_channel_id
        break
      case 'c2c':
        // C2C 需要特殊处理
        return await this._sendC2CFile(originalMessage.author?.user_openid, filePath, finalFileType, caption)
      default:
        throw new Error(`不支持的消息类型: ${type}`)
    }

    if (!channelId) {
      throw new Error('无法确定频道 ID')
    }

    // 5. 上传文件
    this.logger.info('QQBOT', `开始上传文件: ${filePath}`)
    const uploadResult = await this.qqbot.client.uploadFile(channelId, filePath, finalFileType)
    this.logger.success('QQBOT', `✅ 文件上传成功: ${uploadResult.url}`)

    // 6. 构造回复选项
    let replyOptions = {
      msgId: originalMessage?.id,
      eventId: originalMessage?.event_id
    }

    let messageContent = caption

    // 7. 根据文件类型附加到消息
    switch (finalFileType) {
      case 'image':
        replyOptions.image = uploadResult.url
        break
      case 'audio':
        replyOptions.audio = uploadResult.url
        break
      case 'video':
        replyOptions.video = uploadResult.url
        break
      case 'file':
        // 文件类型在消息中包含 URL
        messageContent = `${caption}\n\n📎 文件链接：${uploadResult.url}`.trim()
        break
    }

    // 8. 发送消息
    switch (type) {
      case 'channel':
      case 'at':
        await this.qqbot.client.sendMessage(channelId, messageContent, replyOptions)
        break
      case 'direct':
        await this.qqbot.client.sendDirectMessage(originalMessage.guild_id, messageContent, replyOptions)
        break
    }

    return { url: uploadResult.url, type: finalFileType }
  }

  /**
   * C2C 私信文件发送（特殊处理）
   * @private
   * @param {string} openid - 用户 OpenID
   * @param {string} filePath - 文件路径
   * @param {string} fileType - 文件类型
   * @param {string} caption - 说明文字
   * @returns {Promise<{url: string, type: string}>}
   */
  async _sendC2CFile(openid, filePath, fileType, caption) {
    const FileHelper = require('./utils/file-helper')

    if (!openid) {
      throw new Error('C2C 消息缺少 user_openid')
    }

    try {
      // 1. 验证文件
      FileHelper.validateFile(filePath)

      // 2. 检查文件大小
      const maxSize = 100 * 1024 * 1024 // 100MB
      if (FileHelper.isFileSizeExceeded(filePath, maxSize)) {
        const stats = FileHelper.validateFile(filePath)
        const fileSize = FileHelper.formatFileSize(stats.size)
        throw new Error(`文件大小超过限制（${fileSize} > 100MB）`)
      }

      this.logger.info('QQBOT', `C2C 文件上传: ${filePath} (${fileType})`)
      this.logger.info('QQBOT', `文件大小: ${FileHelper.formatFileSize(FileHelper.validateFile(filePath).size)}`)

      // 3. 上传文件到 QQ 服务器
      const fileUrl = await this.qqbot.client.uploadC2CFile(openid, filePath, fileType)
      this.logger.success('QQBOT', `✅ C2C 文件上传成功: ${fileUrl}`)

      // 4. 构造消息
      let messageContent = caption
      let options = {}

      // 根据文件类型附加到消息
      switch (fileType) {
        case 'image':
          options.image = fileUrl
          break
        case 'audio':
          options.audio = fileUrl
          break
        case 'video':
          options.video = fileUrl
          break
        case 'file':
          messageContent = `${caption}\n\n📎 文件链接：${fileUrl}`.trim()
          break
      }

      // 5. 发送富媒体消息
      await this.qqbot.client.sendC2CMessage(openid, messageContent, options)
      this.logger.success('QQBOT', `✅ C2C 消息发送成功`)

      return { url: fileUrl, type: fileType }

    } catch (error) {
      this.logger.error('QQBOT', `C2C 文件发送失败: ${error.message}`)

      // 失败时回退到发送文件路径提示
      const fallbackMessage = `${caption}\n\n⚠️ 文件上传失败\n\n📎 文件路径：${filePath}\n\n❌ 错误：${error.message}`.trim()
      await this.qqbot.client.sendC2CMessage(openid, fallbackMessage, {})

      return { url: filePath, type: fileType, error: error.message }
    }
  }

  /**
   * 处理 QQ Bot 命令
   */
  async _handleQQBotCommand(command, conversationId, message, type) {
    let response = ''

    switch (command.type) {
      case 'switch':
        try {
          this.qqbot.setSession(conversationId, null, command.provider)
          response = `✅ 已切换到: ${command.provider.toUpperCase()}`
        } catch (error) {
          response = `❌ 切换失败: ${error.message}`
        }
        break

      case 'status':
        const currentAgent = this.qqbot.getSession(conversationId)
        response = `📊 系统状态\n\n`
        response += `当前 AI: ${currentAgent?.provider || '未设置'}\n`
        response += `连接状态: ✅ 正常\n\n`
        response += `输入 "agents" 查看所有可用 AI`
        break

      case 'interrupt':
        response = '⏹️ 任务已停止'
        break

      case 'help':
        response = `🤖 QQ AI 助手\n\n`
        response += `命令列表:\n`
        response += `  status/状态 - 查看当前状态\n`
        response += `  claude - 切换到 Claude\n`
        response += `  iflow - 切换到 IFlow\n`
        response += `  help/帮助 - 显示帮助\n\n`
        response += `💬 直接发送消息即可开始对话`
        break

      default:
        response = '未知命令，输入 "help" 查看帮助'
    }

    // 发送回复（使用正确的消息类型）
    await this._sendQQBotReply(message, type, response)
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
