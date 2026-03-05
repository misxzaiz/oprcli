/**
 * 统一 AI CLI 连接器服务器
 *
 * 支持多个 AI CLI 工具：
 * - Claude Code
 * - IFlow
 *
 * 功能：
 * - Web API 接口
 * - 钉钉机器人集成
 * - 流式事件处理
 * - 会话管理
 */

// 首先加载环境变量（覆盖已存在的环境变量）
require('dotenv').config({ override: true })

const express = require('express')
const helmet = require('helmet')
const config = require('./utils/config')
const Logger = require('./integrations/logger')
const RateLimiter = require('./utils/rate-limiter')
const DingTalkIntegration = require('./integrations/dingtalk')
const MessageFormatter = require('./utils/message-formatter')
const ClaudeConnector = require('./connectors/claude-connector')
const IFlowConnector = require('./connectors/iflow-connector')
const { simpleHash } = require('./utils/string-helper')
const SchedulerModule = require('./scheduler')

// 🆕 核心插件系统
const PluginManager = require('./plugins/core/plugin-manager')
const ConfigManager = require('./plugins/core/config-manager')
const ContextMemory = require('./plugins/core/context-memory')

// 🆕 自定义中间件和启动检查
const {
  requestIdMiddleware,
  errorHandlerMiddleware,
  notFoundMiddleware,
  securityHeadersMiddleware,
  corsMiddleware,
  requestTimeoutMiddleware,
  cacheControlMiddleware,
  performanceMonitorMiddleware,
  getPerformanceStats
} = require('./utils/middleware')
const StartupCheck = require('./utils/startup-check')

// 🆕 新增功能（2026-03-05）
const { createLooseRateLimit, createMediumRateLimit } = require('./utils/rate-limit')
const createHealthRoutes = require('./routes/health')
const { AppError } = require('./utils/app-errors')

// 🆕 性能和稳定性增强（2026-03-05 第二轮优化）
const { CacheManager, createCacheMiddleware } = require('./utils/cache-manager')
const GracefulShutdown = require('./utils/graceful-shutdown')
const MemoryMonitor = require('./utils/memory-monitor')
const { createAxiosRetryInterceptor } = require('./utils/retry-helper')

// 🆕 安全增强（2026-03-05 第三轮优化）
const InputValidator = require('./utils/input-validator')
const SecurityEnhancer = require('./utils/security-enhancer')

// 🆕 安全增强（2026-03-05 第四轮优化）
const { quickSecurityCheck, validateRequest } = require('./utils/input-validator-middleware')
const { requestSizeLimitMiddleware } = require('./utils/middleware')
const { getGlobalMemoryCleaner, memoryCheckMiddleware } = require('./utils/memory-cleaner')
const { requestDeduplication } = require('./utils/request-deduplication')
const { responseCache, cacheStrategies } = require('./utils/response-cache')

class UnifiedServer {
  // 命令配置表
  static COMMANDS = {
    'claude': { type: 'switch', provider: 'claude' },
    'iflow': { type: 'switch', provider: 'iflow' },
    'end': { type: 'interrupt' },
    '停止': { type: 'interrupt' },
    'stop': { type: 'interrupt' },
    'status': { type: 'status' },
    '状态': { type: 'status' },
    'help': { type: 'help' },
    '帮助': { type: 'help' },

    // 定时任务命令
    'tasks': { type: 'tasks_list' },
    'tasks status': { type: 'tasks_status' },
    'tasks reload': { type: 'tasks_reload' },
    'tasks run': { type: 'tasks_run', hasArg: true },
    'tasks enable': { type: 'tasks_enable', hasArg: true },
    'tasks disable': { type: 'tasks_disable', hasArg: true }
  }

  constructor() {
    this.app = express()
    this.logger = new Logger(config.logging)
    this.rateLimiter = new RateLimiter(5, 1000)
    this.dingtalk = new DingTalkIntegration(config.dingtalk, this.logger, this.rateLimiter)
    this.messageFormatter = new MessageFormatter(config.streaming, this.logger)

    // 多模型支持
    this.connectors = new Map()  // 'claude' | 'iflow' -> connector instance
    this.defaultProvider = config.provider

    // 定时任务模块
    this.scheduler = null

    // 🆕 核心插件系统
    this.configManager = new ConfigManager(this.logger)
    this.pluginManager = new PluginManager(this, this.logger)
    this.contextMemory = new ContextMemory(this.logger)

    // 🆕 性能统计（2026-03-05 新增）
    this.performanceStats = null  // 将在中间件中初始化

    // 🆕 内存清理器（2026-03-05 第五轮优化）
    this.memoryCleaner = getGlobalMemoryCleaner({
      logger: this.logger,
      enabled: process.env.MEMORY_CLEANER_ENABLED !== 'false',
      heapUsedPercent: 80,
      rssMemory: 500 * 1024 * 1024,
      triggerCleanup: 70,
      checkInterval: 60000
    })

    // 🆕 缓存管理器（2026-03-05 第二轮优化）
    this.cacheManager = new CacheManager({
      enabled: process.env.CACHE_ENABLED !== 'false',
      defaultTTL: parseInt(process.env.CACHE_TTL || '60000', 10),
      maxEntries: parseInt(process.env.CACHE_MAX_ENTRIES || '1000', 10)
    })

    // 🆕 内存监控器（2026-03-05 第二轮优化）
    this.memoryMonitor = new MemoryMonitor(this.logger, {
      interval: parseInt(process.env.MEMORY_MONITOR_INTERVAL || '60000', 10),
      threshold: parseInt(process.env.MEMORY_THRESHOLD || '524288000', 10), // 500MB
      alertCooldown: parseInt(process.env.MEMORY_ALERT_COOLDOWN || '300000', 10) // 5 分钟
    })

    // 🆕 优雅关闭处理器（2026-03-05 第二轮优化）
    this.gracefulShutdown = null  // 将在 start() 中初始化

    // 🆕 安全增强工具（2026-03-05 第三轮优化）
    this.inputValidator = new InputValidator(this.logger)
    this.securityEnhancer = new SecurityEnhancer(this.logger)

    this._setupMiddleware()
    this._setupRoutes()
    this._setupErrorHandlers()  // 必须在路由之后
  }

