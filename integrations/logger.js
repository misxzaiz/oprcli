/**
 * 统一日志系统
 * 提供分级日志、彩色输出等功能
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
  }

  log(level, category, message, data = null) {
    if (level < this.currentLevel) return

    const levelName = Object.keys(this.levels).find(key => this.levels[key] === level)
    const timestamp = new Date().toISOString().split('T')[1].substring(0, 12)
    const color = this.colors[Object.keys(this.colors)[level]] || ''
    const icon = this.icons[levelName] || ''
    const reset = this.config.colored ? this.colors.reset : ''

    let logMsg = `${color}[${timestamp}] ${icon} [${levelName}] [${category}] ${message}${reset}`

    if (data && level <= this.levels.DEBUG) {
      logMsg += '\n' + JSON.stringify(data, null, 2)
    }

    console.log(logMsg)
  }

  debug(category, message, data) { this.log(this.levels.DEBUG, category, message, data) }
  info(category, message, data) { this.log(this.levels.INFO, category, message, data) }
  event(category, message, data) { this.log(this.levels.EVENT, category, message, data) }
  success(category, message, data) { this.log(this.levels.SUCCESS, category, message, data) }
  warning(category, message, data) { this.log(this.levels.WARNING, category, message, data) }
  error(category, message, data) { this.log(this.levels.ERROR, category, message, data) }
}

module.exports = Logger
