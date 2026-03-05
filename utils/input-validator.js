/**
 * 输入验证工具
 *
 * 功能：
 * - 验证用户输入
 * - 防止注入攻击
 * - 清理和规范化数据
 * - 提供常用的验证规则
 *
 * @version 1.0.0
 */

const Logger = require('../integrations/logger')

class InputValidator {
  constructor(logger) {
    this.logger = logger || new Logger({ level: 'WARN' })
  }

  /**
   * 验证字符串长度
   */
  validateLength(str, min = 0, max = 10000) {
    if (typeof str !== 'string') {
      return { valid: false, error: '输入必须是字符串' }
    }

    if (str.length < min) {
      return { valid: false, error: `输入长度不能少于 ${min} 个字符` }
    }

    if (str.length > max) {
      return { valid: false, error: `输入长度不能超过 ${max} 个字符` }
    }

    return { valid: true }
  }

  /**
   * 验证并清理消息内容
   */
  validateMessage(message) {
    if (!message || typeof message !== 'string') {
      return { valid: false, error: '消息不能为空' }
    }

    // 去除首尾空白
    const trimmed = message.trim()

    // 检查长度
    const lengthCheck = this.validateLength(trimmed, 1, 50000)
    if (!lengthCheck.valid) {
      return lengthCheck
    }

    // 检查是否包含潜在的危险模式
    const dangerousPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi, // 事件处理器如 onclick=
      /<iframe[^>]*>/gi,
      /<object[^>]*>/gi,
      /<embed[^>]*>/gi
    ]

    for (const pattern of dangerousPatterns) {
      if (pattern.test(trimmed)) {
        this.logger.warning('VALIDATOR', '检测到潜在的危险输入模式')
        return {
          valid: false,
          error: '输入包含不允许的内容'
        }
      }
    }

