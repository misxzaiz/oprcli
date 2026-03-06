/**
 * 智能升级建议器
 * 分析任务执行过程，主动发现能力缺口并建议升级
 */

const fs = require('fs').promises
const path = require('path')

class IntelligentUpgrader {
  constructor(evolutionManager, server) {
    this.evolution = evolutionManager
    this.server = server
    this.logger = server.logger
    this.suggestionHistory = []
    this.maxHistorySize = 100
  }

  /**
   * 分析任务执行并提出升级建议
   * @param {Object} task - 任务信息
   * @param {Object} result - 执行结果
   * @param {Object} executionLog - 执行日志（可选）
   */
  async analyzeAndSuggest(task, result, executionLog = null) {
    const suggestions = []

    // 1. 分析任务结果，检测能力缺口
    const gaps = this.detectCapabilityGaps(task, result, executionLog)

    // 2. 为每个缺口生成升级建议
    for (const gap of gaps) {
      const suggestion = await this.generateSuggestion(gap, task)
      if (suggestion) {
        suggestions.push(suggestion)
      }
    }

    // 3. 去重（避免重复建议）
    const uniqueSuggestions = this.deduplicateSuggestions(suggestions)

    // 4. 记录建议历史
    this.recordSuggestions(uniqueSuggestions)

    return uniqueSuggestions
  }

  /**
   * 检测能力缺口
   */
  detectCapabilityGaps(task, result, executionLog) {
    const gaps = []

    // 1. 检测失败模式
    if (result && !result.success) {
      gaps.push({
        type: 'error',
        priority: 'high',
        description: `任务执行失败，可能需要增强错误处理能力`,
        context: {
          taskId: task.id,
          error: result.error
        }
      })
    }

    // 2. 检测超时情况
    if (result && result.elapsed && parseFloat(result.elapsed) > 60) {
      gaps.push({
        type: 'performance',
        priority: 'medium',
        description: '任务执行时间过长，可能需要性能优化',
        context: {
          taskId: task.id,
          elapsed: result.elapsed
        }
      })
    }

    // 3. 分析任务消息中的模式
    const messagePatterns = this.analyzeMessagePatterns(task.message)
    gaps.push(...messagePatterns)

    // 4. 检测重复任务
    const repetitiveTask = this.detectRepetitiveTask(task)
    if (repetitiveTask) {
      gaps.push(repetitiveTask)
    }

    return gaps
  }

  /**
   * 分析任务消息模式
   */
  analyzeMessagePatterns(message) {
    const gaps = []
    const lowerMessage = message.toLowerCase()

    // 检测外部工具需求
    const externalTools = [
      { pattern: /browser|web|网页|浏览器/, type: 'mcp', name: 'mcp-browser', desc: '浏览器自动化能力' },
      { pattern: /search|搜索|查找/, type: 'mcp', name: 'mcp-brave-search', desc: '搜索能力' },
      { pattern: /file|文件|读取|写入/, type: 'mcp', name: 'mcp-filesystem', desc: '文件系统操作能力' },
      { pattern: /git|版本|提交/, type: 'mcp', name: 'mcp-git', desc: 'Git 操作能力' },
      { pattern: /database|数据库|sql/, type: 'mcp', name: 'mcp-sqlite', desc: '数据库操作能力' },
      { pattern: /notify|通知|推送/, type: 'skill', name: 'notification', desc: '通知推送能力' },
      { pattern: /schedule|定时|周期/, type: 'skill', name: 'scheduler', desc: '定时任务能力' }
    ]

    for (const tool of externalTools) {
      if (tool.pattern.test(lowerMessage)) {
        // 检查是否已经有这个能力
        if (!this.hasCapability(tool.name)) {
          gaps.push({
            type: 'capability',
            priority: 'medium',
            description: `检测到可能需要${tool.desc}`,
            context: {
              toolType: tool.type,
              toolName: tool.name,
              matchedPattern: tool.pattern.source
            }
          })
        }
      }
    }

    // 检测复杂任务模式
    if (/(api|接口|rest)/i.test(message) && !this.hasCapability('api-client')) {
      gaps.push({
        type: 'skill',
        priority: 'low',
        description: '可能需要 API 客户端能力',
        context: {
          matchedKeyword: 'api'
        }
      })
    }

    return gaps
  }

  /**
   * 检测重复任务
   */
  detectRepetitiveTask(task) {
    // 检查最近是否有相似的任务
    const recentUpgrades = this.evolution.getRecentUpgrades(20)
    const similarUpgrade = recentUpgrades.find(u =>
      u.description.includes(task.name) ||
      (u.details && u.details.taskId === task.id)
    )

    if (similarUpgrade) {
      return {
        type: 'optimization',
        priority: 'low',
        description: `检测到相似任务重复执行，建议考虑自动化`,
        context: {
          taskId: task.id,
          similarUpgrade: similarUpgrade.id
        }
      }
    }

    return null
  }

  /**
   * 检查是否已有某个能力
   */
  hasCapability(name) {
    // 检查插件
    if (this.server.pluginManager && this.server.pluginManager.hasPlugin(name)) {
      return true
    }

    // 检查进化记录
    const upgrades = this.evolution.getUpgradesByType('mcp')
    if (upgrades.some(u => u.name === name)) {
      return true
    }

    // 检查技能
    const skills = this.evolution.getUpgradesByType('skill')
    if (skills.some(s => s.name === name)) {
      return true
    }

    return false
  }

