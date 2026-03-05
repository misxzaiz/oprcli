/**
 * 增强的健康检查系统
 *
 * 功能：
 * - 依赖服务状态监控
 * - 系统资源监控
 * - 健康检查结果缓存
 * - 历史趋势记录
 */

const os = require('os')

class EnhancedHealthChecker {
  constructor(logger, options = {}) {
    this.logger = logger
    this.cacheTimeout = options.cacheTimeout || 30000 // 30秒缓存
    this.historyLimit = options.historyLimit || 100 // 保留100条历史记录
    this.cache = new Map()
    this.history = []
    this.checks = new Map() // 注册的检查项
  }

  /**
   * 注册健康检查项
   */
  registerCheck(name, checkFn) {
    this.checks.set(name, {
      name,
      fn: checkFn,
      lastResult: null,
      lastCheckTime: null
    })
    this.logger.info('HEALTH', `注册检查项: ${name}`)
  }

  /**
   * 执行单个检查项
   */
  async performCheck(name) {
    const check = this.checks.get(name)
    if (!check) {
      return {
        name,
        status: 'unknown',
        message: '检查项不存在'
      }
    }

    const startTime = Date.now()
    try {
      const result = await check.fn()
      const duration = Date.now() - startTime

      const checkResult = {
        name,
        status: result.healthy ? 'healthy' : 'unhealthy',
        message: result.message || 'OK',
        details: result.details,
        duration,
        timestamp: new Date().toISOString()
      }

      // 更新缓存
      check.lastResult = checkResult
      check.lastCheckTime = Date.now()

      return checkResult
    } catch (error) {
      const duration = Date.now() - startTime
      const checkResult = {
        name,
        status: 'error',
        message: error.message,
        duration,
        timestamp: new Date().toISOString()
      }

      check.lastResult = checkResult
      check.lastCheckTime = Date.now()

      return checkResult
    }
  }

  /**
   * 执行所有检查
   */
  async checkAll(forceRefresh = false) {
    const results = []
    let overallHealthy = true

    for (const [name] of this.checks) {
      let result

      // 检查缓存
      if (!forceRefresh) {
        const check = this.checks.get(name)
        const cacheAge = Date.now() - (check.lastCheckTime || 0)
        if (cacheAge < this.cacheTimeout && check.lastResult) {
          result = check.lastResult
          result.cached = true
        }
      }

      // 执行检查
      if (!result) {
        result = await this.performCheck(name)
        result.cached = false // 明确标记为非缓存
      }

      results.push(result)

      if (result.status !== 'healthy') {
        overallHealthy = false
      }
    }

    const summary = {
      status: overallHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      totalChecks: results.length,
      healthy: results.filter(r => r.status === 'healthy').length,
      unhealthy: results.filter(r => r.status === 'unhealthy').length,
      errors: results.filter(r => r.status === 'error').length,
      checks: results
    }

    // 保存历史
    this.addToHistory(summary)

    return summary
  }

  /**
   * 获取依赖服务状态
   */
  async getDependenciesStatus(server) {
    const dependencies = []

    // 检查钉钉连接
    if (server.dingtalk) {
      const dingtalkStatus = {
        name: 'dingtalk',
        status: 'unknown',
        message: 'Not initialized'
      }

      try {
        // 检查钉钉客户端是否存在
        if (server.dingtalk.client) {
          dingtalkStatus.status = 'connected'
          dingtalkStatus.message = 'Connected'
          dingtalkStatus.details = {
            clientId: server.dingtalk.clientId || 'configured'
          }
        } else {
          dingtalkStatus.status = 'disconnected'
          dingtalkStatus.message = 'Client not initialized'
        }
      } catch (error) {
        dingtalkStatus.status = 'error'
        dingtalkStatus.message = error.message
      }

      dependencies.push(dingtalkStatus)
    }

    // 检查 CLI 连接器
    for (const [provider, connector] of server.connectors) {
      const connectorStatus = {
        name: provider,
        type: 'connector',
        status: 'unknown',
        message: 'Not initialized'
      }

      try {
        if (connector) {
          connectorStatus.status = connector.connected ? 'ready' : 'disconnected'
          connectorStatus.message = connector.connected
            ? 'Connected and ready'
            : 'Not connected'
          connectorStatus.details = {
            connected: connector.connected,
            activeSessions: connector.getActiveSessions().length
          }
        } else {
          connectorStatus.status = 'not_configured'
          connectorStatus.message = 'Connector not configured'
        }
      } catch (error) {
        connectorStatus.status = 'error'
        connectorStatus.message = error.message
      }

      dependencies.push(connectorStatus)
    }

    return {
      total: dependencies.length,
      healthy: dependencies.filter(d => d.status === 'connected' || d.status === 'ready').length,
      dependencies
    }
  }

  /**
   * 获取系统资源状态
   */
  getResourcesStatus() {
    const freemem = os.freemem()
    const totalmem = os.totalmem()
    const usedmem = totalmem - freemem
    const memUsage = (usedmem / totalmem * 100).toFixed(2)

    const cpus = os.cpus()
    const loadAverage = os.loadavg()

    const uptime = process.uptime()
    const uptimeHours = (uptime / 3600).toFixed(2)

    return {
      memory: {
        total: Math.round(totalmem / 1024 / 1024 / 1024), // GB
        used: Math.round(usedmem / 1024 / 1024 / 1024), // GB
        free: Math.round(freemem / 1024 / 1024 / 1024), // GB
        usagePercent: parseFloat(memUsage)
      },
      cpu: {
        cores: cpus.length,
        loadAverage: {
          '1min': loadAverage[0].toFixed(2),
          '5min': loadAverage[1].toFixed(2),
          '15min': loadAverage[2].toFixed(2)
        }
      },
      process: {
        uptime: `${uptimeHours}h`,
        pid: process.pid,
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version
      },
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 获取健康趋势
   */
  getHealthTrends(limit = 20) {
    return this.history.slice(-limit)
  }

  /**
   * 添加到历史记录
   */
  addToHistory(summary) {
    this.history.push({
      status: summary.status,
      timestamp: summary.timestamp,
      healthy: summary.healthy,
      unhealthy: summary.unhealthy,
      errors: summary.errors
    })

    // 限制历史记录数量
    if (this.history.length > this.historyLimit) {
      this.history.shift()
    }
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache.clear()
    for (const check of this.checks.values()) {
      check.lastResult = null
      check.lastCheckTime = null
    }
    this.logger.info('HEALTH', '缓存已清除')
  }

  /**
   * 获取缓存统计
   */
  getCacheStats() {
    return {
      cacheTimeout: this.cacheTimeout,
      historyCount: this.history.length,
      historyLimit: this.historyLimit,
      registeredChecks: this.checks.size
    }
  }
}

module.exports = EnhancedHealthChecker
