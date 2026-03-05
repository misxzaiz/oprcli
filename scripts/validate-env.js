/**
 * 环境变量验证脚本
 *
 * 功能：
 * - 验证所有必需的环境变量是否已设置
 * - 检查环境变量的格式和有效性
 * - 生成 .env.example 文件
 * - 检查敏感信息泄露
 * - 验证文件路径是否存在
 *
 * 使用方法：
 * node scripts/validate-env.js                   # 验证环境变量
 * node scripts/validate-env.js --example         # 生成 .env.example
 * node scripts/validate-env.js --check-secrets   # 检查敏感信息
 * node scripts/validate-env.js --verbose         # 详细输出
 */

const fs = require('fs')
const path = require('path')

// ANSI 颜色
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
 * 环境变量配置
 * 定义所有需要验证的环境变量
 */
const ENV_SCHEMA = {
  // 核心配置
  PROVIDER: {
    required: false,
    default: 'claude',
    validate: (value) => ['claude', 'iflow'].includes(value),
    description: 'AI 提供商 (claude/iflow)',
    example: 'claude'
  },
  PORT: {
    required: false,
    default: '13579',
    validate: (value) => {
      const port = parseInt(value)
      return !isNaN(port) && port >= 1 && port <= 65535
    },
    description: '服务器端口',
    example: '13579'
  },

  // Claude 配置
  CLAUDE_CMD_PATH: {
    required: false,
    validate: (value) => value && value.length > 0,
    checkFile: true,
    description: 'Claude CLI 命令路径',
    example: 'D:/path/to/claude.exe'
  },
  CLAUDE_WORK_DIR: {
    required: false,
    validate: (value) => value && value.length > 0,
    checkDir: true,
    description: 'Claude 工作目录',
    example: 'D:/space/oprcli'
  },
  CLAUDE_GIT_BIN_PATH: {
    required: false,
    validate: (value) => value && value.length > 0,
    checkFile: true,
    description: 'Git 可执行文件路径',
    example: 'C:/Program Files/Git/bin/git.exe'
  },
  CLAUDE_SYSTEM_PROMPT: {
    required: false,
    sensitive: true,
    validate: (value) => typeof value === 'string',
    description: 'Claude 系统提示词',
    example: 'You are a helpful assistant...'
  },

  // IFlow 配置
  IFLOW_PATH: {
    required: false,
    default: 'iflow',
    validate: (value) => typeof value === 'string',
    description: 'IFlow 命令路径',
    example: 'iflow'
  },
  IFLOW_WORK_DIR: {
    required: false,
    validate: (value) => value && value.length > 0,
    checkDir: true,
    description: 'IFlow 工作目录',
    example: 'D:/space/workspace'
  },
  IFLOW_INCLUDE_DIRS: {
    required: false,
    validate: (value) => typeof value === 'string',
    description: 'IFlow 包含目录（逗号分隔）',
    example: 'src,lib'
  },
  IFLOW_SYSTEM_PROMPT: {
    required: false,
    sensitive: true,
    validate: (value) => typeof value === 'string',
    description: 'IFlow 系统提示词',
    example: 'You are a helpful assistant...'
  },

  // 钉钉配置
  DINGTALK_CLIENT_ID: {
    required: false,
    sensitive: true,
    validate: (value) => value && value.length > 0,
    description: '钉钉客户端 ID',
    example: 'your-client-id'
  },
  DINGTALK_CLIENT_SECRET: {
    required: false,
    sensitive: true,
    validate: (value) => value && value.length > 0,
    description: '钉钉客户端密钥',
    example: 'your-client-secret'
  },

  // 提示词配置
  PROMPT_MODE: {
    required: false,
    default: 'full',
    validate: (value) => ['full', 'slim'].includes(value),
    description: '提示词模式 (full/slim)',
    example: 'full'
  },
  SYSTEM_PROMPT: {
    required: false,
    sensitive: true,
    validate: (value) => typeof value === 'string',
    description: '全局系统提示词',
    example: 'You are a helpful assistant...'
  },
  SYSTEM_PROMPTS_DIR: {
    required: false,
    default: './system-prompts',
    validate: (value) => typeof value === 'string',
    checkDir: true,
    description: '系统提示词目录',
    example: './system-prompts'
  },

  // 流式输出配置
  STREAM_ENABLED: {
    required: false,
    default: 'true',
    validate: (value) => ['true', 'false'].includes(value),
    description: '启用流式输出',
    example: 'true'
  },
  STREAM_MODE: {
    required: false,
    default: 'realtime',
    validate: (value) => ['realtime', 'batch'].includes(value),
    description: '流式输出模式',
    example: 'realtime'
  },
  STREAM_INTERVAL: {
    required: false,
    default: '2000',
    validate: (value) => {
      const interval = parseInt(value)
      return !isNaN(interval) && interval >= 100
    },
    description: '流式输出间隔（毫秒）',
    example: '2000'
  },
  STREAM_MAX_LENGTH: {
    required: false,
    default: '5000',
    validate: (value) => {
      const length = parseInt(value)
      return !isNaN(length) && length > 0
    },
    description: '流式输出最大长度',
    example: '5000'
  },
  STREAM_SHOW_THINKING: {
    required: false,
    default: 'true',
    validate: (value) => ['true', 'false'].includes(value),
    description: '显示思考过程',
    example: 'true'
  },
  STREAM_SHOW_TOOLS: {
    required: false,
    default: 'true',
    validate: (value) => ['true', 'false'].includes(value),
    description: '显示工具调用',
    example: 'true'
  },
  STREAM_SHOW_TIME: {
    required: false,
    default: 'true',
    validate: (value) => ['true', 'false'].includes(value),
    description: '显示时间戳',
    example: 'true'
  },
  STREAM_SHOW_COMPLETION: {
    required: false,
    default: 'true',
    validate: (value) => ['true', 'false'].includes(value),
    description: '显示完成摘要',
    example: 'true'
  },
  STREAM_DEDUPLICATE_RESULT: {
    required: false,
    default: 'true',
    validate: (value) => ['true', 'false'].includes(value),
    description: '去重 result 事件',
    example: 'true'
  },
  STREAM_USE_MARKDOWN: {
    required: false,
    default: 'false',
    validate: (value) => ['true', 'false'].includes(value),
    description: '使用 Markdown 格式',
    example: 'false'
  },

  // 日志配置
  LOG_LEVEL: {
    required: false,
    default: 'EVENT',
    validate: (value) => ['DEBUG', 'INFO', 'EVENT', 'SUCCESS', 'WARNING', 'ERROR'].includes(value),
    description: '日志级别',
    example: 'EVENT'
  },
  LOG_COLORED: {
    required: false,
    default: 'true',
    validate: (value) => ['true', 'false'].includes(value),
    description: '彩色日志输出',
    example: 'true'
  },

  // 通知配置
  NOTIFICATION_ENABLED: {
    required: false,
    default: 'false',
    validate: (value) => ['true', 'false'].includes(value),
    description: '启用通知',
    example: 'false'
  },
  NOTIFICATION_TYPE: {
    required: false,
    default: 'dingtalk',
    validate: (value) => ['dingtalk'].includes(value),
    description: '通知类型',
    example: 'dingtalk'
  },
  NOTIFICATION_DINGTALK_WEBHOOK: {
    required: false,
    sensitive: true,
    validate: (value) => typeof value === 'string',
    description: '钉钉通知 Webhook',
    example: 'https://oapi.dingtalk.com/robot/send?access_token=xxx'
  },
  NOTIFICATION_DINGTALK_SECRET: {
    required: false,
    sensitive: true,
    validate: (value) => typeof value === 'string',
    description: '钉钉通知密钥',
    example: 'SECxxxxxxxx'
  },

  // 缓存配置
  CACHE_ENABLED: {
    required: false,
    default: 'true',
    validate: (value) => ['true', 'false'].includes(value),
    description: '启用缓存',
    example: 'true'
  },
  CACHE_TTL: {
    required: false,
    default: '60000',
    validate: (value) => {
      const ttl = parseInt(value)
      return !isNaN(ttl) && ttl > 0
    },
    description: '缓存 TTL（毫秒）',
    example: '60000'
  },
  CACHE_MAX_ENTRIES: {
    required: false,
    default: '1000',
    validate: (value) => {
      const max = parseInt(value)
      return !isNaN(max) && max > 0
    },
    description: '最大缓存条目',
    example: '1000'
  },

  // 内存监控配置
  MEMORY_MONITOR_ENABLED: {
    required: false,
    default: 'true',
    validate: (value) => ['true', 'false'].includes(value),
    description: '启用内存监控',
    example: 'true'
  },
  MEMORY_MONITOR_INTERVAL: {
    required: false,
    default: '60000',
    validate: (value) => {
      const interval = parseInt(value)
      return !isNaN(interval) && interval > 0
    },
    description: '内存监控间隔（毫秒）',
    example: '60000'
  },
  MEMORY_THRESHOLD: {
    required: false,
    default: '524288000',
    validate: (value) => {
      const threshold = parseInt(value)
      return !isNaN(threshold) && threshold > 0
    },
    description: '内存阈值（字节）',
    example: '524288000'
  },
  MEMORY_ALERT_COOLDOWN: {
    required: false,
    default: '300000',
    validate: (value) => {
      const cooldown = parseInt(value)
      return !isNaN(cooldown) && cooldown > 0
    },
    description: '内存告警冷却时间（毫秒）',
    example: '300000'
  },

  // 安全配置
  CORS_ENABLED: {
    required: false,
    default: 'false',
    validate: (value) => ['true', 'false'].includes(value),
    description: '启用 CORS',
    example: 'false'
  },
  CORS_ORIGIN: {
    required: false,
    default: '*',
    validate: (value) => typeof value === 'string',
    description: 'CORS 允许来源',
    example: '*'
  },
  CORS_METHODS: {
    required: false,
    validate: (value) => typeof value === 'string',
    description: 'CORS 允许方法（逗号分隔）',
    example: 'GET,POST,PUT,DELETE,OPTIONS'
  },
  CORS_HEADERS: {
    required: false,
    validate: (value) => typeof value === 'string',
    description: 'CORS 允许头（逗号分隔）',
    example: 'Content-Type,Authorization'
  },
  CORS_CREDENTIALS: {
    required: false,
    default: 'false',
    validate: (value) => ['true', 'false'].includes(value),
    description: 'CORS 允许凭证',
    example: 'false'
  },

  // 优雅关闭配置
  SHUTDOWN_TIMEOUT: {
    required: false,
    default: '30000',
    validate: (value) => {
      const timeout = parseInt(value)
      return !isNaN(timeout) && timeout > 0
    },
    description: '优雅关闭超时（毫秒）',
    example: '30000'
  }
}

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    example: false,
    checkSecrets: false,
    verbose: false,
    help: false
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '-e':
      case '--example':
        options.example = true
        break
      case '-s':
      case '--check-secrets':
        options.checkSecrets = true
        break
      case '-v':
      case '--verbose':
        options.verbose = true
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
🔐 环境变量验证工具 v1.0.0

