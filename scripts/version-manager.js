#!/usr/bin/env node
/**
 * 版本管理工具
 *
 * 功能：
 * - 检查版本一致性
 * - 自动更新版本号
 * - 生成版本标签
 * - 验证发布前状态
 *
 * 使用方法：
 *   node scripts/version-manager.js --check              # 检查版本一致性
 *   node scripts/version-manager.js --bump [type]        # 更新版本号 (patch/minor/major)
 *   node scripts/version-manager.js --validate           # 验证发布前状态
 *   node scripts/version-manager.js --changelog          # 生成变更日志
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

// 配置
const CONFIG = {
  packageJsonPath: path.join(__dirname, '../package.json'),
  changelogPath: path.join(__dirname, '../CHANGELOG.md')
}

// ANSI 颜色
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
}

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    check: false,
    bump: false,
    bumpType: 'patch',
    validate: false,
    changelog: false,
    help: false
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '-c':
      case '--check':
        options.check = true
        break
      case '-b':
      case '--bump':
        options.bump = true
        // 检查下一个参数是否是版本类型
        if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
          options.bumpType = args[i + 1]
          i++
        }
        break
      case '-v':
      case '--validate':
        options.validate = true
        break
      case '-l':
      case '--changelog':
        options.changelog = true
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
🔐 版本管理工具 v1.0.0

使用方法：
  node scripts/version-manager.js [选项]

选项：
  -c, --check              检查版本一致性（package.json vs git tags）
  -b, --bump [type]        更新版本号 (patch: 1.0.0→1.0.1, minor: 1.0.0→1.1.0, major: 1.0.0→2.0.0)
  -v, --validate           验证发布前状态（检查是否可以发布）
  -l, --changelog          生成/更新变更日志
  -h, --help               显示此帮助信息

示例：
  node scripts/version-manager.js --check                 # 检查版本
  node scripts/version-manager.js --bump patch            # 更新补丁版本
  node scripts/version-manager.js --bump minor            # 更新次版本
  node scripts/version-manager.js --validate              # 验证发布
  node scripts/version-manager.js --changelog             # 生成变更日志
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
 * 写入 package.json
 */
function writePackageJson(data) {
  try {
    fs.writeFileSync(CONFIG.packageJsonPath, JSON.stringify(data, null, 2) + '\n')
  } catch (error) {
    console.error(`${COLORS.red}❌ 无法写入 package.json: ${error.message}${COLORS.reset}`)
    process.exit(1)
  }
}

/**
 * 获取最新的 git tag
 */
function getLatestGitTag() {
  try {
    const tags = execSync('git tag -l "*.*.*" --sort=-v:refname', {
      encoding: 'utf-8'
    }).split('\n').filter(tag => tag.trim())

    return tags.length > 0 ? tags[0] : null
  } catch (error) {
    return null
  }
}

/**
 * 获取当前分支的提交历史
 */
function getRecentCommits() {
  try {
    const commits = execSync('git log --oneline -10', {
      encoding: 'utf-8'
    }).split('\n').filter(commit => commit.trim())

    return commits
  } catch (error) {
    return []
  }
}

/**
 * 检查版本一致性
 */
function checkVersion() {
  console.log(`${COLORS.blue}📋 检查版本一致性...${COLORS.reset}\n`)

  const packageJson = readPackageJson()
  const currentVersion = packageJson.version
  const latestTag = getLatestGitTag()

  console.log(`Package.json 版本: ${COLORS.cyan}${currentVersion}${COLORS.reset}`)
  console.log(`最新 Git Tag:      ${COLORS.cyan}${latestTag || '无'}${COLORS.reset}`)

  if (latestTag && latestTag !== `v${currentVersion}`) {
    console.log(`\n${COLORS.yellow}⚠️  版本不一致${COLORS.reset}`)
    console.log(`   Package.json: ${currentVersion}`)
    console.log(`   Git Tag:      ${latestTag}`)

    // 比较版本号
    const pkgVer = currentVersion.split('.').map(Number)
    const tagVer = latestTag.substring(1).split('.').map(Number)

    const pkgVerNum = pkgVer[0] * 10000 + pkgVer[1] * 100 + pkgVer[2]
    const tagVerNum = tagVer[0] * 10000 + tagVer[1] * 100 + tagVer[2]

    if (pkgVerNum > tagVerNum) {
      console.log(`\n${COLORS.green}✅ Package.json 版本较新，建议创建新的 tag${COLORS.reset}`)
    } else if (pkgVerNum < tagVerNum) {
      console.log(`\n${COLORS.red}❌ Package.json 版本较旧，建议更新${COLORS.reset}`)
    }
  } else if (latestTag === `v${currentVersion}`) {
    console.log(`\n${COLORS.green}✅ 版本一致${COLORS.reset}`)
  } else {
    console.log(`\n${COLORS.yellow}ℹ️  尚未创建任何版本 tag${COLORS.reset}`)
  }

  // 检查是否有未提交的更改
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8' })
    if (status.trim()) {
      console.log(`\n${COLORS.yellow}⚠️  存在未提交的更改${COLORS.reset}`)
      console.log(status)
    } else {
      console.log(`\n${COLORS.green}✅ 工作目录干净${COLORS.reset}`)
    }
  } catch (error) {
    // 忽略错误
  }
}

