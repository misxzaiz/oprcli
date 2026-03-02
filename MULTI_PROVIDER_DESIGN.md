# 多模型切换功能 - 技术方案

## 需求
用户通过钉钉命令动态切换 AI 模型：
- 输入 `claude` - 切换到 Claude 模型
- 输入 `iflow` - 切换到 IFlow 模型
- 输入 `end` 或 `停止` - 中断当前任务
- 输入 `status` - 查看当前状态

## 方案审查

### ✅ 选择的方案：命令前缀模式

**优点：**
1. 实现简单清晰
2. 用户学习成本低
3. 符合直觉
4. 易于调试和扩展

### ⚠️ 潜在问题及解决方案

#### 问题 1：会话隔离
**问题**：Claude 的 sessionId 不能用于 IFlow，切换模型时需要清空旧 sessionId

**解决**：切换模型时清空该 conversationId 的 sessionId
```javascript
_switchProvider(conversationId, newProvider) {
  this.dingtalk.sessionMap.delete(conversationId)  // 清空旧 sessionId
  this.conversationProviders.set(conversationId, newProvider)
}
```

#### 问题 2：Connector 初始化
**问题**：当前只初始化单一 connector，需要初始化多个

**解决**：
1. 在 `start()` 时初始化所有配置了的 connectors
2. 允许部分失败（某些 connector 不可用不影响其他）
3. 记录哪些 connector 成功初始化

```javascript
async _initializeAllConnectors() {
  const providers = []

  // 尝试初始化 Claude
  if (config.claude.cmdPath && config.claude.workDir) {
    try {
      const claude = new ClaudeConnector(config.getConnectorOptions('claude'))
      await claude.connect()
      this.connectors.set('claude', claude)
      providers.push('claude')
    } catch (error) {
      this.logger.warning('CONNECTOR', 'Claude 初始化失败', { error: error.message })
    }
  }

  // 尝试初始化 IFlow
  if (config.iflow.workDir) {
    try {
      const iflow = new IFlowConnector(config.getConnectorOptions('iflow'))
      await iflow.connect()
      this.connectors.set('iflow', iflow)
      providers.push('iflow')
    } catch (error) {
      this.logger.warning('CONNECTOR', 'IFlow 初始化失败', { error: error.message })
    }
  }

  if (providers.length === 0) {
    this.logger.error('CONNECTOR', '没有可用的 connectors')
    process.exit(1)
  }

  return providers
}
```

#### 问题 3：会话级别的模型选择
**问题**：不同用户/对话可能需要使用不同模型

**解决**：使用 Map 存储 conversationId -> provider
```javascript
this.conversationProviders = new Map()

// 获取当前会话的 provider
const provider = this.conversationProviders.get(conversationId) || this.defaultProvider
```

#### 问题 4：并发安全
**问题**：钉钉 Stream 是单线程的，不太可能有并发问题

**评估**：无需特殊处理

#### 问题 5：错误处理
**问题**：切换到未初始化的模型怎么办？

**解决**：检查 connector 是否存在，返回友好提示
```javascript
const connector = this.connectors.get(newProvider)
if (!connector || !connector.connected) {
  await this._sendReply(sessionWebhook, `❌ ${newProvider.toUpperCase()} 模型不可用`)
  return { status: 'SUCCESS' }
}
```

#### 问题 6：默认 provider
**问题**：首次对话使用哪个模型？

**解决**：使用 `config.provider` 作为默认值

## 实现细节

### 1. 数据结构变更

**修改前：**
```javascript
this.connector = null
this.currentSessionId = null
```

**修改后：**
```javascript
this.connectors = new Map()  // 'claude' | 'iflow' -> connector
this.conversationProviders = new Map()  // conversationId -> provider
this.defaultProvider = config.provider
```

### 2. 命令识别

