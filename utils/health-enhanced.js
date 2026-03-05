/**
 * 增强的健康检查系统
 *
 * 功能：
 * - 依赖服务状态监控
 * - 系统资源监控
 * - 健康检查结果缓存
 * - 历史趋势记录
 *
 * 从 health-check.js 迁移的类：
 * - HealthCheckResult
 * - SystemHealthChecker
 * - DiagnosticsCollector
 * - PerformanceMetricsCollector
 */

const os = require('os')

/**
 * 健康检查结果类
 * 从 health-check.js 迁移
 */
class HealthCheckResult {
  constructor(status = 'healthy', checks = {}, meta = {}) {
    this.status = status // healthy, degraded, unhealthy
    this.checks = checks
    this.meta = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      ...meta
    }
  }

  isHealthy() {
    return this.status === 'healthy'
  }

  isDegraded() {
    return this.status === 'degraded'
  }

  isUnhealthy() {
    return this.status === 'unhealthy'
  }

  toJSON() {
    return {
      status: this.status,
      checks: this.checks,
      meta: this.meta
    }
  }
}

/**
 * 系统健康检查器
 * 从 health-check.js 迁移
 */
class SystemHealthChecker {
  constructor(config) {
    this.config = config
    this.checks = new Map()
    this.history = []
    this.maxHistorySize = 100
  }

  /**
   * 注册健康检查
   */
  registerCheck(name, checkFn, options = {}) {
    this.checks.set(name, {
      fn: checkFn,
      critical: options.critical !== false,
      timeout: options.timeout || 5000,
      description: options.description || name
    })
  }

  /**
   * 执行所有检查
   */
  async checkAll() {
    const { performance } = require('perf_hooks')
    const checks = {}
    let overallStatus = 'healthy'
    let failedChecks = 0
    let criticalFailedChecks = 0

    for (const [name, check] of this.checks.entries()) {
      const start = performance.now()

      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('检查超时')), check.timeout)
        })

        const result = await Promise.race([
          check.fn(),
          timeoutPromise
        ])

        const duration = performance.now() - start

        checks[name] = {
          name,
          status: 'pass',
          duration: `${duration.toFixed(2)}ms`,
          description: check.description,
          data: result
        }
      } catch (error) {
        const duration = performance.now() - start

        checks[name] = {
          name,
          status: 'fail',
          duration: `${duration.toFixed(2)}ms`,
          description: check.description,
          error: error.message,
          critical: check.critical
        }

        failedChecks++
        if (checks[name].critical) {
          criticalFailedChecks++
        }
      }
    }

    if (criticalFailedChecks > 0) {
      overallStatus = 'unhealthy'
    } else if (failedChecks > 0) {
      overallStatus = 'degraded'
    }

    const result = new HealthCheckResult(overallStatus, checks)
    this.addToHistory(result)

    return result
  }

  /**
   * 添加到历史记录
   */
  addToHistory(result) {
    this.history.push({
      timestamp: result.meta.timestamp,
      status: result.status,
      checks: Object.keys(result.checks).length
    })

    if (this.history.length > this.maxHistorySize) {
      this.history.shift()
    }
  }

  /**
   * 获取历史记录
   */
  getHistory(limit = 10) {
    return this.history.slice(-limit)
  }
}

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

/**
 * 诊断信息收集器
 * 从 health-check.js 迁移
 */
