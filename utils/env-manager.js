/**
 * 环境变量管理器
 * 提供集中式环境变量管理、验证、类型转换和文档生成
 *
 * @version 1.0.0
 * @created 2026-03-05
 *
 * 功能：
 * - 集中管理所有环境变量
 * - 类型验证和转换
 * - 敏感信息脱敏
 * - 环境变量文档生成
 * - 配置验证和错误提示
 */

class EnvManager {
  constructor() {
    // 环境变量定义
    this.definitions = new Map()
    this.errors = []
    this.warnings = []

    this._registerDefinitions()
  }

  /**
   * 注册所有环境变量定义
   * @private
   */
  _registerDefinitions() {
    // 服务器配置
    this.define('PORT', {
      type: 'number',
      default: 13579,
      description: '服务器监听端口'
    })

    this.define('PROVIDER', {
      type: 'enum',
      enum: ['claude', 'iflow'],
      default: 'claude',
      description: '默认AI提供商'
    })

    this.define('NODE_ENV', {
      type: 'enum',
      enum: ['development', 'production', 'test'],
      default: 'development',
      description: '运行环境'
    })

    // 日志配置
    this.define('LOG_LEVEL', {
      type: 'enum',
      enum: ['DEBUG', 'INFO', 'EVENT', 'SUCCESS', 'WARNING', 'ERROR'],
      default: 'EVENT',
      description: '日志级别'
    })

    this.define('STRUCTURED_LOGGING', {
      type: 'boolean',
      default: false,
      description: '启用结构化日志（JSON格式）'
    })

    // 钉钉配置
    this.define('DINGTALK_CLIENT_ID', {
      type: 'string',
      sensitive: true,
      description: '钉钉应用客户端ID'
    })

    this.define('DINGTALK_CLIENT_SECRET', {
      type: 'string',
      sensitive: true,
      description: '钉钉应用客户端密钥'
    })

    // 通知配置
    this.define('NOTIFICATION_DINGTALK_WEBHOOK', {
      type: 'string',
      sensitive: true,
      description: '钉钉通知Webhook地址'
    })

    this.define('NOTIFICATION_DINGTALK_SECRET', {
      type: 'string',
      sensitive: true,
      description: '钉钉通知签名密钥'
    })

    // 缓存配置
    this.define('CACHE_ENABLED', {
      type: 'boolean',
      default: true,
      description: '启用缓存'
    })

    this.define('CACHE_TTL', {
      type: 'number',
      default: 60000,
      description: '缓存默认TTL（毫秒）'
    })

    this.define('CACHE_MAX_ENTRIES', {
      type: 'number',
      default: 1000,
      description: '缓存最大条目数'
    })

    this.define('CACHE_MAX_SIZE', {
      type: 'number',
      default: 100,
      description: '提示词缓存最大条目数'
    })

    // 内存配置
    this.define('MEMORY_CLEANER_ENABLED', {
      type: 'boolean',
      default: true,
      description: '启用内存清理器'
    })

    this.define('MEMORY_MONITOR_INTERVAL', {
      type: 'number',
      default: 60000,
      description: '内存监控间隔（毫秒）'
    })

    this.define('MEMORY_THRESHOLD', {
      type: 'number',
      default: 524288000,
      description: '内存阈值（字节，默认500MB）'
    })

    this.define('MEMORY_ALERT_COOLDOWN', {
      type: 'number',
      default: 300000,
      description: '内存告警冷却时间（毫秒）'
    })

    // 速率限制配置
    this.define('RATE_LIMIT_ENABLED', {
      type: 'boolean',
      default: true,
      description: '启用速率限制'
    })

    this.define('REQUEST_TIMEOUT', {
      type: 'number',
      default: 30000,
      description: '请求超时时间（毫秒）'
    })

    // CORS配置
    this.define('CORS_ENABLED', {
      type: 'boolean',
      default: false,
      description: '启用CORS'
    })

    this.define('CORS_ORIGIN', {
      type: 'string',
      default: '*',
      description: 'CORS允许的来源'
    })

    // 请求大小限制
    this.define('MAX_BODY_SIZE', {
      type: 'number',
      default: 10485760,
      description: '请求体最大大小（字节，默认10MB）'
    })

    // 安全配置
    this.define('SECURITY_CHECK_ENABLED', {
      type: 'boolean',
      default: true,
      description: '启用安全检查'
    })

    this.define('SECURITY_LOG_ONLY', {
      type: 'boolean',
      default: false,
      description: '安全检查仅记录日志，不拦截'
    })

    // 请求去重配置
    this.define('REQUEST_DEDUPLICATION_ENABLED', {
      type: 'boolean',
      default: true,
      description: '启用请求去重'
    })

    this.define('DEDUP_TTL', {
      type: 'number',
      default: 5000,
      description: '请求去重TTL（毫秒）'
    })

    // 提示词配置
    this.define('PROMPT_MODE', {
      type: 'enum',
      enum: ['full', 'slim'],
      default: 'full',
      description: '提示词模式'
    })

    // 流式输出配置
    this.define('STREAM_ENABLED', {
      type: 'boolean',
      default: false,
      description: '启用流式输出'
    })

    this.define('STREAM_MODE', {
      type: 'enum',
      enum: ['realtime', 'interval'],
      default: 'realtime',
      description: '流式输出模式'
    })

    this.define('STREAM_INTERVAL', {
      type: 'number',
      default: 2000,
      description: '流式输出间隔（毫秒）'
    })

    // Claude配置
    this.define('CLAUDE_CMD_PATH', {
      type: 'string',
      description: 'Claude命令路径'
    })

    this.define('CLAUDE_WORK_DIR', {
      type: 'string',
      description: 'Claude工作目录'
    })

    // IFlow配置
    this.define('IFLOW_PATH', {
      type: 'string',
      default: 'iflow',
      description: 'IFlow路径'
    })

    this.define('IFLOW_WORK_DIR', {
      type: 'string',
      description: 'IFlow工作目录'
    })
  }

