#!/usr/bin/env node
/**
 * 依赖健康检查工具
 *
 * 功能：
 * - 检查过期的依赖包
 * - 检查安全漏洞
 * - 验证依赖完整性
 * - 生成健康报告
 *
 * @version 1.0.0
 * @created 2026-03-05
 *
 * 使用方法:
 *   node scripts/dependency-health-check.js
 *   node scripts/dependency-health-check.js --output=report.json
 *   node scripts/dependency-health-check.js --fix
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

/**
 * 执行命令并返回结果
 */
function execCommand(command, options = {}) {
  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      ...options
    })
    return { success: true, output }
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.status
    }
  }
}

/**
 * 检查过期依赖
 */
function checkOutdated() {
  console.log('📦 检查过期依赖...\n')

  const result = execCommand('npm outdated --json')

  if (!result.success) {
    return {
      status: 'error',
      message: '无法检查过期依赖',
      packages: []
    }
  }

  if (result.output.trim() === '') {
    return {
      status: 'healthy',
      message: '所有依赖都是最新的',
      packages: []
    }
  }

  try {
    const outdated = JSON.parse(result.output)
    const packages = Object.entries(outdated).map(([name, info]) => ({
      name,
      current: info.current,
      wanted: info.wanted,
      latest: info.latest,
      type: info.type || 'dependencies'
    }))

    return {
      status: packages.length > 0 ? 'warning' : 'healthy',
      message: `发现 ${packages.length} 个过期依赖`,
      packages
    }
  } catch (error) {
    return {
      status: 'error',
      message: '解析过期依赖失败',
      packages: []
    }
  }
}

/**
 * 检查安全漏洞
 */
function checkVulnerabilities() {
  console.log('🔒 检查安全漏洞...\n')

  const result = execCommand('npm audit --json')

  if (!result.success) {
    return {
      status: 'error',
      message: '无法检查安全漏洞',
      vulnerabilities: {}
    }
  }

  try {
    const audit = JSON.parse(result.output)
    const vulnerabilities = audit.metadata || {}
    const vulnCount = vulnerabilities.vulnerabilities || {}

    const totalVulns =
      (vulnCount.low || 0) +
      (vulnCount.moderate || 0) +
      (vulnCount.high || 0) +
      (vulnCount.critical || 0)

    if (totalVulns === 0) {
      return {
        status: 'healthy',
        message: '未发现安全漏洞',
        vulnerabilities: vulnCount
      }
    }

    return {
      status: vulnCount.critical > 0 || vulnCount.high > 0 ? 'critical' : 'warning',
      message: `发现 ${totalVulns} 个安全漏洞`,
      vulnerabilities: vulnCount
    }
  } catch (error) {
    return {
      status: 'error',
      message: '解析安全漏洞失败',
      vulnerabilities: {}
    }
  }
}

/**
 * 检查依赖完整性
 */
function checkIntegrity() {
  console.log('🔍 检查依赖完整性...\n')

  // 检查 node_modules 是否存在
  const nodeModulesPath = path.join(process.cwd(), 'node_modules')
  if (!fs.existsSync(nodeModulesPath)) {
    return {
      status: 'error',
      message: 'node_modules 不存在，请运行 npm install'
    }
  }

  // 检查 package-lock.json 是否存在
  const lockPath = path.join(process.cwd(), 'package-lock.json')
  if (!fs.existsSync(lockPath)) {
    return {
      status: 'warning',
      message: 'package-lock.json 不存在'
    }
  }

  // 运行 npm check
  const result = execCommand('npm list --depth=0')

  if (!result.success && result.code === 1) {
    return {
      status: 'error',
      message: '依赖完整性检查失败'
    }
  }

  return {
    status: 'healthy',
    message: '依赖完整性检查通过'
  }
}

/**
 * 生成健康报告
 */
function generateHealthReport(outdated, vulnerabilities, integrity) {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      status: 'healthy',
      issues: []
    },
    outdated,
    vulnerabilities,
    integrity
  }

  // 确定总体状态
  const statuses = [
    outdated.status,
    vulnerabilities.status,
    integrity.status
  ]

  if (statuses.includes('critical')) {
    report.summary.status = 'critical'
  } else if (statuses.includes('error')) {
    report.summary.status = 'error'
  } else if (statuses.includes('warning')) {
    report.summary.status = 'warning'
  }

  // 收集问题
  if (outdated.status !== 'healthy') {
    report.summary.issues.push(outdated.message)
  }
  if (vulnerabilities.status !== 'healthy') {
    report.summary.issues.push(vulnerabilities.message)
  }
  if (integrity.status !== 'healthy') {
    report.summary.issues.push(integrity.message)
  }

  return report
}

