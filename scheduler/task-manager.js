/**
 * 定时任务管理器
 * 负责任务调度和执行，Agent 自主处理通知
 * 
 * 🆕 自进化系统集成：
 * - 任务完成后自动检测升级指令
 * - 智能分析任务执行过程，提出升级建议
 */

const cron = require('node-cron')
const fs = require('fs').promises
const path = require('path')

class TaskManager {
  constructor(server, logger) {
    this.server = server
    this.logger = logger
    this.tasks = new Map()
    this.scheduledJobs = new Map()
    this.enabled = false
    this.configPath = null
    
    // 🆕 自进化系统
    this.evolutionEnabled = process.env.EVOLUTION_ENABLED !== 'false'
    this.autoSuggestUpgrades = process.env.EVOLUTION_AUTO_SUGGEST === 'true'
  }

  /**
   * 启动任务管理器
   */
  async start() {
    this.configPath = process.env.TASKS_FILE_PATH || './scheduler/tasks.json'
    await this.loadConfig()

    if (!this.enabled) {
      this.logger.info('SCHEDULER', '定时任务功能已禁用')
      return
    }

    await this.scheduleTasks()
    this.logger.success('SCHEDULER', `定时任务管理器已启动，已调度 ${this.scheduledJobs.size} 个任务`)
  }

