/**
 * 命令常量
 * 统一管理所有命令字符串
 */

const Commands = {
  // 模型切换
  SWITCH_TO_CLAUDE: 'claude',
  SWITCH_TO_IFLOW: 'iflow',

  // 任务控制
  INTERRUPT: ['end', '停止', 'stop'],

  // 信息查询
  STATUS: ['status', '状态'],
  HELP: ['help', '帮助']
}

const CommandTypes = {
  SWITCH: 'switch',
  INTERRUPT: 'interrupt',
  STATUS: 'status',
  HELP: 'help'
}

module.exports = {
  Commands,
  CommandTypes
}
