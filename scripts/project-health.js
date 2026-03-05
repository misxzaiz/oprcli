#!/usr/bin/env node
/**
 * 项目健康检查工具
 *
 * 功能：
 * - 一键查看项目整体状态
 * - 检查依赖、配置、git 状态
 * - 显示性能指标
 * - 生成健康报告
 *
 * 使用方法：
 *   node scripts/project-health.js                    # 显示完整报告
 *   node scripts/project-health.js --quick            # 快速检查
 *   node scripts/project-health.js --json             # 输出 JSON 格式
 *   node scripts/project-health.js --report           # 生成报告文件
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

// 配置
const CONFIG = {
  packageJsonPath: path.join(__dirname, '../package.json'),
  reportPath: path.join(__dirname, '../logs/health-report.json')
}

// ANSI 颜色
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
}

// 图标
const ICONS = {
  ok: '✅',
  warn: '⚠️',
  error: '❌',
  info: 'ℹ️',
  success: '✅',
  check: '🔍',
  chart: '📊',
  package: '📦',
  git: '🔧'
}

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    quick: false,
    json: false,
    report: false,
    help: false
  }

  for (const arg of args) {
    switch (arg) {
      case '-q':
      case '--quick':
        options.quick = true
        break
      case '-j':
      case '--json':
        options.json = true
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
${ICONS.chart} 项目健康检查工具 v1.0.0

使用方法：
  node scripts/project-health.js [选项]

选项：
  -q, --quick              快速检查（只显示关键指标）
  -j, --json               输出 JSON 格式
  -r, --report             生成报告文件到 logs/health-report.json
  -h, --help               显示此帮助信息

示例：
  node scripts/project-health.js                # 完整报告
  node scripts/project-health.js --quick        # 快速检查
  node scripts/project-health.js --json         # JSON 格式
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
    return null
  }
}

/**
 * 检查项目基本信息
 */
function checkProjectInfo() {
  const packageJson = readPackageJson()

  if (!packageJson) {
    return {
      status: 'error',
      name: 'Unknown',
      version: 'Unknown',
      description: '无法读取 package.json'
    }
  }

  return {
    status: 'ok',
    name: packageJson.name || 'Unknown',
    version: packageJson.version || 'Unknown',
    description: packageJson.description || '',
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch
  }
}

/**
 * 检查依赖状态
 */
function checkDependencies() {
  const packageJson = readPackageJson()

  if (!packageJson) {
    return { status: 'error', message: '无法读取 package.json' }
  }

  const dependencies = Object.keys(packageJson.dependencies || {})
  const devDependencies = Object.keys(packageJson.devDependencies || {})
  const totalDependencies = dependencies.length + devDependencies.length

  // 检查 node_modules 是否存在
  const nodeModulesPath = path.join(__dirname, '../node_modules')
  const nodeModulesExists = fs.existsSync(nodeModulesPath)

  // 统计已安装的依赖
  let installedCount = 0
  if (nodeModulesExists) {
    try {
      const installed = fs.readdirSync(nodeModulesPath)
      // 排除 .cache 等隐藏文件夹
      installedCount = installed.filter(name => !name.startsWith('.')).length
    } catch (error) {
      // 忽略
    }
  }

  return {
    status: nodeModulesExists ? 'ok' : 'error',
    totalDependencies,
    productionDependencies: dependencies.length,
    developmentDependencies: devDependencies.length,
    installed: installedCount,
    nodeModulesExists
  }
}

/**
 * 检查 Git 状态
 */
