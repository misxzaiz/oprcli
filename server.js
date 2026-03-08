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
const AuditLogger = require('./integrations/audit-logger')
const RobotEventFormatter = require('./integrations/robot-event-formatter')
const RobotDedup = require('./integrations/robot-dedup')
const DingTalkIntegration = require('./integrations/dingtalk')
const QQBotIntegration = require('./integrations/qqbot')
const ClaudeConnector = require('./connectors/claude-connector')
const IFlowConnector = require('./connectors/iflow-connector')
const CodexConnector = require('./connectors/codex-connector')
const AgentConnector = require('./connectors/agent-connector')
const SchedulerModule = require('./scheduler')
const { parseCommand } = require('./server/commands')
const { dispatchCommand } = require('./server/command-dispatcher')
const { setupHttpRoutes } = require('./server/http-routes')

class UnifiedServer {
  constructor() {
    this.config = config
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
    this.auditLogger = AuditLogger
    this.robotFormatter = new RobotEventFormatter({ maxChars: config.robotStream?.maxChars || 1200 })
    this.robotDedup = new RobotDedup(config.robotStream?.dedupWindowMs || 5000)

    this._setupMiddleware()
    this._setupRoutes()
  }

  _setupMiddleware() {
    // 基础中间件配置
    this.app.use(express.json({ limit: '10mb' }))
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }))
  }

  _setupRoutes() {
    setupHttpRoutes(this)
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

    // 准备 Agent 初始化任务
    if (config.agent.enabled && config.agent.apiKey) {
      initTasks.push(this._initConnector('agent', AgentConnector))
    }

    // 并行执行所有初始化任务
    if (initTasks.length > 0) {
      this.logger.info('CONNECTOR', `并行初始化 ${initTasks.length} 个模型...`)
      const results = await Promise.all(initTasks)

      // 收集结果
      results.forEach(result => {
        if (result.success) {
          const providerName = typeof result.provider === 'string' ? result.provider : String(result.provider)
          this.connectors.set(result.provider, result.connector)
          availableProviders.push(result.provider)
          this.logger.success('CONNECTOR', `${providerName.toUpperCase()} 初始化成功 (版本: ${result.version || 'unknown'})`)
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

      // Agent Connector 需要 server 实例访问定时任务
      if (provider === 'agent') {
        options.server = this
        options.logger = this.logger
      }

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
    return parseCommand(content, this.logger)
  }

  async _handleCommand(command, conversationId, replyTarget, platform, originalMessage, type) {
    return dispatchCommand(this, command, conversationId, replyTarget, platform, originalMessage, type)
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
  • path [目录]  - 查看或设置工作目录
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

  async _handlePath(pathArg, conversationId, replyTarget, platform, originalMessage, type) {
    const session = platform.getSession(conversationId)
    const currentProvider = session?.provider || this.defaultProvider
    const currentWorkDir = session?.workDir || null

    // 如果没有参数，显示当前工作目录信息
    if (!pathArg) {
      const actualWorkDir = config.getWorkDir(currentProvider, currentWorkDir)
      const defaultWorkDir = config.getDefaultWorkDir()
      const projectDir = config.getProjectDir()

      const pathInfo = {
        '当前工作目录': actualWorkDir,
        '默认工作目录': defaultWorkDir,
        '项目目录（文档路径）': projectDir,
        '当前模型': currentProvider.toUpperCase()
      }

      const infoText = `📁 工作目录信息\n\n${Object.entries(pathInfo).map(([k, v]) => `• ${k}：\n  ${v}`).join('\n')}\n\n💡 使用命令：\n/path <目录> - 设置工作目录\n/path ~ - 切换到默认工作目录\n/path reset - 重置为默认工作目录`

      await platform.send(replyTarget, infoText, originalMessage, type)
      return { status: 'SUCCESS' }
    }

    // 处理特殊参数
    const trimmedPath = pathArg.trim().toLowerCase()

    // 切换到默认工作目录
    if (trimmedPath === '~' || trimmedPath === 'reset') {
      platform.setSession(conversationId, session?.sessionId || null, currentProvider, {
        mode: session?.mode || this.defaultPromptMode,
        workDir: null  // 清除会话级别的工作目录设置，使用默认配置
      })

      const defaultDir = config.getDefaultWorkDir()
      await platform.send(
        replyTarget,
        `✅ 已切换到默认工作目录\n\n📍 ${defaultDir}`,
        originalMessage,
        type
      )

      this.logger.info('WORK_DIR', `会话 ${conversationId} 工作目录重置为默认: ${defaultDir}`)
      return { status: 'SUCCESS' }
    }

    // 设置新的工作目录
    const newPath = pathArg.trim()
    const fs = require('fs')

    // 检查目录是否存在
    if (!fs.existsSync(newPath)) {
      await platform.send(
        replyTarget,
        `❌ 目录不存在：${newPath}\n\n💡 请检查路径是否正确`,
        originalMessage,
        type
      )
      return { status: 'SUCCESS' }
    }

    // 检查是否为目录
    try {
      const stats = fs.statSync(newPath)
      if (!stats.isDirectory()) {
        await platform.send(
          replyTarget,
          `❌ 路径不是目录：${newPath}\n\n💡 请提供一个有效的目录路径`,
          originalMessage,
          type
        )
        return { status: 'SUCCESS' }
      }
    } catch (err) {
      await platform.send(
        replyTarget,
        `❌ 无法访问目录：${newPath}\n\n错误：${err.message}`,
        originalMessage,
        type
      )
      return { status: 'SUCCESS' }
    }

    // 设置新的工作目录
    platform.setSession(conversationId, session?.sessionId || null, currentProvider, {
      mode: session?.mode || this.defaultPromptMode,
      workDir: newPath
    })

    await platform.send(
      replyTarget,
      `✅ 工作目录已更新\n\n📍 ${newPath}\n\n💡 使用 /path 查看详细信息`,
      originalMessage,
      type
    )

    this.logger.info('WORK_DIR', `会话 ${conversationId} 工作目录更新为: ${newPath}`)
    return { status: 'SUCCESS' }
  }

  _buildRuntimeContext({ platformName, type, conversationId, provider, mode, sessionWorkDir }) {
    return {
      platform: (platformName || 'UNKNOWN').toLowerCase(),
      message_type: type || 'default',
      conversation_id: conversationId,
      provider,
      mode,
      work_dir: config.getWorkDir(provider, sessionWorkDir),
      project_dir: config.getProjectDir(),
      default_work_dir: config.getDefaultWorkDir(),
      timestamp: new Date().toISOString()
    }
  }

  async _buildContextualMessage(content, runtimeContext, attachments = []) {
    const modeInstructions = {
      universal: '优先按通用全能助手风格回答：先结论，后步骤，跨领域可执行。',
      dev: '优先按工程助手风格回答：给出可执行命令、代码和排障步骤。',
      ops: '优先按运维助手风格回答：强调稳定性、风险、回滚与监控建议。'
    }

    const modeBlock = `[MODE_INSTRUCTION]\n${modeInstructions[runtimeContext.mode] || modeInstructions.universal}\n[/MODE_INSTRUCTION]`
    const modePrompt = await config.getModePrompt(runtimeContext.provider, runtimeContext.mode, runtimeContext.sessionWorkDir)
    const modePromptBlock = modePrompt ? `[MODE_PROMPT]\n${modePrompt}\n[/MODE_PROMPT]` : ''

    // 构建图片附件块（优先使用本地路径）
    let attachmentBlock = ''
    if (attachments && attachments.length > 0) {
      const imageInfos = attachments
        .filter(a => a.type === 'image')
        .map((a, i) => {
          if (a.localPath) {
            // 优先使用已下载的本地文件
            return `[图片${i + 1}] 本地文件: ${a.localPath}`
          } else if (a.content) {
            // 有 base64 数据
            return `[图片${i + 1}] base64数据: ${a.content.substring(0, 100)}...`
          } else if (a.url) {
            // 只有 URL
            return `[图片${i + 1}] URL: ${a.url}`
          }
          return null
        })
        .filter(Boolean)

      if (imageInfos.length > 0) {
        attachmentBlock = `\n\n[ATTACHMENTS]\n用户发送了 ${imageInfos.length} 张图片:\n${imageInfos.join('\n')}\n[/ATTACHMENTS]`
      }
    }

    if (config.systemPrompts?.channelAware === false && config.systemPrompts?.includeSourceContext === false) {
      return `${content}${attachmentBlock}`
    }

    if (config.systemPrompts?.includeSourceContext === false) {
      return `${modePromptBlock ? `${modePromptBlock}\n\n` : ''}${modeBlock}\n\n${content}${attachmentBlock}`
    }

    const contextBlock = `[RUNTIME_CONTEXT]\n${JSON.stringify(runtimeContext)}\n[/RUNTIME_CONTEXT]`
    if (config.systemPrompts?.channelAware === false) {
      return `${modePromptBlock ? `${modePromptBlock}\n\n` : ''}${modeBlock}\n\n${content}${attachmentBlock}`
    }

    return `${contextBlock}\n\n${modePromptBlock ? `${modePromptBlock}\n\n` : ''}${modeBlock}\n\n${content}${attachmentBlock}`
  }

  _mapProviderEventType(event) {
    if (!event || !event.type) return 'unknown'
    if (event.type === 'assistant') return 'assistant_chunk'
    if (event.type === 'result' || event.type === 'done') return 'result'
    if (event.type === 'tool_use') return 'tool_use'
    if (event.type === 'tool_end' || event.type === 'tool_result') return 'tool_result'
    if (event.type === 'session_end') return 'end'
    if (event.type === 'error') return 'error'
    if (event.type.includes('thinking')) return 'thinking_exposed'
    return event.type
  }

  _shouldSendByMode(eventType, cfg) {
    const profile = cfg.profile || 'standard'
    if (profile === 'compact') {
      return eventType === 'assistant_chunk' || eventType === 'result'
    }
    if (profile === 'standard') {
      return ['assistant_chunk', 'result', 'tool_result', 'error', 'end'].includes(eventType)
    }
    return true // full/debug
  }

  _shouldSendEvent(eventType, cfg) {
    if (!cfg.enabled) return eventType === 'assistant_chunk' || eventType === 'result'
    if (!this._shouldSendByMode(eventType, cfg)) return false
    if (cfg.types && cfg.types.length > 0 && !cfg.types.includes(eventType)) return false
    if (eventType === 'thinking_exposed' && !cfg.sendThinking) return false
    if ((eventType === 'http_request' || eventType === 'http_response') && !cfg.sendHttp) return false
    return true
  }

  _trimText(text, maxChars) {
    if (!text) return ''
    const raw = String(text)
    if (raw.length <= maxChars) return raw
    return `${raw.slice(0, maxChars)}...[截断:${raw.length}]`
  }

  _formatEventMessage(eventType, event, extractedText, cfg, elapsedMs) {
    return this.robotFormatter.format(eventType, event, extractedText, {
      profile: cfg.profile,
      elapsedMs
    })
  }

  _shouldSendMessage(traceId, eventType, msg) {
    return this.robotDedup.shouldSend(traceId, eventType, msg)
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
    const traceId = `tr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const startAt = Date.now()
    const streamCfg = config.robotStream || {
      enabled: false,
      profile: 'standard',
      types: [],
      sendThinking: false,
      sendHttp: false,
      maxChars: 1200,
      sendEndSummary: true,
      chunkStrategy: 'throttle'
    }
    const streamState = {
      firstOutputAt: null,
      firstSendAt: null,
      sendCount: 0,
      finalResponseType: 'empty',
      endSent: false
    }

    try {
      this.auditLogger.logAgent('agent.incoming.raw', {
        trace_id: traceId,
        platform: platformName.toLowerCase(),
        conversation_id: conversationId,
        message_type: type || 'default',
        raw_message: rawMessage
      })

      // 1. 提取消息内容（支持图片附件，自动下载）
      const extracted = await platform.extractContent(rawMessage)
      const content = extracted.content || (typeof extracted === 'string' ? extracted : '')
      const attachments = extracted.attachments || []
      
      if (!content && attachments.length === 0) {
        this.logger.warning(platformName, '消息内容为空')
        this.auditLogger.logAgent('agent.incoming.empty', {
          trace_id: traceId,
          platform: platformName.toLowerCase(),
          conversation_id: conversationId
        })
        return { status: 'SUCCESS' }
      }

      this.logger.success(platformName, `📨 原始消息: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"${attachments.length > 0 ? ` [${attachments.length}个附件]` : ''}`)
      this.auditLogger.logAgent('agent.incoming.extracted', {
        trace_id: traceId,
        platform: platformName.toLowerCase(),
        conversation_id: conversationId,
        content,
        attachments: attachments.map(a => ({ type: a.type, hasUrl: !!a.url }))
      })

      // 2. 解析命令
      const command = this._parseCommand(content)
      if (command) {
        this.logger.success('COMMAND', `✅ 识别到命令: ${command.type}${command.provider ? ` -> ${command.provider}` : ''}`)
        this.auditLogger.logAgent('agent.command', {
          trace_id: traceId,
          platform: platformName.toLowerCase(),
          conversation_id: conversationId,
          command
        })
        return await this._handleCommand(command, conversationId, replyTarget, platform, rawMessage, type)
      }

      // 3. 获取会话
      let session = platform.getSession(conversationId)
      let provider = session?.provider || this.defaultProvider
      let sessionId = session?.sessionId || null

      console.log(`[DEBUG] 读取会话: conversationId=${conversationId}, sessionId=${sessionId}, found=${!!session}`)

      this.auditLogger.logAgent('agent.session.read', {
        trace_id: traceId,
        platform: platformName.toLowerCase(),
        conversation_id: conversationId,
        found: !!session,
        session_id: sessionId,
        provider
      })
      const mode = this._normalizePromptMode(session?.mode || this.defaultPromptMode)
      const runtimeContext = this._buildRuntimeContext({
        platformName,
        type,
        conversationId,
        provider,
        mode,
        sessionWorkDir: session?.workDir || null
      })
      const contextualMessage = await this._buildContextualMessage(content, runtimeContext, attachments)
      this.auditLogger.logAgent('agent.request', {
        trace_id: traceId,
        platform: platformName.toLowerCase(),
        conversation_id: conversationId,
        provider,
        mode,
        runtime_context: runtimeContext,
        request_message: contextualMessage
      })

      this.logger.debug(platformName, '使用模型', { provider, mode, hasSessionId: !!sessionId })

      // 4. 获取connector
      const connector = this.connectors.get(provider)
      if (!connector || !connector.connected) {
        const errorMsg = `❌ ${provider.toUpperCase()} 模型不可用\n\n💡 输入 help 查看可用模型`
        this.auditLogger.logAgent('agent.error.connector_unavailable', {
          trace_id: traceId,
          platform: platformName.toLowerCase(),
          conversation_id: conversationId,
          provider
        })
        await platform.send(replyTarget, errorMsg, rawMessage, type)
        return { status: 'SUCCESS' }
      }

      // 5. 调用agent
      await new Promise(async (resolve, reject) => {
        const options = {
          onEvent: async (event) => {
            try {
              // 只处理核心事件
              const mappedType = this._mapProviderEventType(event)
              const extractedText = this._extractTextFromEvent(event)
              const elapsed = Date.now() - startAt

              if (mappedType === 'assistant_chunk' || mappedType === 'result') {
                this.auditLogger.logAgent('agent.event.output', {
                  trace_id: traceId,
                  platform: platformName.toLowerCase(),
                  conversation_id: conversationId,
                  provider,
                  event_type: event.type,
                  mapped_type: mappedType,
                  raw_event: event,
                  extracted_text: extractedText
                })
              } else if (mappedType === 'tool_use' || mappedType === 'tool_result') {
                this.auditLogger.logAgent('agent.event.tool', {
                  trace_id: traceId,
                  platform: platformName.toLowerCase(),
                  conversation_id: conversationId,
                  provider,
                  event_type: event.type,
                  mapped_type: mappedType,
                  raw_event: event
                })
              }

              if (mappedType === 'end') {
                this.auditLogger.logAgent('agent.event.end_suppressed', {
                  trace_id: traceId,
                  platform: platformName.toLowerCase(),
                  conversation_id: conversationId,
                  provider,
                  event_type: event.type,
                  mapped_type: mappedType
                })
              } else if (this._shouldSendEvent(mappedType, streamCfg)) {
                const msg = this._formatEventMessage(mappedType, event, extractedText, streamCfg, elapsed)
                if (msg) {
                  const sendDecision = this._shouldSendMessage(traceId, mappedType, msg)
                  if (!sendDecision.send) {
                    this.auditLogger.logAgent('agent.event.skip_send', {
                      trace_id: traceId,
                      platform: platformName.toLowerCase(),
                      conversation_id: conversationId,
                      provider,
                      mapped_type: mappedType,
                      reason: sendDecision.reason,
                      formatted_preview: msg
                    })
                  } else {
                    if (!streamState.firstOutputAt && (mappedType === 'assistant_chunk' || mappedType === 'result' || mappedType === 'tool_result')) {
                      streamState.firstOutputAt = Date.now()
                      streamState.finalResponseType = mappedType
                    }
                    this.logger.info(platformName, `?? ??????: ${mappedType} (${msg.length} ??)`)
                    await platform.send(replyTarget, msg, rawMessage, type, {
                      traceId,
                      conversationId,
                      provider,
                      platform: platformName.toLowerCase(),
                      messageType: type || 'default',
                      streamEventType: mappedType
                    })
                    if (!streamState.firstSendAt) streamState.firstSendAt = Date.now()
                    streamState.sendCount++
                  }
                }
              }

            } catch (error) {
              this.logger.error(platformName, `onEvent 处理失败: ${error.message}`)
              this.auditLogger.logAgent('agent.event.error', {
                trace_id: traceId,
                platform: platformName.toLowerCase(),
                conversation_id: conversationId,
                provider,
                error: error.message
              })
              // 不抛出异常，让会话继续
            }
          },
          onComplete: (exitCode) => {
            const total = Date.now() - startAt
            if (!streamState.endSent && streamCfg.enabled && streamCfg.sendEndSummary && this._shouldSendEvent('end', streamCfg)) {
              const ttfb = streamState.firstOutputAt ? (streamState.firstOutputAt - startAt) : -1
              const firstSend = streamState.firstSendAt ? (streamState.firstSendAt - startAt) : -1
              const endEvent = {
                status: 'completed',
                totalMs: total,
                ttfbMs: ttfb,
                firstSendMs: firstSend
              }
              const endMsg = this.robotFormatter.format('end', endEvent, '', {
                profile: streamCfg.profile,
                elapsedMs: total,
                finalResponseType: streamState.finalResponseType
              })
              platform.send(replyTarget, endMsg, rawMessage, type, {
                traceId,
                conversationId,
                provider,
                platform: platformName.toLowerCase(),
                messageType: type || 'default',
                streamEventType: 'end'
              }).catch(() => {})
              streamState.endSent = true
            }
            this.logger.success(platformName, `✅ 会话完成，退出码: ${exitCode}`)
            this.auditLogger.logAgent('agent.complete', {
              trace_id: traceId,
              platform: platformName.toLowerCase(),
              conversation_id: conversationId,
              provider,
              exit_code: exitCode,
              elapsed_ms: Date.now() - startAt
            })
            resolve()
          },
          onError: (error) => {
            const total = Date.now() - startAt
            if (streamCfg.enabled && this._shouldSendEvent('error', streamCfg)) {
              const errMsg = this.robotFormatter.format('error', { message: error.message }, '', {
                profile: streamCfg.profile,
                elapsedMs: total
              })
              platform.send(replyTarget, errMsg, rawMessage, type, {
                traceId,
                conversationId,
                provider,
                platform: platformName.toLowerCase(),
                messageType: type || 'default',
                streamEventType: 'error'
              }).catch(() => {})
            }
            this.logger.error(platformName, `❌ 会话错误: ${error.message}`)
            this.auditLogger.logAgent('agent.error', {
              trace_id: traceId,
              platform: platformName.toLowerCase(),
              conversation_id: conversationId,
              provider,
              error: error.message,
              elapsed_ms: Date.now() - startAt
            })
            reject(error)
          }
        }

        // ⭐ 设置 sessionId 更新回调（用于 iflow）
        connector.onSessionIdUpdate((realSessionId) => {
          console.log(`[DEBUG] 收到 sessionIdUpdateCallback: ${realSessionId}, conversationId: ${conversationId}`)
          sessionId = realSessionId
          platform.setSession(conversationId, realSessionId, provider, { mode })
          this.logger.success('SESSION', `✅ 通过回调保存SessionID: ${realSessionId}`)
          this.auditLogger.logAgent('agent.session.saved', {
            trace_id: traceId,
            platform: platformName.toLowerCase(),
            conversation_id: conversationId,
            session_id: realSessionId,
            provider,
            mode,
            source: 'connector_callback'
          })
        })

        if (sessionId) {
          console.log(`[DEBUG] 调用 continueSession: ${sessionId}, conversationId: ${conversationId}`)
          this.logger.debug(platformName, `调用 continueSession: ${sessionId}`)
          this.auditLogger.logAgent('agent.session.continue', {
            trace_id: traceId,
            platform: platformName.toLowerCase(),
            conversation_id: conversationId,
            session_id: sessionId,
            provider
          })
          await connector.continueSession(sessionId, contextualMessage, options)
        } else {
          console.log(`[DEBUG] 调用 startSession (无sessionId), conversationId: ${conversationId}`)
          this.logger.debug(platformName, '调用 startSession')
          this.auditLogger.logAgent('agent.session.start', {
            trace_id: traceId,
            platform: platformName.toLowerCase(),
            conversation_id: conversationId,
            provider
          })
          const startResult = await connector.startSession(contextualMessage, options)
          if (startResult?.sessionId) {
            sessionId = startResult.sessionId
            platform.setSession(conversationId, sessionId, provider, { mode })
            this.logger.success('SESSION', `✅ 通过 startSession 返回值保存 SessionID: ${sessionId}`)
            this.auditLogger.logAgent('agent.session.saved', {
              trace_id: traceId,
              platform: platformName.toLowerCase(),
              conversation_id: conversationId,
              session_id: sessionId,
              provider,
              mode,
              source: 'start_session_result'
            })
          }
        }
      })

      return { status: 'SUCCESS' }
    } catch (error) {
      this.logger.error(platformName, `❌ 处理失败: ${error.message}`)
      this.auditLogger.logAgent('agent.fatal', {
        trace_id: traceId,
        platform: platformName.toLowerCase(),
        conversation_id: conversationId,
        error: error.message,
        elapsed_ms: Date.now() - startAt
      })
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

    // 方式3: event.content 字符串格式 ⭐ 支持 Agent
    if (event.content) {
      return event.content
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
