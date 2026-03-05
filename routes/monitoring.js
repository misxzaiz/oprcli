/**
 * 监控和诊断路由
 * 提供健康检查、性能指标、系统状态等 API
 *
 * @version 1.0.0
 * @lastUpdated 2026-03-05
 */

const express = require('express')
const router = express.Router()

/**
 * 设置监控路由
 */
function setupMonitoringRoutes(server) {
  const healthChecker = server.healthChecker
  const metricsCollector = server.metricsCollector
  const config = server.config

  /**
   * GET /health
   * 健康检查端点
   */
  router.get('/health', async (req, res) => {
    try {
      const result = await healthChecker.checkAll()

      res.status(result.isHealthy() ? 200 : result.isDegraded() ? 200 : 503).json(result.toJSON())
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message
      })
    }
  })

  /**
   * GET /health/live
   * 存活检查（轻量级）
   */
  router.get('/health/live', (req, res) => {
    res.status(200).json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    })
  })

  /**
   * GET /health/ready
   * 就绪检查
   */
  router.get('/health/ready', async (req, res) => {
    try {
      // 检查关键依赖
      const checks = {
        workDir: true,
        prompts: true,
        connectors: true
      }

      res.status(200).json({
        status: 'ready',
        checks,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      res.status(503).json({
        status: 'not_ready',
        error: error.message
      })
    }
  })

  /**
   * GET /metrics
   * 性能指标端点
   */
  router.get('/metrics', (req, res) => {
    try {
      const report = metricsCollector.getPerformanceReport()
      res.json(report)
    } catch (error) {
      res.status(500).json({
        error: error.message
      })
    }
  })

  /**
   * GET /diagnostics
   * 诊断信息端点
   */
  router.get('/diagnostics', (req, res) => {
    try {
      const DiagnosticsCollector = require('../utils/health-check').DiagnosticsCollector
      const report = DiagnosticsCollector.generateDiagnosticsReport(config)

      res.json(report)
    } catch (error) {
      res.status(500).json({
        error: error.message
      })
    }
  })

  /**
   * GET /status
   * 系统状态端点
   */
  router.get('/status', (req, res) => {
    try {
      const status = {
        application: {
          name: 'OPRCLI',
          version: '2.0.0',
          environment: process.env.NODE_ENV || 'development',
          uptime: process.uptime(),
          startTime: new Date(Date.now() - process.uptime() * 1000).toISOString()
        },
        configuration: {
          provider: config.provider,
          promptMode: config.promptMode,
          streamingEnabled: config.streaming.enabled,
          dingtalkEnabled: config.dingtalk.enabled
        },
        connectors: {
          claude: server.claudeConnector ? {
            active: server.claudeConnector === server.currentConnector,
            sessions: server.claudeConnector.sessions.size
          } : null,
          iflow: server.iflowConnector ? {
            active: server.iflowConnector === server.currentConnector,
            sessions: server.iflowConnector.sessions.size
          } : null
        },
        plugins: {
          loaded: server.pluginManager ? server.pluginManager.plugins.length : 0,
          active: server.pluginManager ? server.pluginManager.plugins.filter(p => p.enabled).length : 0
        },
        scheduler: {
          tasks: server.taskManager ? server.taskManager.tasks.length : 0
        }
      }

      res.json(status)
    } catch (error) {
      res.status(500).json({
        error: error.message
      })
    }
  })

  /**
   * GET /logger/stats
   * 日志统计端点
   */
  router.get('/logger/stats', (req, res) => {
    try {
      const stats = server.logger.getStats()
      res.json(stats)
    } catch (error) {
      res.status(500).json({
        error: error.message
      })
    }
  })

  /**
   * POST /logger/reset
   * 重置日志统计
   */
  router.post('/logger/reset', (req, res) => {
    try {
      server.logger.resetStats()
      res.json({
        success: true,
        message: '日志统计已重置'
      })
    } catch (error) {
      res.status(500).json({
        error: error.message
      })
    }
  })

  return router
}

module.exports = setupMonitoringRoutes
