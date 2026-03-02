/**
 * 配置加载器
 * 从环境变量加载配置并提供验证
 */

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
      gitBinPath: process.env.CLAUDE_GIT_BIN_PATH
    }

    // IFlow 配置
    this.iflow = {
      path: process.env.IFLOW_PATH || 'iflow',
      workDir: process.env.IFLOW_WORK_DIR,
      includeDirs: this._parseList(process.env.IFLOW_INCLUDE_DIRS)
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
  }

  _parseList(str) {
    if (!str) return []
    return str.split(',').map(s => s.trim()).filter(s => s)
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

    if (targetProvider === 'claude') {
      return {
        claudeCmdPath: this.claude.cmdPath,
        workDir: this.claude.workDir,
        gitBinPath: this.claude.gitBinPath
      }
    } else if (targetProvider === 'iflow') {
      return {
        iflowPath: this.iflow.path,
        workDir: this.iflow.workDir,
        includeDirectories: this.iflow.includeDirs
      }
    }
    throw new Error(`Unknown provider: ${targetProvider}`)
  }
}

module.exports = new Config()
