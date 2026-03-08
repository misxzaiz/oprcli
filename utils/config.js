/**
 * 配置加载器
 * 从环境变量加载配置并提供验证
 */

const fs = require('fs')
const path = require('path')

class Config {
  constructor() {
    this.load()
  }

  load() {
    // 核心配置
    this.provider = process.env.PROVIDER || 'claude'
    this.port = process.env.PORT ? parseInt(process.env.PORT) : null

    // 项目启动目录（文档路径）
    this.projectDir = process.cwd()

    // 默认工作目录配置
    this.defaultWorkDir = process.env.DEFAULT_WORK_DIR || this.projectDir

    // Claude 配置
    this.claude = {
      cmdPath: process.env.CLAUDE_CMD_PATH,
      workDir: process.env.CLAUDE_WORK_DIR || this.defaultWorkDir,  // 如果未设置则使用默认工作目录
      gitBinPath: process.env.CLAUDE_GIT_BIN_PATH
    }

    // IFlow 配置
    this.iflow = {
      path: process.env.IFLOW_PATH || 'iflow',
      workDir: process.env.IFLOW_WORK_DIR || this.defaultWorkDir,  // 如果未设置则使用默认工作目录
      includeDirs: this._parseList(process.env.IFLOW_INCLUDE_DIRS)
    }

    // Codex 配置
    this.codex = {
      path: process.env.CODEX_PATH || 'codex',
      workDir: process.env.CODEX_WORK_DIR || this.defaultWorkDir,  // 如果未设置则使用默认工作目录
      systemPromptFile: process.env.CODEX_SYSTEM_PROMPT_FILE,
      model: process.env.CODEX_MODEL,
      provider: process.env.CODEX_MODEL_PROVIDER
    }

    // Agent 配置
    this.agent = {
      enabled: process.env.AGENT_ENABLED === 'true',
      providerType: process.env.AGENT_PROVIDER_TYPE || 'iflow',
      apiKey: process.env.AGENT_API_KEY,
      model: process.env.AGENT_MODEL,
      workDir: process.env.AGENT_WORK_DIR || this.defaultWorkDir,  // 支持Agent工作目录配置
      maxHistoryMessages: parseInt(process.env.AGENT_MAX_HISTORY_MESSAGES || '24', 10),
      maxContextChars: parseInt(process.env.AGENT_MAX_CONTEXT_CHARS || '24000', 10),
      summaryTriggerChars: parseInt(process.env.AGENT_SUMMARY_TRIGGER_CHARS || '18000', 10),
      minRecentMessages: parseInt(process.env.AGENT_MIN_RECENT_MESSAGES || '8', 10)
    }

    // 钉钉配置
    this.dingtalk = {
      clientId: process.env.DINGTALK_CLIENT_ID,
      clientSecret: process.env.DINGTALK_CLIENT_SECRET,
      enabled: !!(process.env.DINGTALK_CLIENT_ID && process.env.DINGTALK_CLIENT_SECRET)
    }

    // QQ Bot 配置
    this.qqbot = {
      appId: process.env.QQBOT_APP_ID,
      clientSecret: process.env.QQBOT_CLIENT_SECRET,
      sandbox: process.env.QQBOT_SANDBOX === 'true',
      debug: process.env.QQBOT_DEBUG === 'true',
      commandPrefix: process.env.QQBOT_COMMAND_PREFIX || '/',
      enabled: !!(process.env.QQBOT_APP_ID && process.env.QQBOT_CLIENT_SECRET)
    }

    // 流式输出配置
    this.streaming = {
      enabled: process.env.STREAM_ENABLED === 'true',
      interval: parseInt(process.env.STREAM_INTERVAL || '2000', 10),
      maxLength: parseInt(process.env.STREAM_MAX_LENGTH || '5000', 10),
      showThinking: process.env.STREAM_SHOW_THINKING !== 'false',
      showTools: process.env.STREAM_SHOW_TOOLS !== 'false',
      showTime: process.env.STREAM_SHOW_TIME !== 'false',
      useMarkdown: process.env.STREAM_USE_MARKDOWN === 'true'
    }

    // 日志配置
    this.logging = {
      level: process.env.LOG_LEVEL || 'EVENT',
      colored: process.env.LOG_COLORED !== 'false'
    }

    // 系统提示词配置
    this.systemPrompts = {
      global: process.env.SYSTEM_PROMPT,
      promptsDir: process.env.SYSTEM_PROMPTS_DIR || path.join(__dirname, '../system-prompts'),
      mode: (process.env.PROMPT_MODE || 'universal').toLowerCase(),
      channelAware: process.env.PROMPT_CHANNEL_AWARE !== 'false',
      includeSourceContext: process.env.PROMPT_INCLUDE_SOURCE_CONTEXT !== 'false'
    }

    // 通知配置
    this.notification = {
      enabled: process.env.NOTIFICATION_ENABLED === 'true',
      type: process.env.NOTIFICATION_TYPE || 'dingtalk',
      dingtalk: {
        webhook: process.env.NOTIFICATION_DINGTALK_WEBHOOK,
        secret: process.env.NOTIFICATION_DINGTALK_SECRET
      }
    }

    // 审计日志配置
    this.audit = {
      enabled: process.env.AUDIT_LOG_ENABLED !== 'false',
      dir: process.env.AUDIT_LOG_DIR || './logs',
      agentIO: process.env.AUDIT_LOG_AGENT_IO !== 'false',
      botTransform: process.env.AUDIT_LOG_BOT_TRANSFORM !== 'false',
      maxFieldLength: parseInt(process.env.AUDIT_LOG_MAX_FIELD_LENGTH || '8000', 10),
      redactKeys: this._parseList(process.env.AUDIT_LOG_REDACT_KEYS || 'clientSecret,token,authorization,webhook,secret')
    }

    // 机器人过程输出配置（仅新配置）
    this.robotStream = {
      enabled: process.env.ROBOT_OUTPUT_ENABLED !== 'false',
      profile: (() => {
        const rawProfile = (process.env.ROBOT_OUTPUT_PROFILE || 'standard').toLowerCase()
        const allowedProfiles = ['compact', 'standard', 'full', 'debug']
        return allowedProfiles.includes(rawProfile) ? rawProfile : 'standard'
      })(),
      types: this._parseList(process.env.ROBOT_SHOW_TYPES || 'assistant_chunk,result,thinking_exposed,tool_use,tool_result,http_request,http_response,error,end'),
      sendThinking: process.env.ROBOT_SHOW_THINKING === 'true',
      sendHttp: process.env.ROBOT_SHOW_NETWORK === 'true',
      maxChars: parseInt(process.env.ROBOT_MAX_CHARS || '1200', 10),
      sendEndSummary: process.env.ROBOT_END_SUMMARY !== 'false',
      dedupWindowMs: parseInt(process.env.ROBOT_DEDUP_WINDOW_MS || '5000', 10),
      chunkStrategy: (process.env.ROBOT_CHUNK_STRATEGY || 'throttle').toLowerCase()
    }
  }

