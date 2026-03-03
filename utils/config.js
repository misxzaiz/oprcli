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
    this.port = parseInt(process.env.PORT || '3000', 10)

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
      promptsDir: process.env.SYSTEM_PROMPTS_DIR || path.join(__dirname, '../system-prompts')
    }
  }

  _parseList(str) {
    if (!str) return []
    return str.split(',').map(s => s.trim()).filter(s => s)
  }

  /**
   * 从文件加载系统提示词
   * @param {string} filename - 文件名
   * @returns {string|null} - 提示词内容或 null
   */
  _loadSystemPromptFromFile(filename) {
    try {
      const filepath = path.join(this.systemPrompts.promptsDir, filename)
      if (fs.existsSync(filepath)) {
        return fs.readFileSync(filepath, 'utf-8').trim()
      }
    } catch (err) {
      // 文件读取失败，静默忽略
    }
    return null
  }

  /**
   * 获取指定模型的系统提示词
   * 优先级：模型专用环境变量 > 全局环境变量 > 模型专用文件 > 默认文件
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

    if (!['claude', 'iflow'].includes(this.provider)) {
      errors.push(`Invalid PROVIDER: ${this.provider}`)
    }

    if (this.provider === 'claude') {
      if (!this.claude.cmdPath) errors.push('CLAUDE_CMD_PATH is required')
      if (!this.claude.workDir) errors.push('CLAUDE_WORK_DIR is required')
    } else if (this.provider === 'iflow') {
      if (!this.iflow.workDir) errors.push('IFLOW_WORK_DIR is required')
    }

    if (this.dingtalk.enabled) {
      if (!this.dingtalk.clientId) errors.push('DINGTALK_CLIENT_ID is required')
      if (!this.dingtalk.clientSecret) errors.push('DINGTALK_CLIENT_SECRET is required')
    }

    return {
      valid: errors.length === 0,
      errors
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
}

module.exports = new Config()
