/**
 * 永久记忆系统 MVP
 *
 * 功能：
 * - 基础 CRUD 操作
 * - 分层总结（最多5层）
 * - 搜索功能
 * - load 命令触发总结
 */

const fs = require('fs')
const path = require('path')

class MemorySystem {
  constructor(dataDir = null) {
    // 数据目录
    this.dataDir = dataDir || path.join(__dirname, '../data/memory')
    this._ensureDir()

    // 存储路径
    this.rawMemoriesPath = path.join(this.dataDir, 'raw-memories.json')
    this.summariesPath = path.join(this.dataDir, 'summaries.json')

    // 加载数据
    this.rawMemories = this._loadJson(this.rawMemoriesPath, [])
    this.summaries = this._loadJson(this.summariesPath, [])

    // 配置
    this.maxSummaryLevels = 5
    this.summaryThresholds = [
      { level: 0, hours: 1, name: '1小时' },    // 最新，详细
      { level: 1, hours: 24, name: '1天' },     // 1天范围
      { level: 2, hours: 168, name: '1周' },    // 1周范围 (7*24)
      { level: 3, hours: 720, name: '1月' },    // 1月范围 (30*24)
      { level: 4, hours: 2160, name: '1季度' }  // 1季度范围 (90*24)
    ]
  }

  // ==================== 基础 CRUD ====================

  /**
   * 创建新记忆
   * @param {string} content - 记忆内容
   * @param {Array<string>} tags - 标签
   * @returns {Object} - 创建的记忆对象
   */
  createMemory(content, tags = []) {
    const memory = {
      id: this._generateId(),
      content: content.trim(),
      tags: Array.isArray(tags) ? tags : [tags],
      created_at: new Date().toISOString(),
      summary_id: null  // 是否已被总结
    }

    this.rawMemories.push(memory)
    this._saveJson(this.rawMemoriesPath, this.rawMemories)
    return memory
  }

  /**
   * 获取记忆
   * @param {string} id - 记忆ID
   * @returns {Object|null} - 记忆对象或null
   */
  getMemory(id) {
    return this.rawMemories.find(m => m.id === id) || null
  }

  /**
   * 更新记忆
   * @param {string} id - 记忆ID
   * @param {string} content - 新内容
   * @param {Array<string>} tags - 新标签
   * @returns {boolean} - 是否成功
   */
  updateMemory(id, content, tags = null) {
    const memory = this.rawMemories.find(m => m.id === id)
    if (!memory) return false

    if (content !== null && content !== undefined) {
      memory.content = content.trim()
    }
    if (tags !== null && tags !== undefined) {
      memory.tags = Array.isArray(tags) ? tags : [tags]
    }
    memory.updated_at = new Date().toISOString()

    this._saveJson(this.rawMemoriesPath, this.rawMemories)
    return true
  }

  /**
   * 删除记忆（软删除）
   * @param {string} id - 记忆ID
   * @returns {boolean} - 是否成功
   */
  deleteMemory(id) {
    const index = this.rawMemories.findIndex(m => m.id === id)
    if (index === -1) return false

    // 软删除：标记为删除
    this.rawMemories[index].deleted = true
    this.rawMemories[index].deleted_at = new Date().toISOString()

    this._saveJson(this.rawMemoriesPath, this.rawMemories)
    return true
  }

  /**
   * 搜索记忆
   * @param {string} query - 搜索关键词
   * @param {Object} options - 选项 {limit, tags, startDate, endDate}
   * @returns {Array} - 匹配的记忆列表
   */
  searchMemories(query, options = {}) {
    // 预编译搜索条件
    const lowerQuery = query ? query.toLowerCase() : null
    const hasTags = options.tags && options.tags.length > 0
    const hasDateRange = options.startDate || options.endDate
    const startDate = options.startDate ? new Date(options.startDate) : null
    const endDate = options.endDate ? new Date(options.endDate) : null

    // 单次过滤通过所有条件
    let results = this.rawMemories.filter(m => {
      // 基础过滤：未删除
      if (m.deleted) return false

      // 关键词搜索
      if (lowerQuery) {
        const contentMatch = m.content.toLowerCase().includes(lowerQuery)
        const tagMatch = m.tags.some(t => t.toLowerCase().includes(lowerQuery))
        if (!contentMatch && !tagMatch) return false
      }

      // 标签过滤
      if (hasTags) {
        if (!options.tags.some(tag => m.tags.includes(tag))) return false
      }

      // 时间范围过滤
      if (hasDateRange) {
        const date = new Date(m.created_at)
        if (startDate && date < startDate) return false
        if (endDate && date > endDate) return false
      }

      return true
    })

    // 按时间排序（最新的在前）
    results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    // 限制数量（在排序之后）
    if (options.limit) {
      results = results.slice(0, options.limit)
    }

    return results
  }

