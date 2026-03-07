/**
 * Agent 消息处理模块
 *
 * 提供统一的消息处理逻辑，支持：
 * - 命令解析
 * - 命令处理
 * - Agent 调用
 * - 会话管理
 *
 * 适用于：钉钉、QQ 等所有集成平台
 */

const { createManager } = require('../agents');

// 单例模式
let agentManagerInstance = null;

function _getSessionValue(sessionStore, conversationId) {
  if (!sessionStore) return null;
  if (typeof sessionStore.get === 'function') return sessionStore.get(conversationId);
  if (typeof sessionStore.getSessionId === 'function') return sessionStore.getSessionId(conversationId);
  if (typeof sessionStore.getSession === 'function') return sessionStore.getSession(conversationId);
  return null;
}

function _setSessionValue(sessionStore, conversationId, value) {
  if (!sessionStore) return;
  if (typeof sessionStore.set === 'function') {
    sessionStore.set(conversationId, value);
    return;
  }
  if (typeof sessionStore.setSession === 'function') {
    if (typeof value === 'string') {
      sessionStore.setSession(conversationId, value, null);
      return;
    }
    if (value && typeof value === 'object') {
      sessionStore.setSession(conversationId, value.sessionId || null, value.provider || null);
    }
  }
}

function _deleteSessionValue(sessionStore, conversationId) {
  if (!sessionStore) return;
  if (typeof sessionStore.delete === 'function') {
    sessionStore.delete(conversationId);
    return;
  }
  if (typeof sessionStore.deleteSession === 'function') {
    sessionStore.deleteSession(conversationId);
  }
}

/**
 * 获取 AgentManager 单例
 */
async function getAgentManager() {
  if (!agentManagerInstance) {
    agentManagerInstance = await createManager();
  }
  return agentManagerInstance;
}

/**
 * 解析用户命令
 * @param {string} content - 消息内容
 * @param {string} commandPrefix - 命令前缀（默认 '/'）
 * @returns {Object|null} 命令对象或 null
 */
function parseCommand(content, commandPrefix = '/') {
  const normalized = content.trim().toLowerCase();
  // 命令格式：/agent <id>
  const agentMatch = content.match(new RegExp(`^${commandPrefix}agent\\s+(\\w+)`));
  if (agentMatch) {
    return {
      type: 'switch_agent',
      agentId: agentMatch[1]
    };
  }

  // 命令格式：/agents
  if (content.trim() === `${commandPrefix}agents`) {
    return {
      type: 'list_agents'
    };
  }

  // 命令格式：/clear
  if (content.trim() === `${commandPrefix}clear`) {
    return {
      type: 'clear_session'
    };
  }

  // 命令格式：/status 或直接 status
  if (content.trim() === `${commandPrefix}status` || content.trim() === 'status') {
    return {
      type: 'show_status'
    };
  }

  // 命令格式：/help
  if (content.trim() === `${commandPrefix}help`) {
    return {
      type: 'help'
    };
  }

  if (['claude', 'codex', 'iflow', 'deepseek'].includes(normalized)) {
    return {
      type: 'switch_agent',
      agentId: normalized
    };
  }

  return null;
}

/**
 * 处理命令
 * @param {Object} command - 命令对象
 * @param {string} conversationId - 会话 ID
 * @param {Object} sessionStore - 会话存储
 * @param {string} platform - 平台名称（用于日志）
 * @param {string} commandPrefix - 命令前缀（默认 '/'）
 * @returns {string} 命令响应
 */
