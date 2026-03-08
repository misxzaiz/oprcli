const COMMANDS = {
  claude: { type: 'switch', provider: 'claude' },
  iflow: { type: 'switch', provider: 'iflow' },
  codex: { type: 'switch', provider: 'codex' },
  agent: { type: 'switch', provider: 'agent' },
  end: { type: 'interrupt' },
  '停止': { type: 'interrupt' },
  stop: { type: 'interrupt' },
  status: { type: 'status' },
  '状态': { type: 'status' },
  help: { type: 'help' },
  '帮助': { type: 'help' },
  mode: { type: 'mode', hasArg: true },
  '模式': { type: 'mode', hasArg: true },
  path: { type: 'path', hasArg: true },
  '路径': { type: 'path', hasArg: true },
  tasks: { type: 'tasks_list' },
  'tasks status': { type: 'tasks_status' },
  'tasks reload': { type: 'tasks_reload' },
  'tasks run': { type: 'tasks_run', hasArg: true },
  'tasks enable': { type: 'tasks_enable', hasArg: true },
  'tasks disable': { type: 'tasks_disable', hasArg: true }
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