/**
 * 打印健康报告
 */
function printHealthReport(report) {
  console.log('\n' + '='.repeat(60))
  console.log('📊 依赖健康检查报告')
  console.log('='.repeat(60) + '\n')

  // 总体状态
  const statusIcons = {
    healthy: '✅',
    warning: '⚠️',
    error: '❌',
    critical: '🚨'
  }

  console.log(`总体状态: ${statusIcons[report.summary.status]} ${report.summary.status.toUpperCase()}`)
  console.log(`检查时间: ${new Date(report.timestamp).toLocaleString('zh-CN')}`)

  if (report.summary.issues.length > 0) {
    console.log('\n⚠️  发现以下问题:\n')
    report.summary.issues.forEach(issue => {
      console.log(`  • ${issue}`)
    })
  } else {
    console.log('\n✅ 所有检查通过！\n')
  }

  // 过期依赖详情
  if (report.outdated.packages.length > 0) {
    console.log('\n📦 过期依赖:\n')
    report.outdated.packages.forEach(pkg => {
      console.log(`  • ${pkg.name}`)
      console.log(`    当前: ${pkg.current} → 最新: ${pkg.latest}`)
    })
  }

  // 安全漏洞详情
  const vulns = report.vulnerabilities.vulnerabilities || {}
  if (Object.keys(vulns).length > 0 && (vulns.low || vulns.moderate || vulns.high || vulns.critical)) {
    console.log('\n🔒 安全漏洞:\n')
    if (vulns.critical) console.log(`  🚨 严重: ${vulns.critical}`)
    if (vulns.high) console.log(`  ❌ 高危: ${vulns.high}`)
    if (vulns.moderate) console.log(`  ⚠️ 中危: ${vulns.moderate}`)
    if (vulns.low) console.log(`  ℹ️ 低危: ${vulns.low}`)
  }

  console.log('\n' + '='.repeat(60))

  // 建议
  if (report.summary.status !== 'healthy') {
    console.log('\n💡 建议操作:\n')
    if (report.outdated.packages.length > 0) {
      console.log('  • 更新过期依赖: npm update')
      console.log('  • 或使用: npx npm-check-updates -u')
    }
    if (report.vulnerabilities.status !== 'healthy') {
      console.log('  • 修复安全漏洞: npm audit fix')
      console.log('  • 强制修复: npm audit fix --force')
    }
    if (report.integrity.status !== 'healthy') {
      console.log('  • 重新安装依赖: npm install')
    }
    console.log()
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🔍 开始依赖健康检查...\n')

  // 解析命令行参数
  const args = process.argv.slice(2)
  let outputPath = null
  let shouldFix = false

  for (const arg of args) {
    if (arg.startsWith('--output=')) {
      outputPath = arg.split('=')[1]
    } else if (arg === '--fix') {
      shouldFix = true
    }
  }

  // 如果要求修复
  if (shouldFix) {
    console.log('🔧 尝试自动修复...\n')
    execCommand('npm audit fix')
    console.log('✅ 自动修复完成\n')
  }

  // 执行检查
  const outdated = checkOutdated()
  const vulnerabilities = checkVulnerabilities()
  const integrity = checkIntegrity()

  // 生成报告
  const report = generateHealthReport(outdated, vulnerabilities, integrity)

  // 打印报告
  printHealthReport(report)

  // 保存到文件
  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2))
    console.log(`✅ 报告已保存到: ${outputPath}\n`)
  }

  // 根据状态设置退出码
  const exitCode = {
    healthy: 0,
    warning: 0,
    error: 1,
    critical: 1
  }

  process.exit(exitCode[report.summary.status])
}

// 如果直接运行脚本
if (require.main === module) {
  main().catch(error => {
    console.error('❌ 发生错误:', error.message)
    process.exit(1)
  })
}

module.exports = {
  checkOutdated,
  checkVulnerabilities,
  checkIntegrity,
  generateHealthReport
}
