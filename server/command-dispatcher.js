async function dispatchCommand(server, command, conversationId, replyTarget, platform, originalMessage, type) {
  switch (command.type) {
    case 'switch':
      return server._handleSwitch(command.provider, conversationId, replyTarget, platform, originalMessage, type, command.arg)
    case 'interrupt':
      return server._handleInterrupt(conversationId, replyTarget, platform, originalMessage, type)
    case 'restart':
      return server._handleRestart(conversationId, replyTarget, platform, originalMessage, type)
    case 'status':
      return server._handleStatus(conversationId, replyTarget, platform, originalMessage, type)
    case 'help':
      return server._handleHelp(replyTarget, platform, originalMessage, type)
    case 'path':
      return server._handlePath(command.arg, conversationId, replyTarget, platform, originalMessage, type)
    case 'tasks_list':
      return server._handleTasksList(conversationId, replyTarget, platform, originalMessage, type)
    case 'tasks_status':
      return server._handleTasksStatus(conversationId, replyTarget, platform, originalMessage, type)
    case 'tasks_reload':
      return server._handleTasksReload(conversationId, replyTarget, platform, originalMessage, type)
    case 'tasks_run':
      return server._handleTasksRun(command.arg, conversationId, replyTarget, platform, originalMessage, type)
    case 'tasks_enable':
      return server._handleTasksEnable(command.arg, conversationId, replyTarget, platform, originalMessage, type)
    case 'tasks_disable':
      return server._handleTasksDisable(command.arg, conversationId, replyTarget, platform, originalMessage, type)
    case 'tasks_on':
      return server._handleTasksOn(conversationId, replyTarget, platform, originalMessage, type)
    case 'tasks_off':
      return server._handleTasksOff(conversationId, replyTarget, platform, originalMessage, type)
    case 'tasks_add':
      return server._handleTaskAdd(command.arg, conversationId, replyTarget, platform, originalMessage, type)
    case 'tasks_rm':
      return server._handleTaskRm(command.arg, conversationId, replyTarget, platform, originalMessage, type)
    case 'sessions_list':
      return server._handleSessionsList(conversationId, replyTarget, platform, originalMessage, type)
    case 'sessions_resume':
      return server._handleSessionsResume(command.arg, conversationId, replyTarget, platform, originalMessage, type)
    default:
      server.logger.warning('COMMAND', `Unknown command type: ${command.type}`)
      return { status: 'SUCCESS' }
  }
}

module.exports = {
  dispatchCommand
}
