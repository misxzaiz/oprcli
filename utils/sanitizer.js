/**
 * 敏感信息脱敏工具
 * 用于保护敏感配置信息（API Key、Token、Secret等）
 *
 * 功能：
 * - 自动识别敏感字段
 * - 提供脱敏方法
 * - 支持自定义敏感字段
 * - 支持对象、字符串、数组脱敏
 */

class Sanitizer {
  constructor() {
    // 默认敏感字段模式
    this.sensitivePatterns = [
      /password/i,
      /passwd/i,
      /secret/i,
      /token/i,
      /apikey/i,
      /api[_-]?key/i,
      /access[_-]?token/i,
      /refresh[_-]?token/i,
      /private[_-]?key/i,
      /auth/i,
      /credential/i,
      /webhook/i,
      /client[_-]?secret/i,
      /client[_-]?id/i
    ]

    // 敏感值模式（检测敏感数据格式）
    this.sensitiveValuePatterns = [
      // Bearer Token
      /^Bearer\s+[A-Za-z0-9\-._~+\/]+=*$/i,
      // API Key 格式（常见格式）
      /^[A-Za-z0-9]{32,}$/,
      // JWT Token
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/,
      // Webhook URL
      /oapi\.dingtalk\.com\/robot\/send/i,
      // 密钥格式（sk-开头）
      /^sk-[A-Za-z0-9]{32,}/i,
      // Session ID
      /^sess[a-z0-9]{32,}$/i
    ]
  }

  /**
   * 检查字段名是否敏感
   * @param {string} fieldName - 字段名
   * @returns {boolean}
   */
  isSensitiveField(fieldName) {
    if (!fieldName || typeof fieldName !== 'string') return false

    return this.sensitivePatterns.some(pattern =>
      pattern.test(fieldName)
    )
  }

  /**
   * 检查值是否看起来像敏感数据
   * @param {string} value - 值
   * @returns {boolean}
   */
  isSensitiveValue(value) {
    if (!value || typeof value !== 'string') return false

    return this.sensitiveValuePatterns.some(pattern =>
      pattern.test(value)
    )
  }

  /**
   * 脱敏单个值
   * @param {string} value - 原始值
   * @param {string} fieldName - 字段名（可选，用于判断）
   * @returns {string} - 脱敏后的值
   */
  sanitizeValue(value, fieldName = null) {
    if (value === null || value === undefined) {
      return value
    }

    const strValue = String(value)

    // 检查字段名或值是否敏感
    const isSensitive = this.isSensitiveField(fieldName) || this.isSensitiveValue(strValue)

    if (!isSensitive) {
      return value
    }

    // 脱敏策略：保留前4位和后4位，中间用***代替
    if (strValue.length <= 8) {
      // 如果值太短，全部隐藏
      return '***'
    }

    const start = strValue.substring(0, 4)
    const end = strValue.substring(strValue.length - 4)
    const maskedLength = Math.max(3, strValue.length - 8)

    return `${start}${'*'.repeat(maskedLength)}${end}`
  }

  /**
   * 脱敏对象
   * @param {Object} obj - 原始对象
   * @returns {Object} - 脱敏后的对象
   */
  sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') {
      return obj
    }

    const result = Array.isArray(obj) ? [] : {}

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key]

        if (value === null || value === undefined) {
          result[key] = value
        } else if (typeof value === 'object') {
          // 递归处理嵌套对象
          result[key] = this.sanitizeObject(value)
        } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          // 脱敏基本类型值
          result[key] = this.sanitizeValue(value, key)
        } else {
          result[key] = value
        }
      }
    }

    return result
  }

  /**
   * 脱敏配置对象（主要方法）
   * @param {Object} config - 配置对象
   * @param {Array<string>} additionalFields - 额外需要脱敏的字段
   * @returns {Object} - 脱敏后的配置对象
   */
  sanitizeConfig(config, additionalFields = []) {
    if (!config || typeof config !== 'object') {
      return config
    }

    // 如果用户指定了额外字段，临时添加到敏感模式中
    const originalPatterns = [...this.sensitivePatterns]

    additionalFields.forEach(field => {
      const pattern = new RegExp(field, 'i')
      this.sensitivePatterns.push(pattern)
    })

    const result = this.sanitizeObject(config)

    // 恢复原始模式
    this.sensitivePatterns = originalPatterns

    return result
  }

  /**
   * 脱敏日志消息中的敏感信息
   * @param {string} message - 日志消息
   * @returns {string} - 脱敏后的消息
   */
  sanitizeMessage(message) {
    if (!message || typeof message !== 'string') {
      return message
    }

    let result = message

    // 查找并替换可能的敏感值
    // 匹配常见的密钥格式
    const secretPatterns = [
      // Webhook URL with token
      /access_token=[A-Za-z0-9\-_]+/gi,
      // Bearer tokens
      /Bearer\s+[A-Za-z0-9\-._~+\/]+=*/gi,
      // API keys in query params
      /(?:api[_-]?key|token|secret)=[A-Za-z0-9\-._~+\/]+/gi,
      // 钉钉 webhook URL
      /oapi\.dingtalk\.com\/robot\/send\?access_token=[A-Za-z0-9\-]+/gi
    ]

    secretPatterns.forEach(pattern => {
      result = result.replace(pattern, (match) => {
        // 保留部分结构，替换敏感部分
        if (match.includes('access_token=')) {
          return 'access_token=***'
        } else if (match.toLowerCase().startsWith('bearer')) {
          return 'Bearer ***'
        } else {
          return match.split('=')[0] + '=***'
        }
      })
    })

    return result
  }

  /**
   * 添加自定义敏感字段模式
   * @param {RegExp|Array<RegExp>} patterns - 正则表达式模式
   */
  addSensitivePattern(patterns) {
    if (Array.isArray(patterns)) {
      this.sensitivePatterns.push(...patterns)
    } else if (patterns instanceof RegExp) {
      this.sensitivePatterns.push(patterns)
    }
  }

  /**
   * 获取当前敏感字段模式列表
   * @returns {Array<string>} - 模式描述列表
   */
  getSensitivePatterns() {
    return this.sensitivePatterns.map(pattern =>
      pattern.toString()
    )
  }
}

// 导出单例
module.exports = new Sanitizer()

// 也导出类以便测试
module.exports.SanitizerClass = Sanitizer
