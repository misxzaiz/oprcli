#!/usr/bin/env node
/**
 * 配置备份脚本
 *
 * 功能：
 * - 备份 .env 配置文件
 * - 备份 package.json
 * - 备份关键配置文件
 * - 自动清理过期备份
 * - 支持加密敏感配置
 *
 * 使用方法：
 *   node scripts/backup-config.js                  # 创建备份
 *   node scripts/backup-config.js --list           # 列出所有备份
 *   node scripts/backup-config.js --restore <id>   # 恢复备份
 *   node scripts/backup-config.js --clean          # 清理过期备份
 *   node scripts/backup-config.js --encrypt        # 加密敏感信息
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// 配置
const CONFIG = {
  backupDir: path.join(__dirname, '../backups'),
  maxBackups: 10, // 保留最近10个备份
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30天
  filesToBackup: [
    '.env',
    'package.json',
    '.env.example'
  ]
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
    list: false,
    restore: null,
    clean: false,
    encrypt: false,
    help: false
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '-l':
      case '--list':
        options.list = true
        break
      case '-r':
      case '--restore':
        if (i + 1 < args.length) {
          options.restore = args[++i]
        }
        break
      case '-c':
      case '--clean':
        options.clean = true
        break
      case '-e':
      case '--encrypt':
        options.encrypt = true
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
💾 配置备份工具 v1.0.0

使用方法：
  node scripts/backup-config.js [选项]

选项：
  -l, --list              列出所有备份
  -r, --restore <id>      恢复指定备份
  -c, --clean             清理过期备份
  -e, --encrypt           加密敏感信息
  -h, --help              显示此帮助信息

示例：
  node scripts/backup-config.js                  # 创建备份
  node scripts/backup-config.js --list           # 列出所有备份
  node scripts/backup-config.js --restore 20260305-120000  # 恢复备份
  node scripts/backup-config.js --clean          # 清理过期备份
  node scripts/backup-config.js --encrypt        # 加密敏感信息
`)
}

/**
 * 生成备份ID
 */
function generateBackupId() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hour = String(now.getHours()).padStart(2, '0')
  const minute = String(now.getMinutes()).padStart(2, '0')
  const second = String(now.getSeconds()).padStart(2, '0')

  return `${year}${month}${day}-${hour}${minute}${second}`
}

/**
 * 创建备份
 */