class DiagnosticsCollector {
  /**
   * 收集系统信息
   */
  static collectSystemInfo() {
    const os = require('os')
    return {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      uptime: {
        process: process.uptime(),
        system: os.uptime()
      },
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        usagePercent: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2)
      },
      cpu: {
        model: os.cpus()[0].model,
        cores: os.cpus().length,
        loadAverage: os.loadavg()
      },
      network: os.networkInterfaces()
    }
  }

  /**
   * 收集进程信息
   */
  static collectProcessInfo() {
    const memUsage = process.memoryUsage()
    return {
      pid: process.pid,
      cwd: process.cwd(),
      execPath: process.execPath,
      argv: process.argv,
      memory: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers
      },
      cpuUsage: process.cpuUsage(),
      env: {
        nodeEnv: process.env.NODE_ENV,
        port: process.env.PORT,
        provider: process.env.PROVIDER
      }
    }
  }

  /**
   * 生成完整诊断报告
   */
  static generateDiagnosticsReport(config, additionalChecks = {}) {
    const fs = require('fs')
    const path = require('path')

    return {
      timestamp: new Date().toISOString(),
      system: this.collectSystemInfo(),
      process: this.collectProcessInfo(),
      fileSystem: this.collectFileSystemInfo([
        config?.claude?.workDir,
        config?.iflow?.workDir,
        config?.systemPrompts?.promptsDir
      ].filter(Boolean)),
      additional: additionalChecks
    }
  }

  /**
   * 收集文件系统信息
   */
  static collectFileSystemInfo(directories = []) {
    const fs = require('fs')
    const info = {}

    for (const dir of directories) {
      try {
        const stats = fs.statSync(dir)
        info[dir] = {
          exists: true,
          type: stats.isDirectory() ? 'directory' : 'file',
          size: stats.size,
          modified: stats.mtime,
          accessible: true
        }
      } catch (error) {
        info[dir] = {
          exists: false,
          accessible: false,
          error: error.code
        }
      }
    }

    return info
  }
}

/**
 * 性能指标收集器
 * 从 health-check.js 迁移
 */
class PerformanceMetricsCollector {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        success: 0,
        error: 0,
        avgResponseTime: 0
      },
      operations: {
        total: 0,
        avgTime: 0
      },
      memory: {
        samples: []
      }
    }
    this.startTime = Date.now()
  }

  /**
   * 记录请求指标
   */
  recordRequest(duration, success) {
    this.metrics.requests.total++
    if (success) {
      this.metrics.requests.success++
    } else {
      this.metrics.requests.error++
    }

    // 更新平均响应时间
    const total = this.metrics.requests.total
    const avg = this.metrics.requests.avgResponseTime
    this.metrics.requests.avgResponseTime = (avg * (total - 1) + duration) / total
  }

  /**
   * 记录操作指标
   */
  recordOperation(duration) {
    this.metrics.operations.total++
    const total = this.metrics.operations.total
    const avg = this.metrics.operations.avgTime
    this.metrics.operations.avgTime = (avg * (total - 1) + duration) / total
  }

  /**
   * 记录内存样本
   */
  recordMemorySample() {
    const memUsage = process.memoryUsage()
    this.metrics.memory.samples.push({
      timestamp: Date.now(),
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal
    })

    // 保留最近100个样本
    if (this.metrics.memory.samples.length > 100) {
      this.metrics.memory.samples.shift()
    }
  }

  /**
   * 获取性能报告
   */
  getPerformanceReport() {
    return {
      uptime: Date.now() - this.startTime,
      requests: {
        ...this.metrics.requests,
        errorRate: this.metrics.requests.total > 0
          ? (this.metrics.requests.error / this.metrics.requests.total * 100).toFixed(2) + '%'
          : '0%'
      },
      operations: this.metrics.operations,
      memory: {
        current: this.metrics.memory.samples[this.metrics.memory.samples.length - 1],
        samples: this.metrics.memory.samples.length
      }
    }
  }

  /**
   * 重置指标
   */
  reset() {
    this.metrics = {
      requests: {
        total: 0,
        success: 0,
        error: 0,
        avgResponseTime: 0
      },
      operations: {
        total: 0,
        avgTime: 0
      },
      memory: {
        samples: []
      }
    }
    this.startTime = Date.now()
  }
}

module.exports = {
  EnhancedHealthChecker,
  HealthCheckResult,
  SystemHealthChecker,
  DiagnosticsCollector,
  PerformanceMetricsCollector
}
