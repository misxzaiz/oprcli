/**
 * 安全增强工具
 *
 * 功能：
 * - 添加额外的安全头
 * - 实现 CSP (Content Security Policy)
 * - 增强安全配置
 * - 提供安全相关的辅助函数
 *
 * @version 1.0.0
 */

const Logger = require('../integrations/logger')

class SecurityEnhancer {
  constructor(logger) {
    this.logger = logger || new Logger({ level: 'WARN' })
  }

  /**
   * 创建增强的安全头配置
   */
  createEnhancedSecurityHeaders(options = {}) {
    const {
      enableCSP = true,
      enableHSTS = true,
      enableFrameGuard = true,
      enableXSSFilter = true,
      enableContentTypeOptions = true,
      enableReferrerPolicy = true,
      enablePermissionsPolicy = true,
      customNonce = null
    } = options

    const headers = {}

    // X-Frame-Options: 防止点击劫持
    if (enableFrameGuard) {
      headers['X-Frame-Options'] = 'DENY'
      headers['X-Content-Type-Options'] = 'nosniff'
    }

    // X-XSS-Protection: 启用 XSS 过滤器
    if (enableXSSFilter) {
      headers['X-XSS-Protection'] = '1; mode=block'
    }

    // Strict-Transport-Security: 强制 HTTPS
    if (enableHSTS) {
      headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    }

    // Content-Security-Policy: 内容安全策略
    if (enableCSP) {
      headers['Content-Security-Policy'] = this.buildCSP({
        customNonce,
        enableScriptSrc: true,
        enableStyleSrc: true,
        enableImgSrc: true,
        enableConnectSrc: true,
        enableFontSrc: true,
        enableObjectSrc: false,
        enableMediaSrc: true,
        enableFrameSrc: false
      })
    }

    // Referrer-Policy: 控制 Referer 信息
    if (enableReferrerPolicy) {
      headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    }

    // Permissions-Policy: 控制浏览器功能
    if (enablePermissionsPolicy) {
      headers['Permissions-Policy'] = this.buildPermissionsPolicy()
    }

    // 其他安全头
    headers['X-Permitted-Cross-Domain-Policies'] = 'none'
    headers['Cross-Origin-Opener-Policy'] = 'same-origin'
    headers['Cross-Origin-Resource-Policy'] = 'same-origin'

    return headers
  }

  /**
   * 构建 Content-Security-Policy
   */
  buildCSP(options = {}) {
    const {
      customNonce,
      enableScriptSrc = true,
      enableStyleSrc = true,
      enableImgSrc = true,
      enableConnectSrc = true,
      enableFontSrc = true,
      enableObjectSrc = false,
      enableMediaSrc = true,
      enableFrameSrc = false
    } = options

    const nonce = customNonce ? `'nonce-${customNonce}'` : ''

    const directives = []

    // default-src: 默认策略
    directives.push("default-src 'self'")

    // script-src: 脚本来源
    if (enableScriptSrc) {
      const scriptSrc = ["script-src 'self'"]
      if (nonce) scriptSrc.push(nonce)
      directives.push(scriptSrc.join(' '))
    }

    // style-src: 样式来源
    if (enableStyleSrc) {
      const styleSrc = ["style-src 'self'", "'unsafe-inline'"]
      if (nonce) styleSrc.push(nonce)
      directives.push(styleSrc.join(' '))
    }

    // img-src: 图片来源
    if (enableImgSrc) {
      directives.push("img-src 'self' data: https:")
    }

    // connect-src: 连接来源
    if (enableConnectSrc) {
      directives.push("connect-src 'self'")
    }

    // font-src: 字体来源
    if (enableFontSrc) {
      directives.push("font-src 'self' data:")
    }

    // object-src: 对象来源
    if (enableObjectSrc) {
      directives.push("object-src 'none'")
    }

    // media-src: 媒体来源
    if (enableMediaSrc) {
      directives.push("media-src 'self' data:")
    }

    // frame-src: 框架来源
    if (enableFrameSrc) {
      directives.push("frame-src 'none'")
    }

    // base-uri: 基础 URI
    directives.push("base-uri 'self'")

    // form-action: 表单提交目标
    directives.push("form-action 'self'")

    // frame-ancestors: 可以嵌入此页面的父页面
    directives.push("frame-ancestors 'none'")

    // upgrade-insecure-requests: 升级不安全的请求
    directives.push("upgrade-insecure-requests")

    return directives.join('; ')
  }

  /**
   * 构建 Permissions-Policy
   */
  buildPermissionsPolicy() {
    const policies = [
      'geolocation=()',
      'midi=()',
      'notifications=()',
      'push=()',
      'sync-xhr=()',
      'microphone=()',
      'camera=()',
      'magnetometer=()',
      'gyroscope=()',
      'speaker=()',
      'vibrate=()',
      'fullscreen=(self)',
      'payment=()',
      'usb=()'
    ]

    return policies.join(', ')
  }

  /**
   * 创建 CSP 中间件
   */
  createCSPMiddleware(options = {}) {
    const csp = this.buildCSP(options)

    return (req, res, next) => {
      res.setHeader('Content-Security-Policy', csp)
      next()
    }
  }

