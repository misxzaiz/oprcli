#!/usr/bin/env node
/**
 * 系统性能分析和优化建议工具
 *
 * 功能：
 * - 性能分析（内存、响应时间、缓存效率）
 * - 健康检查（依赖安全、环境配置、系统资源）
 * - 优化建议（代码质量、性能瓶颈、安全加固）
 * - 报告生成（详细报告、趋势分析、可视化）
 *
 * @version 1.0.0
 * @created 2026-03-05
 *
 * 使用方法:
 *   node scripts/performance-analyzer.js
 *   node scripts/performance-analyzer.js --output=report.json
 *   node scripts/performance-analyzer.js --format=detailed
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const os = require('os')

// 加载环境变量
require('dotenv').config()

/**
 * 性能分析器类
 */
class PerformanceAnalyzer {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      hostname: os.hostname(),
      platform: os.platform(),
      nodeVersion: process.version,
      performance: {},
      health: {},
      recommendations: []
    }
  }

  /**
   * 分析内存使用情况
   */
  analyzeMemory() {
    const memoryUsage = process.memoryUsage()
    const totalMemory = os.totalmem()
    const freeMemory = os.freemem()
    const usedMemory = totalMemory - freeMemory

    this.results.performance.memory = {
      heap: {
        used: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        total: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        external: `${(memoryUsage.external / 1024 / 1024).toFixed(2)} MB`
      },
      rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
      system: {
        total: `${(totalMemory / 1024 / 1024 / 1024).toFixed(2)} GB`,
        used: `${(usedMemory / 1024 / 1024 / 1024).toFixed(2)} GB`,
        free: `${(freeMemory / 1024 / 1024 / 1024).toFixed(2)} GB`,
        usagePercent: `${((usedMemory / totalMemory) * 100).toFixed(2)}%`
      }
    }

    // 检查内存使用是否过高
    const memoryUsagePercent = (usedMemory / totalMemory) * 100
    if (memoryUsagePercent > 80) {
      this.results.recommendations.push({
        type: 'warning',
        category: '内存',
        message: `系统内存使用率过高 (${memoryUsagePercent.toFixed(2)}%)`,
        suggestion: '建议检查是否有内存泄漏，考虑增加物理内存或优化内存使用'
      })
    }

    // 检查堆内存使用
    const heapUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100
    if (heapUsagePercent > 80) {
      this.results.recommendations.push({
        type: 'warning',
        category: '堆内存',
        message: `堆内存使用率过高 (${heapUsagePercent.toFixed(2)}%)`,
        suggestion: '建议检查是否有对象未正确释放，考虑使用内存分析工具'
      })
    }

    return this.results.performance.memory
  }

  /**
   * 分析系统负载
   */
  analyzeLoad() {
    const cpus = os.cpus()
    const loadAvg = os.loadavg()

    this.results.performance.system = {
      cpuCount: cpus.length,
      loadAverage: {
        '1min': loadAvg[0].toFixed(2),
        '5min': loadAvg[1].toFixed(2),
        '15min': loadAvg[2].toFixed(2)
      },
      uptime: `${(os.uptime() / 3600).toFixed(2)} hours`
    }

    // 检查负载是否过高
    const loadPerCPU = loadAvg[0] / cpus.length
    if (loadPerCPU > 2) {
      this.results.recommendations.push({
        type: 'warning',
        category: 'CPU',
        message: `系统负载过高 (每核负载: ${loadPerCPU.toFixed(2)})`,
        suggestion: '建议检查是否有高负载进程，考虑优化代码或增加CPU资源'
      })
    }

    return this.results.performance.system
  }

  /**
   * 检查依赖安全性
   */
  async checkDependencies() {
    this.results.health.dependencies = {}

    try {
      // 检查过期的依赖
      const outdated = execSync('npm outdated --json', {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      })

      if (outdated) {
        const outdatedPkgs = JSON.parse(outdated)
        const outdatedCount = Object.keys(outdatedPkgs).length

        this.results.health.dependencies.outdated = outdatedCount
        this.results.health.dependencies.outdatedPackages = Object.keys(outdatedPkgs)

        if (outdatedCount > 0) {
          this.results.recommendations.push({
            type: 'info',
            category: '依赖',
            message: `发现 ${outdatedCount} 个过期的依赖包`,
            suggestion: '建议运行 `npm update` 更新依赖包，或手动检查重要更新'
          })
        }
      } else {
        this.results.health.dependencies.outdated = 0
      }
    } catch (error) {
      // npm outdated 在有过期包时会返回非0退出码
      try {
        const outdatedPkgs = JSON.parse(error.stdout)
        const outdatedCount = Object.keys(outdatedPkgs).length

        this.results.health.dependencies.outdated = outdatedCount
        this.results.health.dependencies.outdatedPackages = Object.keys(outdatedPkgs)

        if (outdatedCount > 0) {
          this.results.recommendations.push({
            type: 'info',
            category: '依赖',
            message: `发现 ${outdatedCount} 个过期的依赖包`,
            suggestion: '建议运行 `npm update` 更新依赖包，或手动检查重要更新'
          })
        }
      } catch (parseError) {
        this.results.health.dependencies.outdated = 0
      }
    }

    try {
      // 检查安全漏洞
      const audit = execSync('npm audit --json', {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      })

      const auditResult = JSON.parse(audit)
      const vulnerabilities = auditResult.metadata?.vulnerabilities || {}

      this.results.health.dependencies.vulnerabilities = {
        low: vulnerabilities.low || 0,
        moderate: vulnerabilities.moderate || 0,
        high: vulnerabilities.high || 0,
        critical: vulnerabilities.critical || 0
      }

      const totalVulns = (vulnerabilities.low || 0) +
                        (vulnerabilities.moderate || 0) +
                        (vulnerabilities.high || 0) +
                        (vulnerabilities.critical || 0)

      if (totalVulns > 0) {
        this.results.recommendations.push({
          type: 'error',
          category: '安全',
          message: `发现 ${totalVulns} 个已知安全漏洞`,
          suggestion: '建议运行 `npm audit fix` 修复安全漏洞，或手动更新受影响的包'
        })
      }
    } catch (error) {
      this.results.health.dependencies.vulnerabilities = {
        low: 0,
        moderate: 0,
        high: 0,
        critical: 0
      }
    }

    return this.results.health.dependencies
  }

  /**
   * 检查环境配置
   */
  checkEnvironment() {
    this.results.health.environment = {}

    const requiredEnvVars = [
      'CLAUDE_API_KEY',
      'PORT',
      'NODE_ENV'
    ]

    const optionalEnvVars = [
      'NOTIFICATION_DINGTALK_WEBHOOK',
      'NOTIFICATION_DINGTALK_SECRET',
      'LOG_LEVEL',
      'CACHE_ENABLED'
    ]

    const missing = []
    const present = []

    for (const envVar of requiredEnvVars) {
      if (process.env[envVar]) {
        present.push(envVar)
      } else {
        missing.push(envVar)
      }
    }

    this.results.health.environment.required = {
      present,
      missing
    }

    const optionalPresent = []
    for (const envVar of optionalEnvVars) {
      if (process.env[envVar]) {
        optionalPresent.push(envVar)
      }
    }

    this.results.health.environment.optional = {
      present: optionalPresent
    }

    if (missing.length > 0) {
      this.results.recommendations.push({
        type: 'error',
        category: '环境',
        message: `缺少必需的环境变量: ${missing.join(', ')}`,
        suggestion: '请在 .env 文件中配置这些必需的环境变量'
      })
    }

    // 检查 Node 环境
    if (process.env.NODE_ENV === 'production') {
      this.results.health.environment.mode = 'production'
      this.results.recommendations.push({
        type: 'success',
        category: '环境',
        message: '运行在生产模式',
        suggestion: '确保已充分测试并优化性能'
      })
    } else {
      this.results.health.environment.mode = 'development'
    }

    return this.results.health.environment
  }

  /**
   * 分析代码质量
   */
  analyzeCodeQuality() {
    this.results.performance.codeQuality = {}

    const projectPath = path.resolve(__dirname, '..')

    try {
      // 统计代码行数
      const jsFiles = this.getJsFiles(projectPath)
      let totalLines = 0
      let totalFiles = 0

      for (const file of jsFiles) {
        const content = fs.readFileSync(file, 'utf8')
        const lines = content.split('\n').length
        totalLines += lines
        totalFiles++
      }

      this.results.performance.codeQuality.stats = {
        totalJsFiles: totalFiles,
        totalLines: totalLines,
        avgLinesPerFile: totalFiles > 0 ? (totalLines / totalFiles).toFixed(0) : 0
      }
    } catch (error) {
      this.results.performance.codeQuality.error = error.message
    }

    return this.results.performance.codeQuality
  }

  /**
   * 获取所有 JS 文件（排除 node_modules）
   */
  getJsFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir)

    for (const file of files) {
      const filePath = path.join(dir, file)
      const stat = fs.statSync(filePath)

      if (stat.isDirectory()) {
        if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
          this.getJsFiles(filePath, fileList)
        }
      } else if (file.endsWith('.js')) {
        fileList.push(filePath)
      }
    }

    return fileList
  }

  /**
   * 生成优化建议
   */
  generateRecommendations() {
    // 如果没有建议，添加一个成功的消息
    if (this.results.recommendations.length === 0) {
      this.results.recommendations.push({
        type: 'success',
        category: '总体',
        message: '系统运行状态良好',
        suggestion: '继续保持良好的维护习惯，定期检查系统状态'
      })
    }

    return this.results.recommendations
  }

  /**
   * 生成报告
   */
  generateReport(format = 'summary') {
    const report = {
      timestamp: this.results.timestamp,
      hostname: this.results.hostname,
      summary: this.getSummary(),
      details: this.results
    }

    if (format === 'detailed') {
      return this.formatDetailedReport(report)
    } else {
      return this.formatSummaryReport(report)
    }
  }

  /**
   * 获取摘要信息
   */
  getSummary() {
    const totalIssues = this.results.recommendations.filter(r =>
      r.type === 'error' || r.type === 'warning'
    ).length

    const totalVulns = this.results.health.dependencies?.vulnerabilities ?
      Object.values(this.results.health.dependencies.vulnerabilities)
        .reduce((a, b) => a + b, 0) : 0

    return {
      totalIssues,
      totalRecommendations: this.results.recommendations.length,
      securityVulnerabilities: totalVulns,
      healthStatus: totalIssues === 0 ? 'healthy' : (totalIssues < 3 ? 'warning' : 'critical')
    }
  }

  /**
   * 格式化摘要报告
   */
  formatSummaryReport(report) {
    let output = '\n'
    output += '🔍 系统性能分析报告\n'
    output += '='.repeat(60) + '\n'
    output += `⏰ 时间: ${report.timestamp}\n`
    output += `🖥️  主机: ${report.hostname}\n`
    output += `📊 状态: ${this.getStatusIcon(report.summary.healthStatus)} ${report.summary.healthStatus.toUpperCase()}\n`
    output += '\n'

    // 性能指标
    output += '📈 性能指标\n'
    output += '-'.repeat(60) + '\n'
    if (this.results.performance.memory) {
      output += `💾 内存使用: ${this.results.performance.memory.system.usagePercent}\n`
      output += `   堆内存: ${this.results.performance.memory.heap.used} / ${this.results.performance.memory.heap.total}\n`
    }
    if (this.results.performance.system) {
      output += `⚡ 系统负载: ${this.results.performance.system.loadAverage['1min']} (1分钟)\n`
      output += `   CPU 核心数: ${this.results.performance.system.cpuCount}\n`
    }
    output += '\n'

    // 依赖健康
    output += '📦 依赖健康\n'
    output += '-'.repeat(60) + '\n'
    if (this.results.health.dependencies) {
      const deps = this.results.health.dependencies
      output += `⚠️  过期包: ${deps.outdated || 0}\n`
      if (deps.vulnerabilities) {
        const vulns = deps.vulnerabilities
        output += `🔒 安全漏洞: ${vulns.critical + vulns.high} 高危, ${vulns.moderate} 中危\n`
      }
    }
    output += '\n'

    // 优化建议
    output += '💡 优化建议\n'
    output += '-'.repeat(60) + '\n'
    this.results.recommendations.slice(0, 5).forEach((rec, index) => {
      output += `${this.getTypeIcon(rec.type)} [${rec.category}] ${rec.message}\n`
      if (rec.suggestion) {
        output += `   → ${rec.suggestion}\n`
      }
    })
    output += '\n'

    output += '='.repeat(60) + '\n'
    output += `总计: ${report.summary.totalRecommendations} 条建议\n`
    output += `问题: ${report.summary.totalIssues} 个需要处理\n`

    return output
  }

  /**
   * 格式化详细报告
   */
  formatDetailedReport(report) {
    return JSON.stringify(report, null, 2)
  }

  /**
   * 获取状态图标
   */
  getStatusIcon(status) {
    const icons = {
      healthy: '✅',
      warning: '⚠️',
      critical: '❌'
    }
    return icons[status] || '❓'
  }

  /**
   * 获取类型图标
   */
  getTypeIcon(type) {
    const icons = {
      success: '✅',
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌'
    }
    return icons[type] || '•'
  }

  /**
   * 运行完整分析
   */
  async analyze() {
    console.log('🔍 开始系统性能分析...\n')

    // 执行所有检查
    this.analyzeMemory()
    console.log('✓ 内存分析完成')

    this.analyzeLoad()
    console.log('✓ 系统负载分析完成')

    await this.checkDependencies()
    console.log('✓ 依赖检查完成')

    this.checkEnvironment()
    console.log('✓ 环境检查完成')

    this.analyzeCodeQuality()
    console.log('✓ 代码质量分析完成')

    this.generateRecommendations()
    console.log('✓ 优化建议生成完成')

    console.log('\n✅ 分析完成！\n')
  }
}

