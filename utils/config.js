/**
 * 配置加载器
 * 从环境变量加载配置并提供验证
 */

const fs = require('fs')
const path = require('path')
const sanitizer = require('./sanitizer')

// 提示词模式常量
const PROMPT_MODES = {
  FULL: 'full',
  SLIM: 'slim'
}

// 🔐 敏感字段列表（用于脱敏）
const SENSITIVE_FIELDS = [
  'clientId',
  'clientSecret',
  'webhook',
  'secret',
  'systemPrompt',
  'cmdPath',
  'gitBinPath'
]

class Config {
  constructor() {
    // 🆕 提示词缓存（避免重复读取文件）
    this._promptCache = new Map()
    // 🆕 缓存大小限制（防止内存无限增长）
    this._maxCacheSize = parseInt(process.env.CACHE_MAX_SIZE || '100', 10)
    // 🆕 缓存统计
    this._cacheHits = 0
    this._cacheMisses = 0
    this._cacheEvictions = 0
    // 🔐 标记敏感字段
    this._sensitiveFields = SENSITIVE_FIELDS
    this.load()
  }

  load() {
    // 核心配置
    this.provider = process.env.PROVIDER || 'claude'
    this.port = process.env.PORT ? parseInt(process.env.PORT) : null

    // 提示词模式（带验证）
    this.promptMode = process.env.PROMPT_MODE || PROMPT_MODES.FULL
    if (!Object.values(PROMPT_MODES).includes(this.promptMode)) {
      console.warn(`[CONFIG] 警告: 无效的 PROMPT_MODE: "${this.promptMode}"，使用默认值: ${PROMPT_MODES.FULL}`)
      this.promptMode = PROMPT_MODES.FULL
    }

    // Claude 配置
    this.claude = {
      cmdPath: process.env.CLAUDE_CMD_PATH,
      workDir: process.env.CLAUDE_WORK_DIR,
      gitBinPath: process.env.CLAUDE_GIT_BIN_PATH,
      systemPrompt: process.env.CLAUDE_SYSTEM_PROMPT
    }

    // IFlow 配置
    this.iflow = {
      path: process.env.IFLOW_PATH || 'iflow',
      workDir: process.env.IFLOW_WORK_DIR,
      includeDirs: this._parseList(process.env.IFLOW_INCLUDE_DIRS),
      systemPrompt: process.env.IFLOW_SYSTEM_PROMPT
    }

    // 钉钉配置
    this.dingtalk = {
      clientId: process.env.DINGTALK_CLIENT_ID,
      clientSecret: process.env.DINGTALK_CLIENT_SECRET,
      enabled: !!(process.env.DINGTALK_CLIENT_ID && process.env.DINGTALK_CLIENT_SECRET)
    }

    // 流式输出配置
    this.streaming = {
      enabled: process.env.STREAM_ENABLED === 'true',
      mode: process.env.STREAM_MODE || 'realtime',
      interval: parseInt(process.env.STREAM_INTERVAL || '2000', 10),
      maxLength: parseInt(process.env.STREAM_MAX_LENGTH || '5000', 10),
      showThinking: process.env.STREAM_SHOW_THINKING !== 'false',
      showTools: process.env.STREAM_SHOW_TOOLS !== 'false',
      showTime: process.env.STREAM_SHOW_TIME !== 'false',
      showCompletionSummary: process.env.STREAM_SHOW_COMPLETION !== 'false',
      deduplicateResult: process.env.STREAM_DEDUPLICATE_RESULT !== 'false',  // 去重 result 事件
      useMarkdown: process.env.STREAM_USE_MARKDOWN === 'true',
      debugMode: process.env.STREAM_DEBUG_MODE === 'true',  // 调试模式开关
      toolIcons: {  // 工具图标配置
        'Bash': '🖥️',
        'Editor': '📝',
        'Browser': '🌐',
        'Computer': '💻'
      }
    }

    // 日志配置
    this.logging = {
      level: process.env.LOG_LEVEL || 'EVENT',
      colored: process.env.LOG_COLORED !== 'false'
    }

    // 系统提示词配置
    this.systemPrompts = {
      global: process.env.SYSTEM_PROMPT,
      promptsDir: process.env.SYSTEM_PROMPTS_DIR || path.join(__dirname, '../system-prompts')
    }

    // 通知配置
    this.notification = {
      enabled: process.env.NOTIFICATION_ENABLED === 'true',
      type: process.env.NOTIFICATION_TYPE || 'dingtalk',

      dingtalk: {
        webhook: process.env.NOTIFICATION_DINGTALK_WEBHOOK,
        secret: process.env.NOTIFICATION_DINGTALK_SECRET
      },

      defaultType: process.env.NOTIFICATION_DEFAULT_TYPE || 'text',

      logEnabled: process.env.NOTIFICATION_LOG_ENABLED === 'true',
      logFile: process.env.NOTIFICATION_LOG_FILE || 'logs/notifications.log'
    }
  }

  _parseList(str) {
    if (!str) return []
    return str.split(',').map(s => s.trim()).filter(s => s)
  }

  /**
   * 从文件加载系统提示词（带缓存）
   * @param {string} filename - 文件名
   * @returns {string|null} - 提示词内容或 null
   */
  _loadSystemPromptFromFile(filename) {
    // 🆕 检查缓存
    if (this._promptCache.has(filename)) {
      this._cacheHits++
      return this._promptCache.get(filename)
    }

    this._cacheMisses++

    try {
      const filepath = path.join(this.systemPrompts.promptsDir, filename)
      const content = fs.readFileSync(filepath, 'utf-8').trim()

      // 🆕 缓存淘汰策略：如果缓存已满，删除最旧的条目
      if (this._promptCache.size >= this._maxCacheSize) {
        const firstKey = this._promptCache.keys().next().value
        this._promptCache.delete(firstKey)
        this._cacheEvictions++
      }

      // 🆕 缓存结果
      this._promptCache.set(filename, content)

      return content
    } catch (err) {
      // 文件读取失败，静默忽略
    }
    return null
  }