  /**
   * 创建安全头中间件
   */
  createSecurityHeadersMiddleware(options = {}) {
    const headers = this.createEnhancedSecurityHeaders(options)

    return (req, res, next) => {
      Object.entries(headers).forEach(([key, value]) => {
        res.setHeader(key, value)
      })
      next()
    }
  }

  /**
   * 创建随机 nonce (用于 CSP)
   */
  generateNonce() {
    const crypto = require('crypto')
    return crypto.randomBytes(16).toString('base64')
  }

  /**
   * 验证请求来源
   */
  validateOrigin(req, allowedOrigins = []) {
    const origin = req.headers.origin || req.headers.referer

    if (!origin) {
      return false
    }

    // 移除 trailing slash
    const normalizedOrigin = origin.replace(/\/$/, '')

    // 检查是否在允许列表中
    return allowedOrigins.some(allowed => {
      const normalizedAllowed = allowed.replace(/\/$/, '')
      return normalizedOrigin === normalizedAllowed ||
             normalizedOrigin.startsWith(normalizedAllowed)
    })
  }

  /**
   * 检测路径遍历攻击
   */
  detectPathTraversal(path) {
    if (typeof path !== 'string') {
      return false
    }

    const traversalPatterns = [
      /\.\.\//,  // ../
      /\.\./,    // ..
      /%2e%2e/,  // URL 编码的 ..
      /%252e/,   // 双重 URL 编码
      /\\..\//,  // Windows 路径遍历
      /\/..\//   // Unix 路径遍历
    ]

    return traversalPatterns.some(pattern => pattern.test(path))
  }

  /**
   * 清理路径，防止路径遍历
   */
  sanitizePath(path) {
    if (typeof path !== 'string') {
      return path
    }

    // 移除路径遍历模式
    return path
      .replace(/\.\./g, '')
      .replace(/[\\/]/g, '/')
      .replace(/\/+/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
  }

  /**
   * 检测 SSRF (服务端请求伪造)
   */
  detectSSRF(url) {
    if (typeof url !== 'string') {
      return false
    }

    try {
      const parsed = new URL(url)

      // 检查是否是内部地址
      const hostname = parsed.hostname

      // 私有 IP 地址范围
      const privateIpPatterns = [
        /^127\./,                          // 127.0.0.0/8 (localhost)
        /^10\./,                           // 10.0.0.0/8
        /^172\.(1[6-9]|2\d|3[01])\./,      // 172.16.0.0/12
        /^192\.168\./,                     // 192.168.0.0/16
        /^localhost$/i,
        /^0\.0\.0\.0$/,
        /^::1$/,
        /^localhost$/i
      ]

      // 检查是否匹配私有 IP
      if (privateIpPatterns.some(pattern => pattern.test(hostname))) {
        return true
      }

      // 检查是否是内部域名
      const internalDomains = [
        'localhost',
        'local',
        'internal',
        'intranet'
      ]

      if (internalDomains.some(domain => hostname.includes(domain))) {
        return true
      }

      return false
    } catch (error) {
      // 无效的 URL
      return true
    }
  }

  /**
   * 检测恶意 User-Agent
   */
  detectMaliciousUserAgent(userAgent) {
    if (typeof userAgent !== 'string') {
      return false
    }

    const maliciousPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scraper/i,
      /curl/i,
      /wget/i,
      /python/i,
      /java/i,
      /perl/i,
      /ruby/i,
      /shodan/i,
      /nikto/i,
      /sqlmap/i
    ]

    // 这些工具本身不是恶意的，但可能表示自动化扫描
    const detected = maliciousPatterns.some(pattern => pattern.test(userAgent))

    if (detected) {
      this.logger.warning('SECURITY', `检测到自动化工具: ${userAgent.substring(0, 50)}`)
    }

    return detected
  }

  /**
   * 创建请求大小限制中间件
   */
  createSizeLimitMiddleware(maxSize = '10mb') {
    return (req, res, next) => {
      const contentLength = parseInt(req.headers['content-length'] || '0', 10)

      // 将 maxSize 转换为字节
      const maxSizeBytes = this.parseSize(maxSize)

      if (contentLength > maxSizeBytes) {
        return res.status(413).json({
          success: false,
          error: `请求体过大，最大允许 ${maxSize}`
        })
      }

      next()
    }
  }

  /**
   * 解析大小字符串（如 '10mb' -> 字节）
   */
  parseSize(size) {
    if (typeof size === 'number') {
      return size
    }

    const match = size.toString().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i)

    if (!match) {
      return 0
    }

    const value = parseFloat(match[1])
    const unit = (match[2] || 'b').toLowerCase()

    const multipliers = {
      b: 1,
      kb: 1024,
      mb: 1024 * 1024,
      gb: 1024 * 1024 * 1024
    }

    return value * multipliers[unit]
  }

  /**
   * 生成安全的 token (用于 CSRF 保护等)
   */
  generateSecureToken(length = 32) {
    const crypto = require('crypto')
    return crypto.randomBytes(length).toString('hex')
  }

  /**
   * 验证 token 格式
   */
  validateToken(token, expectedLength = 64) {
    if (typeof token !== 'string') {
      return false
    }

    // 检查长度（32 字节 = 64 个十六进制字符）
    if (token.length !== expectedLength) {
      return false
    }

    // 检查是否是有效的十六进制字符串
    return /^[a-f0-9]+$/i.test(token)
  }
}

module.exports = SecurityEnhancer
