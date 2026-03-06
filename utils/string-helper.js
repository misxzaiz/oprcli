/**
 * 字符串工具模块
 * 提供常用的字符串操作方法
 */

/**
 * 截断字符串到指定长度
 * @param {string} str - 原字符串
 * @param {number} maxLength - 最大长度
 * @param {string} suffix - 后缀（默认 '...'）
 * @returns {string}
 */
function truncate(str, maxLength, suffix = '...') {
  if (!str || str.length <= maxLength) return str || ''
  return str.substring(0, maxLength) + suffix
}

/**
 * 生成字符串预览（用于日志）
 * @param {string} str - 原字符串
 * @param {number} maxLength - 最大长度（默认 100）
 * @returns {string}
 */
function preview(str, maxLength = 100) {
  if (!str) return ''
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength) + '...'
}

/**
 * 安全 trim，处理 null/undefined
 * @param {string} str - 原字符串
 * @returns {string}
 */
function safeTrim(str) {
  return str ? str.trim() : ''
}

/**
 * 检查字符串是否为空（仅空白字符）
 * @param {string} str - 原字符串
 * @returns {boolean}
 */
function isEmpty(str) {
  return !str || str.trim().length === 0
}

/**
 * 检查字符串是否非空
 * @param {string} str - 原字符串
 * @returns {boolean}
 */
function isNonEmpty(str) {
  return str && str.trim().length > 0
}

/**
 * 简单哈希函数（用于去重）
 * @param {string} str - 原字符串
 * @returns {string|null}
 */
function simpleHash(str) {
  if (!str) return null
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return hash.toString(16)
}

module.exports = {
  truncate,
  preview,
  safeTrim,
  isEmpty,
  isNonEmpty,
  simpleHash
}