  _parseList(str) {
    if (!str) return []
    return str.split(',').map(s => s.trim()).filter(s => s)
  }

  /**
   * 获取当前 provider 的工作目录
   * 支持会话级别的工作目录覆盖（通过path命令设置）
   */
  getWorkDir(provider = null, sessionWorkDir = null) {
    // 优先使用会话级别的工作目录设置
    if (sessionWorkDir) {
      return sessionWorkDir
    }

    const p = provider || this.provider
    // 优先使用provider特定配置
    if (this[p]?.workDir) {
      return this[p].workDir
    }
    // 其次使用默认工作目录
    if (this.defaultWorkDir) {
      return this.defaultWorkDir
    }
    // 最后使用项目启动目录
    return this.projectDir
  }

  /**
   * 获取项目启动目录（文档路径）
   */
  getProjectDir() {
    return this.projectDir
  }

  /**
   * 获取默认工作目录
   */
  getDefaultWorkDir() {
    return this.defaultWorkDir
  }

  /**
   * 从文件加载系统提示词
   */
  async _loadSystemPromptFromFile(filename) {
    try {
      const filepath = path.join(this.systemPrompts.promptsDir, filename)
      const content = await fs.promises.readFile(filepath, 'utf-8')
      return content.trim()
    } catch (err) {
      return null
    }
  }

