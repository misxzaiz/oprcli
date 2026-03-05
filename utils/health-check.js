/**
 * 健康检查和诊断工具
 * 提供系统健康状态监控和诊断功能
 *
 * @version 1.0.0
 * @lastUpdated 2026-03-05
 */

const os = require('os')
const { performance } = require('perf_hooks')
const fs = require('fs')
const path = require('path')

/**
 * 健康检查结果类
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
      critical: options.critical !== false, // 默认为关键检查
      timeout: options.timeout || 5000, // 默认5秒超时
      description: options.description || name
    })
  }

  /**
   * 执行单个检查
   */
  async executeCheck(name, check) {
    const start = performance.now()

    try {
      // 添加超时保护
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('检查超时')), check.timeout)
      })

      const result = await Promise.race([
        check.fn(),
        timeoutPromise
      ])

      const duration = performance.now() - start

      return {
        name,
        status: 'pass',
        duration: `${duration.toFixed(2)}ms`,
        description: check.description,
        data: result
      }
    } catch (error) {
      const duration = performance.now() - start

      return {
        name,
        status: 'fail',
        duration: `${duration.toFixed(2)}ms`,
        description: check.description,
        error: error.message,
        critical: check.critical
      }
    }
  }

  /**
   * 执行所有检查
   */
  async checkAll() {
    const checks = {}
    let overallStatus = 'healthy'
    let failedChecks = 0
    let criticalFailedChecks = 0

    for (const [name, check] of this.checks.entries()) {
      checks[name] = await this.executeCheck(name, check)

      if (checks[name].status === 'fail') {
        failedChecks++
        if (checks[name].critical) {
          criticalFailedChecks++
        }
      }
    }

    // 确定整体状态
    if (criticalFailedChecks > 0) {
      overallStatus = 'unhealthy'
    } else if (failedChecks > 0) {
      overallStatus = 'degraded'
    }

    const result = new HealthCheckResult(overallStatus, checks)

    // 记录历史
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

    // 限制历史记录大小
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

/**
 * 诊断信息收集器
 */
class DiagnosticsCollector {
  /**
   * 收集系统信息
   */
  static collectSystemInfo() {
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
   * 收集应用信息
   */
  static collectAppInfo(config) {
    return {
      version: '2.0.0',
      provider: config.provider,
      promptMode: config.promptMode,
      streamingEnabled: config.streaming.enabled,
      dingtalkEnabled: config.dingtalk.enabled,
      notificationEnabled: config.notification.enabled,
      logLevel: config.logging.level
    }
  }

  /**
   * 收集文件系统信息
   */
  static collectFileSystemInfo(directories = []) {
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

  /**
   * 生成完整诊断报告
   */
  static generateDiagnosticsReport(config, additionalChecks = {}) {
    return {
      timestamp: new Date().toISOString(),
      system: this.collectSystemInfo(),
      process: this.collectProcessInfo(),
      application: this.collectAppInfo(config),
      fileSystem: this.collectFileSystemInfo([
        config.claude.workDir,
        config.iflow.workDir,
        config.systemPrompts.promptsDir
      ]),
      additional: additionalChecks
    }
  }
}

/**
 * 性能指标收集器
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

/**
 * 创建默认健康检查器
 */
function createDefaultHealthChecker(config, logger) {
  const checker = new SystemHealthChecker(config)

  // 内存使用检查
  checker.registerCheck('memory', async () => {
    const memUsage = process.memoryUsage()
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal * 100).toFixed(2)

    if (heapUsedPercent > 90) {
      throw new Error(`堆内存使用率过高: ${heapUsedPercent}%`)
    }

    return {
      heapUsedPercent,
      rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`
    }
  }, { critical: true, description: '内存使用检查' })

  // CPU 负载检查
  checker.registerCheck('cpu', async () => {
    const loadAvg = os.loadavg()
    const cores = os.cpus().length
    const load1 = loadAvg[0]

    if (load1 > cores * 2) {
      throw new Error(`CPU 负载过高: ${load1.toFixed(2)} (核心数: ${cores})`)
    }

    return {
      loadAverage: loadAvg.map(l => l.toFixed(2)),
      cores,
      load1Min: load1.toFixed(2),
      loadStatus: load1 > cores ? 'high' : 'normal'
    }
  }, { critical: true, description: 'CPU 负载检查' })

  // 工作目录检查
  checker.registerCheck('workDirectory', async () => {
    const workDir = config.provider === 'claude' ? config.claude.workDir : config.iflow.workDir

    try {
      const stats = fs.statSync(workDir)
      if (!stats.isDirectory()) {
        throw new Error('工作目录不是一个有效的目录')
      }

      const files = fs.readdirSync(workDir)
      return {
        path: workDir,
        fileCount: files.length,
        accessible: true
      }
    } catch (error) {
      throw new Error(`工作目录访问失败: ${error.message}`)
    }
  }, { critical: true, description: '工作目录检查' })

  // 日志目录检查
  checker.registerCheck('logDirectory', async () => {
    const logDir = path.join(process.cwd(), 'logs')

    try {
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true })
      }

      const stats = fs.statSync(logDir)
      return {
        path: logDir,
        exists: true,
        accessible: true
      }
    } catch (error) {
      throw new Error(`日志目录访问失败: ${error.message}`)
    }
  }, { critical: false, description: '日志目录检查' })

  return checker
}

module.exports = {
  HealthCheckResult,
  SystemHealthChecker,
  DiagnosticsCollector,
  PerformanceMetricsCollector,
  createDefaultHealthChecker
}