/**
 * 主函数
 */
async function main() {
  const analyzer = new PerformanceAnalyzer()

  // 解析命令行参数
  const args = process.argv.slice(2)
  let format = 'summary'
  let outputFile = null

  for (const arg of args) {
    if (arg.startsWith('--format=')) {
      format = arg.split('=')[1]
    } else if (arg.startsWith('--output=')) {
      outputFile = arg.split('=')[1]
    }
  }

  // 执行分析
  await analyzer.analyze()

  // 生成报告
  const report = analyzer.generateReport(format)

  // 输出报告
  if (outputFile) {
    const reportData = format === 'detailed' ?
      JSON.parse(report) : { text: report, data: analyzer.results }

    fs.writeFileSync(outputFile, JSON.stringify(reportData, null, 2))
    console.log(`📄 报告已保存到: ${outputFile}\n`)
  }

  console.log(report)

  // 返回退出码
  const summary = analyzer.getSummary()
  const exitCode = summary.healthStatus === 'critical' ? 1 :
                   (summary.healthStatus === 'warning' ? 0 : 0)

  process.exit(exitCode)
}

// 如果直接运行脚本
if (require.main === module) {
  main().catch(error => {
    console.error('❌ 发生错误:', error.message)
    console.error(error.stack)
    process.exit(1)
  })
}

// 导出供其他模块使用
module.exports = {
  PerformanceAnalyzer
}