  /**
   * 替换模板变量
   * 支持 {{WORK_DIR}}, {{PROJECT_DIR}}, {{DEFAULT_WORK_DIR}}, {{PORT}}, {{PROVIDER}} 等
   */
  _replaceTemplateVars(content, provider, sessionWorkDir = null) {
    const workDir = this.getWorkDir(provider, sessionWorkDir)
    const vars = {
      WORK_DIR: workDir,
      PROJECT_DIR: this.projectDir,
      DEFAULT_WORK_DIR: this.defaultWorkDir,
      PORT: this.port || 'N/A',
      PROVIDER: provider || this.provider,
      PROVIDER_UPPER: (provider || this.provider).toUpperCase()
    }

    return content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return vars[key] !== undefined ? vars[key] : match
    })
  }

  /**
   * 获取系统提示词
   * 优先级：环境变量 > oprcli.md 文件
   */
  async getSystemPrompt(provider) {
    // 1. 检查 provider 专用环境变量
    const providerEnvKey = `${(provider || this.provider).toUpperCase()}_SYSTEM_PROMPT`
    if (process.env[providerEnvKey]) {
      return process.env[providerEnvKey].replace(/\\n/g, '\n')
    }

    // 2. 检查全局环境变量
    if (this.systemPrompts.global) {
      return this.systemPrompts.global.replace(/\\n/g, '\n')
    }

    // 3. 加载默认提示词文件
    const content = await this._loadSystemPromptFromFile('oprcli.md')
    if (content) {
      return this._replaceTemplateVars(content, provider)
    }

    return null
  }

  /**
   * 获取按模式拆分的提示词（oprcli.<mode>.md），找不到时回退到 oprcli.md
   * 不读取环境变量覆盖，专用于运行时 mode 注入
   */
  async getModePrompt(provider, mode = 'universal', sessionWorkDir = null) {
    const normalizedMode = (mode || 'universal').toString().trim().toLowerCase()
    const modeFile = `oprcli.${normalizedMode}.md`
    const fallbackFile = 'oprcli.md'

    let content = await this._loadSystemPromptFromFile(modeFile)
    if (!content && normalizedMode !== 'universal') {
      content = await this._loadSystemPromptFromFile(fallbackFile)
    }
    if (!content && normalizedMode === 'universal') {
      content = await this._loadSystemPromptFromFile(fallbackFile)
    }

    if (!content) return null
    return this._replaceTemplateVars(content, provider, sessionWorkDir)
  }

  validate() {
    const errors = []
    const warnings = []

    // Provider 验证
    if (!['claude', 'iflow', 'codex', 'agent'].includes(this.provider)) {
      errors.push({
        field: 'PROVIDER',
        message: `无效的 PROVIDER 值: "${this.provider}"，有效值为: claude, iflow, codex, agent`,
        value: this.provider
      })
    }

    // Port 验证
    if (this.port !== null) {
      if (typeof this.port !== 'number' || isNaN(this.port)) {
        errors.push({
          field: 'PORT',
          message: `PORT 必须是数字，当前值: ${this.port}`,
          value: this.port
        })
      } else if (this.port < 1 || this.port > 65535) {
        errors.push({
          field: 'PORT',
          message: `PORT 超出有效范围 (1-65535)，当前值: ${this.port}`,
          value: this.port
        })
      } else if (this.port < 1024) {
        warnings.push({
          field: 'PORT',
          message: `使用特权端口 (${this.port}) 可能需要管理员权限`
        })
      }
    }

    // Claude 配置验证
    if (this.provider === 'claude') {
      if (!this.claude.cmdPath) {
        errors.push({
          field: 'CLAUDE_CMD_PATH',
          message: 'Claude 命令路径未配置',
          hint: '请设置 CLAUDE_CMD_PATH 环境变量'
        })
      } else if (!this._checkFileExists(this.claude.cmdPath)) {
        warnings.push({
          field: 'CLAUDE_CMD_PATH',
          message: `Claude 命令路径不存在或无法访问: ${this.claude.cmdPath}`,
          hint: '请检查路径是否正确'
        })
      }

      if (!this.claude.workDir) {
        errors.push({
          field: 'CLAUDE_WORK_DIR',
          message: 'Claude 工作目录未配置',
          hint: '请设置 CLAUDE_WORK_DIR 环境变量'
        })
      } else if (!this._checkDirectoryExists(this.claude.workDir)) {
        warnings.push({
          field: 'CLAUDE_WORK_DIR',
          message: `工作目录不存在或无法访问: ${this.claude.workDir}`,
          hint: '请检查目录是否存在'
        })
      }

      if (this.claude.gitBinPath && !this._checkFileExists(this.claude.gitBinPath)) {
        warnings.push({
          field: 'CLAUDE_GIT_BIN_PATH',
          message: `Git 可执行文件不存在: ${this.claude.gitBinPath}`,
          hint: '将使用系统默认 Git'
        })
      }
    }

    // IFlow 配置验证
    if (this.provider === 'iflow') {
      if (!this.iflow.workDir) {
        errors.push({
          field: 'IFLOW_WORK_DIR',
          message: 'IFlow 工作目录未配置',
          hint: '请设置 IFLOW_WORK_DIR 环境变量'
        })
      } else if (!this._checkDirectoryExists(this.iflow.workDir)) {
        warnings.push({
          field: 'IFLOW_WORK_DIR',
          message: `工作目录不存在或无法访问: ${this.iflow.workDir}`
        })
      }
    }

    // 钉钉配置验证
    if (this.dingtalk.enabled) {
      if (!this.dingtalk.clientId) {
        errors.push({
          field: 'DINGTALK_CLIENT_ID',
          message: '钉钉客户端 ID 未配置',
          hint: '请设置 DINGTALK_CLIENT_ID 环境变量'
        })
      }
      if (!this.dingtalk.clientSecret) {
        errors.push({
          field: 'DINGTALK_CLIENT_SECRET',
          message: '钉钉客户端密钥未配置',
          hint: '请设置 DINGTALK_CLIENT_SECRET 环境变量'
        })
      }
    }

    // 流式配置验证
    if (this.streaming.interval < 100) {
      warnings.push({
        field: 'STREAM_INTERVAL',
        message: `流式输出间隔过短 (${this.streaming.interval}ms)，可能导致性能问题`,
        hint: '建议设置为 500ms 或更长'
      })
    }

    if (this.streaming.maxLength > 10000) {
      warnings.push({
        field: 'STREAM_MAX_LENGTH',
        message: `流式输出最大长度过长 (${this.streaming.maxLength})`,
        hint: '可能导致消息截断或显示问题'
      })
    }

    // 通知配置验证
    if (this.notification.enabled) {
      if (this.notification.type === 'dingtalk') {
        if (!this.notification.dingtalk.webhook) {
          warnings.push({
            field: 'NOTIFICATION_DINGTALK_WEBHOOK',
            message: '钉钉通知 Webhook 未配置，通知功能可能无法正常工作'
          })
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * 检查文件是否存在
   * @private
   */
  _checkFileExists(filePath) {
    try {
      return fs.existsSync(filePath) && fs.statSync(filePath).isFile()
    } catch (err) {
      return false
    }
  }

  /**
   * 检查目录是否存在
   * @private
   */
  _checkDirectoryExists(dirPath) {
    try {
      return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()
    } catch (err) {
      return false
    }
  }

  async getConnectorOptions(provider = null) {
    const targetProvider = provider || this.provider
    const systemPrompt = await this.getSystemPrompt(targetProvider)

    if (targetProvider === 'claude') {
      return {
        claudeCmdPath: this.claude.cmdPath,
        workDir: this.claude.workDir,
        gitBinPath: this.claude.gitBinPath,
        systemPrompt
      }
    } else if (targetProvider === 'iflow') {
      return {
        iflowPath: this.iflow.path,
        workDir: this.iflow.workDir,
        includeDirectories: this.iflow.includeDirs,
        systemPrompt
      }
    } else if (targetProvider === 'codex') {
      return {
        codexPath: this.codex.path,
        workDir: this.codex.workDir,
        systemPromptFile: this.codex.systemPromptFile,
        modelConfig: {
          model: this.codex.model,
          provider: this.codex.provider
        },
        systemPrompt
      }
    } else if (targetProvider === 'agent') {
      return {
        providerType: this.agent.providerType,
        apiKey: this.agent.apiKey,
        model: this.agent.model,
        workDir: this.getWorkDir('agent'),
        maxHistoryMessages: this.agent.maxHistoryMessages,
        maxContextChars: this.agent.maxContextChars,
        summaryTriggerChars: this.agent.summaryTriggerChars,
        minRecentMessages: this.agent.minRecentMessages,
        systemPrompt
      }
    }
    throw new Error(`Unknown provider: ${targetProvider}`)
  }

}

module.exports = new Config()
