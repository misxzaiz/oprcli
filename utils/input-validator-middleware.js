/**
 * 请求体验证中间件（增强版）
 * 用于 Express 的请求验证中间件
 *
 * @version 2.0.0
 * @created 2026-03-05
 *
 * 功能：
 * - 请求体验证（body/query/params）
 * - 安全威胁检测（XSS、SQL注入、命令注入等）
 * - 快速安全检查
 * - 综合验证规则
 */

const { ValidationError } = require('./app-errors')

/**
 * XSS 攻击检测模式
 */
const XSS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi, // onclick=, onload=, etc.
  /<iframe/gi,
  /<embed/gi,
  /<object/gi
]

/**
 * SQL 注入检测模式
 */
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/gi,
  /(--|\#|\/\*|\*\/)/g,
  /(\bor\b|\band\b).*?=/gi,
  /'.*?=.*'/gi
]

/**
 * NoSQL 注入检测模式
 */
const NOSQL_INJECTION_PATTERNS = [
  /\$where/gi,
  /\$ne/gi,
  /\$in/gi,
  /\$gt/gi,
  /\$lt/gi,
  /\{.*?\$.*?\}/gi
]

/**
 * 路径遍历检测模式
 */
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//g,
  /\.\./g,
  /%2e%2e/gi,
  /%2e%2e%2f/gi,
  /\.\.\/\.\.\//g
]

/**
 * 命令注入检测模式
 */