/**
 * 更新版本号
 */
function bumpVersion(type) {
  console.log(`${COLORS.blue}🔄 更新版本号...${COLORS.reset}\n`)

  if (!['patch', 'minor', 'major'].includes(type)) {
    console.error(`${COLORS.red}❌ 无效的版本类型: ${type}${COLORS.reset}`)
    console.error(`${COLORS.yellow}有效值: patch, minor, major${COLORS.reset}`)
    process.exit(1)
  }

  const packageJson = readPackageJson()
  const currentVersion = packageJson.version

  console.log(`当前版本: ${COLORS.cyan}${currentVersion}${COLORS.reset}`)

  // 解析版本号
  const [major, minor, patch] = currentVersion.split('.').map(Number)

  // 计算新版本号
  let newVersion
  switch (type) {
    case 'patch':
      newVersion = `${major}.${minor}.${patch + 1}`
      break
    case 'minor':
      newVersion = `${major}.${minor + 1}.0`
      break
    case 'major':
      newVersion = `${major + 1}.0.0`
      break
  }

  console.log(`新版本:   ${COLORS.green}${newVersion}${COLORS.reset}`)
  console.log(`类型:     ${COLORS.yellow}${type}${COLORS.reset}`)

  // 更新 package.json
  packageJson.version = newVersion
  writePackageJson(packageJson)

  console.log(`\n${COLORS.green}✅ 版本号已更新${COLORS.reset}`)
  console.log(`\n${COLORS.yellow}下一步操作:${COLORS.reset}`)
  console.log(`  1. 查看: git diff package.json`)
  console.log(`  2. 提交: git commit -am "chore: bump version to ${newVersion}"`)
  console.log(`  3. 标签: git tag v${newVersion}`)
  console.log(`  4. 推送: git push && git push --tags`)
}

/**
 * 验证发布前状态
 */
function validateRelease() {
  console.log(`${COLORS.blue}🔍 验证发布前状态...${COLORS.reset}\n`)

  const issues = []
  const warnings = []

  // 1. 检查工作目录
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8' })
    if (status.trim()) {
      issues.push('存在未提交的更改')
    }
  } catch (error) {
    warnings.push('无法检查 git 状态')
  }

  // 2. 检查版本号格式
  const packageJson = readPackageJson()
  const version = packageJson.version
  const versionRegex = /^\d+\.\d+\.\d+$/
  if (!versionRegex.test(version)) {
    issues.push(`版本号格式无效: ${version} (应为 x.y.z)`)
  }

  // 3. 检查依赖是否已安装
  try {
    const nodeModulesExists = fs.existsSync(path.join(__dirname, '../node_modules'))
    if (!nodeModulesExists) {
      issues.push('node_modules 不存在，请先运行 npm install')
    }
  } catch (error) {
    warnings.push('无法检查 node_modules')
  }

  // 4. 检查是否有未推送的提交
  try {
    const unpushed = execSync('git log --oneline @{u}..', { encoding: 'utf-8' })
    if (unpushed.trim()) {
      warnings.push('存在未推送的提交')
    }
  } catch (error) {
    // 可能是上游分支不存在
  }

  // 5. 检查脚本可执行性
  const scripts = packageJson.scripts || {}
  const requiredScripts = ['start']
  const missingScripts = requiredScripts.filter(s => !scripts[s])
  if (missingScripts.length > 0) {
    warnings.push(`缺少脚本: ${missingScripts.join(', ')}`)
  }

  // 显示结果
  if (issues.length === 0 && warnings.length === 0) {
    console.log(`${COLORS.green}✅ 所有检查通过，可以发布！${COLORS.reset}`)
  } else {
    if (issues.length > 0) {
      console.log(`${COLORS.red}❌ 发现问题:${COLORS.reset}`)
      issues.forEach(issue => console.log(`   • ${issue}`))
    }

    if (warnings.length > 0) {
      console.log(`\n${COLORS.yellow}⚠️  警告:${COLORS.reset}`)
      warnings.forEach(warning => console.log(`   • ${warning}`))
    }
  }
}