  // ==================== 总结系统 ====================

  /**
   * 获取未总结的记忆
   * @returns {Array} - 未总结的记忆列表
   */
  getUnsummarizedMemories() {
    return this.rawMemories.filter(m =>
      !m.deleted && !m.summary_id
    ).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  }

  /**
   * 创建总结
   * @param {Array} memories - 要总结的记忆列表
   * @param {number} level - 总结层级 (0-4)
   * @param {string} content - 总结内容
   * @returns {Object} - 创建的总结对象
   */
  createSummary(memories, level, content) {
    if (memories.length === 0) return null

    const timestamps = memories.map(m => new Date(m.created_at))
    const timeRange = {
      start: new Date(Math.min(...timestamps)).toISOString(),
      end: new Date(Math.max(...timestamps)).toISOString()
    }

    const summary = {
      id: this._generateId(),
      level: level,
      content: content.trim(),
      time_range: timeRange,
      memory_count: memories.length,
      memory_ids: memories.map(m => m.id),
      parent_summary_id: null,
      child_summary_ids: [],
      created_at: new Date().toISOString()
    }

    // 更新记忆的总结标记
    memories.forEach(memory => {
      memory.summary_id = summary.id
    })

    this.summaries.push(summary)
    this._saveData()
    return summary
  }

  /**
   * 按层级获取总结
   * @param {number} level - 层级 (0-4)
   * @returns {Array} - 该层级的总结列表
   */
  getSummariesByLevel(level) {
    return this.summaries.filter(s => s.level === level && !s.deleted)
      .sort((a, b) => new Date(b.time_range.end) - new Date(a.time_range.end))
  }

  /**
   * 获取所有总结（按层级组织）
   * @returns {Object} - {0: [], 1: [], ...}
   */
  getAllSummaries() {
    const result = {}
    for (let i = 0; i < this.maxSummaryLevels; i++) {
      result[i] = this.getSummariesByLevel(i)
    }
    return result
  }

  /**
   * 合并多个总结为更高层级的总结
   * @param {Array} summaries - 要合并的总结列表
   * @param {number} newLevel - 新的层级
   * @param {string} content - 合并后的总结内容
   * @returns {Object} - 新的总结对象
   */
  mergeSummaries(summaries, newLevel, content) {
    if (summaries.length === 0) return null

    const allMemoryIds = summaries.flatMap(s => s.memory_ids)
    const allTimeRanges = summaries.map(s => s.time_range)
    const timeRange = {
      start: new Date(Math.min(...allTimeRanges.map(tr => new Date(tr.start)))).toISOString(),
      end: new Date(Math.max(...allTimeRanges.map(tr => new Date(tr.end)))).toISOString()
    }

    const newSummary = {
      id: this._generateId(),
      level: newLevel,
      content: content.trim(),
      time_range: timeRange,
      memory_count: allMemoryIds.length,
      memory_ids: allMemoryIds,
      parent_summary_id: null,
      child_summary_ids: summaries.map(s => s.id),
      created_at: new Date().toISOString()
    }

    // 更新子总结的父引用
    summaries.forEach(summary => {
      summary.parent_summary_id = newSummary.id
      summary.deleted = true  // 标记为已合并
      summary.deleted_at = new Date().toISOString()
    })

    this.summaries.push(newSummary)
    this._saveData()
    return newSummary
  }

  // ==================== Load 命令处理 ====================