function checkGitStatus() {
  try {
    // 检查是否在 git 仓库中
    execSync('git rev-parse --git-dir', { stdio: 'ignore' })

    // 获取当前分支
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf-8'
    }).trim()

    // 获取最新提交
    const lastCommit = execSync('git log -1 --oneline', {
      encoding: 'utf-8'
    }).trim()

    // 检查是否有未提交的更改
    const status = execSync('git status --porcelain', {
      encoding: 'utf-8'
    })

    const hasUncommittedChanges = status.trim().length > 0

    // 检查是否有未推送的提交
    let hasUnpushedCommits = false
    try {
      const unpushed = execSync('git log --oneline @{u}..', {
        encoding: 'utf-8'
      })
      hasUnpushedCommits = unpushed.trim().length > 0
    } catch (error) {
      // 可能是上游分支不存在
    }

    // 获取最新的 tag
    let latestTag = null
    try {
      const tags = execSync('git tag -l "*.*.*" --sort=-v:refname', {
        encoding: 'utf-8'
      }).split('\n').filter(tag => tag.trim())
      latestTag = tags.length > 0 ? tags[0] : null
    } catch (error) {
      // 忽略
    }

    return {
      status: 'ok',
      branch,
      lastCommit,
      hasUncommittedChanges,
      hasUnpushedCommits,
      latestTag,
      clean: !hasUncommittedChanges && !hasUnpushedCommits
    }
  } catch (error) {
    return {
      status: 'error',
      message: '不是 Git 仓库或 Git 不可用'
    }
  }
}

/**
 * 检查配置文件
 */
function checkConfiguration() {
  const envFiles = ['.env', '.env.local', '.env.example']
  const envStatus = []

  for (const envFile of envFiles) {
    const filePath = path.join(__dirname, '..', envFile)
    const exists = fs.existsSync(filePath)
    envStatus.push({
      file: envFile,
      exists
    })
  }

  // 检查是否有 .env 文件
  const hasEnv = fs.existsSync(path.join(__dirname, '../.env'))

  return {
    status: hasEnv ? 'ok' : 'warning',
    envFiles: envStatus,
    hasEnv
  }
}

/**
 * 检查日志文件
 */
function checkLogs() {
  const logsDir = path.join(__dirname, '../logs')
  const logsExist = fs.existsSync(logsDir)

  if (!logsExist) {
    return {
      status: 'warning',
      message: 'logs 目录不存在',
      logFiles: []
    }
  }

  try {
    const files = fs.readdirSync(logsDir)
    const logFiles = files.filter(file => file.endsWith('.log')).map(file => {
      const filePath = path.join(logsDir, file)
      const stats = fs.statSync(filePath)
      return {
        name: file,
        size: stats.size,
        modified: stats.mtime
      }
    })

    return {
      status: 'ok',
      logFiles
    }
  } catch (error) {
    return {
      status: 'error',
      message: error.message,
      logFiles: []
    }
  }
}

/**
 * 获取系统信息
 */
function getSystemInfo() {
  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cwd: process.cwd()
  }
}

/**
 * 显示健康报告
 */