  /**
   * 获取指定模型的系统提示词
   * 优先级：模型专用环境变量 > 全局环境变量 > 模型专用文件 > 默认文件
   * 支持 PROMPT_MODE: slim 使用精简版提示词（节省 token）
   * @param {string} provider - 模型名称 (claude/iflow)
   * @returns {string|null} - 系统提示词
   */
  getSystemPrompt(provider) {
    // 1. 检查模型专用环境变量
    const providerUpper = provider.toUpperCase()
    const providerEnvKey = `${providerUpper}_SYSTEM_PROMPT`
    if (process.env[providerEnvKey]) {
      return this._processEscapedNewlines(process.env[providerEnvKey])
    }

    // 1.5. 检查是否使用精简模式
    if (this.promptMode === 'slim') {
      const slimFile = `${provider}-slim.txt`
      const slimPrompt = this._loadSystemPromptFromFile(slimFile)
      if (slimPrompt) {
        return slimPrompt
      }
    }

    // 2. 检查全局环境变量
    if (this.systemPrompts.global) {
      return this._processEscapedNewlines(this.systemPrompts.global)
    }

    // 3. 检查模型专用配置文件
    const providerFile = this._loadSystemPromptFromFile(`${provider}.txt`)
    if (providerFile) {
      return providerFile
    }

    // 4. 检查默认配置文件
    return this._loadSystemPromptFromFile('default.txt')
  }

  /**
   * 处理转义的换行符
   * 将 \n 转换为实际换行符
   * @param {string} str - 输入字符串
   * @returns {string} - 处理后的字符串
   */
  _processEscapedNewlines(str) {
    return str.replace(/\\n/g, '\n')
  }

  validate() {
    const errors = []
    const warnings = []

    // Provider 验证
    if (!['claude', 'iflow'].includes(this.provider)) {
      errors.push({
        field: 'PROVIDER',
        message: `无效的 PROVIDER 值: "${this.provider}"，有效值为: claude, iflow`,
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

  getConnectorOptions(provider = null) {
    const targetProvider = provider || this.provider
    const systemPrompt = this.getSystemPrompt(targetProvider)

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
    }
    throw new Error(`Unknown provider: ${targetProvider}`)
  }

  /**
   * 🔐 获取安全的配置对象（敏感信息已脱敏）
   * 适用于日志输出和调试
   * @returns {Object} - 脱敏后的配置对象
   */
  getSafeConfig() {
    const config = {
      provider: this.provider,
      port: this.port,
      promptMode: this.promptMode,
      claude: {
        ...this.claude,
        cmdPath: this.claude.cmdPath ? sanitizer.sanitizeValue(this.claude.cmdPath, 'cmdPath') : null,
        gitBinPath: this.claude.gitBinPath ? sanitizer.sanitizeValue(this.claude.gitBinPath, 'gitBinPath') : null,
        systemPrompt: this.claude.systemPrompt ? '[SYSTEM PROMPT HIDDEN]' : null
      },
      iflow: {
        ...this.iflow,
        systemPrompt: this.iflow.systemPrompt ? '[SYSTEM PROMPT HIDDEN]' : null
      },
      dingtalk: {
        ...this.dingtalk,
        clientId: this.dingtalk.clientId ? sanitizer.sanitizeValue(this.dingtalk.clientId, 'clientId') : null,
        clientSecret: this.dingtalk.clientSecret ? '[SECRET HIDDEN]' : null
      },
      streaming: this.streaming,
      logging: this.logging,
      notification: {
        ...this.notification,
        dingtalk: {
          webhook: this.notification.dingtalk.webhook ? sanitizer.sanitizeValue(this.notification.dingtalk.webhook, 'webhook') : null,
          secret: this.notification.dingtalk.secret ? '[SECRET HIDDEN]' : null
        }
      }
    }

    return config
  }

  /**
   * 🔐 获取敏感字段列表
   * @returns {Array<string>} - 敏感字段名数组
   */
  getSensitiveFields() {
    return [...this._sensitiveFields]
  }

  /**
   * 🔐 添加自定义敏感字段
   * @param {string|Array<string>} fields - 字段名或字段名数组
   */
  addSensitiveFields(fields) {
    if (Array.isArray(fields)) {
      this._sensitiveFields.push(...fields)
    } else if (typeof fields === 'string') {
      this._sensitiveFields.push(fields)
    }
  }

  /**
   * 🆕 获取缓存统计信息
   * @returns {Object} - 缓存统计数据
   */
  getCacheStats() {
    const totalRequests = this._cacheHits + this._cacheMisses
    return {
      size: this._promptCache.size,
      maxSize: this._maxCacheSize,
      hits: this._cacheHits,
      misses: this._cacheMisses,
      evictions: this._cacheEvictions,
      hitRate: totalRequests > 0
        ? (this._cacheHits / totalRequests * 100).toFixed(2) + '%'
        : '0%',
      usageRate: (this._promptCache.size / this._maxCacheSize * 100).toFixed(2) + '%'
    }
  }

  /**
   * 🆕 清空提示词缓存
   */
  clearPromptCache() {
    this._promptCache.clear()
    this._cacheHits = 0
    this._cacheMisses = 0
    this._cacheEvictions = 0
  }
}

// 导出常量供外部使用
Config.PROMPT_MODES = PROMPT_MODES

module.exports = new Config()
