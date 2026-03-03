/**
 * 常量定义
 * 统一管理所有的魔术字符串和枚举值
 */

// 命令类型
const CommandTypes = {
  SWITCH: 'switch',
  INTERRUPT: 'interrupt',
  STATUS: 'status',
  HELP: 'help',
  MEMORY_LOAD: 'memory_load',
  MEMORY_SEARCH: 'memory_search',
  MEMORY_STATS: 'memory_stats',
  MEMORY_TAG: 'memory_tag'
}

// 提供商
const Providers = {
  CLAUDE: 'claude',
  IFLOW: 'iflow'
}

// 消息类型
const MessageTypes = {
  TEXT: 'text',
  MARKDOWN: 'markdown'
}

// 事件类型
const EventTypes = {
  SESSION_END: 'session_end',
  ASSISTANT: 'assistant',
  RESULT: 'result',
  THINKING: 'thinking',
  TOOL_START: 'tool_start',
  TOOL_OUTPUT: 'tool_output',
  SYSTEM: 'system'
}

// 记忆标签
const MemoryTags = {
  USER: 'user',
  ASSISTANT: 'assistant',
  MESSAGE: 'message',
  RESPONSE: 'response'
}

// 总结层级
const SummaryLevels = {
  LEVEL_0: 0, // 1小时
  LEVEL_1: 1, // 1天
  LEVEL_2: 2, // 1周
  LEVEL_3: 3, // 1月
  LEVEL_4: 4  // 1季度
}

module.exports = {
  CommandTypes,
  Providers,
  MessageTypes,
  EventTypes,
  MemoryTags,
  SummaryLevels
}