  /**
   * 处理 load 命令
   * 1. 总结未总结的记忆
   * 2. 整合已总结的记忆
   * 3. 返回结果
   * @returns {Object} - 处理结果
   */
  async handleLoad() {
    const result = {
      raw_memories_count: this.rawMemories.filter(m => !m.deleted).length,
      unsummarized_count: 0,
      new_summaries: [],
      merged_summaries: [],
      current_state: this.getAllSummaries()
    }

    // 1. 总结未总结的记忆
    const unsummarized = this.getUnsummarizedMemories()
    result.unsummarized_count = unsummarized.length

    if (unsummarized.length > 0) {
      // 按时间分组总结
      const level0Summaries = await this._summarizeMemoriesByLevel(unsummarized, 0)
      result.new_summaries = level0Summaries
    }

    // 2. 整合总结（从低层级到高层级）
    for (let level = 0; level < this.maxSummaryLevels - 1; level++) {
      const currentLevelSummaries = this.getSummariesByLevel(level)
      const threshold = this.summaryThresholds[level]
      const nextThreshold = this.summaryThresholds[level + 1]

      // 检查是否需要合并
      if (currentLevelSummaries.length >= 2) {
        // 按时间分组，每个组合并为一个更高层级的总结
        const groups = this._groupSummariesByTime(currentLevelSummaries, nextThreshold.hours)
        const merged = []

        for (const group of groups) {
          if (group.length > 1) {
            // 需要合并
            const mergedContent = this._generateMergeSummary(group, level + 1)
            const newSummary = this.mergeSummaries(group, level + 1, mergedContent)
            if (newSummary) {
              merged.push(newSummary)
            }
          }
        }

        if (merged.length > 0) {
          result.merged_summaries.push(...merged)
        }
      }
    }

    // 更新最终状态
    result.current_state = this.getAllSummaries()

    return result
  }

  /**
   * 按层级总结记忆
   * @param {Array} memories - 记忆列表
   * @param {number} level - 层级
   * @returns {Array} - 创建的总结列表
   */
  async _summarizeMemoriesByLevel(memories, level) {
    const threshold = this.summaryThresholds[level]
    const groups = this._groupMemoriesByTime(memories, threshold.hours)
    const summaries = []

    for (const group of groups) {
      const summaryContent = this._generateSummaryContent(group, level)
      const summary = this.createSummary(group, level, summaryContent)
      if (summary) {
        summaries.push(summary)
      }
    }

    return summaries
  }

  /**
   * 按时间范围分组项目（通用方法）
   * @param {Array} items - 项目列表
   * @param {number} hours - 时间范围（小时）
   * @param {Function} timeGetter - 获取项目时间的函数
   * @returns {Array<Array>} - 分组后的项目列表
   */
  _groupByTime(items, hours, timeGetter) {
    if (items.length === 0) return []

    const groups = []
    const windowMs = hours * 60 * 60 * 1000
    let currentGroup = [items[0]]
    let groupStartTime = timeGetter(items[0]).getTime()

    for (let i = 1; i < items.length; i++) {
      const itemTime = timeGetter(items[i]).getTime()

      if (itemTime - groupStartTime <= windowMs) {
        currentGroup.push(items[i])
      } else {
        groups.push(currentGroup)
        currentGroup = [items[i]]
        groupStartTime = itemTime
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup)
    }

    return groups
  }

  /**
   * 按时间范围分组记忆
   * @param {Array} memories - 记忆列表
   * @param {number} hours - 时间范围（小时）
   * @returns {Array<Array>} - 分组后的记忆列表
   */
  _groupMemoriesByTime(memories, hours) {
    return this._groupByTime(memories, hours, m => new Date(m.created_at))
  }

  /**
   * 按时间范围分组总结
   * @param {Array} summaries - 总结列表
   * @param {number} hours - 时间范围（小时）
   * @returns {Array<Array>} - 分组后的总结列表
   */
  _groupSummariesByTime(summaries, hours) {
    return this._groupByTime(summaries, hours, s => new Date(s.time_range.start))
  }

