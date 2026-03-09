const COMMANDS = {
  // Provider 切换命令 - 支持参数: [-r] [自定义提示词]
  // /claude             - 切换到 claude，使用默认提示词
  // /claude 你是助手    - 切换 + 拼接提示词
  // /claude -r 你是助手 - 切换 + 替换提示词
  claude: { type: 'switch', provider: 'claude', hasArg: true, requireSlash: false },
  iflow: { type: 'switch', provider: 'iflow', hasArg: true, requireSlash: false },
  codex: { type: 'switch', provider: 'codex', hasArg: true, requireSlash: false },
  agent: { type: 'switch', provider: 'agent', hasArg: true, requireSlash: false },

  // 中断命令
  end: { type: 'interrupt', requireSlash: true },
  '停止': { type: 'interrupt', requireSlash: true },
  stop: { type: 'interrupt', requireSlash: true },

  // 重启命令
  restart: { type: 'restart', requireSlash: true },
  rs: { type: 'restart', requireSlash: true },
  '重启': { type: 'restart', requireSlash: true },

  // 状态和帮助
  status: { type: 'status', requireSlash: true },
  '状态': { type: 'status', requireSlash: true },
  help: { type: 'help', requireSlash: true },
  '帮助': { type: 'help', requireSlash: true },

  // 路径设置
  path: { type: 'path', hasArg: true, requireSlash: true },
  '路径': { type: 'path', hasArg: true, requireSlash: true },

  // 任务管理
  tasks: { type: 'tasks_list' },
  'tasks status': { type: 'tasks_status' },
  'tasks reload': { type: 'tasks_reload' },
  'tasks run': { type: 'tasks_run', hasArg: true },
  'tasks enable': { type: 'tasks_enable', hasArg: true },
  'tasks disable': { type: 'tasks_disable', hasArg: true },
  'tasks on': { type: 'tasks_on' },
  'tasks off': { type: 'tasks_off' },

  // 任务添加/删除
  'tasks add': { type: 'tasks_add', hasArg: true },
  'tasks rm': { type: 'tasks_rm', hasArg: true },

  // 会话管理
  sessions: { type: 'sessions_list', requireSlash: true },
  '会话': { type: 'sessions_list', requireSlash: true },
  resume: { type: 'sessions_resume', hasArg: true, requireSlash: true },
  '继续': { type: 'sessions_resume', hasArg: true, requireSlash: true },
  '恢复': { type: 'sessions_resume', hasArg: true, requireSlash: true }
}

/**
 * 检查命令是否需要前缀
 * @param {string} commandKey - 命令键名
 * @param {Object} cmdConfig - 命令配置
 * @param {Object} commandConfig - 命令系统配置（可选）
 * @returns {boolean} 是否需要前缀
 */
function _requireSlash(commandKey, cmdConfig, commandConfig = null) {
  // 如果没有提供系统配置，使用命令定义中的设置
  if (!commandConfig) {
    return cmdConfig.requireSlash !== false
  }

  // 优先级1: noSlashList 白名单（不需要前缀）
  if (commandConfig.noSlashList && commandConfig.noSlashList.includes(commandKey)) {
    return false
  }

  // 优先级2: requireSlashList 黑名单（需要前缀）
  if (commandConfig.requireSlashList && commandConfig.requireSlashList.includes(commandKey)) {
    return true
  }

  // 优先级3: 全局 requireSlash 设置
  if (commandConfig.requireSlash) {
    return true
  }

  // 优先级4: 命令定义中的设置
  return cmdConfig.requireSlash !== false
}

function parseCommand(content, logger, commandConfig = null) {
  let trimmed = (content || '').trim()
  const hasSlashPrefix = trimmed.startsWith('/')

  if (logger?.debug) {
    logger.debug('COMMAND', `Raw input: "${content}"`)
    logger.debug('COMMAND', `After trim: "${trimmed}"`)
    logger.debug('COMMAND', `Has slash prefix: ${hasSlashPrefix}`)
  }

  if (hasSlashPrefix) {
    trimmed = trimmed.substring(1).trim()
    logger?.debug?.('COMMAND', `Strip slash: "${trimmed}"`)
  }

  const parts = trimmed.split(/\s+/)
  logger?.debug?.('COMMAND', `Split parts: [${parts.map(p => `"${p}"`).join(', ')}]`)

  // agent-xxx 模式特殊处理（支持有/无前缀）
  const agentMatch = parts[0]?.match(/^agent-(.+)$/i)
  if (agentMatch) {
    logger?.debug?.('COMMAND', `✅ Agent match: agent-${agentMatch[1]}`)
    return {
      type: 'switch',
      provider: 'agent',
      original: parts[0],
      agentModel: agentMatch[1].toLowerCase(),
      arg: parts.length > 1 ? parts.slice(1).join(' ') : null
    }
  }

  // 有 / 前缀：灵活匹配模式（支持参数、缩写）
  // 无 / 前缀：精确匹配模式（输入必须完全等于命令词）
  if (hasSlashPrefix) {
    // 灵活匹配：尝试匹配前 1-3 个词
    for (let i = Math.min(parts.length, 3); i >= 1; i--) {
      const candidate = parts.slice(0, i).join(' ').toLowerCase()
      const cmdConfig = COMMANDS[candidate]
      if (cmdConfig) {
        logger?.debug?.('COMMAND', `✅ Flex match: "${candidate}"`)
        return {
          ...cmdConfig,
          original: candidate,
          arg: parts.length > i ? parts.slice(i).join(' ') : null
        }
      }
    }
  } else {
    // 精确匹配：只匹配完整的第一个词
    if (parts.length === 1) {
      const candidate = parts[0].toLowerCase()
      const cmdConfig = COMMANDS[candidate]
      if (cmdConfig) {
        const requireSlash = _requireSlash(candidate, cmdConfig, commandConfig)
        if (!requireSlash) {
          logger?.debug?.('COMMAND', `✅ Exact match: "${candidate}"`)
          return {
            ...cmdConfig,
            original: candidate,
            arg: null
          }
        } else {
          logger?.debug?.('COMMAND', `⚠️ Command "${candidate}" requires slash prefix`)
        }
      }
    }
  }

  logger?.debug?.('COMMAND', `❌ No command match`)
  return null
}

module.exports = {
  COMMANDS,
  parseCommand
}
