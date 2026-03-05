/**
 * 日志查看器
 *
 * 功能：
 * - 查看最近的日志条目
 * - 过滤特定级别的日志
 * - 实时跟踪日志
 * - 统计日志信息
 *
 * 使用方法：
 * node scripts/view-logs.js                    # 查看最近 50 条
 * node scripts/view-logs.js -n 100            # 查看最近 100 条
 * node scripts/view-logs.js -l error          # 只看错误日志
 * node scripts/view-logs.js -f                # 实时跟踪
 * node scripts/view-logs.js --stats           # 显示统计信息
 */

const fs = require('fs')
const path = require('path')
const readline = require('readline')

// 配置
const CONFIG = {
  logDir: process.env.LOG_DIR || path.join(__dirname, '../logs'),
  defaultLines: 50,
  logFile: 'app.log',
  maxFileSize: 10 * 1024 * 1024 // 10MB
}

// 日志级别
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  EVENT: 2,
  SUCCESS: 3,
  WARNING: 4,
  ERROR: 5
}

// ANSI 颜色代码
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
}

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    lines: CONFIG.defaultLines,
    level: null,
    follow: false,
    stats: false,
    help: false
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '-n':
      case '--lines':
        options.lines = parseInt(args[++i]) || CONFIG.defaultLines
        break
      case '-l':
      case '--level':
        options.level = (args[++i] || '').toUpperCase()
        break
      case '-f':
      case '--follow':
        options.follow = true
        break
      case '-s':
      case '--stats':
        options.stats = true
        break
      case '-h':
      case '--help':
        options.help = true
        break
    }
  }

  return options
}

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log(`
📋 日志查看器 v1.0.0

使用方法：
  node scripts/view-logs.js [选项]

选项：
  -n, --lines <数量>      显示最近的 N 条日志（默认：50）
  -l, --level <级别>      只显示指定级别的日志（DEBUG/INFO/EVENT/SUCCESS/WARNING/ERROR）
  -f, --follow            实时跟踪日志（类似 tail -f）
  -s, --stats             显示日志统计信息
  -h, --help              显示此帮助信息

示例：
  node scripts/view-logs.js                    # 查看最近 50 条日志
  node scripts/view-logs.js -n 100            # 查看最近 100 条日志
  node scripts/view-logs.js -l error          # 只看错误日志
  node scripts/view-logs.js -f                # 实时跟踪日志
  node scripts/view-logs.js --stats           # 显示统计信息

环境变量：
  LOG_DIR                 日志目录（默认：./logs）
`)
}

/**
 * 获取日志文件路径
 */
function getLogFilePath() {
  const logFile = path.join(CONFIG.logDir, CONFIG.logFile)

  if (!fs.existsSync(logFile)) {
    console.error(`${COLORS.red}❌ 日志文件不存在: ${logFile}${COLORS.reset}`)
    console.log(`${COLORS.yellow}💡 提示: 日志功能可能未启用或日志尚未生成${COLORS.reset}`)
    process.exit(1)
  }

  return logFile
}

/**
 * 解析日志行
 */
function parseLogLine(line) {
  // 匹配格式: [时间] 图标 [级别] [类别] 消息
  const match = line.match(/^\[?([^\]]+)\]?\s*(\S*)\s*\[?(\w+)\]?\s*\[?([^\]]+)\]?\s*(.*)$/)

  if (match) {
    const [, time, icon, level, category, message] = match
    return {
      time,
      icon,
      level: level.toUpperCase(),
      category,
      message: message.trim(),
      raw: line
    }
  }

  return null
}

/**
 * 获取日志级别颜色
 */
function getLevelColor(level) {
  switch (level) {
    case 'DEBUG': return COLORS.cyan
    case 'INFO': return COLORS.blue
    case 'EVENT': return COLORS.magenta
    case 'SUCCESS': return COLORS.green
    case 'WARNING': return COLORS.yellow
    case 'ERROR': return COLORS.red
    default: return COLORS.reset
  }
}

/**
 * 格式化日志行
 */
function formatLogLine(parsed) {
  const color = getLevelColor(parsed.level)
  return `${COLORS.gray}[${parsed.time}]${COLORS.reset} ${parsed.icon} ${color}[${parsed.level}]${COLORS.reset} ${COLORS.gray}[${parsed.category}]${COLORS.reset} ${parsed.message}`
}

/**
 * 读取并显示日志
 */
