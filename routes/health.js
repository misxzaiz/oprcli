/**
 * 健康检查路由
 * 提供服务健康状态监控端点
 *
 * @version 2.0.0 - 增强版
 */

const os = require('os')
const EnhancedHealthChecker = require('../utils/health-enhanced')

/**
 * 创建健康检查路由
 * @param {Object} serverInstance - 服务器实例
 * @returns {Router} Express 路由
 */
function createHealthRoutes(serverInstance) {
  const express = require('express')
  const router = express.Router()

  // 获取服务器启动时间
  const startTime = Date.now()

  // 🆕 初始化增强健康检查器（2026-03-05 第三轮优化）
  const enhancedChecker = new EnhancedHealthChecker(
    serverInstance?.logger || console,
    {
      cacheTimeout: parseInt(process.env.HEALTH_CACHE_TIMEOUT || '30000', 10),
      historyLimit: parseInt(process.env.HEALTH_HISTORY_LIMIT || '100', 10)
    }
  )

  // 🆕 注册默认健康检查项
  if (serverInstance) {
    // 检查钉钉连接
    enhancedChecker.registerCheck('dingtalk_connection', async () => {
      if (!serverInstance.dingtalk || !serverInstance.dingtalk.client) {
        return { healthy: false, message: '钉钉客户端未初始化' }
      }
      // 简单检查：如果客户端存在就认为健康
      return { healthy: true, message: '钉钉客户端已连接' }
    })

    // 检查默认连接器
    enhancedChecker.registerCheck('default_connector', async () => {
      const defaultConnector = serverInstance.connectors.get(serverInstance.defaultProvider)
      if (!defaultConnector) {
        return { healthy: false, message: '默认连接器未初始化' }
      }
      if (!defaultConnector.connected) {
        return { healthy: false, message: '默认连接器未连接', details: { provider: serverInstance.defaultProvider } }
      }
      return { healthy: true, message: '默认连接器就绪', details: { provider: serverInstance.defaultProvider } }
    })

    // 检查内存使用
    enhancedChecker.registerCheck('memory_usage', async () => {
      const memoryUsage = process.memoryUsage()
      const heapUsedPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100
      const threshold = 90 // 90% 阈值

      if (heapUsedPercent > threshold) {
        return {
          healthy: false,
          message: `内存使用过高: ${heapUsedPercent.toFixed(2)}%`,
          details: { heapUsedPercent, threshold }
        }
      }
      return {
        healthy: true,
        message: `内存使用正常: ${heapUsedPercent.toFixed(2)}%`,
        details: { heapUsedPercent }
      }
    })

    // 检查事件循环延迟（简化版）
    enhancedChecker.registerCheck('event_loop', async () => {
      const start = process.hrtime.bigint()
      await new Promise(resolve => setImmediate(resolve))
      const delay = Number(process.hrtime.bigint() - start) / 1000000 // 转换为毫秒

      if (delay > 100) { // 100ms 阈值
        return {
          healthy: false,
          message: `事件循环延迟过高: ${delay.toFixed(2)}ms`,
          details: { delay }
        }
      }
      return {
        healthy: true,
        message: `事件循环正常: ${delay.toFixed(2)}ms`,
        details: { delay }
      }
    })
  }

  /**
   * GET /health
   * 基础健康检查（快速响应）
   */
  router.get('/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    })
  })

  /**
   * GET /health/detailed
   * 详细健康检查（包含系统信息）
   */
  router.get('/health/detailed', (req, res) => {
    const memoryUsage = process.memoryUsage()
    const cpuUsage = process.cpuUsage()

    const healthData = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      server: {
        startTime: new Date(startTime).toISOString(),
        uptimeFormatted: formatUptime(process.uptime()),
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch
      },
      system: {
        hostname: os.hostname(),
        osType: os.type(),
        osRelease: os.release(),
        totalMemory: formatBytes(os.totalmem()),
        freeMemory: formatBytes(os.freemem()),
        cpuCount: os.cpus().length,
        loadAverage: os.loadavg()
      },
      process: {
        memory: {
          rss: formatBytes(memoryUsage.rss),
          heapTotal: formatBytes(memoryUsage.heapTotal),
          heapUsed: formatBytes(memoryUsage.heapUsed),
          external: formatBytes(memoryUsage.external),
          arrayBuffers: formatBytes(memoryUsage.arrayBuffers)
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system
        },
        pid: process.pid,
        cwd: process.cwd()
      },
      resources: {
        eventLoopDelay: null, // 需要外部监控库
        heapUsedPercent: ((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100).toFixed(2) + '%'
      }
    }

    // 检查服务器实例状态
    if (serverInstance) {
      healthData.server.instance = {
        port: serverInstance.port,
        provider: serverInstance.provider,
        connections: serverInstance.activeSessions || 0
      }
    }

    res.status(200).json(healthData)
  })

  /**
   * GET /health/live
   * 存活探针（用于 Kubernetes Liveness Probe）
   */
  router.get('/health/live', (req, res) => {
    // 简单检查服务是否运行
    res.status(200).json({ status: 'alive' })
  })

  /**
   * GET /health/ready
   * 就绪探针（用于 Kubernetes Readiness Probe）
   */
  router.get('/health/ready', (req, res) => {
    // 检查服务是否准备好接受请求
    const checks = {
      server: true,
      dependencies: true, // 检查依赖是否已安装
      configuration: true // 检查配置是否有效
    }

    // 检查依赖
    try {
      const fs = require('fs')
      const path = require('path')
      const nodeModulesPath = path.join(__dirname, '../node_modules')
      checks.dependencies = fs.existsSync(nodeModulesPath)
    } catch (error) {
      checks.dependencies = false
    }

    // 检查配置
    try {
      const config = require('../utils/config')
      const validation = config.validate()
      checks.configuration = validation.valid
    } catch (error) {
      checks.configuration = false
    }

    const isReady = Object.values(checks).every(check => check === true)

    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'ready' : 'not_ready',
      checks
    })
  })

  /**
   * GET /health/dependencies
   * 依赖健康检查
   */
  router.get('/health/dependencies', (req, res) => {
    const fs = require('fs')
    const path = require('path')

    try {
      const packageJson = require('../package.json')
      const dependencies = {
        ...packageJson.dependencies,
        ...(packageJson.devDependencies || {})
      }

      const depStatus = []
      let allInstalled = true

      Object.entries(dependencies).forEach(([name, version]) => {
        const modulePath = path.join(__dirname, '../node_modules', name)
        const installed = fs.existsSync(modulePath)

        depStatus.push({
          name,
          requested: version,
          installed: installed ? 'yes' : 'no'
        })

        if (!installed) {
          allInstalled = false
        }
      })

      res.status(200).json({
        status: allInstalled ? 'ok' : 'warning',
        total: depStatus.length,
        installed: depStatus.filter(d => d.installed === 'yes').length,
        missing: depStatus.filter(d => d.installed === 'no').length,
        dependencies: req.query.verbose === 'true' ? depStatus : undefined
      })
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message
      })
    }
  })

  /**
   * GET /health/config
   * 配置检查
   */
  router.get('/health/config', (req, res) => {
    try {
      const config = require('../utils/config')
      const validation = config.validate()

      res.status(validation.valid ? 200 : 503).json({
        status: validation.valid ? 'ok' : 'invalid',
        provider: config.provider,
        promptMode: config.promptMode,
        hasErrors: validation.errors.length > 0,
        hasWarnings: validation.warnings.length > 0,
        errors: req.query.verbose === 'true' ? validation.errors : undefined,
        warnings: req.query.verbose === 'true' ? validation.warnings : undefined
      })
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message
      })
    }
  })

  /**
   * GET /health/logs
   * 日志统计
   */
  router.get('/health/logs', (req, res) => {
    try {
      if (serverInstance && serverInstance.logger) {
        const stats = serverInstance.logger.getStats()

        res.status(200).json({
          status: 'ok',
          stats: {
            total: stats.total,
            breakdown: {
              debug: stats.debug,
              info: stats.info,
              event: stats.event,
              success: stats.success,
              warning: stats.warning,
              error: stats.error
            },
            distribution: stats.levelDistribution,
            activeCategories: stats.activeCategories
          }
        })
      } else {
        res.status(503).json({
          status: 'unavailable',
          message: 'Logger not initialized'
        })
      }
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message
      })
    }
  })

  // 🆕 增强功能（2026-03-05 第三轮优化）

  /**
   * GET /health/enhanced
   * 增强健康检查（包含所有注册的检查项）
   */
  router.get('/health/enhanced', async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === 'true'
      const results = await enhancedChecker.checkAll(forceRefresh)
      res.status(results.status === 'healthy' ? 200 : 503).json(results)
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message
      })
    }
  })

  /**
   * GET /health/dependencies/status
   * 依赖服务状态（钉钉、连接器等）
   */
  router.get('/health/dependencies/status', async (req, res) => {
    try {
      const status = await enhancedChecker.getDependenciesStatus(serverInstance)
      const allHealthy = status.healthy === status.total

      res.status(allHealthy ? 200 : 503).json({
        status: allHealthy ? 'ok' : 'degraded',
        ...status
      })
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message
      })
    }
  })

  /**
   * GET /health/resources/status
   * 系统资源状态（内存、CPU等）
   */
  router.get('/health/resources/status', (req, res) => {
    try {
      const resources = enhancedChecker.getResourcesStatus()

      // 检查是否有资源使用过高
      const memoryHigh = resources.memory.usagePercent > 90
      const loadHigh = resources.cpu.cores > 0 &&
        parseFloat(resources.cpu.loadAverage['1min']) > resources.cpu.cores

      const status = (memoryHigh || loadHigh) ? 'warning' : 'ok'

      res.status(status === 'ok' ? 200 : 503).json({
        status,
        resources
      })
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message
      })
    }
  })

  /**
   * GET /health/trends
   * 健康趋势数据
   */
  router.get('/health/trends', (req, res) => {
    try {
      const limit = parseInt(req.query.limit || '20', 10)
      const trends = enhancedChecker.getHealthTrends(limit)

      res.status(200).json({
        status: 'ok',
        count: trends.length,
        trends
      })
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message
      })
    }
  })

  /**
   * POST /health/check
   * 手动触发健康检查
   */
  router.post('/health/check', async (req, res) => {
    try {
      const results = await enhancedChecker.checkAll(true) // 强制刷新
      res.status(results.status === 'healthy' ? 200 : 503).json(results)
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message
      })
    }
  })

  /**
   * POST /health/cache/clear
   * 清除健康检查缓存
   */
  router.post('/health/cache/clear', (req, res) => {
    try {
      enhancedChecker.clearCache()
      res.status(200).json({
        status: 'ok',
        message: '缓存已清除'
      })
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message
      })
    }
  })

  /**
   * GET /health/cache/stats
   * 缓存统计信息
   */
  router.get('/health/cache/stats', (req, res) => {
    try {
      const stats = enhancedChecker.getCacheStats()
      res.status(200).json({
        status: 'ok',
        stats
      })
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message
      })
    }
  })

  /**
   * GET /health/all
   * 综合健康状态（包含所有信息）
   */
  router.get('/health/all', async (req, res) => {
    try {
      const [enhanced, dependencies, resources, trends] = await Promise.all([
        enhancedChecker.checkAll(req.query.refresh === 'true'),
        enhancedChecker.getDependenciesStatus(serverInstance),
        Promise.resolve(enhancedChecker.getResourcesStatus()),
        Promise.resolve(enhancedChecker.getHealthTrends(10))
      ])

      const allHealthy = enhanced.status === 'healthy' &&
        dependencies.healthy === dependencies.total

      res.status(allHealthy ? 200 : 503).json({
        status: allHealthy ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        enhanced,
        dependencies,
        resources,
        trends: trends.slice(-5) // 最近5条
      })
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message
      })
    }
  })

  return router
}

/**
 * 格式化字节数
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * 格式化运行时间
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / (3600 * 24))
  const hours = Math.floor((seconds % (3600 * 24)) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  const parts = []
  if (days > 0) parts.push(`${days}天`)
  if (hours > 0) parts.push(`${hours}小时`)
  if (minutes > 0) parts.push(`${minutes}分钟`)
  if (secs > 0 || parts.length === 0) parts.push(`${secs}秒`)

  return parts.join(' ')
}

module.exports = createHealthRoutes