const COMMAND_INJECTION_PATTERNS = [
  /[;&|`$()]/g,
  /\beval\b/gi,
  /\bexec\b/gi,
  /\bsystem\b/gi
]

/**
 * 检测恶意输入
 * @param {string} value - 要检查的值
 * @param {Array} patterns - 检测模式
 * @param {string} attackType - 攻击类型名称
 * @returns {boolean} 是否检测到威胁
 */
function detectMaliciousInput(value, patterns, attackType) {
  if (typeof value !== 'string') return false

  for (const pattern of patterns) {
    if (pattern.test(value)) {
      return true
    }
  }

  return false
}

/**
 * 综合安全检查
 * @param {string} value - 要检查的值
 * @returns {Array} 检测到的威胁列表
 */
function securityCheck(value) {
  const threats = []

  if (typeof value !== 'string') return threats

  if (detectMaliciousInput(value, XSS_PATTERNS, 'XSS')) {
    threats.push('XSS')
  }

  if (detectMaliciousInput(value, SQL_INJECTION_PATTERNS, 'SQL 注入')) {
    threats.push('SQL_INJECTION')
  }

  if (detectMaliciousInput(value, NOSQL_INJECTION_PATTERNS, 'NoSQL 注入')) {
    threats.push('NOSQL_INJECTION')
  }

  if (detectMaliciousInput(value, PATH_TRAVERSAL_PATTERNS, '路径遍历')) {
    threats.push('PATH_TRAVERSAL')
  }

  if (detectMaliciousInput(value, COMMAND_INJECTION_PATTERNS, '命令注入')) {
    threats.push('COMMAND_INJECTION')
  }

  return threats
}

/**
 * 验证字符串字段
 * @param {*} value - 要验证的值
 * @param {Object} options - 验证选项
 * @returns {string|null} 错误信息或 null
 */
function validateString(value, options = {}) {
  const {
    fieldName = 'field',
    required = false,
    minLength = 0,
    maxLength = 1000,
    pattern = null,
    allowEmpty = false
  } = options

  // 检查必填
  if (required && (value === undefined || value === null)) {
    return `${fieldName} 是必填字段`
  }

  // 如果非必填且为空，则跳过验证
  if (!required && (value === undefined || value === null)) {
    return null
  }

  // 检查类型
  if (typeof value !== 'string') {
    return `${fieldName} 必须是字符串`
  }

  // 检查空字符串
  if (!allowEmpty && value.trim().length === 0) {
    return `${fieldName} 不能为空字符串`
  }

  // 检查长度
  if (value.length < minLength) {
    return `${fieldName} 长度不能少于 ${minLength} 个字符`
  }

  if (value.length > maxLength) {
    return `${fieldName} 长度不能超过 ${maxLength} 个字符`
  }

  // 检查正则表达式
  if (pattern && !pattern.test(value)) {
    return `${fieldName} 格式不正确`
  }

  return null
}

/**
 * 请求体验证中间件工厂
 * @param {Object} schema - 验证模式
 * @returns {Function} Express 中间件
 *
 * @example
 * // 在路由中使用
 * app.post('/api/message',
 *   validateRequest({
 *     body: {
 *       message: { required: true, minLength: 1, maxLength: 10000 },
 *       sessionId: { required: false, pattern: /^[a-zA-Z0-9\-_]+$/ }
 *     }
 *   }),
 *   handler
 * )
 */
function validateRequest(schema = {}) {
  return (req, res, next) => {
    const errors = []

    // 验证 body
    if (schema.body) {
      for (const [field, rules] of Object.entries(schema.body)) {
        const value = req.body?.[field]
        const error = validateString(value, { ...rules, fieldName: field })

        if (error) {
          errors.push({ field, error, location: 'body' })
          continue
        }

        // 安全检查
        if (typeof value === 'string' && rules.securityCheck !== false) {
          const threats = securityCheck(value)
          if (threats.length > 0) {
            errors.push({
              field,
              error: `检测到安全威胁: ${threats.join(', ')}`,
              location: 'body',
              threats
            })
          }
        }
      }
    }

    // 验证 query
    if (schema.query) {
      for (const [field, rules] of Object.entries(schema.query)) {
        const value = req.query?.[field]
        const error = validateString(value, { ...rules, fieldName: field })

        if (error) {
          errors.push({ field, error, location: 'query' })
          continue
        }

        // 安全检查
        if (typeof value === 'string' && rules.securityCheck !== false) {
          const threats = securityCheck(value)
          if (threats.length > 0) {
            errors.push({
              field,
              error: `检测到安全威胁: ${threats.join(', ')}`,
              location: 'query',
              threats
            })
          }
        }
      }
    }

    // 验证 params
    if (schema.params) {
      for (const [field, rules] of Object.entries(schema.params)) {
        const value = req.params?.[field]
        const error = validateString(value, { ...rules, fieldName: field })

        if (error) {
          errors.push({ field, error, location: 'params' })
        }
      }
    }

    // 如果有错误，返回 400
    if (errors.length > 0) {
      req.logger?.warn('VALIDATION', '请求验证失败', {
        requestId: req.id,
        errors
      })

      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '请求数据验证失败',
          details: errors
        }
      })
    }

    next()
  }
}

/**
 * 快速安全检查中间件（仅安全检查，不验证字段）
 * @param {Object} options - 配置选项
 * @returns {Function} Express 中间件
 *
 * @example
 * // 全局安全检查
 * app.use(quickSecurityCheck({
 *   checkBody: true,
 *   checkQuery: true,
 *   checkParams: false,
 *   throwOnThreat: true
 * }))
 */
function quickSecurityCheck(options = {}) {
  const {
    checkBody = true,
    checkQuery = true,
    checkParams = false,
    throwOnThreat = true,
    logOnly = false // 仅记录，不拒绝
  } = options

  return (req, res, next) => {
    const threats = []

    // 检查 body
    if (checkBody && req.body) {
      checkObjectForThreats(req.body, threats, 'body')
    }

    // 检查 query
    if (checkQuery && req.query) {
      checkObjectForThreats(req.query, threats, 'query')
    }

    // 检查 params
    if (checkParams && req.params) {
      checkObjectForThreats(req.params, threats, 'params')
    }

    // 如果检测到威胁
    if (threats.length > 0) {
      req.logger?.error('SECURITY', '检测到安全威胁', {
        requestId: req.id,
        threats,
        ip: req.ip,
        path: req.path,
        method: req.method
      })

      if (!logOnly && throwOnThreat) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'SECURITY_THREAT_DETECTED',
            message: '检测到潜在的恶意输入',
            details: threats
          }
        })
      }
    }

    next()
  }
}

/**
 * 递归检查对象中的威胁
 * @param {*} obj - 要检查的对象
 * @param {Array} threats - 威胁列表
 * @param {string} location - 位置信息
 */
function checkObjectForThreats(obj, threats, location) {
  if (typeof obj === 'string') {
    const detectedThreats = securityCheck(obj)
    if (detectedThreats.length > 0) {
      threats.push({
        location,
        threats: detectedThreats,
        value: obj.substring(0, 100) // 只记录前100个字符
      })
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      checkObjectForThreats(item, threats, location)
    }
  } else if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      checkObjectForThreats(value, threats, `${location}.${key}`)
    }
  }
}

/**
 * 常用验证规则
 */
const commonRules = {
  // sessionId: 字母数字和连字符
  sessionId: {
    pattern: /^[a-zA-Z0-9\-_]+$/,
    maxLength: 100,
    securityCheck: false
  },

  // message: 消息内容
  message: {
    required: true,
    minLength: 1,
    maxLength: 10000,
    allowEmpty: false,
    securityCheck: true
  },

  // provider: 提供商名称
  provider: {
    pattern: /^(claude|iflow)$/i,
    maxLength: 10,
    securityCheck: false
  }
}

/**
 * 预定义的验证模式
 */
const schemas = {
  // POST /api/message
  sendMessage: {
    body: {
      message: commonRules.message,
      sessionId: { ...commonRules.sessionId, required: false }
    }
  },

  // POST /api/connect
  connect: {
    body: {
      provider: commonRules.provider
    }
  },

  // GET /api/status
  getStatus: {
    query: {
      sessionId: { ...commonRules.sessionId, required: false }
    }
  }
}

module.exports = {
  validateRequest,
  quickSecurityCheck,
  validateString,
  securityCheck,
  detectMaliciousInput,
  commonRules,
  schemas,
  // 导出检测模式供自定义使用
  XSS_PATTERNS,
  SQL_INJECTION_PATTERNS,
  NOSQL_INJECTION_PATTERNS,
  PATH_TRAVERSAL_PATTERNS,
  COMMAND_INJECTION_PATTERNS
}
