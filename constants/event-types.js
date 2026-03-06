/**
 * 事件类型常量
 * 统一管理所有事件类型字符串
 */

const EventTypes = {
  // 会话事件
  SESSION_END: 'session_end',
  SESSION_START: 'session_start',

  // AI 响应事件
  ASSISTANT: 'assistant',
  THINKING: 'thinking',
  RESULT: 'result',

  // 工具事件
  TOOL_START: 'tool_start',
  TOOL_OUTPUT: 'tool_output',
  TOOL_END: 'tool_end',

  // 系统事件
  SYSTEM: 'system',
  ERROR: 'error'
}

module.exports = { EventTypes }