```javascript
_parseCommand(content) {
  const trimmed = content.trim().toLowerCase()

  // 模型切换命令
  if (trimmed === 'claude') {
    return { type: 'switch', provider: 'claude' }
  }
  if (trimmed === 'iflow') {
    return { type: 'switch', provider: 'iflow' }
  }

  // 中断命令
  if (trimmed === 'end' || trimmed === '停止' || trimmed === 'stop') {
    return { type: 'interrupt' }
  }

  // 状态查询
  if (trimmed === 'status' || trimmed === '状态') {
    return { type: 'status' }
  }

  // 帮助命令
  if (trimmed === 'help' || trimmed === '帮助') {
    return { type: 'help' }
  }

  return null
}
```

### 3. 命令处理

```javascript
async _handleCommand(command, conversationId, sessionWebhook) {
  switch (command.type) {
    case 'switch':
      return await this._handleSwitch(command.provider, conversationId, sessionWebhook)

    case 'interrupt':
      return await this._handleInterrupt(conversationId, sessionWebhook)

    case 'status':
      return await this._handleStatus(conversationId, sessionWebhook)

    case 'help':
      return await this._handleHelp(sessionWebhook)
  }
}

async _handleSwitch(provider, conversationId, sessionWebhook) {
  // 检查 connector 是否可用
  const connector = this.connectors.get(provider)
  if (!connector || !connector.connected) {
    await this._sendReply(sessionWebhook, `❌ ${provider.toUpperCase()} 模型不可用`)
    return { status: 'SUCCESS' }
  }

  // 中断当前任务
  const currentSessionId = this.dingtalk.getSessionId(conversationId)
  if (currentSessionId) {
    const currentProvider = this.conversationProviders.get(conversationId) || this.defaultProvider
    const currentConnector = this.connectors.get(currentProvider)
    if (currentConnector) {
      currentConnector.interruptSession(currentSessionId)
    }
  }

  // 切换模型
  this.conversationProviders.set(conversationId, provider)
  this.dingtalk.sessionMap.delete(conversationId)  // 清空旧 sessionId

  const availableProviders = Array.from(this.connectors.keys()).map(p => p.toUpperCase()).join(', ')
  await this._sendReply(sessionWebhook,
    `✅ 已切换到 ${provider.toUpperCase()} 模型\n\n` +
    `💡 可用模型：${availableProviders}`
  )

  this.logger.info('PROVIDER', `会话 ${conversationId} 切换到 ${provider}`)
  return { status: 'SUCCESS' }
}

async _handleInterrupt(conversationId, sessionWebhook) {
  const sessionId = this.dingtalk.getSessionId(conversationId)

  if (!sessionId) {
    await this._sendReply(sessionWebhook, '⚠️ 没有运行中的任务')
    return { status: 'SUCCESS' }
  }

  const provider = this.conversationProviders.get(conversationId) || this.defaultProvider
  const connector = this.connectors.get(provider)

  if (connector) {
    connector.interruptSession(sessionId)
    this.dingtalk.sessionMap.delete(conversationId)
    await this._sendReply(sessionWebhook, '✅ 任务已中断')
    this.logger.info('PROVIDER', `会话 ${conversationId} 任务已中断`)
  }

  return { status: 'SUCCESS' }
}

async _handleStatus(conversationId, sessionWebhook) {
  const provider = this.conversationProviders.get(conversationId) || this.defaultProvider
  const sessionId = this.dingtalk.getSessionId(conversationId)
  const availableProviders = Array.from(this.connectors.keys()).map(p => p.toUpperCase()).join(', ')

  const status = {
    当前模型: provider.toUpperCase(),
    会话状态: sessionId ? '运行中' : '空闲',
    可用模型: availableProviders
  }

  await this._sendReply(sessionWebhook,
    `📊 系统状态\n\n` +
    Object.entries(status).map(([k, v]) => `• ${k}：${v}`).join('\n')
  )

  return { status: 'SUCCESS' }
}

async _handleHelp(sessionWebhook) {
  const help = `