使用方法：
  node scripts/validate-env.js [选项]

选项：
  -e, --example           生成 .env.example 文件
  -s, --check-secrets     检查敏感信息泄露
  -v, --verbose           显示详细输出
  -h, --help              显示此帮助信息

示例：
  node scripts/validate-env.js                   # 验证环境变量
  node scripts/validate-env.js --example         # 生成 .env.example
  node scripts/validate-env.js --check-secrets   # 检查敏感信息
  node scripts/validate-env.js --verbose         # 详细输出
`)
}

/**
 * 验证单个环境变量
 */
function validateVariable(name, schema, options) {
  const value = process.env[name]
  const result = {
    name,
    set: value !== undefined,
    valid: false,
    errors: [],
    warnings: []
  }

  // 检查是否设置
  if (!result.set) {
    if (schema.required) {
      result.errors.push('必需的环境变量未设置')
    } else if (schema.default) {
      result.warnings.push(`未设置，将使用默认值: ${schema.default}`)
      result.valid = true
    } else {
      result.valid = true
    }
    return result
  }

  // 验证值
  if (schema.validate && !schema.validate(value)) {
    result.errors.push('值格式无效')
    return result
  }

  result.valid = true

  // 检查文件路径
  if (schema.checkFile) {
    if (!fs.existsSync(value)) {
      result.warnings.push(`文件不存在: ${value}`)
    } else if (!fs.statSync(value).isFile()) {
      result.warnings.push(`路径不是文件: ${value}`)
    }
  }

  // 检查目录路径
  if (schema.checkDir) {
    if (!fs.existsSync(value)) {
      result.warnings.push(`目录不存在: ${value}`)
    } else if (!fs.statSync(value).isDirectory()) {
      result.warnings.push(`路径不是目录: ${value}`)
    }
  }

  // 检查敏感信息
  if (options.checkSecrets && schema.sensitive) {
    if (value.length < 10) {
      result.warnings.push('敏感信息值过短，可能不安全')
    }
    if (value === schema.example) {
      result.errors.push('使用了示例值，请设置真实的值')
      result.valid = false
    }
  }

  return result
}

/**
 * 验证所有环境变量
 */
function validateAllVariables(options) {
  const results = {
    valid: [],
    invalid: [],
    warnings: [],
    total: 0
  }

  Object.entries(ENV_SCHEMA).forEach(([name, schema]) => {
    results.total++
    const result = validateVariable(name, schema, options)

    if (result.valid) {
      if (result.warnings.length > 0) {
        results.warnings.push(result)
      } else {
        results.valid.push(result)
      }
    } else {
      results.invalid.push(result)
    }

    if (options.verbose) {
      console.log(`\n${COLORS.cyan}${name}${COLORS.reset}`)
      console.log(`  状态: ${result.set ? '✅ 已设置' : '⚠️  未设置'}`)
      if (result.warnings.length > 0) {
        result.warnings.forEach(w => console.log(`  ${COLORS.yellow}⚠️  ${w}${COLORS.reset}`))
      }
      if (result.errors.length > 0) {
        result.errors.forEach(e => console.log(`  ${COLORS.red}❌ ${e}${COLORS.reset}`))
      }
    }
  })

  return results
}

/**
 * 显示验证结果
 */
function displayResults(results) {
  console.log(`${COLORS.blue}📊 验证结果${COLORS.reset}`)
  console.log(`${COLORS.gray}${'─'.repeat(40)}${COLORS.reset}`)
  console.log(`总计: ${results.total}`)
  console.log(`${COLORS.green}✅ 有效: ${results.valid.length}${COLORS.reset}`)
  console.log(`${COLORS.yellow}⚠️  警告: ${results.warnings.length}${COLORS.reset}`)
  console.log(`${COLORS.red}❌ 无效: ${results.invalid.length}${COLORS.reset}`)

  if (results.invalid.length > 0) {
    console.log(`\n${COLORS.red}❌ 无效的环境变量:${COLORS.reset}`)
    results.invalid.forEach(result => {
      console.log(`\n${COLORS.red}${result.name}${COLORS.reset}`)
      result.errors.forEach(error => {
        console.log(`  • ${error}`)
      })
    })
  }

  if (results.warnings.length > 0) {
    console.log(`\n${COLORS.yellow}⚠️  有警告的环境变量:${COLORS.reset}`)
    results.warnings.forEach(result => {
      console.log(`\n${COLORS.yellow}${result.name}${COLORS.reset}`)
      result.warnings.forEach(warning => {
        console.log(`  • ${warning}`)
      })
    })
  }

  const hasErrors = results.invalid.length > 0
  console.log(`\n${hasErrors ? `${COLORS.red}❌ 验证失败${COLORS.reset}` : `${COLORS.green}✅ 验证通过${COLORS.reset}`}`)

  return hasErrors ? 1 : 0
}

/**
 * 生成 .env.example 文件
 */
function generateExampleFile() {
  const lines = [
    '# OPRCLI 环境变量配置示例',
    '# 复制此文件为 .env 并设置实际值',
    `# 生成时间: ${new Date().toISOString()}`,
    ''
  ]

  // 按类别分组
  const categories = {
    '核心配置': ['PROVIDER', 'PORT'],
    'Claude 配置': ['CLAUDE_CMD_PATH', 'CLAUDE_WORK_DIR', 'CLAUDE_GIT_BIN_PATH', 'CLAUDE_SYSTEM_PROMPT'],
    'IFlow 配置': ['IFLOW_PATH', 'IFLOW_WORK_DIR', 'IFLOW_INCLUDE_DIRS', 'IFLOW_SYSTEM_PROMPT'],
    '钉钉配置': ['DINGTALK_CLIENT_ID', 'DINGTALK_CLIENT_SECRET'],
    '提示词配置': ['PROMPT_MODE', 'SYSTEM_PROMPT', 'SYSTEM_PROMPTS_DIR'],
    '流式输出配置': [
      'STREAM_ENABLED', 'STREAM_MODE', 'STREAM_INTERVAL', 'STREAM_MAX_LENGTH',
      'STREAM_SHOW_THINKING', 'STREAM_SHOW_TOOLS', 'STREAM_SHOW_TIME',
      'STREAM_SHOW_COMPLETION', 'STREAM_DEDUPLICATE_RESULT', 'STREAM_USE_MARKDOWN'
    ],
    '日志配置': ['LOG_LEVEL', 'LOG_COLORED'],
    '通知配置': ['NOTIFICATION_ENABLED', 'NOTIFICATION_TYPE', 'NOTIFICATION_DINGTALK_WEBHOOK', 'NOTIFICATION_DINGTALK_SECRET'],
    '缓存配置': ['CACHE_ENABLED', 'CACHE_TTL', 'CACHE_MAX_ENTRIES'],
    '内存监控配置': ['MEMORY_MONITOR_ENABLED', 'MEMORY_MONITOR_INTERVAL', 'MEMORY_THRESHOLD', 'MEMORY_ALERT_COOLDOWN'],
    '安全配置': ['CORS_ENABLED', 'CORS_ORIGIN', 'CORS_METHODS', 'CORS_HEADERS', 'CORS_CREDENTIALS'],
    '优雅关闭配置': ['SHUTDOWN_TIMEOUT']
  }

  Object.entries(categories).forEach(([category, vars]) => {
    lines.push(`# ${category}`)
    vars.forEach(varName => {
      const schema = ENV_SCHEMA[varName]
      const comment = schema.required ? ' (必需)' : ''
      const example = schema.example || schema.default || ''
      lines.push(`# ${schema.description}${comment}`)
      lines.push(`${varName}=${example}`)
      lines.push('')
    })
  })

  const examplePath = path.join(__dirname, '../.env.example')
  fs.writeFileSync(examplePath, lines.join('\n'))

  console.log(`${COLORS.green}✅ .env.example 文件已生成${COLORS.reset}`)
  console.log(`${COLORS.gray}路径: ${examplePath}${COLORS.reset}`)
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

  if (options.example) {
    generateExampleFile()
    process.exit(0)
  }

  console.log(`${COLORS.blue}🔐 验证环境变量...${COLORS.reset}\n`)

  const results = validateAllVariables(options)
  const exitCode = displayResults(results)

  process.exit(exitCode)
}

// 运行
main()
