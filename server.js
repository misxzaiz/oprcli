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
const DingTalkIntegration = require('./integrations/dingtalk')
const QQBotIntegration = require('./integrations/qqbot')
const ClaudeConnector = require('./connectors/claude-connector')
const IFlowConnector = require('./connectors/iflow-connector')
const CodexConnector = require('./connectors/codex-connector')
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
    'mode': { type: 'mode', hasArg: true },
    '模式': { type: 'mode', hasArg: true },

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
    this.dingtalk = new DingTalkIntegration(config.dingtalk, this.logger)
    this.qqbot = new QQBotIntegration(config.qqbot, this.logger)

    // 多模型支持
    this.connectors = new Map()  // 'claude' | 'iflow' -> connector instance
    this.defaultProvider = config.provider
    this.defaultPromptMode = this._normalizePromptMode(config.systemPrompts?.mode)

    // 定时任务模块
    this.scheduler = null

    this._setupMiddleware()
  }

  _setupMiddleware() {
    // 基础中间件配置
    this.app.use(express.json({ limit: '10mb' }))
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }))
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

      case 'mode':
        return await this._handleMode(command.arg, conversationId, replyTarget, platform, originalMessage, type)

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
    platform.setSession(conversationId, null, provider, { mode: currentSession?.mode || this.defaultPromptMode })

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
    const mode = this._normalizePromptMode(session?.mode || this.defaultPromptMode)
    const sessionId = session?.sessionId || null
    const availableProviders = Array.from(this.connectors.entries())
      .filter(([_, conn]) => conn.connected)
      .map(([p, _]) => p.toUpperCase())
      .join(', ')

    const status = {
      当前模型: provider.toUpperCase(),
      对话模式: mode,
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
  • mode [universal|dev|ops]  - 查看或切换对话模式
  • help / 帮助  - 显示此帮助

💡 可用模型：${availableProviders || '无'}`

    await platform.send(replyTarget, help.trim(), originalMessage, type)
    return { status: 'SUCCESS' }
  }

  _normalizePromptMode(mode) {
    const value = (mode || '').toString().trim().toLowerCase()
    const aliases = {
      all: 'universal',
      general: 'universal',
      full: 'universal',
      universal: 'universal',
      dev: 'dev',
      developer: 'dev',
      coding: 'dev',
      ops: 'ops',
      operation: 'ops'
    }
    return aliases[value] || 'universal'
  }

  async _handleMode(modeArg, conversationId, replyTarget, platform, originalMessage, type) {
    const session = platform.getSession(conversationId)
    const currentProvider = session?.provider || this.defaultProvider
    const currentMode = this._normalizePromptMode(session?.mode || this.defaultPromptMode)

    if (!modeArg) {
      await platform.send(
        replyTarget,
        `🧭 当前模式：${currentMode}\n\n可选模式：universal / dev / ops\n命令示例：mode universal`,
        originalMessage,
        type
      )
      return { status: 'SUCCESS' }
    }

    const rawMode = modeArg.trim().toLowerCase()
    const normalized = this._normalizePromptMode(rawMode)
    const isValidMode = ['universal', 'dev', 'ops', 'all', 'general', 'full', 'developer', 'coding', 'operation'].includes(rawMode)

    if (!isValidMode) {
      await platform.send(
        replyTarget,
        `❌ 不支持的模式：${modeArg}\n可选模式：universal / dev / ops`,
        originalMessage,
        type
      )
      return { status: 'SUCCESS' }
    }

    platform.setSession(conversationId, session?.sessionId || null, currentProvider, { mode: normalized })
    await platform.send(replyTarget, `✅ 已切换对话模式：${normalized}`, originalMessage, type)
    return { status: 'SUCCESS' }
  }

  _buildRuntimeContext({ platformName, type, conversationId, provider, mode }) {
    return {
      platform: (platformName || 'UNKNOWN').toLowerCase(),
      message_type: type || 'default',
      conversation_id: conversationId,
      provider,
      mode,
      work_dir: config.getWorkDir(provider),
      timestamp: new Date().toISOString()
    }
  }

  _buildContextualMessage(content, runtimeContext) {
    const modeInstructions = {
      universal: '优先按通用全能助手风格回答：先结论，后步骤，跨领域可执行。',
      dev: '优先按工程助手风格回答：给出可执行命令、代码和排障步骤。',
      ops: '优先按运维助手风格回答：强调稳定性、风险、回滚与监控建议。'
    }

    const modeBlock = `[MODE_INSTRUCTION]\n${modeInstructions[runtimeContext.mode] || modeInstructions.universal}\n[/MODE_INSTRUCTION]`

    if (config.systemPrompts?.channelAware === false && config.systemPrompts?.includeSourceContext === false) {
      return content
    }

    if (config.systemPrompts?.includeSourceContext === false) {
      return `${modeBlock}\n\n${content}`
    }

    const contextBlock = `[RUNTIME_CONTEXT]\n${JSON.stringify(runtimeContext)}\n[/RUNTIME_CONTEXT]`
    if (config.systemPrompts?.channelAware === false) {
      return `${modeBlock}\n\n${content}`
    }

    return `${contextBlock}\n\n${modeBlock}\n\n${content}`
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
      const mode = this._normalizePromptMode(session?.mode || this.defaultPromptMode)
      const runtimeContext = this._buildRuntimeContext({
        platformName,
        type,
        conversationId,
        provider,
        mode
      })
      const contextualMessage = this._buildContextualMessage(content, runtimeContext)

      this.logger.debug(platformName, '使用模型', { provider, mode, hasSessionId: !!sessionId })

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
                platform.setSession(conversationId, sessionId, provider, { mode })
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
          connector.continueSession(sessionId, contextualMessage, options)
        } else {
          this.logger.debug(platformName, '调用 startSession')
          connector.startSession(contextualMessage, options)
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

  async shutdown() {
    this.logger.info('SERVER', '正在优雅关闭...')

    try {
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