function createBackup(options) {
  console.log(`${COLORS.blue}💾 创建配置备份...${COLORS.reset}\n`)

  // 确保备份目录存在
  if (!fs.existsSync(CONFIG.backupDir)) {
    fs.mkdirSync(CONFIG.backupDir, { recursive: true })
    console.log(`${COLORS.green}✅ 创建备份目录${COLORS.reset}\n`)
  }

  const backupId = generateBackupId()
  const backupPath = path.join(CONFIG.backupDir, backupId)
  fs.mkdirSync(backupPath, { recursive: true })

  const backupManifest = {
    id: backupId,
    timestamp: new Date().toISOString(),
    files: [],
    encrypted: options.encrypt
  }

  let backedUp = 0
  let skipped = 0

  // 备份每个文件
  CONFIG.filesToBackup.forEach(filename => {
    const sourcePath = path.join(__dirname, '..', filename)

    if (!fs.existsSync(sourcePath)) {
      console.log(`${COLORS.yellow}⚠️  跳过（文件不存在）: ${filename}${COLORS.reset}`)
      skipped++
      return
    }

    try {
      let content = fs.readFileSync(sourcePath, 'utf-8')
      const targetPath = path.join(backupPath, filename)

      // 如果需要加密
      if (options.encrypt && filename === '.env') {
        content = encryptContent(content)
        fs.writeFileSync(targetPath, content)
        console.log(`${COLORS.green}✅ 已加密备份: ${filename}${COLORS.reset}`)
      } else {
        fs.writeFileSync(targetPath, content)
        console.log(`${COLORS.green}✅ 已备份: ${filename}${COLORS.reset}`)
      }

      backupManifest.files.push({
        filename,
        size: content.length,
        encrypted: options.encrypt && filename === '.env'
      })

      backedUp++
    } catch (error) {
      console.log(`${COLORS.red}❌ 备份失败: ${filename} - ${error.message}${COLORS.reset}`)
      skipped++
    }
  })

  // 保存清单
  const manifestPath = path.join(backupPath, 'manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify(backupManifest, null, 2))

  console.log(`\n${COLORS.blue}📊 备份统计${COLORS.reset}`)
  console.log(`${COLORS.gray}${'─'.repeat(40)}${COLORS.reset}`)
  console.log(`备份 ID: ${backupId}`)
  console.log(`成功: ${backedUp}`)
  console.log(`跳过: ${skipped}`)
  console.log(`路径: ${backupPath}`)

  // 清理旧备份
  cleanOldBackups()

  return backupId
}

/**
 * 加密内容
 */
function encryptContent(content) {
  const algorithm = 'aes-256-cbc'
  const key = crypto.scryptSync(backupId, 'salt', 32) // 使用备份ID作为密钥
  const iv = crypto.randomBytes(16)

  const cipher = crypto.createCipheriv(algorithm, key, iv)
  let encrypted = cipher.update(content, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  return iv.toString('hex') + ':' + encrypted
}

/**
 * 解密内容
 */
function decryptContent(encryptedContent, backupId) {
  const algorithm = 'aes-256-cbc'
  const key = crypto.scryptSync(backupId, 'salt', 32)

  const parts = encryptedContent.split(':')
  const iv = Buffer.from(parts[0], 'hex')
  const encrypted = parts[1]

  const decipher = crypto.createDecipheriv(algorithm, key, iv)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

/**
 * 列出所有备份
 */
function listBackups() {
  console.log(`${COLORS.blue}📋 配置备份列表${COLORS.reset}`)
  console.log(`${COLORS.gray}${'─'.repeat(40)}${COLORS.reset}\n`)

  if (!fs.existsSync(CONFIG.backupDir)) {
    console.log(`${COLORS.yellow}⚠️  没有找到备份目录${COLORS.reset}`)
    return
  }

  const backups = fs.readdirSync(CONFIG.backupDir)
    .filter(name => name !== '.gitkeep')
    .sort()
    .reverse()

  if (backups.length === 0) {
    console.log(`${COLORS.yellow}⚠️  没有找到备份${COLORS.reset}`)
    return
  }

  backups.forEach(backupId => {
    const backupPath = path.join(CONFIG.backupDir, backupId)
    const manifestPath = path.join(backupPath, 'manifest.json')

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      const date = new Date(manifest.timestamp).toLocaleString('zh-CN')
      const encrypted = manifest.encrypted ? ' 🔒' : ''

      console.log(`${COLORS.cyan}${backupId}${encrypted}${COLORS.reset}`)
      console.log(`  时间: ${date}`)
      console.log(`  文件: ${manifest.files.length} 个`)
      console.log(`  大小: ${formatSize(manifest.files.reduce((sum, f) => sum + f.size, 0))}`)
      console.log('')
    } catch (error) {
      console.log(`${COLORS.red}${backupId} (无效的备份)${COLORS.reset}\n`)
    }
  })

  console.log(`${COLORS.gray}总计: ${backups.length} 个备份${COLORS.reset}`)
}

/**
 * 恢复备份
 */
function restoreBackup(backupId) {
  console.log(`${COLORS.blue}🔄 恢复配置备份...${COLORS.reset}\n`)

  const backupPath = path.join(CONFIG.backupDir, backupId)

  if (!fs.existsSync(backupPath)) {
    console.log(`${COLORS.red}❌ 备份不存在: ${backupId}${COLORS.reset}`)
    return false
  }

  const manifestPath = path.join(backupPath, 'manifest.json')

  if (!fs.existsSync(manifestPath)) {
    console.log(`${COLORS.red}❌ 备份清单不存在${COLORS.reset}`)
    return false
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    let restored = 0
    let skipped = 0

    console.log(`备份 ID: ${backupId}`)
    console.log(`备份时间: ${new Date(manifest.timestamp).toLocaleString('zh-CN')}\n`)

    // 恢复每个文件
    manifest.files.forEach(fileInfo => {
      const sourcePath = path.join(backupPath, fileInfo.filename)
      const targetPath = path.join(__dirname, '..', fileInfo.filename)

      if (!fs.existsSync(sourcePath)) {
        console.log(`${COLORS.yellow}⚠️  跳过（源文件不存在）: ${fileInfo.filename}${COLORS.reset}`)
        skipped++
        return
      }

      try {
        let content = fs.readFileSync(sourcePath, 'utf-8')

        // 如果文件已加密，先解密
        if (fileInfo.encrypted) {
          content = decryptContent(content, backupId)
          console.log(`${COLORS.green}✅ 已解密恢复: ${fileInfo.filename}${COLORS.reset}`)
        } else {
          console.log(`${COLORS.green}✅ 已恢复: ${fileInfo.filename}${COLORS.reset}`)
        }

        // 备份现有文件
        if (fs.existsSync(targetPath)) {
          const backupExisting = targetPath + '.bak'
          fs.copyFileSync(targetPath, backupExisting)
        }

        fs.writeFileSync(targetPath, content)
        restored++
      } catch (error) {
        console.log(`${COLORS.red}❌ 恢复失败: ${fileInfo.filename} - ${error.message}${COLORS.reset}`)
        skipped++
      }
    })

    console.log(`\n${COLORS.blue}📊 恢复统计${COLORS.reset}`)
    console.log(`${COLORS.gray}${'─'.repeat(40)}${COLORS.reset}`)
    console.log(`成功: ${restored}`)
    console.log(`跳过: ${skipped}`)

    return restored > 0
  } catch (error) {
    console.log(`${COLORS.red}❌ 恢复失败: ${error.message}${COLORS.reset}`)
    return false
  }
}

/**
 * 清理旧备份
 */
function cleanOldBackups() {
  if (!fs.existsSync(CONFIG.backupDir)) {
    return
  }

  const backups = fs.readdirSync(CONFIG.backupDir)
    .filter(name => name !== '.gitkeep')
    .sort()
    .reverse()

  if (backups.length <= CONFIG.maxBackups) {
    return
  }

  const toDelete = backups.slice(CONFIG.maxBackups)
  let deleted = 0

  toDelete.forEach(backupId => {
    const backupPath = path.join(CONFIG.backupDir, backupId)

    try {
      fs.rmSync(backupPath, { recursive: true, force: true })
      deleted++
    } catch (error) {
      console.log(`${COLORS.yellow}⚠️  删除失败: ${backupId}${COLORS.reset}`)
    }
  })

  if (deleted > 0) {
    console.log(`\n${COLORS.yellow}🗑️  已清理 ${deleted} 个旧备份${COLORS.reset}`)
  }
}

/**
 * 清理过期备份
 */
function cleanExpiredBackups() {
  console.log(`${COLORS.blue}🧹 清理过期备份...${COLORS.reset}\n`)

  if (!fs.existsSync(CONFIG.backupDir)) {
    console.log(`${COLORS.yellow}⚠️  没有找到备份目录${COLORS.reset}`)
    return
  }

  const backups = fs.readdirSync(CONFIG.backupDir)
    .filter(name => name !== '.gitkeep')
  const now = Date.now()
  let deleted = 0

  backups.forEach(backupId => {
    const backupPath = path.join(CONFIG.backupDir, backupId)
    const manifestPath = path.join(backupPath, 'manifest.json')

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      const backupTime = new Date(manifest.timestamp).getTime()
      const age = now - backupTime

      if (age > CONFIG.maxAge) {
        fs.rmSync(backupPath, { recursive: true, force: true })
        console.log(`${COLORS.green}✅ 已删除: ${backupId} (${Math.floor(age / (24 * 60 * 60 * 1000))}天前)${COLORS.reset}`)
        deleted++
      }
    } catch (error) {
      // 删除无效的备份
      fs.rmSync(backupPath, { recursive: true, force: true })
      console.log(`${COLORS.yellow}⚠️  已删除无效备份: ${backupId}${COLORS.reset}`)
      deleted++
    }
  })

  if (deleted === 0) {
    console.log(`${COLORS.green}✅ 没有过期备份需要清理${COLORS.reset}`)
  } else {
    console.log(`\n${COLORS.green}✅ 已清理 ${deleted} 个过期备份${COLORS.reset}`)
  }
}

/**
 * 格式化文件大小
 */
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
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

  if (options.list) {
    listBackups()
    process.exit(0)
  }

  if (options.restore) {
    const success = restoreBackup(options.restore)
    process.exit(success ? 0 : 1)
  }

  if (options.clean) {
    cleanExpiredBackups()
    cleanOldBackups()
    process.exit(0)
  }

  // 默认创建备份
  const backupId = createBackup(options)
  console.log(`\n${COLORS.green}✅ 备份完成${COLORS.reset}`)

  process.exit(0)
}

// 运行
main()