  /**
   * 定义环境变量
   * @param {string} name - 环境变量名
   * @param {Object} definition - 定义对象
   */
  define(name, definition) {
    this.definitions.set(name, {
      type: definition.type || 'string',
      default: definition.default,
      description: definition.description || '',
      sensitive: definition.sensitive || false,
      enum: definition.enum || null,
      required: definition.required || false
    })
  }

  /**
   * 获取环境变量值
   * @param {string} name - 环境变量名
   * @returns {*} 环境变量值
   */
  get(name) {
    const definition = this.definitions.get(name)
    if (!definition) {
      this.warnings.push(`未定义的环境变量: ${name}`)
      return process.env[name]
    }

    const rawValue = process.env[name]

    // 如果未设置，返回默认值
    if (rawValue === undefined || rawValue === '') {
      return definition.default
    }

    // 类型转换
    try {
      return this._convertType(rawValue, definition)
    } catch (error) {
      this.errors.push(`环境变量 ${name} 值无效: ${error.message}`)
      return definition.default
    }
  }

  /**
   * 类型转换
   * @private
   */
  _convertType(value, definition) {
    switch (definition.type) {
      case 'boolean':
        if (value === 'true' || value === '1') return true
        if (value === 'false' || value === '0') return false
        throw new Error(`无效的布尔值: ${value}`)

      case 'number':
        const num = Number(value)
        if (isNaN(num)) throw new Error(`无效的数字: ${value}`)
        return num

      case 'enum':
        if (definition.enum && !definition.enum.includes(value)) {
          throw new Error(`无效的枚举值: ${value}，允许的值: ${definition.enum.join(', ')}`)
        }
        return value

      default:
        return value
    }
  }

