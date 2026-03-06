/**
 * 输入验证工具集
 * 提供全面的输入验证和清理功能
 *
 * @version 1.0.0
 * @lastUpdated 2026-03-05
 */

const { performance } = require('perf_hooks')

/**
 * 验证结果类
 */
class ValidationResult {
  constructor(valid = true, errors = [], warnings = []) {
    this.valid = valid
    this.errors = errors
    this.warnings = warnings
  }

  addError(message) {
    this.errors.push(message)
    this.valid = false
  }

  addWarning(message) {
    this.warnings.push(message)
  }

  toJSON() {
    return {
      valid: this.valid,
      errors: this.errors,
      warnings: this.warnings,
      errorCount: this.errors.length,
      warningCount: this.warnings.length
    }
  }
}

/**
 * 输入验证器
 */
class InputValidator {
  /**
   * 验证字符串输入
   */
  static validateString(input, options = {}) {
    const {
      minLength = 0,
      maxLength = 10000,
      required = false,
      pattern = null,
      allowEmpty = true,
      trim = true
    } = options

    const result = new ValidationResult()

    // 空值检查
    if (input === null || input === undefined) {
      if (required) {
        result.addError('输入不能为空')
      }
      return result
    }

    // 类型检查
    if (typeof input !== 'string') {
      result.addError('输入必须是字符串')
      return result
    }

    // 处理字符串
    let value = trim ? input.trim() : input

    // 空字符串检查
    if (!allowEmpty && value.length === 0) {
      result.addError('输入不能为空字符串')
    }

    // 长度检查
    if (value.length < minLength) {
      result.addError(`输入长度不能少于 ${minLength} 个字符`)
    }

    if (value.length > maxLength) {
      result.addError(`输入长度不能超过 ${maxLength} 个字符`)
    }

    // 模式匹配
    if (pattern && !pattern.test(value)) {
      result.addError('输入格式不正确')
    }

    // 安全性检查：防止路径遍历攻击
    if (value.includes('..') || value.includes('\\')) {
      result.addWarning('输入包含可疑字符')
    }

    return result
  }

  /**
   * 验证数字输入
   */
  static validateNumber(input, options = {}) {
    const {
      min = Number.MIN_SAFE_INTEGER,
      max = Number.MAX_SAFE_INTEGER,
      required = false,
      integer = false
    } = options

    const result = new ValidationResult()

    // 空值检查
    if (input === null || input === undefined) {
      if (required) {
        result.addError('输入不能为空')
      }
      return result
    }

    // 类型检查
    const num = Number(input)
    if (isNaN(num)) {
      result.addError('输入必须是有效数字')
      return result
    }

    // 整数检查
    if (integer && !Number.isInteger(num)) {
      result.addError('输入必须是整数')
    }

    // 范围检查
    if (num < min) {
      result.addError(`输入不能小于 ${min}`)
    }

    if (num > max) {
      result.addError(`输入不能大于 ${max}`)
    }

    return result
  }

  /**
   * 验证对象输入
   */
  static validateObject(input, options = {}) {
    const {
      required = false,
      allowedKeys = null,
      requiredKeys = []
    } = options

    const result = new ValidationResult()

    // 空值检查
    if (input === null || input === undefined) {
      if (required) {
        result.addError('输入不能为空')
      }
      return result
    }

    // 类型检查
    if (typeof input !== 'object' || Array.isArray(input)) {
      result.addError('输入必须是对象')
      return result
    }

    // 检查必需的键
    for (const key of requiredKeys) {
      if (!(key in input)) {
        result.addError(`缺少必需的字段: ${key}`)
      }
    }

    // 检查允许的键
    if (allowedKeys) {
      const keys = Object.keys(input)
      for (const key of keys) {
        if (!allowedKeys.includes(key)) {
          result.addWarning(`包含不允许的字段: ${key}`)
        }
      }
    }

    return result
  }