async function viewLogs(options) {
  const logFile = getLogFilePath()
  const stats = fs.statSync(logFile)

  // 检查文件大小
  if (stats.size > CONFIG.maxFileSize) {
    console.warn(`${COLORS.yellow}⚠️  警告: 日志文件过大 (${(stats.size / 1024 / 1024).toFixed(2)}MB)，可能影响性能${COLORS.reset}`)
  }

  // 读取文件
  const lines = fs.readFileSync(logFile, 'utf-8').split('\n').filter(line => line.trim())

  // 过滤和限制
  let filteredLines = lines

  if (options.level) {
    filteredLines = lines.filter(line => {
      const parsed = parseLogLine(line)
      return parsed && parsed.level === options.level
    })
  }

  const linesToShow = filteredLines.slice(-options.lines)

  // 显示日志
  console.log(`${COLORS.blue}📋 显示最近 ${linesToShow.length} 条日志${COLORS.reset}\n`)

  linesToShow.forEach(line => {
    const parsed = parseLogLine(line)
    if (parsed) {
      console.log(formatLogLine(parsed))
    } else {
      console.log(line)
    }
  })

  // 显示统计信息
  if (options.stats) {
    showStats(lines)
  }

  // 实时跟踪
  if (options.follow) {
    console.log(`\n${COLORS.green}🔄 实时跟踪中... (Ctrl+C 退出)${COLORS.reset}\n`)
    await followLogs(logFile, options)
  }
}

/**
 * 显示统计信息
 */
function showStats(lines) {
  const stats = {
    DEBUG: 0,
    INFO: 0,
    EVENT: 0,
    SUCCESS: 0,
    WARNING: 0,
    ERROR: 0,
    total: lines.length
  }

  const categories = new Set()

  lines.forEach(line => {
    const parsed = parseLogLine(line)
    if (parsed) {
      stats[parsed.level]++
      categories.add(parsed.category)
    }
  })

  console.log(`\n${COLORS.blue}📊 日志统计${COLORS.reset}`)
  console.log(`${COLORS.gray}${'─'.repeat(40)}${COLORS.reset}`)
  console.log(`总条目: ${stats.total}`)
  console.log(`活跃类别: ${categories.size}`)

  console.log(`\n级别分布:`)
  Object.entries(stats).forEach(([level, count]) => {
    if (level !== 'total') {
      const percentage = stats.total > 0 ? ((count / stats.total) * 100).toFixed(1) : '0.0'
      const color = getLevelColor(level)
      const bar = '█'.repeat(Math.ceil((count / stats.total) * 20))
      console.log(`  ${color}${level.padEnd(8)}${COLORS.reset} ${count.toString().padStart(5)} (${percentage}%) ${COLORS.gray}${bar}${COLORS.reset}`)
    }
  })

  if (categories.size > 0) {
    console.log(`\n活跃类别:`)
    Array.from(categories).sort().forEach(cat => {
      console.log(`  • ${cat}`)
    })
  }
}

/**
 * 实时跟踪日志
 */
async function followLogs(logFile, options) {
  let lastSize = fs.statSync(logFile).size

  const watcher = fs.watch(logFile, async (eventType) => {
    if (eventType === 'change') {
      const stats = fs.statSync(logFile)

      if (stats.size > lastSize) {
        // 读取新增内容
        const stream = fs.createReadStream(logFile, {
          start: lastSize,
          encoding: 'utf-8'
        })

        const rl = readline.createInterface({
          input: stream,
          crlfDelay: Infinity
        })

        for await (const line of rl) {
          if (line.trim()) {
            if (options.level) {
              const parsed = parseLogLine(line)
              if (parsed && parsed.level === options.level) {
                console.log(formatLogLine(parsed))
              }
            } else {
              const parsed = parseLogLine(line)
              console.log(parsed ? formatLogLine(parsed) : line)
            }
          }
        }

        lastSize = stats.size
      } else if (stats.size < lastSize) {
        // 日志被轮转或清空
        console.log(`${COLORS.yellow}📝 日志文件已重置${COLORS.reset}`)
        lastSize = stats.size
      }
    }
  })

  // 处理 Ctrl+C
  process.on('SIGINT', () => {
    watcher.close()
    console.log(`\n${COLORS.blue}👋 已停止跟踪${COLORS.reset}`)
    process.exit(0)
  })
}

/**
 * 主函数
 */
async function main() {
  const options = parseArgs()

  if (options.help) {
    showHelp()
    process.exit(0)
  }

  try {
    await viewLogs(options)
  } catch (error) {
    console.error(`${COLORS.red}❌ 错误: ${error.message}${COLORS.reset}`)
    process.exit(1)
  }
}

// 运行
main()
