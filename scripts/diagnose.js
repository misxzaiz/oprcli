/**
 * 系统诊断工具
 *
 * 功能：
 * - 检查系统环境
 * - 检查 Node.js 版本和依赖
 * - 检查文件系统权限
 * - 检查端口占用
 * - 检查服务状态
 * - 生成诊断报告
 *
 * 使用方法：
 * node scripts/diagnose.js                    # 运行完整诊断
 * node scripts/diagnose.js --quick            # 快速诊断
 * node scripts/diagnose.js --report           # 生成诊断报告
 * node scripts/diagnose.js --check-port       # 检查端口
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const { execSync } = require('child_process')

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
    quick: false,
    report: false,
    checkPort: null,
    help: false
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '-q':
      case '--quick':
        options.quick = true
        break
      case '-r':
      case '--report':
        options.report = true
        break
      case '-p':
      case '--check-port':
        options.checkPort = args[++i]
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
🔬 系统诊断工具 v1.0.0

使用方法：
  node scripts/diagnose.js [选项]

选项：
  -q, --quick              快速诊断（跳过耗时检查）
  -r, --report             生成诊断报告到 logs/diagnosis-report.json
  -p, --check-port <端口>  检查指定端口是否被占用
  -h, --help               显示此帮助信息

示例：
  node scripts/diagnose.js                    # 运行完整诊断
  node scripts/diagnose.js --quick            # 快速诊断
  node scripts/diagnose.js --report           # 生成诊断报告
  node scripts/diagnose.js --check-port 13579 # 检查端口
`)
}

/**
 * 诊断 Node.js 环境
 */
function diagnoseNodeEnv() {
  console.log(`${COLORS.blue}📦 Node.js 环境${COLORS.reset}`)
  console.log(`${COLORS.gray}${'─'.repeat(40)}${COLORS.reset}`)

  const results = {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    issues: []
  }

  console.log(`Node.js 版本: ${results.nodeVersion}`)
  console.log(`平台: ${results.platform}`)
  console.log(`架构: ${results.arch}`)

  // 检查 Node.js 版本
  const majorVersion = parseInt(process.version.slice(1).split('.')[0])
  if (majorVersion < 14) {
    console.log(`${COLORS.red}❌ Node.js 版本过低，建议使用 14.0.0 或更高版本${COLORS.reset}`)
    results.issues.push('Node.js 版本过低')
  } else if (majorVersion < 16) {
    console.log(`${COLORS.yellow}⚠️  建议升级到 Node.js 16 或更高版本${COLORS.reset}`)
    results.issues.push('建议升级 Node.js')
  } else {
    console.log(`${COLORS.green}✅ Node.js 版本符合要求${COLORS.reset}`)
  }

  // 检查 npm
  try {
    const npmVersion = execSync('npm --version', { encoding: 'utf-8' }).trim()
    console.log(`npm 版本: ${npmVersion}`)
    results.npmVersion = npmVersion
  } catch (error) {
    console.log(`${COLORS.red}❌ 无法获取 npm 版本${COLORS.reset}`)
    results.issues.push('npm 不可用')
  }

  console.log()
  return results
}

/**
 * 诊断项目依赖
 */
function diagnoseDependencies() {
  console.log(`${COLORS.blue}📚 项目依赖${COLORS.reset}`)
  console.log(`${COLORS.gray}${'─'.repeat(40)}${COLORS.reset}`)

  const results = {
    packageJsonExists: false,
    nodeModulesExists: false,
    dependenciesInstalled: false,
    issues: []
  }

  // 检查 package.json
  const packageJsonPath = path.join(__dirname, '../package.json')
  results.packageJsonExists = fs.existsSync(packageJsonPath)

  if (results.packageJsonExists) {
    console.log(`${COLORS.green}✅ package.json 存在${COLORS.reset}`)

    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      const depCount = Object.keys(packageJson.dependencies || {}).length
      const devDepCount = Object.keys(packageJson.devDependencies || {}).length

      console.log(`生产依赖: ${depCount}`)
      console.log(`开发依赖: ${devDepCount}`)
      results.dependencyCount = depCount + devDepCount
    } catch (error) {
      console.log(`${COLORS.red}❌ package.json 解析失败${COLORS.reset}`)
      results.issues.push('package.json 解析失败')
    }
  } else {
    console.log(`${COLORS.red}❌ package.json 不存在${COLORS.reset}`)
    results.issues.push('package.json 不存在')
  }

  // 检查 node_modules
  const nodeModulesPath = path.join(__dirname, '../node_modules')
  results.nodeModulesExists = fs.existsSync(nodeModulesPath)

  if (results.nodeModulesExists) {
    console.log(`${COLORS.green}✅ node_modules 存在${COLORS.reset}`)

    // 检查是否有依赖
    try {
      const modules = fs.readdirSync(nodeModulesPath)
      const filteredModules = modules.filter(m => !m.startsWith('.'))
      results.dependenciesInstalled = filteredModules.length > 0
      results.installedModuleCount = filteredModules.length

      if (results.dependenciesInstalled) {
        console.log(`已安装模块: ${results.installedModuleCount}`)
      } else {
        console.log(`${COLORS.yellow}⚠️  node_modules 为空${COLORS.reset}`)
        results.issues.push('node_modules 为空')
      }
    } catch (error) {
      console.log(`${COLORS.red}❌ 无法读取 node_modules${COLORS.reset}`)
      results.issues.push('无法读取 node_modules')
    }
  } else {
    console.log(`${COLORS.red}❌ node_modules 不存在${COLORS.reset}`)
    results.issues.push('node_modules 不存在，请运行 npm install')
  }

  console.log()
  return results
}