async function handleCommand(command, conversationId, sessionStore, platform = 'PLATFORM', commandPrefix = '/') {
  const agentManager = await getAgentManager();
  const currentAgent = agentManager.getCurrentAgent();

  switch (command.type) {
    case 'list_agents': {
      const agents = agentManager.listAgents();
      let text = '📋 可用的 AI:\n\n';

      agents.forEach(agent => {
        const status = agent.connected ? '✅' : '❌';
        const current = agent.current ? ' [当前]' : '';
        text += `${status} **${agent.id}**: ${agent.name}${current}\n`;
      });

      text += `\n使用 "${commandPrefix}agent <id>" 切换 AI`;
      return text;
    }

    case 'switch_agent': {
      try {
        agentManager.switchAgent(command.agentId);
        const newAgent = agentManager.getCurrentAgent();

        // 更新会话的 provider
        const session = _getSessionValue(sessionStore, conversationId);
        if (session) {
          session.provider = command.agentId;
          _setSessionValue(sessionStore, conversationId, session);
        }

        return `✅ 已切换到 AI: ${newAgent.name} (${command.agentId})`;
      } catch (error) {
        return `❌ 切换失败: ${error.message}\n\n使用 ${commandPrefix}agents 查看可用 AI`;
      }
    }

    case 'clear_session': {
      _deleteSessionValue(sessionStore, conversationId);
      return '🗑️ 当前会话已清空，下次对话将重新开始';
    }

    case 'show_status': {
      // 显示当前状态
      let statusText = '📊 系统状态：\n\n';

      // 当前 Agent
      try {
        statusText += `🤖 当前 AI: ${currentAgent.name} (${currentAgent.id})\n`;
        statusText += `📡 连接状态: ${currentAgent.connected ? '✅ 已连接' : '❌ 未连接'}\n`;

        const agents = agentManager.listAgents();
        statusText += `📋 可用 AI: ${agents.length} 个\n\n`;

        // 显示所有 Agent 状态
        agents.forEach(agent => {
          const s = agent.connected ? '✅' : '❌';
          const c = agent.current ? ' [当前]' : '';
          statusText += `  ${s} ${agent.id}: ${agent.name}${c}\n`;
        });
      } catch (e) {
        statusText += `⚠️ 获取状态失败: ${e.message}\n`;
      }

      return statusText;
    }

    case 'help': {
      const currentAgentName = currentAgent ? currentAgent.name : '未初始化';

      return `🤖 AI 助手命令：

**${commandPrefix}status** - 查看当前状态
**${commandPrefix}agents** - 列出所有可用的 AI
**${commandPrefix}agent <id>** - 切换到指定的 AI
**${commandPrefix}clear** - 清空当前会话
**${commandPrefix}help** - 显示帮助信息

当前使用: ${currentAgentName}

💬 直接发送消息即可开始对话`;
    }

    default:
      return '未知命令';
  }
}

/**
 * 处理消息（集成 AI）
 * @param {string} conversationId - 会话 ID
 * @param {string} content - 消息内容
 * @param {Object} sessionStore - 会话存储
 * @param {string} platform - 平台名称（用于日志）
 * @param {string} commandPrefix - 命令前缀（默认 '/'）
 * @returns {string} AI 响应
 */
async function processMessage(conversationId, content, sessionStore, platform = 'PLATFORM', commandPrefix = '/') {
  console.log(`[${platform}] 消息: conversationId=${conversationId}`);
  console.log(`[${platform}] 内容: ${content}`);

  try {
    const agentManager = await getAgentManager();

    // 检查是否是命令
    const command = parseCommand(content, commandPrefix);
    if (command) {
      return await handleCommand(command, conversationId, sessionStore, platform, commandPrefix);
    }

    // 普通聊天消息
    const sessionId = _getSessionValue(sessionStore, conversationId);

    console.log(`[${platform}] 调用 AI, sessionId: ${sessionId || '新会话'}`);

    const response = await agentManager.chat(content, {
      sessionId,
      tools: true  // 启用工具
    });

    // 保存会话 ID
    if (response.sessionId) {
      _setSessionValue(sessionStore, conversationId, response.sessionId);
      console.log(`[${platform}] 保存新会话: ${response.sessionId}`);
    }

    console.log(`[${platform}] ✅ AI 响应成功\n`);

    return response.response;

  } catch (err) {
    console.error(`[${platform}] ❌ 处理错误:`, err.message);
    return `处理失败: ${err.message}`;
  }
}

/**
 * 获取当前 Agent 信息
 * @returns {Object|null} Agent 信息
 */
async function getCurrentAgentInfo() {
  try {
    const agentManager = await getAgentManager();
    const agent = agentManager.getCurrentAgent();

    return {
      id: agent.id || agent.constructor.name.replace('Agent', '').toLowerCase(),
      name: agent.name,
      connected: agent.connected
    };
  } catch (error) {
    return null;
  }
}

/**
 * 格式化 Agent 列表
 * @returns {string} 格式化的列表
 */
async function formatAgentList(commandPrefix = '/') {
  try {
    const agentManager = await getAgentManager();
    const agents = agentManager.listAgents();

    let text = '📋 可用的 AI:\n\n';
    agents.forEach(agent => {
      const status = agent.connected ? '✅' : '❌';
      const current = agent.current ? ' [当前]' : '';
      text += `${status} **${agent.id}**: ${agent.name}${current}\n`;
    });

    text += `\n使用 "${commandPrefix}agent <id>" 切换 AI`;

    return text;
  } catch (error) {
    return `⚠️ 无法获取 AI 列表: ${error.message}`;
  }
}

module.exports = {
  getAgentManager,
  parseCommand,
  handleCommand,
  processMessage,
  getCurrentAgentInfo,
  formatAgentList
};