  /**
   * 生成总结内容
   * @param {Array} memories - 记忆列表
   * @param {number} level - 层级
   * @returns {string} - 总结内容
   */
  _generateSummaryContent(memories, level) {
    const threshold = this.summaryThresholds[level]
    const count = memories.length
    const timestamps = memories.map(m => new Date(m.created_at))
    const timeRange = {
      start: new Date(Math.min(...timestamps)),
      end: new Date(Math.max(...timestamps))
    }

    // 提取关键信息
    const allTags = [...new Set(memories.flatMap(m => m.tags))]
    const contents = memories.map(m => m.content)

    let summary = `## ${threshold.name}总结 (${count}条记录)\n`
    summary += `时间范围: ${timeRange.start.toLocaleString('zh-CN')} - ${timeRange.end.toLocaleString('zh-CN')}\n\n`

    if (level <= 1) {
      // 详细级别：包含所有内容摘要
      summary += `### 内容摘要\n`
      contents.forEach((content, idx) => {
        summary += `${idx + 1}. ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}\n`
      })
    } else if (level <= 2) {
      // 中等级别：主要事件
      summary += `### 主要事件\n`
      contents.slice(0, 5).forEach((content, idx) => {
        summary += `- ${content.substring(0, 50)}...\n`
      })
      if (contents.length > 5) {
        summary += `- 还有 ${contents.length - 5} 条记录...\n`
      }
    } else {
      // 高级别：概要统计
      summary += `### 概要\n`
      summary += `- 共 ${count} 条记录\n`
      summary += `- 主要标签: ${allTags.slice(0, 3).join(', ')}\n`
    }

    if (allTags.length > 0) {
      summary += `\n### 标签\n${allTags.join(', ')}\n`
    }

    return summary
  }

  /**
   * 生成合并总结
   * @param {Array} summaries - 总结列表
   * @param {number} newLevel - 新层级
   * @returns {string} - 合并后的总结内容
   */
  _generateMergeSummary(summaries, newLevel) {
    const threshold = this.summaryThresholds[newLevel]
    const totalMemories = summaries.reduce((sum, s) => sum + s.memory_count, 0)

    let merged = `## ${threshold.name}总结 (合并${summaries.length}个总结，共${totalMemories}条记录)\n\n`

    if (newLevel <= 2) {
      // 详细级别：包含各个总结的要点
      summaries.forEach((summary, idx) => {
        merged += `### ${idx + 1}. ${summary.time_range.start.toLocaleString('zh-CN')} - ${summary.time_range.end.toLocaleString('zh-CN')}\n`
        merged += `${summary.content.substring(0, 200)}...\n\n`
      })
    } else {
      // 高级别：概要
      merged += `### 合并概要\n`
      summaries.forEach((summary, idx) => {
        merged += `${idx + 1}. ${new Date(summary.time_range.start).toLocaleString('zh-CN')} (${summary.memory_count}条记录)\n`
      })
    }

    return merged
  }

  // ==================== 工具方法 ====================

  /**
   * 生成唯一ID
   * @returns {string} - 唯一ID
   */
  _generateId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }

  /**
   * 确保数据目录存在
   */
  _ensureDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true })
    }
  }

  /**
   * 加载JSON文件
   * @param {string} filepath - 文件路径
   * @param {*} defaultValue - 默认值
   * @returns {*} - 解析后的数据
   */
  _loadJson(filepath, defaultValue) {
    try {
      const content = fs.readFileSync(filepath, 'utf-8')
      return JSON.parse(content)
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`加载文件失败: ${filepath}`, error.message)
      }
      return defaultValue
    }
  }

  /**
   * 保存JSON文件
   * @param {string} filepath - 文件路径
   * @param {*} data - 要保存的数据
   */
  _saveJson(filepath, data) {
    try {
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8')
    } catch (error) {
      console.error(`保存文件失败: ${filepath}`, error.message)
    }
  }

  /**
   * 保存所有数据
   */
  _saveData() {
    this._saveJson(this.rawMemoriesPath, this.rawMemories)
    this._saveJson(this.summariesPath, this.summaries)
  }

  /**
   * 获取系统统计信息
   * @returns {Object} - 统计信息
   */
  getStats() {
    const activeRaw = this.rawMemories.filter(m => !m.deleted)
    const activeSummaries = this.summaries.filter(s => !s.deleted)

    return {
      raw_memories: {
        total: activeRaw.length,
        unsummarized: activeRaw.filter(m => !m.summary_id).length,
        summarized: activeRaw.filter(m => m.summary_id).length
      },
      summaries: {
        total: activeSummaries.length,
        by_level: Object.keys(this.getAllSummaries()).reduce((acc, level) => {
          acc[level] = this.getSummariesByLevel(parseInt(level)).length
          return acc
        }, {})
      },
      storage: {
        raw_size: JSON.stringify(this.rawMemories).length,
        summaries_size: JSON.stringify(this.summaries).length
      }
    }
  }
}

module.exports = MemorySystem