/**
 * 诊断文件系统
 */
function diagnoseFileSystem() {
  console.log(`${COLORS.blue}💾 文件系统${COLORS.reset}`)
  console.log(`${COLORS.gray}${'─'.repeat(40)}${COLORS.reset}`)

  const results = {
    issues: []
  }

  // 检查目录权限
  const dirsToCheck = [
    path.join(__dirname, '..'),
    path.join(__dirname, '../logs'),
    path.join(__dirname, '../system-prompts')
  ]

  dirsToCheck.forEach(dir => {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
        console.log(`${COLORS.yellow}⚠️  已创建目录: ${dir}${COLORS.reset}`)
      }

      fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK)
      console.log(`${COLORS.green}✅ ${dir}${COLORS.reset}`)
    } catch (error) {
      console.log(`${COLORS.red}❌ ${dir} - 无读写权限${COLORS.reset}`)
      results.issues.push(`${dir} 无读写权限`)
    }
  })

  // 检查磁盘空间
  const stats = fs.statSync(path.join(__dirname, '..'))
  console.log(`\n项目目录大小: ${formatBytes(stats.size || 0)}`)

  console.log()
  return results
}

/**
 * 检查端口占用
 */
function checkPort(port) {
  console.log(`${COLORS.blue}🌐 端口检查${COLORS.reset}`)
  console.log(`${COLORS.gray}${'─'.repeat(40)}${COLORS.reset}`)

  const results = {
    port: port,
    inUse: false,
    process: null,
    issues: []
  }

  if (!port) {
    // 从环境变量或配置读取默认端口
    port = process.env.PORT || '13579'
  }

  console.log(`检查端口: ${port}`)

  try {
    // 使用 netstat 检查端口
    const output = execSync(`netstat -ano | findstr :${port}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    })

    if (output.trim()) {
      console.log(`${COLORS.yellow}⚠️  端口 ${port} 已被占用${COLORS.reset}`)
      results.inUse = true

      // 解析进程信息
      const lines = output.trim().split('\n')
      const firstLine = lines[0]
      const parts = firstLine.trim().split(/\s+/)
      const pid = parts[parts.length - 1]

      if (pid && pid !== 'PID') {
        try {
          const processInfo = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
            encoding: 'utf-8'
          })
          results.process = processInfo.trim()
          console.log(`占用进程: ${results.process}`)
        } catch (error) {
          console.log(`PID: ${pid}`)
        }

        results.issues.push(`端口 ${port} 被占用`)
      }
    } else {
      console.log(`${COLORS.green}✅ 端口 ${port} 可用${COLORS.reset}`)
    }
  } catch (error) {
    // netstat 返回非零退出码表示端口未找到（可用）
    console.log(`${COLORS.green}✅ 端口 ${port} 可用${COLORS.reset}`)
  }

  console.log()
  return results
}

/**
 * 诊断环境配置
 */
function diagnoseEnvironment() {
  console.log(`${COLORS.blue}🔐 环境配置${COLORS.reset}`)
  console.log(`${COLORS.gray}${'─'.repeat(40)}${COLORS.reset}`)

  const results = {
    envFileExists: false,
    requiredVarsSet: [],
    missingVars: [],
    issues: []
  }

  // 检查 .env 文件
  const envPath = path.join(__dirname, '../.env')
  results.envFileExists = fs.existsSync(envPath)

  if (results.envFileExists) {
    console.log(`${COLORS.green}✅ .env 文件存在${COLORS.reset}`)
  } else {
    console.log(`${COLORS.yellow}⚠️  .env 文件不存在${COLORS.reset}`)
    results.issues.push('.env 文件不存在')
  }

  // 检查关键环境变量
  const requiredVars = ['PORT', 'PROVIDER']
  const optionalVars = ['CLAUDE_CMD_PATH', 'CLAUDE_WORK_DIR', 'DINGTALK_CLIENT_ID']

  requiredVars.forEach(varName => {
    if (process.env[varName]) {
      console.log(`${COLORS.green}✅ ${varName}=${process.env[varName]}${COLORS.reset}`)
      results.requiredVarsSet.push(varName)
    } else {
      console.log(`${COLORS.yellow}⚠️  ${varName} 未设置（将使用默认值）${COLORS.reset}`)
    }
  })

  optionalVars.forEach(varName => {
    if (process.env[varName]) {
      const value = varName.includes('SECRET') || varName.includes('TOKEN')
        ? '***'
        : process.env[varName]
      console.log(`  ${varName}=${value}`)
    }
  })

  console.log()
  return results
}

/**
 * 诊断系统资源
 */
function diagnoseSystemResources() {
  console.log(`${COLORS.blue}💻 系统资源${COLORS.reset}`)
  console.log(`${COLORS.gray}${'─'.repeat(40)}${COLORS.reset}`)

  const results = {
    issues: []
  }

  // CPU 信息
  const cpus = os.cpus()
  console.log(`CPU 型号: ${cpus[0].model}`)
  console.log(`CPU 核心数: ${cpus.length}`)

  // 内存信息
  const totalMemory = os.totalmem()
  const freeMemory = os.freemem()
  const usedMemory = totalMemory - freeMemory
  const memoryUsagePercent = (usedMemory / totalMemory * 100).toFixed(1)

  console.log(`总内存: ${formatBytes(totalMemory)}`)
  console.log(`已用内存: ${formatBytes(usedMemory)} (${memoryUsagePercent}%)`)
  console.log(`可用内存: ${formatBytes(freeMemory)}`)

  if (memoryUsagePercent > 90) {
    console.log(`${COLORS.red}❌ 内存使用率过高${COLORS.reset}`)
    results.issues.push('内存使用率过高')
  } else if (memoryUsagePercent > 80) {
    console.log(`${COLORS.yellow}⚠️  内存使用率较高${COLORS.reset}`)
  }

  // 系统负载
  const loadAverage = os.loadavg()
  console.log(`系统负载: ${loadAverage.map(l => l.toFixed(2)).join(', ')}`)

  console.log()
  return results
}

/**
 * 生成诊断报告
 */
function generateReport(diagnosis) {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalIssues: 0,
      criticalIssues: 0,
      warnings: 0
    },
    details: diagnosis
  }

  // 统计问题
  Object.values(diagnosis).forEach(section => {
    if (section.issues) {
      report.summary.totalIssues += section.issues.length
    }
  })

  // 保存报告
  const reportPath = path.join(__dirname, '../logs/diagnosis-report.json')
  const logDir = path.dirname(reportPath)

  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`${COLORS.green}📄 诊断报告已保存到: ${reportPath}${COLORS.reset}\n`)

  return report
}

/**
 * 格式化字节数
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
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

  console.log(`${COLORS.magenta}🔬 OPRCLI 系统诊断${COLORS.reset}`)
  console.log(`${COLORS.gray}时间: ${new Date().toLocaleString('zh-CN')}${COLORS.reset}\n`)

  const diagnosis = {}

  // 运行诊断
  diagnosis.nodeEnv = diagnoseNodeEnv()
  diagnosis.dependencies = diagnoseDependencies()
  diagnosis.fileSystem = diagnoseFileSystem()

  if (!options.quick) {
    diagnosis.systemResources = diagnoseSystemResources()
  }

  diagnosis.environment = diagnoseEnvironment()

  if (options.checkPort) {
    diagnosis.port = checkPort(options.checkPort)
  }

  // 生成报告
  if (options.report) {
    const report = generateReport(diagnosis)

    console.log(`${COLORS.blue}📊 诊断摘要${COLORS.reset}`)
    console.log(`${COLORS.gray}${'─'.repeat(40)}${COLORS.reset}`)
    console.log(`发现问题: ${report.summary.totalIssues}`)

    if (report.summary.totalIssues > 0) {
      console.log(`\n${COLORS.yellow}💡 建议操作:${COLORS.reset}`)
      Object.entries(diagnosis).forEach(([section, data]) => {
        if (data.issues && data.issues.length > 0) {
          console.log(`\n${section}:`)
          data.issues.forEach(issue => {
            console.log(`  • ${issue}`)
          })
        }
      })
    }
  }

  // 返回退出码
  const totalIssues = Object.values(diagnosis).reduce((sum, section) => {
    return sum + (section.issues ? section.issues.length : 0)
  }, 0)

  if (totalIssues > 0) {
    console.log(`${COLORS.yellow}⚠️  发现 ${totalIssues} 个问题，请检查上述警告${COLORS.reset}`)
    process.exit(1)
  } else {
    console.log(`${COLORS.green}✅ 所有检查通过，系统状态良好${COLORS.reset}`)
    process.exit(0)
  }
}

// 运行
main()