/**
 * 生成变更日志
 */
function generateChangelog() {
  console.log(`${COLORS.blue}📝 生成变更日志...${COLORS.reset}\n`)

  const packageJson = readPackageJson()
  const currentVersion = packageJson.version
  const latestTag = getLatestGitTag()

  let commits = []

  if (latestTag) {
    // 获取自上一个 tag 以来的提交
    try {
      const output = execSync(`git log ${latestTag}..HEAD --oneline`, {
        encoding: 'utf-8'
      })
      commits = output.split('\n').filter(commit => commit.trim())
    } catch (error) {
      console.log(`${COLORS.yellow}⚠️  无法获取提交历史${COLORS.reset}`)
    }
  } else {
    // 获取所有提交
    commits = getRecentCommits()
  }

  if (commits.length === 0) {
    console.log(`${COLORS.yellow}ℹ️  没有新的提交${COLORS.reset}`)
    return
  }

  // 分类提交
  const categorized = {
    feat: [],
    fix: [],
    perf: [],
    refactor: [],
    chore: [],
    docs: [],
    other: []
  }

  commits.forEach(commit => {
    const match = commit.match(/^(?:[a-f0-9]+)\s+(?:(\w+)(?:\(.+\))?:\s*)?(.*)$/) ||
                 /^(?:[a-f0-9]+)\s+(.*)$/
    if (match) {
      const type = match[1] || 'other'
      const message = match[2] || commit
      if (categorized[type]) {
        categorized[type].push(message)
      } else {
        categorized.other.push(message)
      }
    }
  })

  // 生成变更日志内容
  const date = new Date().toISOString().split('T')[0]
  let changelog = `## [${currentVersion}] - ${date}\n\n`

  const sections = [
    { title: '✨ 新功能', type: 'feat', icon: '✨' },
    { title: '🐛 Bug 修复', type: 'fix', icon: '🐛' },
    { title: '⚡ 性能优化', type: 'perf', icon: '⚡' },
    { title: '♻️  代码重构', type: 'refactor', icon: '♻️' },
    { title: '🔧 构建/工具', type: 'chore', icon: '🔧' },
    { title: '📚 文档', type: 'docs', icon: '📚' }
  ]

  let hasContent = false
  sections.forEach(section => {
    if (categorized[section.type].length > 0) {
      changelog += `### ${section.title}\n\n`
      categorized[section.type].forEach(msg => {
        changelog += `- ${msg}\n`
      })
      changelog += '\n'
      hasContent = true
    }
  })

  if (categorized.other.length > 0) {
    changelog += `### 其他\n\n`
    categorized.other.forEach(msg => {
      changelog += `- ${msg}\n`
    })
    changelog += '\n'
    hasContent = true
  }

  if (!hasContent) {
    console.log(`${COLORS.yellow}ℹ️  没有可记录的变更${COLORS.reset}`)
    return
  }

  // 输出到控制台
  console.log(changelog)

  // 询问是否保存到文件
  console.log(`${COLORS.yellow}💡 变更日志已生成${COLORS.reset}`)
  console.log(`${COLORS.cyan}如需保存到 CHANGELOG.md，请手动复制以上内容${COLORS.reset}`)
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

  // 默认执行检查
  if (!options.bump && !options.validate && !options.changelog) {
    options.check = true
  }

  try {
    if (options.check) {
      checkVersion()
    }

    if (options.bump) {
      bumpVersion(options.bumpType)
    }

    if (options.validate) {
      validateRelease()
    }

    if (options.changelog) {
      generateChangelog()
    }
  } catch (error) {
    console.error(`${COLORS.red}❌ 错误: ${error.message}${COLORS.reset}`)
    process.exit(1)
  }
}

// 运行
if (require.main === module) {
  main()
}

module.exports = {
  checkVersion,
  bumpVersion,
  validateRelease,
  generateChangelog
}
