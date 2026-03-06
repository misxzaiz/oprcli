/**
 * 启动前检查工具
 * 验证环境和配置是否符合要求
 *
 * 增强功能：
 * - 检查系统资源
 * - 检查依赖完整性
 * - 检查配置有效性
 * - 生成详细报告
 */

const fs = require('fs')
const path = require('path')
const os = require('os')

class StartupCheck {
  constructor(logger) {
    this.logger = logger
    this.errors = []
    this.warnings = []
    this.info = [] // 新增：信息性消息
  }

  /**
   * 检查必需的环境变量
   */
  checkEnvVars(requiredVars) {
    const missing = []

    for (const envVar of requiredVars) {
      if (!process.env[envVar]) {
        missing.push(envVar)
      }
    }

    if (missing.length > 0) {
      this.errors.push(`缺少必需的环境变量: ${missing.join(', ')}`)
    }

    return this
  }

  /**
   * 检查 Node.js 版本
   */
  checkNodeVersion(minVersion = '14.0.0') {
    const currentVersion = process.version
    const minVersionNum = minVersion.replace('v', '').split('.').map(Number)
    const currentVersionNum = currentVersion.replace('v', '').split('.').map(Number)

    for (let i = 0; i < minVersionNum.length; i++) {
      if (currentVersionNum[i] < minVersionNum[i]) {
        this.errors.push(`Node.js 版本过低: 当前 ${currentVersion}，要求 >= ${minVersion}`)
        break
      }
      if (currentVersionNum[i] > minVersionNum[i]) {
        break
      }
    }

    return this
  }

  /**
   * 检查并创建目录
   */
  ensureDir(dirPath, description = '目录') {
    const fullPath = path.resolve(dirPath)

    if (!fs.existsSync(fullPath)) {
      try {
        fs.mkdirSync(fullPath, { recursive: true })
        this.logger.info('STARTUP', `✓ 已创建 ${description}: ${fullPath}`)
      } catch (error) {
        this.errors.push(`创建 ${description} 失败: ${fullPath} - ${error.message}`)
      }
    }

    return this
  }

  /**
   * 检查文件是否存在
   */
  checkFile(filePath, description = '文件', required = true) {
    const fullPath = path.resolve(filePath)

    if (!fs.existsSync(fullPath)) {
      if (required) {
        this.errors.push(`${description} 不存在: ${fullPath}`)
      } else {
        this.warnings.push(`${description} 不存在: ${fullPath}`)
      }
    }

    return this
  }

  /**
   * 检查端口是否可用
   */
  async checkPort(port, host = '0.0.0.0') {
    const net = require('net')

    return new Promise((resolve) => {
      const server = net.createServer()

      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          this.errors.push(`端口 ${port} 已被占用`)
        }
        resolve()
      })

      server.once('listening', () => {
        server.close()
        resolve()
      })

      server.listen(port, host)
    })
  }

  /**
   * 获取检查结果
   */
  getResult() {
    return {
      success: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings
    }
  }

  /**
   * 检查系统资源（新增）
   */
  checkSystemResources() {
    const freeMemory = os.freemem()
    const totalMemory = os.totalmem()
    const memoryUsagePercent = ((totalMemory - freeMemory) / totalMemory * 100).toFixed(2)

    const cpus = os.cpus()
    const loadAverage = os.loadavg()

    // 检查内存使用率
    if (memoryUsagePercent > 90) {
      this.warnings.push(`系统内存使用率过高: ${memoryUsagePercent}%`)
    } else {
      this.info.push(`系统内存使用率: ${memoryUsagePercent}%`)
    }

    // 检查 CPU 负载
    const loadAverage1m = loadAverage[0]
    const cpuCount = cpus.length
    const loadPercent = ((loadAverage1m / cpuCount) * 100).toFixed(2)

    if (loadPercent > 80) {
      this.warnings.push(`系统 CPU 负载较高: ${loadPercent}% (${loadAverage1m}/${cpuCount} 核)`)
    } else {
      this.info.push(`CPU 核心数: ${cpuCount}`)
    }

    return this
  }

  /**
   * 检查依赖完整性（新增）
   */
  checkDependencies(packageJsonPath) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies }

      const missing = []
      for (const dep of Object.keys(dependencies)) {
        const depPath = path.join(path.dirname(packageJsonPath), 'node_modules', dep)
        if (!fs.existsSync(depPath)) {
          missing.push(dep)
        }
      }

      if (missing.length > 0) {
        this.errors.push(`缺少依赖包: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}`)
      } else {
        this.info.push(`所有依赖包已安装 (${Object.keys(dependencies).length} 个)`)
      }
    } catch (error) {
      this.warnings.push(`无法检查依赖: ${error.message}`)
    }

    return this
  }

  /**
   * 检查配置有效性（新增）
   */
  checkConfig(config) {
    // 检查端口范围
    if (config.port !== undefined && config.port !== null) {
      if (config.port < 1 || config.port > 65535) {
        this.errors.push(`无效的端口号: ${config.port}`)
      } else if (config.port < 1024) {
        this.warnings.push(`使用特权端口 (${config.port}) 可能需要管理员权限`)
      }
    }

    // 检查 provider
    if (config.provider && !['claude', 'iflow'].includes(config.provider)) {
      this.errors.push(`无效的 provider: ${config.provider}`)
    }

    return this
  }

  /**
   * 检查 Git 状态（新增）
   */
  checkGit() {
    try {
      // 检查是否在 git 仓库中
      const { execSync } = require('child_process')
      execSync('git rev-parse --git-dir', { stdio: 'ignore' })

      // 获取当前分支
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim()
      this.info.push(`Git 分支: ${branch}`)

      // 检查是否有未提交的更改
      const status = execSync('git status --porcelain', { encoding: 'utf-8' })
      if (status.trim()) {
        this.warnings.push('存在未提交的更改')
      }
    } catch (error) {
      this.warnings.push('不是 Git 仓库或 Git 不可用')
    }

    return this
  }

  /**
   * 获取检查结果（增强）
   */
  getResult() {
    return {
      success: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      info: this.info,
      summary: {
        errors: this.errors.length,
        warnings: this.warnings.length,
        info: this.info.length
      }
    }
  }

  /**
   * 打印检查结果（增强）
   */
  printResult() {
    // 打印信息性消息
    if (this.info.length > 0 && this.logger.currentLevel <= 1) { // DEBUG 或 INFO 级别
      console.log('\nℹ️  系统信息:')
      this.info.forEach(info => {
        console.log(`  ℹ️  ${info}`)
      })
    }

    // 打印警告
    if (this.warnings.length > 0) {
      this.logger.warning('STARTUP', '检查警告:')
      this.warnings.forEach(warning => {
        console.log(`  ⚠️  ${warning}`)
      })
    }

    // 打印错误
    if (this.errors.length > 0) {
      this.logger.error('STARTUP', '检查失败:')
      this.errors.forEach(error => {
        console.log(`  ❌ ${error}`)
      })
      return false
    }

    this.logger.success('STARTUP', '✓ 所有检查通过')
    return true
  }

  /**
   * 生成详细报告（新增）
   */
  generateReport() {
    return {
      timestamp: new Date().toISOString(),
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        uptime: process.uptime()
      },
      resources: {
        freeMemory: Math.round(os.freemem() / 1024 / 1024) + ' MB',
        totalMemory: Math.round(os.totalmem() / 1024 / 1024) + ' MB',
        cpus: os.cpus().length
      },
      checks: this.getResult()
    }
  }
}

module.exports = StartupCheck
