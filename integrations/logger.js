/**
 * 统一日志系统
 * 提供分级日志、彩色输出、性能监控等功能
 *
 * 优化：
 * - 添加日志统计功能
 * - 添加性能监控（日志级别分布）
 * - 改进时间格式
 */

class Logger {
  constructor(config) {
    this.config = config
    this.levels = {
      DEBUG: 0,
      INFO: 1,
      EVENT: 2,
      SUCCESS: 3,
      WARNING: 4,
      ERROR: 5
    }
    this.currentLevel = this.levels[config.level] || this.levels.EVENT
    this.colors = {
      reset: '\x1b[0m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m'
    }
    this.icons = {
      DEBUG: '🔍',
      INFO: 'ℹ️',
      EVENT: '📡',
      SUCCESS: '✅',
      WARNING: '⚠️',
      ERROR: '❌'
    }

    // 🆕 统计信息
    this.stats = {
      debug: 0,
      info: 0,
      event: 0,
      success: 0,
      warning: 0,
      warn: 0, // 🔥 新增：与 warning 共享计数
      error: 0,
      total: 0
    }

    // 🆕 性能监控：记录每个类别的日志时间
    this.categoryTimings = new Map()
  }

  log(level, category, message, data = null) {
    if (level < this.currentLevel) return

    // 🔥 修复：确保 levelName 有效
    const levelName = Object.keys(this.levels).find(key => this.levels[key] === level) || 'INFO'
    const timestamp = new Date().toISOString().split('T')[1].substring(0, 12)
    const color = this.colors[Object.keys(this.colors)[level]] || ''
    const icon = this.icons[levelName] || ''
    const reset = this.config.colored ? this.colors.reset : ''

    let logMsg = `${color}[${timestamp}] ${icon} [${levelName}] [${category}] ${message}${reset}`

    // 🔧 修复：ERROR 和 WARNING 级别也显示详细数据
    if (data && (level <= this.levels.DEBUG || level >= this.levels.WARNING)) {
      logMsg += '\n' + JSON.stringify(data, null, 2)
    }

    console.log(logMsg)

    // 🆕 更新统计（使用安全的默认值）
    const levelNameLower = levelName ? levelName.toLowerCase() : 'info'
    this.stats[levelNameLower] = (this.stats[levelNameLower] || 0) + 1
    this.stats.total++

    // 🆕 性能监控：记录类别最后日志时间
    this.categoryTimings.set(category, Date.now())

    // 🆕 结构化日志（当环境变量启用时）
    if (process.env.STRUCTURED_LOGGING === 'true') {
      this._logStructured(levelName, category, message, data)
    }
  }

  debug(category, message, data) { this.log(this.levels.DEBUG, category, message, data) }
  info(category, message, data) { this.log(this.levels.INFO, category, message, data) }
  event(category, message, data) { this.log(this.levels.EVENT, category, message, data) }
  success(category, message, data) { this.log(this.levels.SUCCESS, category, message, data) }
  warning(category, message, data) { this.log(this.levels.WARNING, category, message, data) }
  warn(category, message, data) {
    this.warning(category, message, data); // 调用 warning 方法
    this.stats.warn++; // 🔥 额外增加 warn 计数
  }
  error(category, message, data) { this.log(this.levels.ERROR, category, message, data) }

  /**
   * 🆕 获取日志统计信息
   */
  getStats() {
    return {
      ...this.stats,
      levelDistribution: {
        debug: ((this.stats.debug / this.stats.total) * 100).toFixed(1) + '%',
        info: ((this.stats.info / this.stats.total) * 100).toFixed(1) + '%',
        event: ((this.stats.event / this.stats.total) * 100).toFixed(1) + '%',
        success: ((this.stats.success / this.stats.total) * 100).toFixed(1) + '%',
        warning: ((this.stats.warning / this.stats.total) * 100).toFixed(1) + '%',
        warn: ((this.stats.warn / this.stats.total) * 100).toFixed(1) + '%', // 🔥 新增
        error: ((this.stats.error / this.stats.total) * 100).toFixed(1) + '%'
      },
      activeCategories: Array.from(this.categoryTimings.keys()).length
    }
  }

  /**
   * 🆕 重置统计信息
   */
  resetStats() {
    this.stats = {
      debug: 0,
      info: 0,
      event: 0,
      success: 0,
      warning: 0,
      warn: 0, // 🔥 新增
      error: 0,
      total: 0
    }
    this.categoryTimings.clear()
  }

  /**
   * 🆕 获取某个类别的最后活跃时间
   */
  getLastActiveTime(category) {
    const timestamp = this.categoryTimings.get(category)
    return timestamp ? new Date(timestamp).toISOString() : null
  }

  /**
   * 🆕 输出结构化日志（JSON 格式）
   * @private
   */
  _logStructured(level, category, message, data) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      ...data,
      pid: process.pid,
      env: process.env.NODE_ENV || 'development',
      hostname: require('os').hostname()
    }
    console.log(JSON.stringify(logEntry))
  }
}

module.exports = Logger