  /**
   * 验证数组输入
   */
  static validateArray(input, options = {}) {
    const {
      minLength = 0,
      maxLength = 1000,
      required = false,
      itemValidator = null
    } = options

    const result = new ValidationResult()

    // 空值检查
    if (input === null || input === undefined) {
      if (required) {
        result.addError('输入不能为空')
      }
      return result
    }

    // 类型检查
    if (!Array.isArray(input)) {
      result.addError('输入必须是数组')
      return result
    }

    // 长度检查
    if (input.length < minLength) {
      result.addError(`数组长度不能少于 ${minLength}`)
    }

    if (input.length > maxLength) {
      result.addError(`数组长度不能超过 ${maxLength}`)
    }

    // 元素验证
    if (itemValidator) {
      input.forEach((item, index) => {
        const itemResult = itemValidator(item)
        if (!itemResult.valid) {
          result.addError(`数组元素 [${index}] 验证失败: ${itemResult.errors.join(', ')}`)
        }
      })
    }

    return result
  }

  /**
   * 验证命令输入（安全检查）
   */
  static validateCommand(input, options = {}) {
    const {
      allowedCommands = [],
      allowShellOperators = false
    } = options

    const result = new ValidationResult()

    if (!input || typeof input !== 'string') {
      result.addError('命令必须是字符串')
      return result
    }

    const trimmed = input.trim()

    // 空命令检查
    if (trimmed.length === 0) {
      result.addError('命令不能为空')
      return result
    }

    // 危险字符检查
    const dangerousPatterns = [
      /\|/,  // 管道符
      /;/,   // 命令分隔符
      /&/,   // 后台运行
      /\$\(/, // 命令替换
      /`/,   // 反引号命令替换
      /\n/,  // 换行符
      /\r/,  // 回车符
      /\t/   // 制表符
    ]

    if (!allowShellOperators) {
      for (const pattern of dangerousPatterns) {
        if (pattern.test(trimmed)) {
          result.addError('命令包含不允许的字符或操作符')
          break
        }
      }
    }

    // 白名单检查
    if (allowedCommands.length > 0) {
      const command = trimmed.split(' ')[0]
      if (!allowedCommands.includes(command)) {
        result.addError(`命令 "${command}" 不在允许列表中`)
      }
    }

    return result
  }

  /**
   * 清理输入字符串
   */
  static sanitize(input, options = {}) {
    const {
      trim = true,
      removeControlChars = true,
      maxLength = null
    } = options

    if (typeof input !== 'string') {
      return input
    }

    let result = input

    // 去除首尾空格
    if (trim) {
      result = result.trim()
    }

    // 移除控制字符
    if (removeControlChars) {
      result = result.replace(/[\x00-\x1F\x7F]/g, '')
    }

    // 限制长度
    if (maxLength && result.length > maxLength) {
      result = result.substring(0, maxLength)
    }

    return result
  }
}

/**
 * 请求体验证器
 */
class RequestValidator {
  /**
   * 验证请求体
   */
  static validateBody(body, schema) {
    const result = new ValidationResult()

    if (!body || typeof body !== 'object') {
      result.addError('请求体必须是有效对象')
      return result
    }

    // 验证必需字段
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in body)) {
          result.addError(`缺少必需字段: ${field}`)
        }
      }
    }

    // 验证字段类型和格式
    if (schema.properties) {
      for (const [field, rules] of Object.entries(schema.properties)) {
        if (field in body) {
          const value = body[field]

          // 类型检查
          if (rules.type && typeof value !== rules.type) {
            result.addError(`字段 "${field}" 类型错误，期望 ${rules.type}`)
          }

          // 枚举检查
          if (rules.enum && !rules.enum.includes(value)) {
            result.addError(`字段 "${field}" 值不在允许范围内`)
          }

          // 自定义验证器
          if (rules.validator) {
            const fieldResult = rules.validator(value)
            if (!fieldResult.valid) {
              result.addError(`字段 "${field}": ${fieldResult.errors.join(', ')}`)
            }
          }
        }
      }
    }

    return result
  }
}

/**
 * 性能验证器
 */
class PerformanceValidator {
  static checkPerformanceThreshold(duration, threshold, operation) {
    if (duration > threshold) {
      return {
        passed: false,
        message: `${operation} 性能警告: 执行时间 ${duration}ms 超过阈值 ${threshold}ms`,
        severity: duration > threshold * 2 ? 'critical' : 'warning'
      }
    }
    return {
      passed: true,
      message: `${operation} 性能正常: ${duration}ms`,
      severity: 'info'
    }
  }
}

module.exports = {
  ValidationResult,
  InputValidator,
  RequestValidator,
  PerformanceValidator
}
