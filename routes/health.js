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
      database: false, // 如果有数据库连接
      externalServices: false // 如果有外部服务依赖
    }

    const isReady = Object.values(checks).every(check => check === true)

    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'ready' : 'not_ready',
      checks
    })
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
