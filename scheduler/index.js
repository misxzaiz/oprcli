/**
 * 定时任务调度模块
 * 提供任务调度功能，Agent 自主决定是否通知
 */

const TaskManager = require('./task-manager')

class SchedulerModule {
  constructor(server, logger) {
    this.server = server
    this.logger = logger
    this.taskManager = null
    this.enabled = false
  }

  async start() {
    this.taskManager = new TaskManager(this.server, this.logger)
    await this.taskManager.start()
    this.enabled = this.taskManager.enabled
  }

  stop() {
    if (this.taskManager) {
      this.taskManager.stop()
    }
  }

  getStatus() {
    return this.taskManager?.getStatus() || { enabled: false }
  }
}

module.exports = SchedulerModule