📖 命令帮助

🤖 模型切换：
  • claude  - 切换到 Claude 模型
  • iflow  - 切换到 IFlow 模型

🛑 任务控制：
  • end / 停止 / stop  - 中断当前任务

ℹ️ 信息查询：
  • status / 状态  - 查看当前状态
  • help / 帮助  - 显示此帮助
  `.trim()

  await this._sendReply(sessionWebhook, help)
  return { status: 'SUCCESS' }
}
```

### 4. 辅助方法

```javascript
async _sendReply(sessionWebhook, text) {
  const message = {
    msgtype: 'text',
    text: { content: text }
  }

  try {
    await this.dingtalk.send(sessionWebhook, message)
    this.logger.debug('DINGTALK', '回复已发送')
  } catch (error) {
    this.logger.error('DINGTALK', '回复发送失败', { error: error.message })
  }
}
```

### 5. 消息处理流程

```javascript
async handleDingTalkMessage(message) {
  // ... 前面的解析代码 ...

  const messageContent = text?.content?.trim()

  // 1. 检查是否是命令
  const command = this._parseCommand(messageContent)
  if (command) {
    this.logger.info('COMMAND', `识别到命令: ${command.type}`)
    return await this._handleCommand(command, conversationId, sessionWebhook)
  }

  // 2. 正常消息处理
  const provider = this.conversationProviders.get(conversationId) || this.defaultProvider
  const connector = this.connectors.get(provider)

  if (!connector || !connector.connected) {
    await this._sendReply(sessionWebhook, `❌ ${provider.toUpperCase()} 模型不可用，请尝试切换模型`)
    return { status: 'SUCCESS' }
  }

  // ... 后续的消息处理逻辑 ...
}
```

## 配置要求

### .env 文件
```bash
# 默认模型（首次对话使用）
PROVIDER=claude

# Claude 配置（必需）
CLAUDE_CMD_PATH=C:/Users/.../claude.cmd
CLAUDE_WORK_DIR=D:/temp
CLAUDE_GIT_BIN_PATH=C:/Program Files/Git/usr/bin/bash.exe

# IFlow 配置（可选，如果不需要 IFlow 可以不配置）
IFLOW_PATH=C:/Users/.../iflow.cmd
IFLOW_WORK_DIR=D:/temp
IFLOW_INCLUDE_DIRS=D:/tmp1,D:/tmp2
```

## 测试计划

### 测试用例 1：基本切换
```
用户: claude
系统: ✅ 已切换到 CLAUDE 模型

用户: 你好
系统: [Claude 回复]

用户: iflow
系统: ✅ 已切换到 IFLOW 模型

用户: 分析这个项目
系统: [IFlow 回复]
```

### 测试用例 2：中断任务
```
用户: 帮我写一个爬虫
系统: [开始执行...]

用户: 停止
系统: ✅ 任务已中断
```

### 测试用例 3：状态查询
```
用户: status
系统: 📊 系统状态
• 当前模型：CLAUDE
• 会话状态：运行中
• 可用模型：CLAUDE, IFLOW
```

### 测试用例 4：不可用模型
```
用户: claude
系统: ❌ CLAUDE 模型不可用
```

### 测试用例 5：并发切换（两个不同用户）
```
用户A: claude
用户B: iflow
用户A: 你好  -> 使用 Claude
用户B: 分析  -> 使用 IFlow
```

## 优势总结

✅ **灵活性**：支持运行时切换，无需重启
✅ **隔离性**：不同会话可以使用不同模型
✅ **容错性**：某个模型不可用不影响其他模型
✅ **易用性**：简单的命令，符合直觉
✅ **可扩展**：易于添加新模型或新命令

## 风险评估

⚠️ **低风险**：
- 会话隔离已处理
- 错误处理完善
- 允许部分失败

✅ **可以安全实现**
