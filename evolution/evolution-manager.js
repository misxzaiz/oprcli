/**
 * 自进化管理器
 * 负责记录升级、生成文档、动态注入系统提示词
 */

const fs = require('fs').promises
const path = require('path')

class EvolutionManager {
  constructor(server, logger) {
    this.server = server
    this.logger = logger
    this.logPath = path.join(__dirname, 'upgrade-log.json')
    this.docsDir = path.join(__dirname, '../system-prompts/docs/evolution')
    this.basePromptPath = path.join(__dirname, '../system-prompts/base.txt')
    this.upgradeLog = []
    this.maxRecentUpgrades = 10  // 系统提示词中保留的最大升级记录数
  }

  /**
   * 初始化进化管理器
   */
  async initialize() {
    try {
      // 确保目录存在
      await fs.mkdir(this.docsDir, { recursive: true })

      // 加载升级日志
      await this.loadLog()

      this.logger.success('EVOLUTION', `自进化管理器已初始化，已记录 ${this.upgradeLog.length} 次升级`)
      return true
    } catch (error) {
      this.logger.error('EVOLUTION', '初始化失败', { error: error.message })
      return false
    }
  }

  /**
   * 加载升级日志
   */
  async loadLog() {
    try {
      const content = await fs.readFile(this.logPath, 'utf-8')
      this.upgradeLog = JSON.parse(content)
    } catch (error) {
      if (error.code === 'ENOENT') {
        // 文件不存在，创建空日志
        this.upgradeLog = []
        await this.saveLog()
      } else {
        throw error
      }
    }
  }

  /**
   * 保存升级日志
   */
  async saveLog() {
    await fs.writeFile(this.logPath, JSON.stringify(this.upgradeLog, null, 2))
  }

  /**
   * 记录升级
   * @param {Object} upgrade - 升级信息
   * @param {string} upgrade.type - 升级类型 (mcp | skill | config | capability)
   * @param {string} upgrade.action - 操作类型 (add | remove | update)
   * @param {string} upgrade.name - 升级名称
   * @param {string} upgrade.description - 升级描述
   * @param {Object} upgrade.details - 详细信息
   */
  async recordUpgrade(upgrade) {
    const entry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      type: upgrade.type || 'capability',
      action: upgrade.action || 'add',
      name: upgrade.name || '未知升级',
      description: upgrade.description || '',
      details: upgrade.details || {},
      status: 'completed'
    }

    // 添加到日志
    this.upgradeLog.unshift(entry)  // 最新的放前面

    // 限制日志大小
    if (this.upgradeLog.length > 100) {
      this.upgradeLog = this.upgradeLog.slice(0, 100)
    }

    // 保存日志
    await this.saveLog()

    // 生成文档
    await this.generateDocumentation(entry)

    // 更新系统提示词
    await this.updateSystemPrompt()

    // 触发钩子
    if (this.server.pluginManager) {
      await this.server.pluginManager.executeHook('evolution:upgrade', entry)
    }

    this.logger.success('EVOLUTION', `已记录升级: ${entry.description}`, {
      id: entry.id,
      type: entry.type
    })

