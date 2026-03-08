const COMMANDS = {
  // Provider 切换命令 - 支持参数: [-r] [自定义提示词]
  // /claude             - 切换到 claude，使用默认提示词
  // /claude 你是助手    - 切换 + 拼接提示词
  // /claude -r 你是助手 - 切换 + 替换提示词
  claude: { type: 'switch', provider: 'claude', hasArg: true },
  iflow: { type: 'switch', provider: 'iflow', hasArg: true },
  codex: { type: 'switch', provider: 'codex', hasArg: true },
  agent: { type: 'switch', provider: 'agent', hasArg: true },

  // 中断命令
  end: { type: 'interrupt' },
  '停止': { type: 'interrupt' },
  stop: { type: 'interrupt' },

  // 重启命令
  restart: { type: 'restart' },
  rs: { type: 'restart' },
  '重启': { type: 'restart' },

  // 状态和帮助
  status: { type: 'status' },
  '状态': { type: 'status' },
  help: { type: 'help' },
  '帮助': { type: 'help' },

  // 路径设置
  path: { type: 'path', hasArg: true },
  '路径': { type: 'path', hasArg: true },

  // 任务管理
  tasks: { type: 'tasks_list' },
  'tasks status': { type: 'tasks_status' },
  'tasks reload': { type: 'tasks_reload' },
  'tasks run': { type: 'tasks_run', hasArg: true },
  'tasks enable': { type: 'tasks_enable', hasArg: true },
  'tasks disable': { type: 'tasks_disable', hasArg: true },

  // 会话管理
  sessions: { type: 'sessions_list' },
  '会话': { type: 'sessions_list' },
  resume: { type: 'sessions_resume', hasArg: true },
  '继续': { type: 'sessions_resume', hasArg: true },
  '恢复': { type: 'sessions_resume', hasArg: true }
}

function parseCommand(content, logger) {
  let trimmed = (content || '').trim()

  if (logger?.debug) {
    logger.debug('COMMAND', `Raw input: "${content}"`)
    logger.debug('COMMAND', `After trim: "${trimmed}"`)
  }

  if (trimmed.startsWith('/')) {
    trimmed = trimmed.substring(1).trim()
    logger?.debug?.('COMMAND', `Strip slash: "${trimmed}"`)
  }

  const parts = trimmed.split(/\s+/)
  logger?.debug?.('COMMAND', `Split parts: [${parts.map(p => `"${p}"`).join(', ')}]`)

  for (let i = Math.min(parts.length, 3); i >= 1; i--) {
    const candidate = parts.slice(0, i).join(' ').toLowerCase()
    const cmdConfig = COMMANDS[candidate]
    if (cmdConfig) {
      return {
        ...cmdConfig,
        original: candidate,
        arg: parts.length > i ? parts.slice(i).join(' ') : null
      }
    }
  }

  const agentMatch = parts[0]?.match(/^agent-(.+)$/i)
  if (agentMatch) {
    return {
      type: 'switch',
      provider: 'agent',
      original: parts[0],
      agentModel: agentMatch[1].toLowerCase(),
      arg: parts.length > 1 ? parts.slice(1).join(' ') : null
    }
  }

  return null
}

module.exports = {
  COMMANDS,
  parseCommand
}