  _setupMiddleware() {
    // 🆕 请求 ID 中间件（必须在其他中间件之前）
    this.app.use(requestIdMiddleware)

    // 🛡️ Helmet 安全中间件（2026-03-05 第四轮优化）
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      },
      noSniff: true,
      xssFilter: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
    }))
    this.logger.info('SERVER', '✓ Helmet 安全中间件已配置')

    // 🔒 安全头中间件（2026-03-05 新增）
    this.app.use(securityHeadersMiddleware)
    this.logger.info('SERVER', '✓ 自定义安全头已配置')

    // 🌐 CORS 中间件（根据环境变量启用，2026-03-05 新增）
    if (process.env.CORS_ENABLED === 'true') {
      const corsOrigin = process.env.CORS_ORIGIN || '*'
      const corsMethods = process.env.CORS_METHODS ? process.env.CORS_METHODS.split(',') : ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
      const corsHeaders = process.env.CORS_HEADERS ? process.env.CORS_HEADERS.split(',') : ['Content-Type', 'Authorization']
      const corsCredentials = process.env.CORS_CREDENTIALS === 'true'

      this.app.use(corsMiddleware({
        origin: corsOrigin === '*' ? '*' : corsOrigin,
        methods: corsMethods,
        allowedHeaders: corsHeaders,
        credentials: corsCredentials
      }))
      this.logger.info('SERVER', `✓ CORS 已启用 (来源: ${corsOrigin})`)
    }

    // 🆕 请求体大小限制中间件（2026-03-05 第五轮优化）
    const maxBodySize = parseInt(process.env.MAX_BODY_SIZE || '10485760', 10) // 默认 10MB
    this.app.use(requestSizeLimitMiddleware({
      maxBodySize,
      maxUrlLength: 2000,
      throwOnLimit: true
    }))
    this.logger.info('SERVER', `✓ 请求体大小限制已配置 (最大: ${(maxBodySize / 1024 / 1024).toFixed(2)}MB)`)

    // 🆕 快速安全检查中间件（2026-03-05 第五轮优化）
    if (process.env.SECURITY_CHECK_ENABLED !== 'false') {
      this.app.use(quickSecurityCheck({
        checkBody: true,
        checkQuery: true,
        checkParams: false,
        throwOnThreat: true,
        logOnly: process.env.SECURITY_LOG_ONLY === 'true'
      }))
      this.logger.info('SERVER', '✓ 快速安全检查已启用')
    }

    // 安全配置：限制请求大小（防止DoS攻击）
    this.app.use(express.json({ limit: '10mb' }))
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }))

    // 🆕 内存检查中间件（2026-03-05 第五轮优化）
    const memoryThreshold = parseInt(process.env.MEMORY_THRESHOLD || '90', 10)
    this.app.use(memoryCheckMiddleware({
      threshold: memoryThreshold,
      logger: this.logger,
      rejectOnHighMemory: process.env.REJECT_ON_HIGH_MEMORY === 'true'
    }))
    this.logger.info('SERVER', `✓ 内存检查已配置 (阈值: ${memoryThreshold}%)`)

    // 🆕 请求去重中间件（2026-03-05 第五轮优化）
    if (process.env.REQUEST_DEDUPLICATION_ENABLED !== 'false') {
      const dedupTTL = parseInt(process.env.DEDUP_TTL || '5000', 10)
      this.app.use(requestDeduplication({
        enabled: true,
        excludePaths: ['/health', '/api/health'],
        logDuplicates: true
      }))
      this.logger.info('SERVER', `✓ 请求去重已启用 (TTL: ${dedupTTL}ms)`)
    }

    // 🆕 响应压缩中间件（如果可用）
    try {
      const compression = require('compression')
      this.app.use(compression({
        filter: (req, res) => {
          if (req.headers['x-no-compression']) {
            return false
          }
          return compression.filter(req, res)
        },
        threshold: 1024 // 只压缩大于1KB的响应
      }))
      this.logger.info('SERVER', '✓ 响应压缩已启用')
    } catch (error) {
      this.logger.debug('SERVER', 'compression模块不可用，跳过')
    }

    // ⏱️ 请求超时中间件（2026-03-05 新增）
    const timeoutMs = parseInt(process.env.REQUEST_TIMEOUT || '30000', 10)
    this.app.use(requestTimeoutMiddleware(timeoutMs))
    this.logger.info('SERVER', `✓ 请求超时已设置: ${timeoutMs}ms`)

    // 📊 性能监控中间件（2026-03-05 新增）
    const perfMiddleware = performanceMonitorMiddleware(this.logger)
    this.app.use(perfMiddleware)
    // 保存性能统计对象的引用（通过闭包访问）
    this.app.use((req, res, next) => {
      if (!this.performanceStats && req.performanceStats) {
        this.performanceStats = req.performanceStats
      }
      next()
    })
    this.logger.info('SERVER', '✓ 性能监控已启用')

    // 🛡️ 速率限制中间件（2026-03-05 新增）
    const rateLimitEnabled = process.env.RATE_LIMIT_ENABLED !== 'false' // 默认启用
    if (rateLimitEnabled) {
      const apiRateLimit = createMediumRateLimit()
      // 对 API 路由应用速率限制（将在路由中应用）
      this.apiRateLimit = apiRateLimit
      this.logger.info('SERVER', '✓ 速率限制已启用')
    } else {
      this.logger.info('SERVER', '⚠️  速率限制已禁用')
    }

    // 🆕 请求日志中间件（增强版，包含请求ID）
    if (process.env.NODE_ENV === 'production') {
      this.app.use((req, res, next) => {
        const start = Date.now()
        res.on('finish', () => {
          const duration = Date.now() - start
          this.logger.debug('HTTP', `[${req.id}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`)
        })
        next()
      })
    }

    // 🆕 缓存中间件（2026-03-05 第二轮优化）
    if (this.cacheManager.enabled) {
      const cacheMiddleware = createCacheMiddleware(this.cacheManager, {
        keyGenerator: (req) => `${req.method}:${req.originalUrl}`,
        ttl: parseInt(process.env.CACHE_TTL || '60000', 10),
        shouldCache: (req) => {
          // 只缓存 GET 请求
          if (req.method !== 'GET') return false
          // 不缓存包含特定路径的请求
          const noCachePaths = ['/api/message', '/api/connect', '/api/interrupt']
          return !noCachePaths.some(path => req.path.startsWith(path))
        }
      })
      this.app.use(cacheMiddleware)
      this.logger.info('SERVER', '✓ 响应缓存已启用')
    }

    // 注意：404 和错误处理中间件在 _setupErrorHandlers() 中设置（路由之后）
  }

  /**
   * 设置错误处理中间件（必须在所有路由之后）
   */
  _setupErrorHandlers() {
    // 🆕 404 处理中间件（必须在所有路由之后）
    this.app.use(notFoundMiddleware)

    // 🆕 全局错误处理中间件（必须在最后）
    this.app.use(errorHandlerMiddleware(this.logger))
  }

  _setupRoutes() {
    // 🆕 健康检查路由（2026-03-05 新增）
    const healthRoutes = createHealthRoutes(this)
    this.app.use('/', healthRoutes)
    this.logger.info('SERVER', '✓ 健康检查端点已注册')

    // 🛡️ 对 API 路由应用速率限制
    if (this.apiRateLimit) {
      this.app.use('/api', this.apiRateLimit)
    }

    this.app.post('/api/connect', this.handleConnect.bind(this))
    this.app.get('/api/status', this.handleStatus.bind(this))
    this.app.post('/api/message', this.handleMessage.bind(this))
    this.app.post('/api/interrupt', this.handleInterrupt.bind(this))
    this.app.post('/api/reset', this.handleReset.bind(this))
    this.app.get('/api/dingtalk/status', this.handleDingTalkStatus.bind(this))

    // 内部 API：定时任务管理（仅允许本地访问）
    this.app.post('/api/tasks/reload', this.handleTasksReload.bind(this))
    this.app.post('/api/tasks/run/:taskId', this.handleTasksRunApi.bind(this))

    // 🆕 插件系统 API
    this.app.get('/api/plugins', this.handleListPlugins.bind(this))
    this.app.get('/api/config', this.handleGetConfig.bind(this))
    this.app.post('/api/config', this.handleSetConfig.bind(this))
    this.app.get('/api/memory/stats', this.handleMemoryStats.bind(this))

    // 🆕 健康检查和监控 API
    this.app.get('/health', this.handleHealthCheck.bind(this))
    this.app.get('/api/health', this.handleHealthCheck.bind(this))
    this.app.get('/api/metrics', this.handleMetrics.bind(this))
  }

  // ==================== 🆕 插件系统 ====================

  /**
   * 注册核心插件
   */
  async registerCorePlugins() {
    // 注册配置管理器
    await this.pluginManager.registerPlugin({
      name: 'config-manager',
      version: '1.0.0',
      description: '配置管理系统',
      author: 'OPRCLI Team',
      init: async (server) => {
        server.logger.info('PLUGIN', '✓ 配置管理器已初始化')
      },
      api: {
        get: (key) => server.configManager.get(key),
        set: async (key, value) => await server.configManager.set(key, value),
        addTool: async (config) => await server.configManager.addTool(config)
      }
    })

    // 注册上下文记忆
    await this.pluginManager.registerPlugin({
      name: 'context-memory',
      version: '1.0.0',
      description: '上下文记忆系统',
      author: 'OPRCLI Team',
      init: async (server) => {
        server.logger.info('PLUGIN', '✓ 上下文记忆已初始化')
      },
      api: {
        set: async (key, value) => await server.contextMemory.set(key, value),
        get: async (key) => await server.contextMemory.get(key),
        saveSession: async (id, ctx) => await server.contextMemory.saveSession(id, ctx)
      }
    })

    // 加载用户自定义插件
    const path = require('path')
    const customPluginDir = path.join(__dirname, 'plugins/custom')

    const fs = require('fs')
    if (fs.existsSync(customPluginDir)) {
      await this.pluginManager.loadPluginsFromDir(customPluginDir)
    }
  }

  /**
   * API: 列出所有插件
   */
  async handleListPlugins(req, res) {
    const plugins = this.pluginManager.listPlugins()

    res.json({
      success: true,
      plugins,
      stats: this.pluginManager.getStats()
    })
  }

  /**
   * API: 获取配置
   */
  async handleGetConfig(req, res) {
    const { key } = req.query

    try {
      if (key) {
        const value = this.configManager.get(key)
        res.json({ success: true, key, value })
      } else {
        const all = this.configManager.getAll()
        res.json({ success: true, config: all })
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error.message })
    }
  }

  /**
   * API: 设置配置
   */
  async handleSetConfig(req, res) {
    const { key, value } = req.body

    // 🆕 输入验证（2026-03-05 第三轮优化）
    const keyValidation = this.inputValidator.validateConfigKey(key)
    if (!keyValidation.valid) {
      this.logger.warn('API', `配置键验证失败: ${keyValidation.error}`, { requestId: req.id })
      return res.status(400).json({ success: false, error: keyValidation.error })
    }

    try {
      await this.configManager.set(key, value)
      res.json({ success: true, message: `配置已更新: ${key}` })
    } catch (error) {
      res.status(500).json({ success: false, error: error.message })
    }
  }

  /**
   * API: 获取记忆统计
   */
  async handleMemoryStats(req, res) {
    try {
      const stats = this.contextMemory.getStats()
      res.json({ success: true, stats })
    } catch (error) {
      res.status(500).json({ success: false, error: error.message })
    }
  }

  async handleConnect(req, res) {
    // Connectors 已经在 start() 时初始化，这里返回状态
    const providers = []
    const versions = {}

    for (const [provider, connector] of this.connectors.entries()) {
      if (connector?.connected) {
        providers.push(provider)
        // 尝试获取版本信息（如果 connector 有）
        if (connector.version) {
          versions[provider] = connector.version
        }
      }
    }

    if (providers.length === 0) {
      return res.status(503).json({
        success: false,
        error: '没有可用的 connectors'
      })
    }

    res.json({
      success: true,
      providers,
      defaultProvider: this.defaultProvider,
      versions
    })
  }

  async handleStatus(req, res) {
    // 收集所有 connectors 的状态
    const connectorsStatus = {}
    for (const [provider, connector] of this.connectors.entries()) {
      connectorsStatus[provider] = {
        connected: connector?.connected || false,
        activeSessions: connector?.getActiveSessions() || []
      }
    }

    res.json({
      defaultProvider: this.defaultProvider,
      connectors: connectorsStatus,
      dingtalk: {
        enabled: config.dingtalk.enabled,
        connected: this.dingtalk.client?.connected || false,
        activeSessions: this.dingtalk.getActiveSessions()
      }
    })
  }

  async handleMessage(req, res) {
    // 从 connectors Map 中获取默认连接器
    const connector = this.connectors.get(this.defaultProvider)
    if (!connector?.connected) {
      return res.status(400).json({ success: false, error: '未连接，请先调用 /api/connect' })
    }

    const { message, sessionId } = req.body

    // 🆕 输入验证（2026-03-05 第三轮优化）
    // 验证消息内容
    const messageValidation = this.inputValidator.validateMessage(message)
    if (!messageValidation.valid) {
      this.logger.warn('API', `消息验证失败: ${messageValidation.error}`, { requestId: req.id })
      return res.status(400).json({ success: false, error: messageValidation.error })
    }

    // 验证会话 ID
    const sessionValidation = this.inputValidator.validateSessionId(sessionId)
    if (!sessionValidation.valid) {
      this.logger.warn('API', `会话 ID 验证失败: ${sessionValidation.error}`, { requestId: req.id })
      return res.status(400).json({ success: false, error: sessionValidation.error })
    }

    // 使用清理后的消息
    const sanitizedMessage = messageValidation.sanitized

    try {
      const events = []
      const isResume = !!sessionId

      await new Promise((resolve, reject) => {
        const options = {
          onEvent: (event) => {
            events.push(event)
            this.logger.debug('EVENT', `收到事件: ${event.type}`)
          },
          onComplete: (exitCode) => {
            this.logger.success('SESSION', `完成，退出码: ${exitCode}`)
            resolve({
              success: true,
              sessionId: sessionId || this.currentSessionId,
              isResume,
              events,
              exitCode
            })
          },
          onError: (error) => {
            this.logger.error('SESSION', '错误', { error: error.message })
            resolve({ success: false, error: error.message, events })
          }
        }

        if (isResume) {
          connector.continueSession(sessionId, sanitizedMessage, options)
        } else {
          const result = connector.startSession(sanitizedMessage, options)
          this.currentSessionId = result.sessionId
        }
      })

      res.json({ success: true })
    } catch (error) {
      res.status(500).json({ success: false, error: error.message })
    }
  }

  handleInterrupt(req, res) {
    // 中断所有 connectors 的所有活动会话
    let totalInterrupted = 0

    for (const [provider, connector] of this.connectors.entries()) {
      if (connector?.connected) {
        const sessions = connector.getActiveSessions()
        sessions.forEach(sessionId => {
          connector.interruptSession(sessionId)
          totalInterrupted++
        })
      }
    }

    // 清空所有会话映射
    this.dingtalk.clearSessions()

    res.json({
      success: true,
      message: `已中断 ${totalInterrupted} 个会话`
    })
  }

  handleReset(req, res) {
    // 中断所有活动会话
    for (const [provider, connector] of this.connectors.entries()) {
      if (connector?.connected) {
        const sessions = connector.getActiveSessions()
        sessions.forEach(sessionId => {
          connector.interruptSession(sessionId)
        })
      }
    }

    // 清空所有会话映射
    this.dingtalk.clearSessions()

    res.json({ success: true })
  }

  handleDingTalkStatus(req, res) {
    res.json({
      enabled: config.dingtalk.enabled,
      connected: this.dingtalk.client?.connected || false,
      activeSessions: this.dingtalk.getActiveSessions()
    })
  }

  /**
   * 内部 API：重新加载定时任务配置
   * 仅允许本地访问（127.0.0.1 或 ::1）
   */
  async handleTasksReload(req, res) {
    // 安全检查：仅允许本地访问
    const clientIp = req.ip || req.connection.remoteAddress
    const isLocalhost =
      clientIp === '127.0.0.1' ||
      clientIp === '::1' ||
      clientIp === '::ffff:127.0.0.1'

    if (!isLocalhost) {
      this.logger.warning('API', `拒绝非本地访问: ${clientIp}`)
      return res.status(403).json({
        success: false,
        error: 'Forbidden: 仅允许本地访问'
      })
    }

    // 检查 scheduler 是否可用
    if (!this.scheduler || !this.scheduler.taskManager) {
      return res.status(503).json({
        success: false,
        error: '定时任务管理器未初始化'
      })
    }

    try {
      this.logger.info('API', '重新加载定时任务配置')

      // 执行重新加载
      await this.scheduler.taskManager.reload()

      const status = this.scheduler.getStatus()
      res.json({
        success: true,
        message: '任务配置已重新加载',
        tasks: status.totalTasks,
        enabledTasks: status.enabledTasks,
        scheduledJobs: status.scheduledJobs
      })
    } catch (error) {
      this.logger.error('API', '重新加载失败', { error: error.message })
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  }

  /**
   * API: 手动执行定时任务
   */
  async handleTasksRunApi(req, res) {
    const clientIp = req.ip || req.connection.remoteAddress
    const isLocalhost = clientIp === '127.0.0.1' ||
      clientIp === '::1' ||
      clientIp === '::ffff:127.0.0.1'

    if (!isLocalhost) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: 仅允许本地访问'
      })
    }

    const taskId = req.params.taskId
    if (!taskId) {
      return res.status(400).json({
        success: false,
        error: '请指定任务 ID'
      })
    }

    if (!this.scheduler || !this.scheduler.taskManager) {
      return res.status(503).json({
        success: false,
        error: '定时任务管理器未初始化'
      })
    }

    try {
      this.logger.info('API', `手动执行任务: ${taskId}`)
      const result = await this.scheduler.taskManager.runTask(taskId)
      res.json({
        success: result.success,
        elapsed: result.elapsed,
        error: result.error
      })
    } catch (error) {
      this.logger.error('API', '执行任务失败', { error: error.message })
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  }

  /**
   * 健康检查端点
   * 用于负载均衡器、容器编排系统等监控系统状态
   */
  async handleHealthCheck(req, res) {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: require('./package.json').version
    }

    // 检查 connectors 状态
    const connectorHealth = {}
    for (const [provider, connector] of this.connectors.entries()) {
      connectorHealth[provider] = {
        connected: connector?.connected || false,
        activeSessions: connector?.getActiveSessions()?.length || 0
      }
    }

    // 检查钉钉连接
    const dingtalkHealth = {
      enabled: config.dingtalk.enabled,
      connected: this.dingtalk.client?.connected || false,
      activeSessions: this.dingtalk.getActiveSessions()?.length || 0
    }

    // 如果有任何关键组件不可用，标记为 degraded
    const hasActiveConnectors = Object.values(connectorHealth).some(c => c.connected)
    if (!hasActiveConnectors) {
      health.status = 'degraded'
      health.connectors = connectorHealth
      return res.status(503).json(health)
    }

    health.connectors = connectorHealth
    health.dingtalk = dingtalkHealth

    // 添加内存使用情况
    health.memory = {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
    }

    res.json(health)
  }

  /**
   * 系统指标端点
   * 提供详细的性能和统计信息
   */
  async handleMetrics(req, res) {
    try {
      const metrics = {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),

        // Connectors 状态
        connectors: {},
        activeSessions: 0,

        // 速率限制器统计
        rateLimiter: this.rateLimiter.getStats(),

        // 钉钉统计
        dingtalk: {
          enabled: config.dingtalk.enabled,
          connected: this.dingtalk.client?.connected || false,
          activeSessions: this.dingtalk.getActiveSessions()?.length || 0,
          processedMessages: this.dingtalk.processedMessages?.size || 0
        },

        // 定时任务状态
        scheduler: this.scheduler?.getStatus() || { enabled: false },

        // 插件统计
        plugins: this.pluginManager?.getStats() || { loaded: 0 },

        // 上下文记忆统计
        memory: this.contextMemory?.getStats() || { sessions: 0 },

        // 🆕 HTTP 性能统计（2026-03-05 新增）
        http: this.performanceStats ? getPerformanceStats(this.performanceStats) : {
          totalRequests: 0,
          totalErrors: 0,
          errorRate: '0%',
          avgResponseTime: '0ms',
          routes: []
        },

        // 🆕 缓存统计（2026-03-05 第二轮优化）
        cache: this.cacheManager.getStats(),

        // 🆕 内存监控统计（2026-03-05 第二轮优化）
        memoryMonitor: this.memoryMonitor.getStats()
      }

      // 收集每个 connector 的详细信息
      for (const [provider, connector] of this.connectors.entries()) {
        if (connector) {
          const sessions = connector.getActiveSessions() || []
          metrics.connectors[provider] = {
            connected: connector.connected || false,
            activeSessions: sessions.length,
            sessionIds: sessions
          }
          metrics.activeSessions += sessions.length
        }
      }

      res.json(metrics)
    } catch (error) {
      this.logger.error('API', '获取指标失败', { error: error.message })
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  }

  _createConnector(options) {
    switch (config.provider) {
      case 'claude':
        return new ClaudeConnector(options)
      case 'iflow':
        return new IFlowConnector(options)
      default:
        throw new Error(`Unknown provider: ${config.provider}`)
    }
  }

  async _initializeAllConnectors() {
    const availableProviders = []
    const errors = []

    // 并行初始化任务列表
    const initTasks = []

    // 准备 Claude 初始化任务
    if (config.claude.cmdPath && config.claude.workDir) {
      initTasks.push(this._initConnector('claude', ClaudeConnector))
    }

    // 准备 IFlow 初始化任务
    if (config.iflow.workDir) {
      initTasks.push(this._initConnector('iflow', IFlowConnector))
    }

    // 并行执行所有初始化任务
    if (initTasks.length > 0) {
      this.logger.info('CONNECTOR', `并行初始化 ${initTasks.length} 个模型...`)
      const results = await Promise.all(initTasks)

      // 收集结果
      results.forEach(result => {
        if (result.success) {
          this.connectors.set(result.provider, result.connector)
          availableProviders.push(result.provider)
          this.logger.success('CONNECTOR', `${result.provider.toUpperCase()} 初始化成功 (版本: ${result.version || 'unknown'})`)
        } else {
          errors.push(result.error)
        }
      })
    }

    // 如果有错误，记录警告
    if (errors.length > 0) {
      this.logger.warning('CONNECTOR', '部分模型初始化失败', { errors })
    }

    return availableProviders
  }

  /**
   * 通用连接器初始化方法
   * @param {string} provider - 提供商名称 ('claude' | 'iflow')
   * @param {class} ConnectorClass - 连接器类
   * @returns {Promise<Object>} { success, provider, connector?, version?, error? }
   */
  async _initConnector(provider, ConnectorClass) {
    const providerName = provider.toUpperCase()
    try {
      this.logger.info('CONNECTOR', `正在初始化 ${providerName}...`)
      const options = config.getConnectorOptions(provider)
      const connector = new ConnectorClass(options)
      const result = await connector.connect()

      if (result.success) {
        return {
          success: true,
          provider,
          connector,
          version: result.version
        }
      }
      return {
        success: false,
        error: `${providerName}: ${result.error}`
      }
    } catch (error) {
      this.logger.warning('CONNECTOR', `${providerName} 初始化失败`, { error: error.message })
      return {
        success: false,
        error: `${providerName}: ${error.message}`
      }
    }
  }

  // ==================== 命令处理 ====================

  /**
   * 解析用户命令
   * 支持多词命令，使用最长匹配原则
   * @param {string} content - 用户输入内容
   * @returns {Object|null} 命令对象 { type, provider?, arg? }
   */
  _parseCommand(content) {
    const trimmed = content.trim()
    const parts = trimmed.split(/\s+/)

    // 🔥 从最长到最短尝试匹配（最长匹配原则）
    // 例如：'tasks run 1' -> 先尝试 'tasks run'，再尝试 'tasks'
    for (let i = Math.min(parts.length, 3); i >= 1; i--) {
      const candidate = parts.slice(0, i).join(' ').toLowerCase()
      const cmdConfig = UnifiedServer.COMMANDS[candidate]

      if (cmdConfig) {
        // 提取参数（剩余部分）
        const arg = parts.length > i ? parts.slice(i).join(' ') : null

        return {
          ...cmdConfig,
          original: candidate,
          arg
        }
      }
    }

    return null
  }

  async _handleCommand(command, conversationId, sessionWebhook) {
    switch (command.type) {
      case 'switch':
        return await this._handleSwitch(command.provider, conversationId, sessionWebhook)

      case 'interrupt':
        return await this._handleInterrupt(conversationId, sessionWebhook)

      case 'status':
        return await this._handleStatus(conversationId, sessionWebhook)

      case 'help':
        return await this._handleHelp(sessionWebhook)

      // 定时任务命令
      case 'tasks_list':
        return await this._handleTasksList(conversationId, sessionWebhook)

      case 'tasks_status':
        return await this._handleTasksStatus(conversationId, sessionWebhook)

      case 'tasks_reload':
        return await this._handleTasksReload(conversationId, sessionWebhook)

      case 'tasks_run':
        return await this._handleTasksRun(command.arg, conversationId, sessionWebhook)

      case 'tasks_enable':
        return await this._handleTasksEnable(command.arg, conversationId, sessionWebhook)

      case 'tasks_disable':
        return await this._handleTasksDisable(command.arg, conversationId, sessionWebhook)

      default:
        this.logger.warning('COMMAND', `未知命令类型: ${command.type}`)
        return { status: 'SUCCESS' }
    }
  }

  async _handleSwitch(provider, conversationId, sessionWebhook) {
    // 检查 connector 是否可用
    const connector = this.connectors.get(provider)
    if (!connector || !connector.connected) {
      const availableProviders = Array.from(this.connectors.keys()).map(p => p.toUpperCase()).join(', ')
      await this._sendReply(sessionWebhook,
        `❌ ${provider.toUpperCase()} 模型不可用\n\n` +
        `💡 可用模型：${availableProviders || '无'}`
      )
      return { status: 'SUCCESS' }
    }

    // 中断当前任务（如果有）
    const currentSession = this.dingtalk.getSession(conversationId)
    if (currentSession?.sessionId) {
      const currentConnector = this.connectors.get(currentSession.provider)
      if (currentConnector) {
        currentConnector.interruptSession(currentSession.sessionId)
        this.logger.info('PROVIDER', `中断旧任务: ${currentSession.sessionId}`)
      }
    }

    // 切换模型（清空旧 sessionId，保留 provider）
    this.dingtalk.setSession(conversationId, null, provider)

    const availableProviders = Array.from(this.connectors.keys()).map(p => p.toUpperCase()).join(', ')
    await this._sendReply(sessionWebhook,
      `✅ 已切换到 ${provider.toUpperCase()} 模型\n\n` +
      `💡 可用模型：${availableProviders}`
    )

    this.logger.info('PROVIDER', `会话 ${conversationId} 切换到 ${provider}`)
    return { status: 'SUCCESS' }
  }

  async _handleInterrupt(conversationId, sessionWebhook) {
    const session = this.dingtalk.getSession(conversationId)

    if (!session?.sessionId) {
      await this._sendReply(sessionWebhook, '⚠️ 没有运行中的任务')
      return { status: 'SUCCESS' }
    }

    const connector = this.connectors.get(session.provider)

    if (connector) {
      connector.interruptSession(session.sessionId)
      this.dingtalk.deleteSession(conversationId)
      await this._sendReply(sessionWebhook, '✅ 任务已中断')
      this.logger.info('PROVIDER', `会话 ${conversationId} 任务已中断`)
    } else {
      await this._sendReply(sessionWebhook, '❌ 无法中断任务：模型不可用')
    }

    return { status: 'SUCCESS' }
  }

  async _handleStatus(conversationId, sessionWebhook) {
    const session = this.dingtalk.getSession(conversationId)
    const provider = session?.provider || this.defaultProvider
    const sessionId = session?.sessionId || null
    const availableProviders = Array.from(this.connectors.entries())
      .filter(([_, conn]) => conn.connected)
      .map(([p, _]) => p.toUpperCase())
      .join(', ')

    const status = {
      当前模型: provider.toUpperCase(),
      会话状态: sessionId ? '运行中' : '空闲',
      可用模型: availableProviders || '无'
    }

    const statusText = `📊 系统状态\n\n${Object.entries(status).map(([k, v]) => `• ${k}：${v}`).join('\n')}`
    await this._sendReply(sessionWebhook, statusText)

    return { status: 'SUCCESS' }
  }

  async _handleHelp(sessionWebhook) {
    const availableProviders = Array.from(this.connectors.entries())
      .filter(([_, conn]) => conn.connected)
      .map(([p, _]) => p.toUpperCase())
      .join(', ')

    const schedulerEnabled = this.scheduler?.enabled || false

    const help = `📖 命令帮助

🤖 模型切换：
  • claude  - 切换到 Claude 模型
  • iflow  - 切换到 IFlow 模型

🛑 任务控制：
  • end / 停止 / stop  - 中断当前任务

📅 定时任务${schedulerEnabled ? '' : ' (未启用)'}：
  • tasks  - 查看任务列表
  • tasks status  - 查看任务状态
  • tasks reload  - 重载任务配置
  • tasks run <id>  - 手动执行任务
  • tasks enable <id>  - 启用任务
  • tasks disable <id>  - 禁用任务

ℹ️ 信息查询：
  • status / 状态  - 查看当前状态
  • help / 帮助  - 显示此帮助

💡 可用模型：${availableProviders || '无'}`

    await this._sendReply(sessionWebhook, help.trim())
    return { status: 'SUCCESS' }
  }

  async _sendReply(sessionWebhook, text) {
    const message = {
      msgtype: 'text',
      text: { content: text }
    }

    try {
      await this.dingtalk.send(sessionWebhook, message)
      this.logger.debug('DINGTALK', '回复已发送', { length: text.length })
    } catch (error) {
      this.logger.error('DINGTALK', '回复发送失败', { error: error.message })
    }
  }

  // ==================== 定时任务命令处理 ====================

  async _handleTasksList(conversationId, sessionWebhook) {
    if (!this.scheduler || !this.scheduler.enabled) {
      await this._sendReply(sessionWebhook, '⚠️ 定时任务功能未启用')
      return { status: 'SUCCESS' }
    }

    const status = this.scheduler.getStatus()

    if (status.tasks.length === 0) {
      await this._sendReply(sessionWebhook, '📋 暂无定时任务')
      return { status: 'SUCCESS' }
    }

    const lines = ['📋 定时任务列表\n']
    status.tasks.forEach(task => {
      const enabled = task.enabled ? '✅' : '❌'
      const scheduled = task.scheduled ? '运行中' : '已停止'
      lines.push(`\n${enabled} ${task.name}`)
      lines.push(`   ID: ${task.id}`)
      lines.push(`   调度: ${task.schedule}`)
      lines.push(`   模型: ${task.provider}`)
      lines.push(`   状态: ${scheduled}`)
    })

    lines.push('\n💡 命令：')
    lines.push('• tasks status - 查看详细状态')
    lines.push('• tasks run <id> - 手动执行任务')
    lines.push('• tasks enable <id> - 启用任务')
    lines.push('• tasks disable <id> - 禁用任务')

    await this._sendReply(sessionWebhook, lines.join('\n'))
    return { status: 'SUCCESS' }
  }

  async _handleTasksStatus(conversationId, sessionWebhook) {
    if (!this.scheduler) {
      await this._sendReply(sessionWebhook, '⚠️ 定时任务管理器未初始化')
      return { status: 'SUCCESS' }
    }

    const status = this.scheduler.getStatus()

    const lines = [
      '📊 定时任务状态',
      `\n功能状态: ${status.enabled ? '✅ 已启用' : '❌ 已禁用'}`,
      `配置文件: ${status.configPath}`,
      `总任务数: ${status.totalTasks}`,
      `启用任务: ${status.enabledTasks}`,
      `运行中任务: ${status.scheduledJobs}`
    ]

    await this._sendReply(sessionWebhook, lines.join('\n'))
    return { status: 'SUCCESS' }
  }

  async _handleTasksReload(conversationId, sessionWebhook) {
    if (!this.scheduler) {
      await this._sendReply(sessionWebhook, '⚠️ 定时任务管理器未初始化')
      return { status: 'SUCCESS' }
    }

    try {
      await this.scheduler.taskManager.reload()
      await this._sendReply(sessionWebhook, '✅ 任务配置已重载')
    } catch (error) {
      await this._sendReply(sessionWebhook, `❌ 重载失败: ${error.message}`)
    }

    return { status: 'SUCCESS' }
  }

  async _handleTasksRun(taskId, conversationId, sessionWebhook) {
    if (!this.scheduler || !this.scheduler.enabled) {
      await this._sendReply(sessionWebhook, '⚠️ 定时任务功能未启用')
      return { status: 'SUCCESS' }
    }

    if (!taskId) {
      await this._sendReply(sessionWebhook, '❌ 请指定任务 ID：tasks run <id>')
      return { status: 'SUCCESS' }
    }

    try {
      const result = await this.scheduler.taskManager.runTask(taskId)

      if (result.success) {
        await this._sendReply(sessionWebhook,
          `✅ 任务执行完成\n耗时: ${result.elapsed}s`
        )
      } else {
        await this._sendReply(sessionWebhook,
          `❌ 任务执行失败: ${result.error}`
        )
      }
    } catch (error) {
      await this._sendReply(sessionWebhook,
        `❌ 执行失败: ${error.message}`
      )
    }

    return { status: 'SUCCESS' }
  }

  async _handleTasksEnable(taskId, conversationId, sessionWebhook) {
    if (!this.scheduler || !this.scheduler.enabled) {
      await this._sendReply(sessionWebhook, '⚠️ 定时任务功能未启用')
      return { status: 'SUCCESS' }
    }

    if (!taskId) {
      await this._sendReply(sessionWebhook, '❌ 请指定任务 ID：tasks enable <id>')
      return { status: 'SUCCESS' }
    }

    try {
      this.scheduler.taskManager.enableTask(taskId)
      await this._sendReply(sessionWebhook, `✅ 任务已启用: ${taskId}`)
    } catch (error) {
      await this._sendReply(sessionWebhook, `❌ 启用失败: ${error.message}`)
    }

    return { status: 'SUCCESS' }
  }

  async _handleTasksDisable(taskId, conversationId, sessionWebhook) {
    if (!this.scheduler || !this.scheduler.enabled) {
      await this._sendReply(sessionWebhook, '⚠️ 定时任务功能未启用')
      return { status: 'SUCCESS' }
    }

    if (!taskId) {
      await this._sendReply(sessionWebhook, '❌ 请指定任务 ID：tasks disable <id>')
      return { status: 'SUCCESS' }
    }

    try {
      this.scheduler.taskManager.disableTask(taskId)
      await this._sendReply(sessionWebhook, `✅ 任务已禁用: ${taskId}`)
    } catch (error) {
      await this._sendReply(sessionWebhook, `❌ 禁用失败: ${error.message}`)
    }

    return { status: 'SUCCESS' }
  }

  /**
   * 计算内容哈希，用于检测重复
   * 使用统一的哈希工具函数
   * @param {string} content - 要哈希的内容
   * @returns {string|null} 哈希值
   */
  _hashContent(content) {
    return simpleHash(content)
  }

  async start() {
    // 🆕 启动前检查
    const startupCheck = new StartupCheck(this.logger)

    // 检查 Node.js 版本
    startupCheck.checkNodeVersion('14.0.0')

    // 确保必要的目录存在
    startupCheck.ensureDir('D:/space/tasks', '进化日志目录')
    startupCheck.ensureDir('logs', '日志目录')

    // 打印检查结果
    if (!startupCheck.printResult()) {
      process.exit(1)
    }

    // 验证配置
    const validation = config.validate()
    if (!validation.valid) {
      console.error('❌ 配置错误:')
      validation.errors.forEach(err => console.error(`  - ${err}`))
      process.exit(1)
    }

    // 🆕 初始化核心插件系统
    try {
      this.logger.info('SERVER', '正在初始化核心插件系统...')

      // 初始化配置管理器
      await this.configManager.init()

      // 🆕 启动配置热重载（2026-03-05 自动升级优化）
      this.configManager.startWatch()

      // 🆕 添加配置变更监听器
      this.configManager.addChangeListener((changeInfo) => {
        this.handleConfigChange(changeInfo)
      })

      // 初始化上下文记忆
      await this.contextMemory.init()

      // 注册核心插件
      await this.registerCorePlugins()

      this.logger.success('SERVER', '✓ 核心插件系统初始化完成')
    } catch (error) {
      this.logger.error('SERVER', `核心插件系统初始化失败: ${error.message}`)
      process.exit(1)
    }

    // 初始化所有可用的 connectors
    try {
      const availableProviders = await this._initializeAllConnectors()

      if (availableProviders.length === 0) {
        this.logger.error('CONNECTOR', '没有可用的 AI 模型')
        process.exit(1)
      }

      this.logger.success('CONNECTOR', `已初始化 ${availableProviders.length} 个模型: ${availableProviders.map(p => p.toUpperCase()).join(', ')}`)
      this.logger.info('CONNECTOR', `默认模型: ${this.defaultProvider.toUpperCase()}`)
    } catch (error) {
      this.logger.error('CONNECTOR', `初始化失败: ${error.message}`)
      process.exit(1)
    }

    // 初始化钉钉（在连接之前注册消息处理器）
    const dingtalkEnabled = await this.dingtalk.init(this.handleDingTalkMessage.bind(this))
    if (dingtalkEnabled) {
      this.logger.success('DINGTALK', '钉钉集成已启动')
    }

    // 启动定时任务模块
    this.scheduler = new SchedulerModule(this, this.logger)
    await this.scheduler.start()

    // 启动 HTTP 服务器（仅在端口配置时）
    let server = null
    if (config.port) {
      server = this.app.listen(config.port, () => {
        console.log('\n========================================')
        console.log('  Unified AI CLI Connector Server')
        console.log('========================================')
        console.log(`\n🌐 服务器运行在: http://localhost:${config.port}`)
        console.log(`🤖 提供商: ${config.provider.toUpperCase()}`)
        console.log(`📱 钉钉: ${dingtalkEnabled ? '✅ 已启用' : '❌ 未启用'}`)
        console.log('\n按 Ctrl+C 停止服务器\n')
      })
    } else {
      console.log('\n========================================')
      console.log('  Unified AI CLI Connector Server')
      console.log('========================================')
      console.log(`\n🤖 提供商: ${config.provider.toUpperCase()}`)
      console.log(`📱 钉钉: ${dingtalkEnabled ? '✅ 已启用' : '❌ 未启用'}`)
      console.log(`🌐 API: 未启用（未配置端口）`)
      console.log('\n按 Ctrl+C 停止服务器\n')
    }

    // 🆕 设置优雅关闭（2026-03-05 第二轮优化）
    if (server) {
      this.gracefulShutdown = new GracefulShutdown(server, this.logger, {
        timeout: parseInt(process.env.SHUTDOWN_TIMEOUT || '30000', 10)
      })

      // 注册清理任务
      this.gracefulShutdown.registerCleanupTask(async () => {
        this.logger.info('SHUTDOWN', '清理缓存...')
        this.cacheManager.clear()
      })

      this.gracefulShutdown.registerCleanupTask(async () => {
        this.logger.info('SHUTDOWN', '停止内存监控...')
        this.memoryMonitor.stop()
      })

      this.gracefulShutdown.registerCleanupTask(async () => {
        this.logger.info('SHUTDOWN', '停止定时任务...')
        if (this.scheduler) {
          this.scheduler.stop()
        }
      })

      // 设置信号监听
      this.gracefulShutdown.setup()
      this.logger.info('SERVER', '✓ 优雅关闭处理器已设置')
    }

    // 🆕 启动内存监控（2026-03-05 新增，2026-03-05 第二轮优化）
    if (process.env.MEMORY_MONITOR_ENABLED !== 'false') {
      this.memoryMonitor.start()
    }
  }

  async handleDingTalkMessage(message) {
    const timestamp = new Date().toISOString()
    this.logger.success('DINGTALK', '========== 钉钉消息接收 ==========')
    this.logger.success('DINGTALK', `时间戳: ${timestamp}`)

    const { headers, data } = message
    const { messageId } = headers

    // 🔍 MessageID 和去重信息（直接输出字符串，避免对象不显示）
    this.logger.success('DINGTALK', `MessageID: ${messageId || 'null'}`)
    this.logger.success('DINGTALK', `已处理消息数: ${this.dingtalk.processedMessages.size}`)

    const isProcessed = messageId ? this.dingtalk.isProcessed(messageId) : null
    if (messageId) {
      const status = isProcessed ? '✅ 已处理，跳过' : '❌ 未处理，继续'
      this.logger.success('DINGTALK', `去重: ${status}`)
    } else {
      this.logger.warning('DINGTALK', '⚠️  MessageID 为空，无法去重！')
    }

    // 消息去重
    if (messageId && isProcessed) {
      this.logger.warning('DINGTALK', '⚠️  消息已处理，跳过')
      return { status: 'SUCCESS' }
    }

    if (messageId) {
      this.dingtalk.markAsProcessed(messageId)
      this.logger.success('DINGTALK', '✅ 标记为已处理')
    }

    try {
      const robotMessage = JSON.parse(data)
      this.logger.debug('DINGTALK', '解析后的消息', { message: robotMessage })

      const { conversationId, senderNick, text, msgtype, sessionWebhook } = robotMessage

      this.logger.success('DINGTALK', `收到消息: ${senderNick}`)
      this.logger.debug('DINGTALK', '消息详情', {
        conversationId,
        senderNick,
        msgtype,
        hasText: !!text,
        hasSessionWebhook: !!sessionWebhook
      })

      if (msgtype !== 'text') {
        this.logger.warning('DINGTALK', `不支持的消息类型: ${msgtype}`)
        return { status: 'SUCCESS' }
      }

      const messageContent = text?.content?.trim()
      if (!messageContent) {
        this.logger.warning('DINGTALK', '消息内容为空')
        return { status: 'SUCCESS' }
      }

      this.logger.info('DINGTALK', `消息内容: ${messageContent.substring(0, 50)}...`)

      // 🎯 检查是否是命令
      const command = this._parseCommand(messageContent)
      if (command) {
        this.logger.info('COMMAND', `识别到命令: ${command.type}${command.provider ? ` -> ${command.provider}` : ''}`)
        return await this._handleCommand(command, conversationId, sessionWebhook)
      }

      // 🤖 获取当前会话使用的 provider
      const session = this.dingtalk.getSession(conversationId)
      const provider = session?.provider || this.defaultProvider
      const sessionId = session?.sessionId || null
      const connector = this.connectors.get(provider)

      this.logger.debug('DINGTALK', '使用模型', { provider })

      // 🔍 检查 connector 状态
      if (!connector || !connector.connected) {
        this.logger.error('DINGTALK', `Connector ${provider} 未连接`)
        await this._sendReply(sessionWebhook,
          `❌ ${provider.toUpperCase()} 模型不可用\n\n` +
          `💡 输入 help 查看可用模型`
        )
        return { status: 'SUCCESS' }
      }

      // 🔍 会话管理详细日志
      this.logger.success('SESSION', '========== 会话管理诊断 ==========')
      this.logger.success('SESSION', `ConversationID: ${conversationId}`)
      this.logger.success('SESSION', `Provider: ${provider}`)

      const sessionMapSize = this.dingtalk.conversations.size
      this.logger.success('SESSION', `SessionMap 大小: ${sessionMapSize}`)

      if (sessionMapSize > 0) {
        this.logger.success('SESSION', 'SessionMap 内容:', {
          entries: Array.from(this.dingtalk.conversations.entries())
        })
      }

      const isResume = !!sessionId

      this.logger.success('SESSION', `检索到的 SessionID: ${sessionId || 'null'}`)
      this.logger.success('SESSION', `会话模式: ${isResume ? '继续会话' : '新会话'}`)
      this.logger.success('SESSION', '====================================')

      // ⭐ 设置 sessionId 更新回调（用于 Claude 和 IFlow）
      connector.onSessionIdUpdate((realSessionId) => {
        this.dingtalk.setSession(conversationId, realSessionId, provider)
        this.logger.success('SESSION', '✅ 通过回调保存 SessionID', {
          conversationId,
          sessionId: realSessionId,
          sessionMapSize: this.dingtalk.conversations.size
        })
      })

      let messageCount = 0
      let sentMessageCount = 0  // 实际发送的消息数
      const startTime = Date.now()

      // 🔍 用于去重的状态
      let assistantContent = null  // assistant 的内容
      let assistantHash = null     // 内容哈希
      let sessionEndSent = false   // session_end 是否已发送

      this.logger.info('DINGTALK', `开始调用 ${isResume ? 'continueSession' : 'startSession'}...`)

      await new Promise((resolve, reject) => {
        const options = {
          onEvent: async (event) => {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
            const context = { index: ++messageCount, elapsed, sentIndex: sentMessageCount + 1 }

            // 🔍 详细事件日志
            this.logger.info('EVENT', `#${messageCount} [${event.type}]`)

            // 🎯 session_end 去重：只发送一次
            if (event.type === 'session_end') {
              if (sessionEndSent) {
                this.logger.warning('EVENT', '⚠️  session_end 事件已发送，跳过重复')
                return
              }
              sessionEndSent = true
              this.logger.info('EVENT', '✅ 首次 session_end 事件，正常处理')
            }

            // 打印事件内容（用于诊断重复）
            if (event.type === 'assistant') {
              const text = event.message?.content
                ?.filter(c => c.type === 'text')
                ?.map(c => c.text)
                ?.join('') || ''
              this.logger.info('EVENT', `Assistant 内容: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}" (${text.length} 字符)`)

              // 保存 assistant 内容用于去重检测
              assistantContent = text
              assistantHash = this._hashContent(text)
            }
            else if (event.type === 'result') {
              const result = event.result || ''
              this.logger.info('EVENT', `Result 内容: "${result.substring(0, 100)}${result.length > 100 ? '...' : ''}" (${result.length} 字符)`)

              // 🔍 检测是否与 assistant 重复
              if (config.streaming.deduplicateResult && assistantContent) {
                const resultHash = this._hashContent(result)

                if (assistantHash === resultHash) {
                  this.logger.warning('EVENT', `⚠️  Result 与 Assistant 内容相同，跳过发送`)
                  this.logger.info('EVENT', `  Assistant 哈希: ${assistantHash}`)
                  this.logger.info('EVENT', `  Result 哈希: ${resultHash}`)
                  return  // ← 跳过此事件，不发送
                } else {
                  this.logger.info('EVENT', `✅ Result 与 Assistant 内容不同，正常发送`)
                }
              }
            }
            else if (event.type === 'thinking') {
              const content = event.content?.substring(0, 100) || ''
              this.logger.debug('EVENT', `Thinking: "${content}..."`)
            }
            else if (event.type === 'tool_start') {
              this.logger.debug('EVENT', `工具开始: ${event.tool}`)
            }
            else if (event.type === 'tool_output') {
              const output = event.output?.substring(0, 100) || ''
              this.logger.debug('EVENT', `工具输出: "${output}..."`)
            }

            // 捕获 sessionId
            if (!isResume && event.type === 'system' && event.extra?.session_id) {
              sessionId = event.extra.session_id
              this.dingtalk.setSession(conversationId, sessionId, provider)
              this.logger.success('SESSION', '✅ 保存 SessionID 到 SessionMap', {
                conversationId,
                sessionId,
                sessionMapSize: this.dingtalk.conversations.size
              })
            }

            // 流式发送
            if (config.streaming.enabled) {
              const formatted = this.messageFormatter.formatEvent(event, context)
              if (formatted) {
                sentMessageCount++
                this.logger.info('DINGTALK', `✅ 发送消息 #${sentMessageCount}/${messageCount} (${formatted.msgtype})`)
                try {
                  await this.dingtalk.send(sessionWebhook, formatted)
                  this.logger.debug('DINGTALK', `发送成功`)
                } catch (error) {
                  this.logger.error('DINGTALK', '发送失败', { error: error.message })
                }
              } else {
                this.logger.debug('EVENT', `事件 ${event.type} 未格式化（跳过）`)
              }
            }
          },
          onComplete: async (exitCode) => {
            const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
            this.logger.success('SESSION', `✅ 完成，退出码: ${exitCode}, 耗时: ${totalTime}s, 事件数: ${messageCount}, 发送数: ${sentMessageCount}`)

            // 🎯 发送完成消息到钉钉（如果配置启用且还未发送）
            if (config.streaming.showCompletionSummary && !sessionEndSent) {
              try {
                this.logger.info('DINGTALK', '准备发送完成消息（onComplete）')
                const context = { index: messageCount, elapsed: totalTime }
                const completionEvent = {
                  type: 'session_end',
                  exitCode: exitCode
                }
                const formatted = this.messageFormatter.formatEvent(completionEvent, context)

                if (formatted && sessionWebhook) {
                  await this.dingtalk.send(sessionWebhook, formatted)
                  this.logger.success('DINGTALK', '✅ 完成消息已发送（onComplete）')
                }
              } catch (error) {
                this.logger.error('DINGTALK', '发送完成消息失败', { error: error.message })
              }
            } else if (sessionEndSent) {
              this.logger.info('DINGTALK', 'ℹ️  session_end 已在 onEvent 中发送，跳过 onComplete 中的发送')
            } else if (!config.streaming.showCompletionSummary) {
              this.logger.info('DINGTALK', 'ℹ️  完成总结已禁用，不发送')
            }

            resolve()
          },
          onError: (error) => {
            this.logger.error('SESSION', '❌ 错误', { error: error.message, stack: error.stack })
            reject(error)
          }
        }

        if (isResume) {
          this.logger.debug('DINGTALK', `调用 continueSession: ${sessionId}`)
          connector.continueSession(sessionId, messageContent, options)
        } else {
          this.logger.debug('DINGTALK', '调用 startSession')
          connector.startSession(messageContent, options)
        }

        this.logger.info('DINGTALK', '✅ Session 方法已调用，等待事件...')
      })

      return { status: 'SUCCESS' }
    } catch (error) {
      this.logger.error('DINGTALK', '处理失败', { error: error.message })
      return { status: 'LATER', message: error.message }
    }
  }

  /**
   * 启动内存监控
   * 定期记录内存使用情况，帮助发现内存泄漏
   * @private
   */
  _startMemoryMonitor() {
    // 检查是否启用内存监控
    const enabled = process.env.MEMORY_MONITOR_ENABLED !== 'false'
    const intervalMs = parseInt(process.env.MEMORY_MONITOR_INTERVAL || '300000', 10) // 默认5分钟

    if (!enabled) {
      this.logger.debug('SERVER', '内存监控已禁用')
      return
    }

    this.memoryMonitorInterval = setInterval(() => {
      const memUsage = process.memoryUsage()
      const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024)
      const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024)
      const rssMB = Math.round(memUsage.rss / 1024 / 1024)
      const externalMB = Math.round(memUsage.external / 1024 / 1024)

      // 计算堆内存使用率
      const heapUsagePercent = ((heapUsedMB / heapTotalMB) * 100).toFixed(1)

      // 记录内存使用情况
      this.logger.info('MEMORY', `内存使用情况`, {
        heap: `${heapUsedMB}MB / ${heapTotalMB}MB (${heapUsagePercent}%)`,
        rss: `${rssMB}MB`,
        external: `${externalMB}MB`,
        arrayBuffers: `${Math.round(memUsage.arrayBuffers / 1024 / 1024)}MB`
      })

      // 内存使用率超过 80% 时发出警告
      if (parseFloat(heapUsagePercent) > 80) {
        this.logger.warning('MEMORY', `⚠️ 内存使用率过高: ${heapUsagePercent}%`, {
          heap: `${heapUsedMB}MB / ${heapTotalMB}MB`,
          recommendation: '建议检查内存泄漏或增加堆内存限制'
        })
      }
    }, intervalMs)

    this.logger.info('SERVER', `✓ 内存监控已启动 (间隔: ${intervalMs}ms)`)
  }

  async shutdown() {
    this.logger.info('SERVER', '正在优雅关闭...')

    try {
      // 🆕 停止内存监控
      if (this.memoryMonitorInterval) {
        clearInterval(this.memoryMonitorInterval)
        this.logger.info('SERVER', '✓ 内存监控已停止')
      }

      // 停止定时任务
      if (this.scheduler) {
        this.scheduler.stop()
        this.logger.info('SCHEDULER', '✓ 定时任务已停止')
      }

      // 中断所有活跃会话
      if (this.connectors) {
        for (const [provider, connector] of this.connectors.entries()) {
          try {
            const sessions = connector.getActiveSessions ? connector.getActiveSessions() : []
            if (Array.isArray(sessions) && sessions.length > 0) {
              sessions.forEach(sid => {
                if (connector.interruptSession) {
                  connector.interruptSession(sid)
                }
              })
              this.logger.info('CONNECTOR', `✓ ${provider} 会话已中断: ${sessions.length} 个`)
            }

            // 关闭连接器
            if (connector.close) {
              await connector.close()
            }
          } catch (error) {
            this.logger.warning('CONNECTOR', `${provider} 关闭失败: ${error.message}`)
          }
        }
      }

      // 关闭钉钉连接
      await this.dingtalk.close()
      this.logger.info('DINGTALK', '✓ 钉钉连接已关闭')

      // 🆕 保存上下文记忆（如果有）
      if (this.contextMemory) {
        try {
          await this.contextMemory.saveAll()
          this.logger.info('MEMORY', '✓ 上下文记忆已保存')
        } catch (error) {
          this.logger.warning('MEMORY', `保存失败: ${error.message}`)
        }
      }

      this.logger.success('SERVER', '✓ 服务器已安全关闭')

      // 🆕 添加短暂延迟确保日志输出
      await new Promise(resolve => setTimeout(resolve, 100))

      process.exit(0)
    } catch (error) {
      this.logger.error('SERVER', `关闭过程中出错: ${error.message}`)
      process.exit(1)
    }
  }

  // ==================== 🆕 配置变更处理（2026-03-05 自动升级优化）====================

  /**
   * 处理配置变更
   * @param {Object} changeInfo - 变更信息
   */
  async handleConfigChange(changeInfo) {
    try {
      if (changeInfo.error) {
        // 重载失败
        this.logger.error('CONFIG', `配置重载失败: ${changeInfo.error}`)
        await this.sendConfigChangeNotification({
          success: false,
          error: changeInfo.error,
          timestamp: changeInfo.timestamp
        })
        return
      }

      if (!changeInfo.hasChanged) {
        // 配置未变化
        this.logger.debug('CONFIG', '配置内容未变化')
        return
      }

      // 配置成功重载
      this.logger.success('CONFIG', '✓ 配置已自动更新')

      // 发送通知到钉钉
      await this.sendConfigChangeNotification({
        success: true,
        reloadCount: changeInfo.reloadCount,
        fileInfo: changeInfo.fileInfo,
        timestamp: changeInfo.timestamp
      })

      // 🆕 可以在这里添加更多配置变更后的处理逻辑
      // 例如：重新加载某些模块、更新连接器配置等
    } catch (error) {
      this.logger.error('CONFIG', '处理配置变更失败', error)
    }
  }

  /**
   * 发送配置变更通知到钉钉
   * @param {Object} data - 通知数据
   */
  async sendConfigChangeNotification(data) {
    try {
      const timestamp = data.timestamp ? new Date(data.timestamp).toLocaleString('zh-CN') : new Date().toLocaleString('zh-CN')

      let message = ''

      if (data.success) {
        message = `🔄 **配置自动更新**\n\n`
        message += `✅ 配置已成功重载\n`
        message += `📅 时间: ${timestamp}\n`
        message += `🔢 重载次数: ${data.reloadCount}\n`

        if (data.fileInfo) {
          message += `📄 文件大小: ${Math.round(data.fileInfo.size / 1024)} KB\n`
        }
      } else {
        message = `⚠️ **配置重载失败**\n\n`
        message += `❌ 错误: ${data.error}\n`
        message += `📅 时间: ${timestamp}\n`
        message += `\n请检查配置文件格式是否正确`
      }

      // 通过钉钉发送通知
      await this.dingtalk.sendMarkdown(message)

      this.logger.debug('CONFIG', '配置变更通知已发送')
    } catch (error) {
      this.logger.error('CONFIG', '发送配置变更通知失败', error)
    }
  }
}

// 启动服务器
const server = new UnifiedServer()
server.start().catch(error => {
  console.error('启动失败:', error)
  process.exit(1)
})

// 优雅关闭
process.on('SIGINT', () => server.shutdown())
process.on('SIGTERM', () => server.shutdown())

module.exports = UnifiedServer