    return entry
  }

  /**
   * 生成升级文档
   */
  async generateDocumentation(entry) {
    const docPath = path.join(this.docsDir, `${entry.id}.md`)

    const doc = `# ${entry.description}

**类型**: ${this.getTypeLabel(entry.type)}
**操作**: ${this.getActionLabel(entry.action)}
**时间**: ${new Date(entry.timestamp).toLocaleString('zh-CN')}
**ID**: ${entry.id}

## 详细说明

${entry.details.description || entry.description}

## 使用方式

\`\`\`
${entry.details.usage || '查看相关功能文档'}
\`\`\`

${entry.details.example ? `## 示例\n\n\`\`\`\n${entry.details.example}\n\`\`\`\n` : ''}

## 技术细节

- **升级类型**: ${entry.type}
- **升级名称**: ${entry.name}
- **影响范围**: ${entry.details.scope || '当前会话'}

---

*此文档由自进化系统自动生成*
`

    await fs.writeFile(docPath, doc, 'utf-8')

    // 更新文档索引
    await this.updateDocsIndex()

    this.logger.debug('EVOLUTION', `文档已生成: ${entry.id}.md`)
  }

  /**
   * 更新文档索引
   */
  async updateDocsIndex() {
    const indexPath = path.join(this.docsDir, 'README.md')

    const recentUpgrades = this.upgradeLog.slice(0, 20)

    let index = `# 🧬 自进化系统文档

本系统支持自适应升级，以下记录了所有已完成的升级操作。

## 最近升级

${recentUpgrades.map(u => `- [${u.description}](./${u.id}.md) - ${this.getTypeLabel(u.type)} (${new Date(u.timestamp).toLocaleDateString('zh-CN')})`).join('\n')}

## 升级类型说明

- **MCP**: 添加或更新 MCP 工具
- **Skill**: 添加或更新技能模块
- **Config**: 配置更新
- **Capability**: 能力增强

---

*此文档由自进化系统自动维护*

**最后更新**: ${new Date().toLocaleString('zh-CN')}
`

    await fs.writeFile(indexPath, index, 'utf-8')
  }

  /**
   * 动态更新系统提示词
   */
  async updateSystemPrompt() {
    try {
      let content = await fs.readFile(this.basePromptPath, 'utf-8')

      // 获取最近的升级记录
      const recentUpgrades = this.upgradeLog.slice(0, this.maxRecentUpgrades)

      if (recentUpgrades.length === 0) {
        return
      }

      // 构建进化记录部分
      const evolutionSection = this.formatEvolutionSection(recentUpgrades)

      // 查找或创建进化记录标记
      const markerStart = '<!-- EVOLUTION_START -->'
      const markerEnd = '<!-- EVOLUTION_END -->'

      if (content.includes(markerStart) && content.includes(markerEnd)) {
        // 替换现有内容
        const startIdx = content.indexOf(markerStart) + markerStart.length
        const endIdx = content.indexOf(markerEnd)
        content = content.slice(0, startIdx) + '\n' + evolutionSection + '\n' + content.slice(endIdx)
      } else {
        // 在文件末尾添加（确保有换行）
        if (!content.endsWith('\n')) {
          content += '\n'
        }
        content += `\n${markerStart}\n${evolutionSection}\n${markerEnd}\n`
      }

      await fs.writeFile(this.basePromptPath, content, 'utf-8')

      this.logger.debug('EVOLUTION', '系统提示词已更新')
    } catch (error) {
      this.logger.error('EVOLUTION', '更新系统提示词失败', { error: error.message })
    }
  }

  /**
   * 格式化进化记录部分
   */
  formatEvolutionSection(upgrades) {
    return `## 🧬 最近的自适应升级

以下是系统最近的自适应升级记录：

${upgrades.map(u => `
### ${this.getTypeLabel(u.type)}: ${u.name}
- **描述**: ${u.description}
- **时间**: ${new Date(u.timestamp).toLocaleString('zh-CN')}
- **详情**: \`cat system-prompts/docs/evolution/${u.id}.md\`
`).join('\n')}

💡 这些升级已在系统中生效，你可以直接使用相关功能。
`
  }

  /**
   * 获取最近的升级记录
   */
  getRecentUpgrades(limit = 10) {
    return this.upgradeLog.slice(0, limit)
  }

  /**
   * 搜索升级记录
   */
  searchUpgrades(query) {
    const lowerQuery = query.toLowerCase()
    return this.upgradeLog.filter(u =>
      u.description.toLowerCase().includes(lowerQuery) ||
      u.name.toLowerCase().includes(lowerQuery) ||
      u.type.toLowerCase().includes(lowerQuery)
    )
  }

  /**
   * 按类型获取升级
   */
  getUpgradesByType(type) {
    return this.upgradeLog.filter(u => u.type === type)
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const stats = {
      total: this.upgradeLog.length,
      byType: {},
      byAction: {},
      lastUpgrade: null
    }

    for (const upgrade of this.upgradeLog) {
      // 按类型统计
      stats.byType[upgrade.type] = (stats.byType[upgrade.type] || 0) + 1

      // 按操作统计
      stats.byAction[upgrade.action] = (stats.byAction[upgrade.action] || 0) + 1
    }

    if (this.upgradeLog.length > 0) {
      stats.lastUpgrade = this.upgradeLog[0]
    }

    return stats
  }

  /**
   * 解析升级指令
   * 格式: @upgrade add mcp mcp-name "description"
   */
  parseUpgradeCommand(message) {
    const match = message.match(/@upgrade\s+(add|remove|update)\s+(\w+)\s+(\S+)(?:\s+"([^"]+)")?/i)

    if (match) {
      return {
        action: match[1].toLowerCase(),
        type: match[2].toLowerCase(),
        name: match[3],
        description: match[4] || `${match[1]} ${match[2]}: ${match[3]}`,
        details: {
          usage: `使用 @${match[2]} ${match[3]} 来调用这个功能`,
          scope: '所有会话'
        }
      }
    }

    return null
  }

  /**
   * 生成唯一ID
   */
  generateId() {
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).slice(2, 7)
    return `upgrade-${timestamp}-${random}`
  }

  /**
   * 获取类型标签
   */
  getTypeLabel(type) {
    const labels = {
      mcp: 'MCP工具',
      skill: '技能模块',
      config: '配置更新',
      capability: '能力增强'
    }
    return labels[type] || type
  }

  /**
   * 获取操作标签
   */
  getActionLabel(action) {
    const labels = {
      add: '新增',
      remove: '移除',
      update: '更新'
    }
    return labels[action] || action
  }

  /**
   * 清理过期记录
   */
  async cleanup(maxAge = 30 * 24 * 60 * 60 * 1000) {  // 默认30天
    const cutoff = Date.now() - maxAge
    const originalLength = this.upgradeLog.length

    // 保留最近的记录（即使过期）
    const recentKeep = this.upgradeLog.slice(0, this.maxRecentUpgrades)

    // 过滤旧记录
    this.upgradeLog = [
      ...recentKeep,
      ...this.upgradeLog.slice(this.maxRecentUpgrades).filter(u =>
        new Date(u.timestamp).getTime() > cutoff
      )
    ]

    if (this.upgradeLog.length < originalLength) {
      await this.saveLog()
      this.logger.info('EVOLUTION', `清理了 ${originalLength - this.upgradeLog.length} 条过期记录`)
    }
  }
}

module.exports = EvolutionManager