  /**
   * 生成升级建议
   */
  async generateSuggestion(gap, task) {
    // 根据缺口类型生成具体建议
    let suggestion = {
      id: this.generateSuggestionId(),
      timestamp: new Date().toISOString(),
      priority: gap.priority,
      type: gap.type,
      description: gap.description,
      context: gap.context,
      task: {
        id: task.id,
        name: task.name
      }
    }

    // 根据类型添加具体的升级建议
    switch (gap.type) {
      case 'capability':
        suggestion.upgrade = {
          type: gap.context.toolType || 'mcp',
          action: 'add',
          name: gap.context.toolName,
          description: `添加${gap.description}`,
          details: {
            usage: `安装并配置 ${gap.context.toolName}`,
            scope: '系统级别'
          }
        }
        break

      case 'skill':
        suggestion.upgrade = {
          type: 'skill',
          action: 'add',
          name: gap.context?.matchedKeyword || 'custom-skill',
          description: gap.description,
          details: {
            usage: '创建自定义技能模块',
            scope: '项目级别'
          }
        }
        break

      case 'performance':
        suggestion.upgrade = {
          type: 'config',
          action: 'update',
          name: 'performance-optimization',
          description: gap.description,
          details: {
            usage: '优化相关配置参数',
            scope: '配置级别'
          }
        }
        break

      case 'error':
        suggestion.upgrade = {
          type: 'capability',
          action: 'update',
          name: 'error-handling',
          description: gap.description,
          details: {
            usage: '增强错误处理和恢复机制',
            scope: '系统级别',
            error: gap.context?.error
          }
        }
        break

      case 'optimization':
        suggestion.upgrade = {
          type: 'skill',
          action: 'add',
          name: 'task-automation',
          description: gap.description,
          details: {
            usage: '创建自动化任务处理流程',
            scope: '项目级别'
          }
        }
        break
    }

    return suggestion
  }

  /**
   * 去重建议
   */
  deduplicateSuggestions(suggestions) {
    const seen = new Set()
    return suggestions.filter(s => {
      const key = `${s.type}-${s.description}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
  }

  /**
   * 记录建议历史
   */
  recordSuggestions(suggestions) {
    this.suggestionHistory.unshift(...suggestions)

    // 限制历史大小
    if (this.suggestionHistory.length > this.maxHistorySize) {
      this.suggestionHistory = this.suggestionHistory.slice(0, this.maxHistorySize)
    }
  }

  /**
   * 获取最近的建议
   */
  getRecentSuggestions(limit = 10) {
    return this.suggestionHistory.slice(0, limit)
  }

  /**
   * 应用建议（执行升级）
   */
  async applySuggestion(suggestion) {
    if (!suggestion.upgrade) {
      throw new Error('建议没有包含升级信息')
    }

    this.logger.info('EVOLUTION', `正在应用升级建议: ${suggestion.description}`)

    try {
      // 记录升级
      const entry = await this.evolution.recordUpgrade(suggestion.upgrade)

      // 标记建议已应用
      suggestion.applied = true
      suggestion.appliedAt = new Date().toISOString()
      suggestion.upgradeId = entry.id

      this.logger.success('EVOLUTION', `升级建议已应用: ${entry.id}`)

      return {
        success: true,
        entry,
        suggestion
      }
    } catch (error) {
      this.logger.error('EVOLUTION', '应用升级建议失败', { error: error.message })
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 格式化建议为可读文本
   */
  formatSuggestions(suggestions) {
    if (suggestions.length === 0) {
      return '当前没有升级建议'
    }

    const lines = ['💡 系统分析发现以下升级建议：', '']

    suggestions.forEach((s, idx) => {
      const priorityIcon = {
        high: '🔴',
        medium: '🟡',
        low: '🟢'
      }[s.priority] || '⚪'

      lines.push(`${idx + 1}. ${priorityIcon} **${s.description}**`)
      if (s.upgrade) {
        lines.push(`   - 类型: ${s.upgrade.type}`)
        lines.push(`   - 操作: ${s.upgrade.action}`)
        lines.push(`   - 名称: ${s.upgrade.name}`)
      }
      lines.push('')
    })

    lines.push('---')
    lines.push('如需应用某个建议，请回复对应的序号')

    return lines.join('\n')
  }

  /**
   * 生成建议ID
   */
  generateSuggestionId() {
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).slice(2, 5)
    return `suggestion-${timestamp}-${random}`
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const stats = {
      totalSuggestions: this.suggestionHistory.length,
      byType: {},
      byPriority: {},
      applied: 0,
      pending: 0
    }

    for (const suggestion of this.suggestionHistory) {
      stats.byType[suggestion.type] = (stats.byType[suggestion.type] || 0) + 1
      stats.byPriority[suggestion.priority] = (stats.byPriority[suggestion.priority] || 0) + 1

      if (suggestion.applied) {
        stats.applied++
      } else {
        stats.pending++
      }
    }

    return stats
  }
}

module.exports = IntelligentUpgrader