    return {
      valid: true,
      sanitized: this.sanitizeHtml(trimmed)
    }
  }

  /**
   * 验证会话 ID
   */
  validateSessionId(sessionId) {
    if (!sessionId) {
      return { valid: true, value: null } // 允许空值（新会话）
    }

    if (typeof sessionId !== 'string') {
      return { valid: false, error: '会话 ID 必须是字符串' }
    }

    // 会话 ID 格式验证（字母数字和连字符）
    const sessionIdPattern = /^[a-zA-Z0-9\-_]+$/
    if (!sessionIdPattern.test(sessionId)) {
      return { valid: false, error: '会话 ID 格式无效' }
    }

    const lengthCheck = this.validateLength(sessionId, 1, 100)
    if (!lengthCheck.valid) {
      return lengthCheck
    }

    return { valid: true, value: sessionId }
  }

  /**
   * 验证配置键
   */
  validateConfigKey(key) {
    if (!key || typeof key !== 'string') {
      return { valid: false, error: '配置键不能为空' }
    }

    // 配置键格式验证（点分隔的路径）
    const keyPattern = /^[a-zA-Z0-9_.\-]+$/
    if (!keyPattern.test(key)) {
      return { valid: false, error: '配置键格式无效' }
    }

    const lengthCheck = this.validateLength(key, 1, 100)
    if (!lengthCheck.valid) {
      return lengthCheck
    }

    return { valid: true, value: key }
  }

  /**
   * 验证提供者名称
   */
  validateProvider(provider) {
    if (!provider || typeof provider !== 'string') {
      return { valid: false, error: '提供者名称不能为空' }
    }

    const validProviders = ['claude', 'iflow']
    if (!validProviders.includes(provider.toLowerCase())) {
      return {
        valid: false,
        error: `无效的提供者，必须是: ${validProviders.join(', ')}`
      }
    }

    return { valid: true, value: provider.toLowerCase() }
  }

  /**
   * 清理 HTML 特殊字符
   */
  sanitizeHtml(str) {
    if (typeof str !== 'string') {
      return str
    }

    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;')
  }

  /**
   * 验证请求体
   */
  validateRequestBody(body, requiredFields = []) {
    if (!body || typeof body !== 'object') {
      return { valid: false, error: '请求体格式无效' }
    }

    // 检查必需字段
    for (const field of requiredFields) {
      if (!(field in body) || body[field] === undefined || body[field] === null) {
        return { valid: false, error: `缺少必需字段: ${field}` }
      }
    }

    return { valid: true }
  }

  /**
   * 验证路径参数
   */
  validatePathParam(param, allowList = []) {
    if (!param || typeof param !== 'string') {
      return { valid: false, error: '路径参数无效' }
    }

    if (allowList.length > 0 && !allowList.includes(param)) {
      return {
        valid: false,
        error: `路径参数不在允许列表中，允许的值: ${allowList.join(', ')}`
      }
    }

    return { valid: true, value: param }
  }

  /**
   * 检测 SQL 注入模式
   */
  detectSqlInjection(str) {
    if (typeof str !== 'string') {
      return false
    }

    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/gi,
      /(--)|(\#)|(\/*\*\/)/g,
      /(\bOR\b|\bAND\b).*=.*=/gi,
      /'.*'=.*'/g
    ]

    for (const pattern of sqlPatterns) {
      if (pattern.test(str)) {
        return true
      }
    }

    return false
  }

  /**
   * 检测命令注入模式
   */
  detectCommandInjection(str) {
    if (typeof str !== 'string') {
      return false
    }

    const commandPatterns = [
      /[;&|`$()]/, // 常见的 shell 元字符
      /\$\([^)]*\)/, // 命令替换
      /`[^`]*`/, // 反引号命令替换
      /\|.*\b(cat|ls|rm|cp|mv|wget|curl|nc|netcat)\b/gi // 常见命令
    ]

    for (const pattern of commandPatterns) {
      if (pattern.test(str)) {
        return true
      }
    }

    return false
  }

  /**
   * 综合安全检查
   */
  performSecurityCheck(input, options = {}) {
    const {
      checkSqlInjection = true,
      checkCommandInjection = true,
      maxLength = 50000
    } = options

    if (typeof input !== 'string') {
      return { safe: false, reason: '输入必须是字符串' }
    }

    // 长度检查
    if (input.length > maxLength) {
      return {
        safe: false,
        reason: `输入超过最大长度 ${maxLength}`
      }
    }

    // SQL 注入检查
    if (checkSqlInjection && this.detectSqlInjection(input)) {
      this.logger.warning('VALIDATOR', '检测到潜在的 SQL 注入')
      return {
        safe: false,
        reason: '输入包含潜在的 SQL 注入模式'
      }
    }

    // 命令注入检查
    if (checkCommandInjection && this.detectCommandInjection(input)) {
      this.logger.warning('VALIDATOR', '检测到潜在的命令注入')
      return {
        safe: false,
        reason: '输入包含潜在的命令注入模式'
      }
    }

    return { safe: true }
  }

  /**
   * 验证并清理多个输入字段
   */
  validateMultiple(fields, schema) {
    const errors = []
    const sanitized = {}

    for (const [fieldName, rules] of Object.entries(schema)) {
      const value = fields[fieldName]
      const {
        required = false,
        type = 'string',
        minLength,
        maxLength,
        pattern,
        allowList,
        sanitize = true
      } = rules

      // 检查必需字段
      if (required && (value === undefined || value === null || value === '')) {
        errors.push(`${fieldName} 是必需的`)
        continue
      }

      // 允许可选字段为空
      if (!required && (value === undefined || value === null || value === '')) {
        sanitized[fieldName] = value
        continue
      }

      // 类型检查
      if (type && typeof value !== type) {
        errors.push(`${fieldName} 必须是 ${type} 类型`)
        continue
      }

      // 字符串验证
      if (typeof value === 'string') {
        // 长度检查
        if (minLength && value.length < minLength) {
          errors.push(`${fieldName} 长度不能少于 ${minLength}`)
          continue
        }

        if (maxLength && value.length > maxLength) {
          errors.push(`${fieldName} 长度不能超过 ${maxLength}`)
          continue
        }

        // 模式匹配
        if (pattern && !pattern.test(value)) {
          errors.push(`${fieldName} 格式无效`)
          continue
        }

        // 允许列表检查
        if (allowList && !allowList.includes(value)) {
          errors.push(`${fieldName} 不在允许的值列表中`)
          continue
        }

        // 清理
        sanitized[fieldName] = sanitize ? this.sanitizeHtml(value.trim()) : value.trim()
      } else {
        sanitized[fieldName] = value
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized
    }
  }
}

module.exports = InputValidator
