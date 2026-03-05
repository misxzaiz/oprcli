/**
 * 启动前检查工具
 * 验证环境和配置是否符合要求
 */

const fs = require('fs')
const path = require('path')

class StartupCheck {
  constructor(logger) {
    this.logger = logger
    this.errors = []
    this.warnings = []
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
   * 打印检查结果
   */
  printResult() {
    if (this.warnings.length > 0) {
      this.logger.warning('STARTUP', '检查警告:')
      this.warnings.forEach(warning => {
        console.log(`  ⚠️  ${warning}`)
      })
    }

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
}

module.exports = StartupCheck