  /**
   * 验证所有环境变量
   * @returns {Object} 验证结果
   */
  validate() {
    this.errors = []
    this.warnings = []

    // 检查必需的环境变量
    for (const [name, definition] of this.definitions.entries()) {
      if (definition.required && !process.env[name]) {
        this.errors.push(`缺少必需的环境变量: ${name}`)
      }

      // 验证枚举值
      if (definition.enum && process.env[name]) {
        const value = this.get(name)
        if (!definition.enum.includes(value)) {
          this.errors.push(
            `环境变量 ${name} 的值无效: ${value}，允许的值: ${definition.enum.join(', ')}`
          )
        }
      }
    }

    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings
    }
  }

  /**
   * 获取所有配置（脱敏）
   * @returns {Object} 配置对象
   */
  getAll(maskSensitive = true) {
    const config = {}
    for (const [name, definition] of this.definitions.entries()) {
      const value = this.get(name)
      if (definition.sensitive && maskSensitive) {
        config[name] = this._maskValue(value)
      } else {
        config[name] = value
      }
    }
    return config
  }

  /**
   * 脱敏处理
   * @private
   */
  _maskValue(value) {
    if (!value || typeof value !== 'string') return '***'
    if (value.length <= 6) return '***'
    return value.substring(0, 3) + '***' + value.substring(value.length - 3)
  }

  /**
   * 生成环境变量文档（Markdown格式）
   * @returns {string} Markdown文档
   */
  generateDocs() {
    let docs = '# 环境变量配置文档\n\n'
    docs += `生成时间: ${new Date().toISOString()}\n\n`

    // 按类别分组
    const categories = {
      '服务器配置': ['PORT', 'PROVIDER', 'NODE_ENV'],
      '日志配置': ['LOG_LEVEL', 'STRUCTURED_LOGGING'],
      '钉钉配置': ['DINGTALK_CLIENT_ID', 'DINGTALK_CLIENT_SECRET'],
      '通知配置': ['NOTIFICATION_DINGTALK_WEBHOOK', 'NOTIFICATION_DINGTALK_SECRET'],
      '缓存配置': ['CACHE_ENABLED', 'CACHE_TTL', 'CACHE_MAX_ENTRIES', 'CACHE_MAX_SIZE'],
      '内存配置': [
        'MEMORY_CLEANER_ENABLED',
        'MEMORY_MONITOR_INTERVAL',
        'MEMORY_THRESHOLD',
        'MEMORY_ALERT_COOLDOWN'
      ],
      '安全配置': ['RATE_LIMIT_ENABLED', 'REQUEST_TIMEOUT', 'MAX_BODY_SIZE', 'SECURITY_CHECK_ENABLED'],
      'CORS配置': ['CORS_ENABLED', 'CORS_ORIGIN'],
      '提示词配置': ['PROMPT_MODE', 'STREAM_ENABLED', 'STREAM_MODE', 'STREAM_INTERVAL'],
      'Claude配置': ['CLAUDE_CMD_PATH', 'CLAUDE_WORK_DIR'],
      'IFlow配置': ['IFLOW_PATH', 'IFLOW_WORK_DIR']
    }

    for (const [category, vars] of Object.entries(categories)) {
      docs += `## ${category}\n\n`
      docs += '| 变量名 | 类型 | 默认值 | 描述 | 敏感 |\n'
      docs += '| ------ | ---- | ------ | ---- | ---- |\n'

      for (const varName of vars) {
        const def = this.definitions.get(varName)
        if (!def) continue

        const type = def.type === 'enum' ? `enum: ${def.enum.join(', ')}` : def.type
        const defaultValue = def.default !== undefined ? String(def.default) : '(无)'
        const sensitive = def.sensitive ? '✅' : ''

        docs += `| \`${varName}\` | ${type} | ${defaultValue} | ${def.description} | ${sensitive} |\n`
      }

      docs += '\n'
    }

    return docs
  }

  /**
   * 获取配置摘要
   * @returns {Object} 配置摘要
   */
  getSummary() {
    const summary = {
      total: this.definitions.size,
      configured: 0,
      usingDefault: 0,
      sensitive: 0,
      byType: {}
    }

    for (const [name, definition] of this.definitions.entries()) {
      if (definition.sensitive) summary.sensitive++
      if (process.env[name]) {
        summary.configured++
      } else if (definition.default !== undefined) {
        summary.usingDefault++
      }

      const type = definition.type
      summary.byType[type] = (summary.byType[type] || 0) + 1
    }

    return summary
  }
}

// 导出类和单例实例
module.exports = EnvManager
module.exports.default = new EnvManager()

// 如果直接运行，生成文档
if (require.main === module) {
  const envManager = new EnvManager()
  const validation = envManager.validate()
  console.log(envManager.generateDocs())

  console.log('\n## 配置摘要\n\n')
  console.log(JSON.stringify(envManager.getSummary(), null, 2))

  if (validation.errors.length > 0) {
    console.log('\n## 验证错误\n\n')
    validation.errors.forEach(err => console.log(`❌ ${err}`))
  }

  if (validation.warnings.length > 0) {
    console.log('\n## 警告\n\n')
    validation.warnings.forEach(warn => console.log(`⚠️  ${warn}`))
  }

  if (validation.valid) {
    console.log('\n✅ 所有配置验证通过')
  } else {
    console.log('\n❌ 配置验证失败')
    process.exit(1)
  }
}
