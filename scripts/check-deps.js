/**
 * 依赖检查脚本
 *
 * 功能：
 * - 检查依赖是否已安装
 * - 检查依赖版本是否满足要求
 * - 检查是否有可用的更新
 * - 检查依赖是否存在安全漏洞
 * - 生成依赖报告
 *
 * 使用方法：
 * node scripts/check-deps.js                    # 检查所有依赖
 * node scripts/check-deps.js --production       # 只检查生产依赖
 * node scripts/check-deps.js --updates          # 检查可用更新
 * node scripts/check-deps.js --audit            # 检查安全漏洞
 * node scripts/check-deps.js --report           # 生成详细报告
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

// 配置
const CONFIG = {
  packageJsonPath: path.join(__dirname, '../package.json'),
  nodeModulesPath: path.join(__dirname, '../node_modules'),
  reportPath: path.join(__dirname, '../logs/dependency-report.json')
}

// ANSI 颜色
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
}

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    production: false,
    updates: false,
    audit: false,
    report: false,
    help: false
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '-p':
      case '--production':
        options.production = true
        break
      case '-u':
      case '--updates':
        options.updates = true
        break
      case '-a':
      case '--audit':
        options.audit = true
        break
      case '-r':
      case '--report':
        options.report = true
        break
      case '-h':
      case '--help':
        options.help = true
        break
    }
  }

  return options
}

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log(`
🔍 依赖检查工具 v1.0.0

使用方法：
  node scripts/check-deps.js [选项]

选项：
  -p, --production        只检查生产依赖（不包括 devDependencies）
  -u, --updates           检查可用的依赖更新
  -a, --audit             运行 npm audit 检查安全漏洞
  -r, --report            生成详细的依赖报告到 logs/dependency-report.json
  -h, --help              显示此帮助信息

示例：
  node scripts/check-deps.js                    # 检查所有依赖
  node scripts/check-deps.js --production       # 只检查生产依赖
  node scripts/check-deps.js --updates          # 检查可用更新
  node scripts/check-deps.js --audit            # 检查安全漏洞
  node scripts/check-deps.js --report           # 生成详细报告
`)
}

/**
 * 读取 package.json
 */
