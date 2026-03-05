/**
 * 健康检查路由
 * 提供服务健康状态监控端点
 *
 * @version 1.0.0
 */

const os = require('os')

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