function displayHealthReport(healthData, options) {
  if (options.json) {
    console.log(JSON.stringify(healthData, null, 2))
    return
  }

  console.log(`\n${COLORS.blue}${ICONS.chart} 项目健康报告${COLORS.reset}`)
  console.log(`${COLORS.gray}${'─'.repeat(50)}${COLORS.reset}\n`)

  // 项目信息
  console.log(`${COLORS.cyan}${ICONS.package} 项目信息${COLORS.reset}`)
  console.log(`  名称:       ${healthData.projectInfo.name}`)
  console.log(`  版本:       ${healthData.projectInfo.version}`)
  console.log(`  Node.js:    ${healthData.projectInfo.nodeVersion}`)
  console.log(`  平台:       ${healthData.projectInfo.platform} (${healthData.projectInfo.arch})`)

  // 依赖状态
  console.log(`\n${COLORS.cyan}${ICONS.package} 依赖状态${COLORS.reset}`)
  const deps = healthData.dependencies
  const depIcon = deps.status === 'ok' ? ICONS.ok : ICONS.error
  const depColor = deps.status === 'ok' ? COLORS.green : COLORS.red
  console.log(`  状态:       ${depColor}${depIcon} ${deps.status}${COLORS.reset}`)
  console.log(`  总数:       ${deps.totalDependencies} 个`)
  console.log(`  生产依赖:   ${deps.productionDependencies} 个`)
  console.log(`  开发依赖:   ${deps.developmentDependencies} 个`)

  // Git 状态
  console.log(`\n${COLORS.cyan}${ICONS.git} Git 状态${COLORS.reset}`)
  const git = healthData.git
  if (git.status === 'ok') {
    console.log(`  分支:       ${git.branch}`)
    console.log(`  最新提交:   ${git.lastCommit}`)
    if (git.latestTag) {
      console.log(`  最新标签:   ${git.latestTag}`)
    }

    const statusItems = []
    if (git.hasUncommittedChanges) {
      statusItems.push(`${COLORS.yellow}未提交更改${COLORS.reset}`)
    }
    if (git.hasUnpushedCommits) {
      statusItems.push(`${COLORS.yellow}未推送提交${COLORS.reset}`)
    }
    if (statusItems.length === 0) {
      statusItems.push(`${COLORS.green}${ICONS.ok} 干净${COLORS.reset}`)
    }

    console.log(`  状态:       ${statusItems.join(' / ')}`)
  } else {
    console.log(`  ${COLORS.red}${git.message}${COLORS.reset}`)
  }

  if (!options.quick) {
    // 配置状态
    console.log(`\n${COLORS.cyan}⚙️  配置状态${COLORS.reset}`)
    const config = healthData.configuration
    const configIcon = config.status === 'ok' ? ICONS.ok : ICONS.warn
    const configColor = config.status === 'ok' ? COLORS.green : COLORS.yellow
    console.log(`  ${configColor}${configIcon} ${config.status}${COLORS.reset}`)

    if (!config.hasEnv) {
      console.log(`  ${COLORS.yellow}提示: 未找到 .env 文件${COLORS.reset}`)
    }

    // 日志文件
    console.log(`\n${COLORS.cyan}📝 日志文件${COLORS.reset}`)
    const logs = healthData.logs
    if (logs.status === 'ok' && logs.logFiles.length > 0) {
      logs.logFiles.forEach(log => {
        const size = log.size > 1024
          ? `${(log.size / 1024).toFixed(2)} KB`
          : `${log.size} B`
        console.log(`  • ${log.name} (${size})`)
      })
    } else {
      console.log(`  ${COLORS.yellow}没有日志文件${COLORS.reset}`)
    }
  }

  // 总体状态
  console.log(`\n${COLORS.blue}${'─'.repeat(50)}${COLORS.reset}`)

  const issues = []
  if (healthData.dependencies.status !== 'ok') issues.push('依赖问题')
  if (healthData.git.hasUncommittedChanges) issues.push('未提交更改')
  if (healthData.git.hasUnpushedCommits) issues.push('未推送提交')
  if (!healthData.configuration.hasEnv) issues.push('缺少 .env')

  if (issues.length === 0) {
    console.log(`${COLORS.green}${ICONS.success} 项目状态: 良好${COLORS.reset}`)
  } else {
    console.log(`${COLORS.yellow}${ICONS.warn} 发现问题: ${issues.join(', ')}${COLORS.reset}`)
  }

  console.log('')
}

/**
 * 生成报告文件
 */
function generateReportFile(healthData) {
  try {
    const logDir = path.dirname(CONFIG.reportPath)
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }

    fs.writeFileSync(CONFIG.reportPath, JSON.stringify(healthData, null, 2))
    console.log(`${COLORS.green}📄 报告已保存: ${CONFIG.reportPath}${COLORS.reset}`)
  } catch (error) {
    console.error(`${COLORS.red}❌ 无法保存报告: ${error.message}${COLORS.reset}`)
  }
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

  const healthData = {
    timestamp: new Date().toISOString(),
    projectInfo: checkProjectInfo(),
    dependencies: checkDependencies(),
    git: checkGitStatus(),
    configuration: checkConfiguration(),
    logs: checkLogs(),
    system: getSystemInfo()
  }

  displayHealthReport(healthData, options)

  if (options.report) {
    generateReportFile(healthData)
  }

  // 返回退出码
  const hasIssues =
    healthData.dependencies.status !== 'ok' ||
    healthData.git.hasUncommittedChanges ||
    !healthData.configuration.hasEnv

  process.exit(hasIssues ? 1 : 0)
}

// 运行
if (require.main === module) {
  main()
}

module.exports = {
  checkProjectInfo,
  checkDependencies,
  checkGitStatus,
  checkConfiguration
}