function readPackageJson() {
  try {
    const content = fs.readFileSync(CONFIG.packageJsonPath, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    console.error(`${COLORS.red}❌ 无法读取 package.json: ${error.message}${COLORS.reset}`)
    process.exit(1)
  }
}

/**
 * 检查依赖是否已安装
 */
function checkInstalledDependencies(packageJson, options) {
  const dependencies = {
    ...packageJson.dependencies,
    ...(options.production ? {} : packageJson.devDependencies)
  }

  const results = {
    installed: [],
    missing: [],
    total: Object.keys(dependencies).length
  }

  Object.entries(dependencies).forEach(([name, version]) => {
    const modulePath = path.join(CONFIG.nodeModulesPath, name)
    const installed = fs.existsSync(modulePath)

    if (installed) {
      // 读取已安装的版本
      try {
        const pkgPath = path.join(modulePath, 'package.json')
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
        results.installed.push({
          name,
          requested: version,
          installed: pkg.version
        })
      } catch {
        results.installed.push({
          name,
          requested: version,
          installed: 'unknown'
        })
      }
    } else {
      results.missing.push({
        name,
        version
      })
    }
  })

  return results
}

/**
 * 检查可用更新
 */
function checkUpdates() {
  try {
    const output = execSync('npm outdated --json', {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf-8'
    })

    const outdated = JSON.parse(output)
    return Object.entries(outdated).map(([name, info]) => ({
      name,
      current: info.current,
      wanted: info.wanted,
      latest: info.latest,
      type: info.type || 'dependencies'
    }))
  } catch (error) {
    // npm outdated 在有过期包时返回非零退出码
    if (error.stdout) {
      try {
        const outdated = JSON.parse(error.stdout)
        return Object.entries(outdated).map(([name, info]) => ({
          name,
          current: info.current,
          wanted: info.wanted,
          latest: info.latest,
          type: info.type || 'dependencies'
        }))
      } catch {
        return []
      }
    }
    return []
  }
}

/**
 * 运行安全审计
 */
function runAudit() {
  try {
    const output = execSync('npm audit --json', {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf-8'
    })

    const audit = JSON.parse(output)

    return {
      vulnerabilities: audit.metadata?.vulnerabilities || {},
      total: audit.metadata?.vulnerabilities?.total || 0,
      severity: audit.metadata?.vulnerabilities || {}
    }
  } catch (error) {
    // npm audit 在有漏洞时返回非零退出码
    if (error.stdout) {
      try {
        const audit = JSON.parse(error.stdout)
        return {
          vulnerabilities: audit.metadata?.vulnerabilities || {},
          total: audit.metadata?.vulnerabilities?.total || 0,
          severity: audit.metadata?.vulnerabilities || {}
        }
      } catch {
        return {
          vulnerabilities: {},
          total: 0,
          severity: {}
        }
      }
    }
    return {
      error: error.message
    }
  }
}

/**
 * 显示依赖检查结果
 */
function displayDependencyResults(results) {
  console.log(`${COLORS.blue}📦 依赖安装状态${COLORS.reset}`)
  console.log(`${COLORS.gray}${'─'.repeat(40)}${COLORS.reset}`)

  console.log(`总依赖数: ${results.total}`)
  console.log(`${COLORS.green}已安装: ${results.installed.length}${COLORS.reset}`)
  console.log(`${COLORS.red}缺失: ${results.missing.length}${COLORS.reset}`)

  if (results.missing.length > 0) {
    console.log(`\n${COLORS.red}❌ 缺失的依赖:${COLORS.reset}`)
    results.missing.forEach(dep => {
      console.log(`  • ${dep.name} (${dep.version})`)
    })
    console.log(`\n${COLORS.yellow}💡 运行 npm install 安装缺失的依赖${COLORS.reset}`)
  }
}

/**
 * 显示更新结果
 */
function displayUpdateResults(updates) {
  if (updates.length === 0) {
    console.log(`\n${COLORS.green}✅ 所有依赖都是最新版本${COLORS.reset}`)
    return
  }

  console.log(`\n${COLORS.yellow}📦 可用的更新 (${updates.length})${COLORS.reset}`)
  console.log(`${COLORS.gray}${'─'.repeat(40)}${COLORS.reset}`)

  updates.forEach(update => {
    const isMajor = update.current.split('.')[0] !== update.latest.split('.')[0]
    const color = isMajor ? COLORS.red : COLORS.yellow

    console.log(`\n${color}${update.name}${COLORS.reset}`)
    console.log(`  当前: ${update.current}`)
    console.log(`  最新: ${update.latest} ${isMajor ? '(主版本更新)' : ''}`)
  })

  console.log(`\n${COLORS.yellow}💡 运行 npm update 更新依赖${COLORS.reset}`)
}

/**
 * 显示审计结果
 */
function displayAuditResults(audit) {
  if (audit.error) {
    console.log(`\n${COLORS.red}❌ 审计失败: ${audit.error}${COLORS.reset}`)
    return
  }

  const total = audit.total || 0

  if (total === 0) {
    console.log(`\n${COLORS.green}✅ 未发现安全漏洞${COLORS.reset}`)
    return
  }

  console.log(`\n${COLORS.red}🚨 发现 ${total} 个安全漏洞${COLORS.reset}`)
  console.log(`${COLORS.gray}${'─'.repeat(40)}${COLORS.reset}`)

  if (audit.severity) {
    Object.entries(audit.severity).forEach(([severity, count]) => {
      if (severity !== 'total' && count > 0) {
        const color = severity === 'critical' || severity === 'high' ? COLORS.red : COLORS.yellow
        console.log(`${color}${severity.toUpperCase()}: ${count}${COLORS.reset}`)
      }
    })
  }

  console.log(`\n${COLORS.yellow}💡 运行 npm audit fix 自动修复漏洞${COLORS.reset}`)
}

/**
 * 生成详细报告
 */
function generateReport(packageJson, depResults, updates, audit) {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalDependencies: depResults.total,
      installed: depResults.installed.length,
      missing: depResults.missing.length,
      outdated: updates.length,
      vulnerabilities: audit.total || 0
    },
    dependencies: depResults.installed,
    missing: depResults.missing,
    updates: updates,
    security: audit
  }

  // 确保日志目录存在
  const logDir = path.dirname(CONFIG.reportPath)
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }

  fs.writeFileSync(CONFIG.reportPath, JSON.stringify(report, null, 2))
  console.log(`\n${COLORS.green}📄 详细报告已保存到: ${CONFIG.reportPath}${COLORS.reset}`)
}

/**
 * 主函数
 */
async function main() {
  const options = parseArgs()

  if (options.help) {
    showHelp()
    process.exit(0)
  }

  console.log(`${COLORS.blue}🔍 检查项目依赖...${COLORS.reset}\n`)

  const packageJson = readPackageJson()

  // 检查安装状态
  const depResults = checkInstalledDependencies(packageJson, options)
  displayDependencyResults(depResults)

  // 检查更新
  if (options.updates) {
    const updates = checkUpdates()
    displayUpdateResults(updates)

    if (options.report) {
      const audit = options.audit ? runAudit() : {}
      generateReport(packageJson, depResults, updates, audit)
    }
  }

  // 安全审计
  if (options.audit) {
    const audit = runAudit()
    displayAuditResults(audit)

    if (options.report && !options.updates) {
      generateReport(packageJson, depResults, [], audit)
    }
  }

  // 生成报告
  if (options.report && !options.updates && !options.audit) {
    generateReport(packageJson, depResults, [], {})
  }

  // 返回退出码
  const hasIssues = depResults.missing.length > 0
  process.exit(hasIssues ? 1 : 0)
}

// 运行
main()