  /**
   * 加载配置
   */
  async loadConfig() {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8')
      const data = JSON.parse(content)

      this.enabled = data.enabled === true

      if (!this.enabled) {
        this.tasks.clear()
        return
      }

      if (Array.isArray(data.tasks)) {
        data.tasks.forEach(task => {
          this.tasks.set(task.id, task)
        })
      }

      this.logger.info('SCHEDULER', `已加载 ${this.tasks.size} 个任务配置`)
    } catch (error) {
      this.logger.warning('SCHEDULER', '加载任务配置失败', {
        error: error.message
      })
      await this.createDefaultConfig()
    }
  }

  /**
   * 创建默认配置
   */
  async createDefaultConfig() {
    const defaultConfig = {
      enabled: false,
      tasks: [
        {
          id: "example-task",
          name: "示例定时任务",
          enabled: false,
          schedule: "0 9 * * *",
          provider: "claude",
          message: "这是一个示例任务"
        }
      ]
    }

    const configDir = path.dirname(this.configPath)
    await fs.mkdir(configDir, { recursive: true })
    await fs.writeFile(this.configPath, JSON.stringify(defaultConfig, null, 2))

    this.logger.info('SCHEDULER', `已创建默认配置: ${this.configPath}`)
  }

  /**
   * 调度所有任务
   */
  async scheduleTasks() {
    this.scheduledJobs.forEach(job => job.stop())
    this.scheduledJobs.clear()

    for (const [taskId, task] of this.tasks.entries()) {
      if (task.enabled) {
        await this.scheduleTask(taskId, task)
      }
    }
  }

  /**
   * 调度单个任务
   */
  async scheduleTask(taskId, task) {
    try {
      if (!cron.validate(task.schedule)) {
        this.logger.error('SCHEDULER', `任务 ${taskId} 的 cron 表达式无效: ${task.schedule}`)
        return
      }

      const cronJob = cron.schedule(task.schedule, async () => {
        await this.executeTask(task)
      })

      this.scheduledJobs.set(taskId, cronJob)

      this.logger.info('SCHEDULER', `任务已调度: ${task.name}`, {
        id: taskId,
        schedule: task.schedule
      })
    } catch (error) {
      this.logger.error('SCHEDULER', `任务 ${taskId} 调度失败`, {
        error: error.message
      })
    }
  }

  /**
   * 执行任务
   */
  async executeTask(task, manualTrigger = false) {
    const startTime = Date.now()
    const trigger = manualTrigger ? '手动触发' : '定时触发'

    this.logger.info('SCHEDULER', `========== ${trigger}: ${task.name} ==========`)

    try {
      const connector = this.server.connectors.get(task.provider)
      if (!connector || !connector.connected) {
        throw new Error(`${task.provider} 连接器不可用`)
      }

      this.logger.info('SCHEDULER', `使用 ${task.provider} 执行任务`)

      const result = await this.runTaskSession(connector, task.message, task)

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      this.logger.success('SCHEDULER', `任务 ${task.name} 完成，耗时: ${elapsed}s`)

      // 🆕 自进化系统：检查升级指令
      if (this.evolutionEnabled && this.server.evolution) {
        await this.checkForUpgrades(task, result)
      }

      return { success: true, elapsed, result }
    } catch (error) {
      this.logger.error('SCHEDULER', `任务 ${task.name} 失败`, {
        error: error.message
      })
      
      // 🆕 自进化系统：分析失败原因
      if (this.evolutionEnabled && this.server.intelligentUpgrader) {
        await this.analyzeFailure(task, error)
      }
      
      return { success: false, error: error.message }
    }
  }

  /**
   * 🆕 检查升级指令
   */
  async checkForUpgrades(task, result) {
    try {
      // 1. 解析任务消息中的升级指令
      const upgradeCmd = this.server.evolution.parseUpgradeCommand(task.message)

      if (upgradeCmd) {
        this.logger.info('EVOLUTION', `检测到升级指令: ${upgradeCmd.action} ${upgradeCmd.type} ${upgradeCmd.name}`)

        // 记录升级
        await this.server.evolution.recordUpgrade(upgradeCmd)

        this.logger.success('EVOLUTION', '升级指令已执行并记录')
      }

      // 2. 智能升级建议（如果启用）
      if (this.autoSuggestUpgrades && this.server.intelligentUpgrader) {
        const suggestions = await this.server.intelligentUpgrader.analyzeAndSuggest(task, result)

        if (suggestions.length > 0) {
          this.logger.info('EVOLUTION', `发现 ${suggestions.length} 个升级建议`)

          // 记录建议到上下文记忆
          if (this.server.contextMemory) {
            await this.server.contextMemory.set(
              `suggestions:${task.id}`,
              {
                taskId: task.id,
                suggestions,
                timestamp: Date.now()
              },
              { ttl: 24 * 60 * 60 * 1000 }  // 保留1天
            )
          }

          // 自动应用高优先级建议
          const highPrioritySuggestions = suggestions.filter(s => s.priority === 'high')

          for (const suggestion of highPrioritySuggestions.slice(0, 1)) {  // 只自动应用第一个高优先级建议
            this.logger.info('EVOLUTION', `自动应用高优先级建议: ${suggestion.description}`)
            await this.server.intelligentUpgrader.applySuggestion(suggestion)
          }
        }
      }
    } catch (error) {
      this.logger.error('EVOLUTION', '检查升级失败', { error: error.message })
    }
  }

  /**
   * 🆕 分析任务失败原因
   */
  async analyzeFailure(task, error) {
    try {
      const suggestion = await this.server.intelligentUpgrader.analyzeAndSuggest(task, {
        success: false,
        error: error.message
      })

      if (suggestion.length > 0) {
        this.logger.info('EVOLUTION', `失败分析完成，发现 ${suggestion.length} 个改进建议`)
      }
    } catch (err) {
      this.logger.error('EVOLUTION', '失败分析出错', { error: err.message })
    }
  }

  /**
   * 运行会话
   */
  async runTaskSession(connector, message, task) {
    return new Promise((resolve, reject) => {
      let eventCount = 0

      const options = {
        onEvent: (event) => {
          eventCount++
          if (eventCount <= 3) {
            this.logger.debug('SCHEDULER', `[${task.id}] ${event.type}`)
          }
        },
        onComplete: (exitCode) => {
          this.logger.info('SCHEDULER', `[${task.id}] 会话完成，退出码: ${exitCode}`)
          resolve({
            success: exitCode === 0,
            eventCount,
            exitCode
          })
        },
        onError: (error) => {
          reject(error)
        }
      }

      connector._startSessionInternal(message, options)
    })
  }

  /**
   * 手动执行任务
   */
  async runTask(taskId) {
    const task = this.tasks.get(taskId)
    if (!task) {
      throw new Error(`任务不存在: ${taskId}`)
    }
    return await this.executeTask(task, true)
  }

  /**
   * 启用任务
   */
  enableTask(taskId) {
    const task = this.tasks.get(taskId)
    if (!task) throw new Error(`任务不存在: ${taskId}`)

    task.enabled = true
    this.scheduleTask(taskId, task)
    this.logger.success('SCHEDULER', `任务已启用: ${task.name}`)
  }

  /**
   * 禁用任务
   */
  disableTask(taskId) {
    const task = this.tasks.get(taskId)
    if (!task) throw new Error(`任务不存在: ${taskId}`)

    task.enabled = false

    const job = this.scheduledJobs.get(taskId)
    if (job) {
      job.stop()
      this.scheduledJobs.delete(taskId)
    }

    this.logger.success('SCHEDULER', `任务已禁用: ${task.name}`)
  }

  /**
   * 重载配置
   */
  async reload() {
    this.scheduledJobs.forEach(job => job.stop())
    this.scheduledJobs.clear()
    this.tasks.clear()

    await this.loadConfig()
    await this.start()

    this.logger.success('SCHEDULER', '任务配置已重载')
  }

  /**
   * 获取状态
   */
  getStatus() {
    return {
      enabled: this.enabled,
      configPath: this.configPath,
      totalTasks: this.tasks.size,
      enabledTasks: Array.from(this.tasks.values()).filter(t => t.enabled).length,
      scheduledJobs: this.scheduledJobs.size,
      tasks: Array.from(this.tasks.values()).map(task => ({
        id: task.id,
        name: task.name,
        enabled: task.enabled,
        scheduled: this.scheduledJobs.has(task.id),
        schedule: task.schedule,
        provider: task.provider
      }))
    }
  }

  /**
   * 验证任务配置
   */
  validateTask(task) {
    const errors = []

    // ID 校验
    if (!task.id || typeof task.id !== 'string') {
      errors.push('任务ID必须是非空字符串')
    } else if (task.id.length > 50) {
      errors.push('任务ID长度不能超过50个字符')
    } else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(task.id)) {
      errors.push('任务ID格式错误，建议使用 kebab-case（如：daily-weather）')
    }

    // 名称校验
    if (!task.name || typeof task.name !== 'string') {
      errors.push('任务名称必须是非空字符串')
    } else if (task.name.length > 100) {
      errors.push('任务名称长度不能超过100个字符')
    }

    // Cron 表达式校验
    if (!task.schedule || typeof task.schedule !== 'string') {
      errors.push('Cron表达式必须是字符串')
    } else if (!cron.validate(task.schedule)) {
      errors.push('Cron表达式无效')
    }

    // 消息校验
    if (!task.message || typeof task.message !== 'string') {
      errors.push('任务消息必须是非空字符串')
    }

    // Provider 校验（可选）
    if (task.provider && !['claude', 'iflow'].includes(task.provider)) {
      errors.push('Provider 必须是 claude 或 iflow')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * 添加新任务
   */
  async addTask(taskConfig) {
    // 参数校验
    const validation = this.validateTask(taskConfig)
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join('; ')
      }
    }

    // 检查ID唯一性
    if (this.tasks.has(taskConfig.id)) {
      return {
        success: false,
        error: `任务ID已存在: ${taskConfig.id}`
      }
    }

    // 构建任务对象
    const task = {
      id: taskConfig.id,
      name: taskConfig.name,
      schedule: taskConfig.schedule,
      message: taskConfig.message,
      provider: taskConfig.provider || 'claude',
      enabled: true,
      createdAt: new Date().toISOString()
    }

    try {
      // 添加到内存
      this.tasks.set(task.id, task)

      // 保存配置
      await this.saveConfig()

      // 如果全局启用且任务启用，立即调度
      if (this.enabled && task.enabled) {
        await this.scheduleTask(task.id, task)
      }

      this.logger.success('SCHEDULER', `任务已添加: ${task.name}`, {
        id: task.id,
        schedule: task.schedule
      })

      return {
        success: true,
        task: {
          id: task.id,
          name: task.name,
          schedule: task.schedule,
          enabled: task.enabled
        }
      }
    } catch (error) {
      // 回滚
      this.tasks.delete(task.id)
      return {
        success: false,
        error: `添加任务失败: ${error.message}`
      }
    }
  }

  /**
   * 删除任务
   */
  async removeTask(taskId) {
    const task = this.tasks.get(taskId)
    if (!task) {
      return {
        success: false,
        error: `任务不存在: ${taskId}`
      }
    }

    try {
      // 停止调度（如果在运行）
      const job = this.scheduledJobs.get(taskId)
      if (job) {
        job.stop()
        this.scheduledJobs.delete(taskId)
      }

      // 从内存删除
      this.tasks.delete(taskId)

      // 保存配置
      await this.saveConfig()

      this.logger.success('SCHEDULER', `任务已删除: ${task.name}`, {
        id: taskId
      })

      return {
        success: true,
        message: `任务 "${task.name}" 已删除`
      }
    } catch (error) {
      return {
        success: false,
        error: `删除任务失败: ${error.message}`
      }
    }
  }

  /**
   * 更新任务
   */
  async updateTask(taskId, updates) {
    const task = this.tasks.get(taskId)
    if (!task) {
      return {
        success: false,
        error: `任务不存在: ${taskId}`
      }
    }

    try {
      // 停止现有调度
      const job = this.scheduledJobs.get(taskId)
      if (job) {
        job.stop()
        this.scheduledJobs.delete(taskId)
      }

      // 应用更新
      const updatedTask = {
        ...task,
        ...updates,
        id: task.id, // ID不允许修改
        createdAt: task.createdAt,
        updatedAt: new Date().toISOString()
      }

      // 验证更新后的任务
      const validation = this.validateTask(updatedTask)
      if (!validation.valid) {
        // 恢复原调度
        if (task.enabled) {
          await this.scheduleTask(taskId, task)
        }
        return {
          success: false,
          error: validation.errors.join('; ')
        }
      }

      // 更新内存
      this.tasks.set(taskId, updatedTask)

      // 保存配置
      await this.saveConfig()

      // 重新调度（如果启用）
      if (this.enabled && updatedTask.enabled) {
        await this.scheduleTask(taskId, updatedTask)
      }

      this.logger.success('SCHEDULER', `任务已更新: ${updatedTask.name}`, {
        id: taskId
      })

      return {
        success: true,
        task: {
          id: updatedTask.id,
          name: updatedTask.name,
          schedule: updatedTask.schedule,
          enabled: updatedTask.enabled
        }
      }
    } catch (error) {
      // 尝试恢复
      if (task.enabled) {
        await this.scheduleTask(taskId, task)
      }
      return {
        success: false,
        error: `更新任务失败: ${error.message}`
      }
    }
  }

  /**
   * 保存配置到文件
   */
  async saveConfig() {
    const config = {
      enabled: this.enabled,
      tasks: Array.from(this.tasks.values())
    }

    try {
      await fs.writeFile(this.configPath, JSON.stringify(config, null, 2))
    } catch (error) {
      if (error.code === 'ENOENT') {
        // 目录不存在，创建目录
        await fs.mkdir(path.dirname(this.configPath), { recursive: true })
        await fs.writeFile(this.configPath, JSON.stringify(config, null, 2))
      } else {
        throw error
      }
    }
  }

  /**
   * 停止管理器
   */
  stop() {
    this.scheduledJobs.forEach(job => job.stop())
    this.scheduledJobs.clear()
    this.logger.info('SCHEDULER', '任务管理器已停止')
  }
}

module.exports = TaskManager
