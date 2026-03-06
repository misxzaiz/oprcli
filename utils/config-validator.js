/**
 * 配置验证工具模块
 *
 * 提供统一的配置验证规则和工具函数
 * 用于 utils/config.js 和 plugins/core/config-manager.js
 *
 * @module utils/config-validator
 * @created 2026-03-06 (ISS-038 优化)
 */

/**
 * 验证端口号范围（基础验证）
 * @param {number} port - 端口号
 * @returns {{valid: boolean, isInPrivilegedRange: boolean}}
 */
function checkPortRange(port) {
  if (typeof port !== 'number' || isNaN(port)) {
    return { valid: false, isInPrivilegedRange: false };
  }

  if (port < 1 || port > 65535) {
    return { valid: false, isInPrivilegedRange: false };
  }

  return {
    valid: true,
    isInPrivilegedRange: port < 1024
  };
}

/**
 * 检查 Provider 是否有效
 * @param {string} provider - Provider 值
 * @param {string[]} validProviders - 有效的 Provider 列表
 * @returns {boolean}
 */
function isValidProvider(provider, validProviders = ['claude', 'iflow']) {
  return validProviders.includes(provider);
}

/**
 * 验证 Provider 类型（返回错误消息）
 * @param {string} provider - Provider 值
 * @param {string[]} validProviders - 有效的 Provider 列表
 * @returns {{valid: boolean, error?: string}}
 */
function validateProvider(provider, validProviders = ['claude', 'iflow']) {
  if (!provider) {
    return { valid: false, error: 'Provider 未配置' };
  }

  if (!validProviders.includes(provider)) {
    return {
      valid: false,
      error: `无效的 PROVIDER 值: "${provider}"，有效值为: ${validProviders.join(', ')}`
    };
  }

  return { valid: true };
}

/**
 * 验证端口号（返回错误和警告数组）
 * @param {number} port - 端口号
 * @param {string} fieldName - 字段名称（用于错误消息）
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 */
function validatePort(port, fieldName = 'PORT') {
  const errors = [];
  const warnings = [];

  if (port !== null && port !== undefined) {
    const checkResult = checkPortRange(port);

    if (!checkResult.valid) {
      if (typeof port !== 'number' || isNaN(port)) {
        errors.push(`${fieldName} 必须是数字，当前值: ${port}`);
      } else {
        errors.push(`${fieldName} 超出有效范围 (1-65535)，当前值: ${port}`);
      }
    } else if (checkResult.isInPrivilegedRange) {
      warnings.push(`使用特权端口 (${port}) 可能需要管理员权限`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * 验证主机地址格式
 * @param {string} host - 主机地址
 * @returns {{valid: boolean, warning?: string}}
 */
function validateHost(host) {
  if (!host) {
    return { valid: true };
  }

  // 验证主机地址格式：*、IP地址、域名
  const hostPattern = /^(\*|[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}|[a-zA-Z0-9.-]+)$/;

  if (!hostPattern.test(host)) {
    return {
      valid: false,
      warning: 'server.host 格式可能不正确'
    };
  }

  return { valid: true };
}

/**
 * 验证数值范围
 * @param {number} value - 数值
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @param {string} fieldName - 字段名称
 * @returns {{valid: boolean, warning?: string}}
 */
function validateRange(value, min, max, fieldName) {
  if (value === undefined || value === null) {
    return { valid: true };
  }

  if (typeof value !== 'number' || isNaN(value)) {
    return {
      valid: false,
      warning: `${fieldName} 必须是数字`
    };
  }

  if (value < min || value > max) {
    return {
      valid: false,
      warning: `${fieldName} 建议在 ${min}-${max} 之间`
    };
  }

  return { valid: true };
}

/**
 * 验证超时时间
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {{valid: boolean, warning?: string}}
 */
function validateTimeout(timeout) {
  return validateRange(timeout, 1000, 600000, '连接器超时时间');
}

/**
 * 验证并发数
 * @param {number} concurrent - 并发数
 * @returns {{valid: boolean, warning?: string}}
 */
function validateConcurrent(concurrent) {
  return validateRange(concurrent, 1, 10, '并发任务数');
}

/**
 * 验证重试次数
 * @param {number} retryTimes - 重试次数
 * @returns {{valid: boolean, warning?: string}}
 */
function validateRetryTimes(retryTimes) {
  return validateRange(retryTimes, 0, 10, '重试次数');
}

/**
 * 验证内存缓存配置
 * @param {number} maxSize - 最大条目数
 * @param {number} defaultTTL - 默认TTL（毫秒）
 * @returns {{valid: boolean, warnings: string[]}}
 */
function validateMemoryConfig(maxSize, defaultTTL) {
  const warnings = [];

  if (maxSize !== undefined) {
    const sizeResult = validateRange(maxSize, 100, 10000, '内存最大条目数');
    if (!sizeResult.valid && sizeResult.warning) {
      warnings.push(sizeResult.warning);
    }
  }

  if (defaultTTL !== undefined) {
    // 默认7天
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    if (defaultTTL > oneWeek) {
      warnings.push('默认 TTL 过长，建议不超过 7 天');
    }
  }

  return { valid: true, warnings };
}

/**
 * 验证流式输出配置
 * @param {number} interval - 输出间隔（毫秒）
 * @param {number} maxLength - 最大长度
 * @returns {{valid: boolean, warnings: string[]}}
 */
function validateStreamingConfig(interval, maxLength) {
  const warnings = [];

  if (interval !== undefined && interval < 100) {
    warnings.push(`流式输出间隔过短 (${interval}ms)，可能导致性能问题，建议设置为 500ms 或更长`);
  }

  if (maxLength !== undefined && maxLength > 10000) {
    warnings.push(`流式输出最大长度过长 (${maxLength})，可能导致消息截断或显示问题`);
  }

  return { valid: true, warnings };
}

/**
 * 创建验证结果对象
 * @param {boolean} valid - 是否有效
 * @param {string[]} errors - 错误列表
 * @param {string[]} warnings - 警告列表
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 */
function createResult(valid = true, errors = [], warnings = []) {
  return {
    valid,
    errors: Array.isArray(errors) ? errors : [],
    warnings: Array.isArray(warnings) ? warnings : []
  };
}

/**
 * 合并多个验证结果
 * @param {...Object} results - 验证结果对象
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 */
function mergeResults(...results) {
  const allErrors = [];
  const allWarnings = [];

  for (const result of results) {
    if (result.errors) {
      allErrors.push(...result.errors);
    }
    if (result.warnings) {
      allWarnings.push(...result.warnings);
    }
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings
  };
}

module.exports = {
  // 基础检查函数（返回 boolean 或简单对象）
  checkPortRange,
  isValidProvider,

  // 验证函数（返回标准验证结果）
  validatePort,
  validateProvider,
  validateHost,
  validateRange,

  // 特定配置验证
  validateTimeout,
  validateConcurrent,
  validateRetryTimes,
  validateMemoryConfig,
  validateStreamingConfig,

  // 工具函数
  createResult,
  mergeResults
};
