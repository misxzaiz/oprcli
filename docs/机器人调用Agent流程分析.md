# OPRCLI 钉钉和 QQ 机器人调用 Agent 详细流程分析

## 📋 目录
1. [系统架构概览](#系统架构概览)
2. [初始化流程](#初始化流程)
3. [消息接收流程](#消息接收流程)
4. [Agent 调用流程](#agent-调用流程)
5. [事件处理流程](#事件处理流程)
6. [响应发送流程](#响应发送流程)
7. [关键代码位置](#关键代码位置)
8. [流程图](#流程图)

---

## 1. 系统架构概览

### 1.1 核心组件

```
┌─────────────────────────────────────────────────────────────┐
│                         server.js                            │
│                      (主服务器 2667行)                       │
│  - 初始化所有集成模块                                        │
│  - 管理连接器 (connectors)                                   │
│  - 处理消息分发和会话管理                                    │
└─────────────────────────────────────────────────────────────┘
            │                    │                    │
    ┌───────▼──────┐    ┌───────▼──────┐    ┌───────▼──────┐
    │  DingTalk    │    │   QQBot      │    │  Connectors  │
    │ Integration  │    │ Integration  │    │              │
    │  (548行)     │    │  (302行)     │    │ - claude     │
    │              │    │              │    │ - iflow      │
    │ - WebSocket  │    │ - WebSocket  │    │ - codex      │
    │ - 会话管理   │    │ - 会话管理   │    │              │
    │ - 消息去重   │    │ - 消息去重   │    │ - 进程管理   │
    └──────────────┘    └──────────────┘    └──────────────┘
            │                    │
    ┌───────▼──────┐    ┌───────▼──────┐
    │dingtalk-stream│    │qqbot-client │
    │    SDK       │    │  (自定义998行)│
    └──────────────┘    └──────────────┘
```

### 1.2 数据流向

```
用户消息 → 平台服务器 → WebSocket → 集成模块 → 消息处理器
    ↓
命令解析 → 会话管理 → Connector → 进程执行 (iflow)
    ↓
事件流 (JSONL) → 事件处理 → 消息格式化 → 平台API → 用户
```

---

## 2. 初始化流程

### 2.1 服务器启动 (server.js:1594-1640)

```javascript
async start() {
  // 1. 初始化钉钉（在连接之前注册消息处理器）
  const dingtalkEnabled = await this.dingtalk.init(
    this.handleDingTalkMessage.bind(this)  // ← 传入消息处理器
  )

  // 2. 启动 QQ Bot 集成（传入messageHandler，像钉钉一样）
  const qqbotEnabled = await this.qqbot.init(
    this.handleQQBotMessage.bind(this)  // ← 传入消息处理器
  )

  // 3. 初始化连接器
  await this._initConnectors()
}
```

### 2.2 钉钉初始化 (dingtalk.js:54-133)

```javascript
async init(messageHandler = null) {
  // 1. 创建会话持久化
  this.sessionStore = await createSessionPersistence(this.logger)
  await this._restoreSessions()  // 恢复历史会话

  // 2. 加载钉钉SDK
  const { DWClient, TOPIC_ROBOT } = require('dingtalk-stream')

  // 3. 创建客户端实例
  this.client = new DWClient({
    clientId: this.config.clientId,
    clientSecret: this.config.clientSecret,
    debug: true
  })

  // 4. ⭐ 关键：在连接之前注册消息处理器
  if (messageHandler) {
    this.client.registerCallbackListener(TOPIC_ROBOT, async (message) => {
      const messageId = message.headers?.messageId

      // 立即响应钉钉服务器，避免 60 秒后重试
      if (messageId) {
        this.client.socketCallBackResponse(messageId, { status: 'SUCCESS' })
      }

      // 异步处理消息
      await messageHandler(message)
    })
  }

  // 5. 连接到钉钉服务器
  await this.client.connect()

  // 6. 启动自动清理
  this.startAutoCleanup()
}
```

### 2.3 QQ Bot 初始化 (qqbot.js:42-99)

```javascript
async init(messageHandler = null) {
  // 1. 加载 QQ Bot 客户端
  const QQBotClient = require('./qqbot/qqbot-client')

  // 2. 创建客户端实例
  this.client = new QQBotClient({
    appId: this.config.appId,
    clientSecret: this.config.clientSecret,
    sandbox: this.config.sandbox || false,
    autoReconnect: true
  })

  // 3. 注册事件监听器
  this._registerEvents(messageHandler)

  // 4. 连接到 QQ 服务器
  await this.client.connect()

  // 5. 启动自动清理
  this.startAutoCleanup()
}
```

### 2.4 QQ Bot 客户端连接 (qqbot-client.js:86-111)

```javascript
async connect() {
  // 1. 获取 Access Token
  await this.getAccessToken()

  // 2. 获取 WebSocket 地址
  const wsInfo = await this.getWebSocketInfo()

  // 3. 连接 WebSocket
  await this.connectWebSocket(wsInfo.url)

  return this
}

// WebSocket 连接建立后
connectWebSocket(wsUrl) {
  this.ws = new WebSocket(wsUrl)

  this.ws.on('open', () => {
    // 连接成功
  })

  this.ws.on('message', (data) => {
    this.handleMessage(data)  // 处理收到的消息
  })

  this.ws.on('close', (code, reason) => {
    if (this.autoReconnect) {
      this.scheduleReconnect()  // 自动重连
    }
  })
}
```

---

## 3. 消息接收流程

### 3.1 钉钉消息接收 (dingtalk.js:98-111)

```javascript
// 注册消息监听器
this.client.registerCallbackListener(TOPIC_ROBOT, async (message) => {
  const messageId = message.headers?.messageId

  // ⚡ 立即响应（60秒内必须响应）
  if (messageId) {
    this.client.socketCallBackResponse(messageId, { status: 'SUCCESS' })
  }

  // 📨 异步处理消息
  await messageHandler(message)  // → server.handleDingTalkMessage
})
```

### 3.2 QQ Bot 消息接收 (qqbot-client.js:333-386)

```javascript
// 处理 WebSocket 消息
handleMessage(data) {
  const message = JSON.parse(data)

  switch (message.op) {
    case 0: // DISPATCH - 事件消息
      this.handleEvent(message)
      break
    case 10: // HELLO - 服务器握手
      this.authenticate()  // 鉴权
      break
  }
}

// 处理事件
handleEvent(message) {
  const eventType = message.t
  const eventData = message.d

  switch (eventType) {
    case 'MESSAGE_CREATE':
      this.emit('message', eventData)  // → qqbot.js
      break
    case 'AT_MESSAGE_CREATE':
      this.emit('at_message', eventData)
      break
    case 'C2C_MESSAGE_CREATE':
      this.emit('c2c_message', eventData)
      break
  }
}
```

### 3.3 QQ Bot 事件转发 (qqbot.js:108-126)

```javascript
_registerEvents(messageHandler) {
  this.messageHandler = messageHandler

  // 频道消息
  this.client.on('message', async (message) => {
    await this._handleMessage(message, 'channel')
  })

  // @机器人消息
  this.client.on('at_message', async (message) => {
    await this._handleMessage(message, 'at')
  })

  // C2C 私信
  this.client.on('c2c_message', async (message) => {
    await this._handleMessage(message, 'c2c')
  })
}

// 统一处理所有消息类型
async _handleMessage(message, type) {
  const messageId = this._getMessageDedupKey(message, type)

  // 去重检查
  if (this.isProcessed(messageId)) {
    return
  }
  this.markAsProcessed(messageId)

  const conversationId = this._getConversationId(message, type)

  // → server.handleQQBotMessage
  await this.messageHandler(message, type, conversationId)
}
```

---

## 4. Agent 调用流程

### 4.1 钉钉消息处理入口 (server.js:1682-1961)

```javascript
async handleDingTalkMessage(message) {
  // 1. 解析消息
  const { headers, data } = message
  const { messageId } = headers
  const robotMessage = JSON.parse(data)
  const { conversationId, senderNick, text, sessionWebhook } = robotMessage

  // 2. 消息去重
  if (this.dingtalk.isProcessed(messageId)) {
    return { status: 'SUCCESS' }
  }
  this.dingtalk.markAsProcessed(messageId)

  // 3. 解析命令
  const command = this._parseCommand(text.content)
  if (command) {
    return await this._handleCommand(command, conversationId, sessionWebhook)
  }

  // 4. 获取会话
  let session = this.dingtalk.getSession(conversationId)
  let provider = session?.provider || this.defaultProvider
  let sessionId = session?.sessionId || null

  // 5. 获取 Connector
  const connector = this.connectors.get(provider)

  // 6. 调用 Agent
  await new Promise((resolve, reject) => {
    const options = {
      onEvent: async (event) => {
        // 处理事件（见第5节）
      },
      onComplete: async (exitCode) => {
        // 会话完成
      },
      onError: (error) => {
        reject(error)
      }
    }

    // ⭐ 调用 connector 的会话方法
    if (sessionId) {
      connector.continueSession(sessionId, text.content, options)
    } else {
      connector.startSession(text.content, options)
    }
  })

  return { status: 'SUCCESS' }
}
```

### 4.2 QQ Bot 消息处理入口 (server.js:2160-2395)

```javascript
async handleQQBotMessage(message, type, conversationId) {
  // 1. 提取消息内容
  const content = message.content?.trim()
  if (!content) return

  // 2. 解析命令
  const command = this._parseCommand(content)
  if (command) {
    await this._handleQQBotCommand(command, conversationId, message, type)
    return
  }

  // 3. 获取会话
  let session = this.qqbot.getSession(conversationId)
  let provider = session?.provider || this.defaultProvider
  let sessionId = session?.sessionId || null

  // 4. 获取 Connector
  const connector = this.connectors.get(provider)

  // 5. 调用 Agent
  await new Promise((resolve, reject) => {
    const options = {
      onEvent: async (event) => {
        // 处理事件（类似钉钉，但支持 send_file）
        if (event.type === 'send_file') {
          await this._uploadAndSendFile(...)
        }
      },
      onComplete: async (exitCode) => {
        // 发送暂存的回复
        await this._sendQQBotReply(message, type, latestReply)
      }
    }

    // ⭐ 调用 connector 的会话方法
    if (sessionId) {
      connector.continueSession(sessionId, content, options)
    } else {
      connector.startSession(content, options)
    }
  })
}
```

### 4.3 IFlow Connector 调用 (iflow-connector.js:61-100)

```javascript
async _startSessionInternal(message, options) {
  // 1. 生成临时会话ID
  const tempSessionId = this._generateTempId()

  // 2. 构建命令参数
  const args = this._buildCommandArgs(message, false)

  // 3. 启动进程
  const child = this._spawnProcess(args, message)

  // 4. 注册会话
  this._registerSession(tempSessionId, { process: child })

  // 5. 设置事件处理器
  this._setupEventHandlers(child, tempSessionId, options)

  return { sessionId: tempSessionId }
}

async _continueSessionInternal(sessionId, message, options) {
  // 1. 终止旧进程
  const session = this._getSession(sessionId)
  if (session?.process) {
    this._terminateProcess(session.process)
  }

  // 2. 构建命令参数（包含 --resume）
  const args = this._buildCommandArgs(message, true, sessionId)

  // 3. 启动新进程
  const child = this._spawnProcess(args, message)

  // 4. 更新会话
  this._registerSession(sessionId, { process: child })

  // 5. 设置事件处理器
  this._setupEventHandlers(child, sessionId, options)
}

// 启动进程
_spawnProcess(cmdStr, stdinMessage = null) {
  const fullCommand = `"${this.iflowPath}" ${cmdStr}`
  const child = spawn(fullCommand, [], {
    cwd: this.workDir,
    stdio: ['pipe', 'pipe', 'pipe'],  // stdin 用于传递消息
    shell: this._isWindows()
  })

  // 通过 stdin 传递消息
  if (stdinMessage && child.stdin) {
    child.stdin.write(stdinMessage)
    child.stdin.end()
  }

  return child
}
```

---

## 5. 事件处理流程

### 5.1 事件监听器设置 (iflow-connector.js:225-300)

```javascript
_setupEventHandlers(child, sessionId, options) {
  const { onEvent, onError, onComplete } = options

  let stdoutBuffer = ''
  let realSessionId = null

  // 监听标准输出
  child.stdout.on('data', (data) => {
    stdoutBuffer += data
  })

  // 监听标准错误
  child.stderr.on('data', (data) => {
    const text = data.toString()

    // 提取真实的 session_id
    if (!realSessionId) {
      const jsonMatch = text.match(/"session-id":\s*"([^"]+)"/i)
      if (jsonMatch) {
        realSessionId = jsonMatch[1]

        // 通知 server.js 更新 sessionId
        if (this.sessionIdUpdateCallback) {
          this.sessionIdUpdateCallback(realSessionId)
        }
      }
    }
  })

  // 监听进程结束
  child.on('close', (code) => {
    // 如果没有 JSONL 事件，使用 stdout 文本
    if (!hasJsonlEvents && stdoutBuffer.trim() && onEvent) {
      onEvent({
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: stdoutBuffer.trim() }]
        }
      })
    }

    // 发送会话结束事件
    if (onEvent) {
      onEvent({ type: 'session_end' })
    }

    // 调用完成回调
    if (onComplete) {
      onComplete(code)
    }
  })
}
```

### 5.2 钉钉事件处理 (server.js:1820-1955)

```javascript
onEvent: async (event) => {
  const context = { index: ++messageCount, elapsed }

  // 记录事件类型
  this.logger.info('EVENT', `#${messageCount} [${event.type}]`)

  // 处理不同类型的事件
  switch (event.type) {
    case 'assistant':
      // 提取文本内容
      const text = event.message?.content
        ?.filter(c => c.type === 'text')
        ?.map(c => c.text)
        ?.join('') || ''

      assistantContent = text
      assistantHash = this._hashContent(text)
      break

    case 'result':
      // 检测是否与 assistant 重复
      const resultHash = this._hashContent(event.result)
      if (assistantHash === resultHash) {
        return  // 跳过重复内容
      }
      break

    case 'system':
      // 捕获 sessionId
      if (event.extra?.session_id) {
        sessionId = event.extra.session_id
        this.dingtalk.setSession(conversationId, sessionId, provider)
      }
      break
  }

  // 格式化并发送消息
  if (config.streaming.enabled) {
    const formatted = this.messageFormatter.formatEvent(event, context)
    if (formatted) {
      await this.dingtalk.send(sessionWebhook, formatted)
    }
  }
}
```

### 5.3 QQ Bot 事件处理 (server.js:2246-2380)

```javascript
onEvent: async (event) => {
  const context = { index: ++messageCount, elapsed }

  // 记录事件类型
  eventTypes.push(event.type)

  // 处理不同类型的事件
  if (event.type === 'assistant' || event.type === 'result') {
    // 提取文本内容（支持多种格式）
    let text = ''

    // 方式1: event.message.content 数组格式
    if (event.message?.content && Array.isArray(event.message.content)) {
      text = event.message.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('')
    }
    // 方式2: event.result 字符串格式
    if (!text && event.result) {
      text = event.result
    }
    // 方式3-5: 其他格式...

    // 暂存回复，等待 session_end 统一发送
    latestReply = text

  } else if (event.type === 'send_file') {
    // ⭐ 特殊处理：文件发送
    const fileInfo = await this._uploadAndSendFile(
      message, type,
      event.filePath,
      event.fileType || 'file',
      event.caption || ''
    )
    sentMessageCount++

  } else if (event.type === 'error') {
    await this._sendQQBotReply(message, type, `❌ 处理失败: ${event.error}`)
  }
}
```

---

## 6. 响应发送流程

### 6.1 钉钉响应发送 (dingtalk.js:160-209)

```javascript
async send(sessionWebhook, message, maxRetries = 3) {
  // 重试机制
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await axios.post(sessionWebhook, message, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (attempt > 1) {
        this.logger.success('DINGTALK', `消息发送成功（第${attempt}次尝试）`)
      }

      return  // 成功发送，退出

    } catch (error) {
      const isLastAttempt = attempt === maxRetries

      if (!isLastAttempt) {
        // 指数退避：等待时间随尝试次数增加
        const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
        await this.sleep(waitTime)
      }
    }
  }

  // 所有重试都失败
  throw lastError
}
```

### 6.2 QQ Bot 响应发送 (qqbot-client.js:450-712)

```javascript
// 发送消息到频道
async sendMessage(channelId, content, options = {}) {
  return this.sendWithRetry(() => this._sendMessage(channelId, content, options))
}

// 内部发送实现
async _sendMessage(channelId, content, options = {}) {
  return new Promise((resolve, reject) => {
    const postData = {
      content: content
    }

    if (options.msgId) {
      postData.msg_id = options.msgId
    }
    if (options.image) {
      postData.image = options.image
    }

    const reqOptions = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `QQBot ${this.accessToken}`,
        'Content-Type': 'application/json'
      }
    }

    const req = https.request(reqOptions, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        const result = JSON.parse(data)
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve(result)
        } else {
          reject(new Error(`发送失败 (${res.statusCode}): ${result.message}`))
        }
      })
    })

    req.write(JSON.stringify(postData))
    req.end()
  })
}

// 带重试的发送
async sendWithRetry(sendFn, retries = this.maxRetry) {
  for (let i = 0; i < retries; i++) {
    try {
      return await sendFn()
    } catch (error) {
      if (i === retries - 1) throw error

      // 指数退避：1s, 2s, 4s（最大5s）
      const waitTime = Math.min(1000 * Math.pow(2, i), 5000)
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
  }
}
```

### 6.3 QQ Bot 文件发送 (qqbot-client.js:742-801)

```javascript
// 上传文件到频道
async uploadFile(channelId, filePath, fileType = 'file') {
  const FormData = require('form-data')

  return new Promise((resolve, reject) => {
    // 1. 构造 multipart/form-data
    const formData = new FormData()
    formData.append('file', fs.createReadStream(filePath))
    formData.append('file_type', this._mapFileType(fileType))

    const formDataHeaders = formData.getHeaders()
    formDataHeaders['Authorization'] = `QQBot ${this.accessToken}`

    // 2. 发送请求
    const req = https.request(urlObj, {
      method: 'POST',
      headers: formDataHeaders
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        const result = JSON.parse(data)
        if (result.code === 0) {
          resolve(result.data)  // { url: '...', ttl: ... }
        } else {
          reject(new Error(`上传失败: ${result.message}`))
        }
      })
    })

    // 3. 发送表单数据
    formData.pipe(req)
  })
}
```

---

## 7. 关键代码位置

### 7.1 核心文件

| 文件路径 | 行数 | 功能描述 |
|---------|------|---------|
| `server.js` | 2667 | 主服务器，消息分发和会话管理 |
| `integrations/dingtalk.js` | 548 | 钉钉集成，WebSocket 和消息管理 |
| `integrations/qqbot.js` | 302 | QQ Bot 集成，事件转发 |
| `integrations/qqbot/qqbot-client.js` | 998 | QQ Bot 客户端，WebSocket 和 API |
| `connectors/iflow-connector.js` | 606+ | IFlow 连接器，进程管理 |
| `connectors/claude-connector.js` | 270+ | Claude 连接器 |
| `connectors/base-connector.js` | 280+ | 连接器基类 |

### 7.2 关键函数位置

#### 钉钉流程

| 函数名 | 文件 | 行号 | 功能 |
|-------|------|------|------|
| `init()` | dingtalk.js | 54-133 | 初始化钉钉客户端 |
| `handleDingTalkMessage()` | server.js | 1682-1961 | 处理钉钉消息 |
| `send()` | dingtalk.js | 160-209 | 发送消息到钉钉 |
| `setSession()` | dingtalk.js | 237-251 | 设置会话 |
| `getSession()` | dingtalk.js | 258-260 | 获取会话 |

#### QQ Bot 流程

| 函数名 | 文件 | 行号 | 功能 |
|-------|------|------|------|
| `init()` | qqbot.js | 42-99 | 初始化 QQ Bot |
| `connect()` | qqbot-client.js | 86-111 | 连接 QQ 服务器 |
| `handleMessage()` | qqbot-client.js | 262-301 | 处理 WebSocket 消息 |
| `handleQQBotMessage()` | server.js | 2160-2395 | 处理 QQ 消息 |
| `_sendQQBotReply()` | server.js | 2399-2437 | 发送 QQ 回复 |

#### Connector 流程

| 函数名 | 文件 | 行号 | 功能 |
|-------|------|------|------|
| `_startSessionInternal()` | iflow-connector.js | 61-77 | 启动新会话 |
| `_continueSessionInternal()` | iflow-connector.js | 79-100 | 继续会话 |
| `_spawnProcess()` | iflow-connector.js | 196-223 | 启动 iflow 进程 |
| `_setupEventHandlers()` | iflow-connector.js | 225-300+ | 设置事件监听 |

---

## 8. 流程图

### 8.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户 (钉钉/QQ)                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      钉钉/QQ 服务器                               │
│                    (WebSocket 推送消息)                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              DingTalkIntegration / QQBotIntegration        │  │
│  │  - WebSocket 连接管理                                      │  │
│  │  - 消息去重 (BoundedMap)                                  │  │
│  │  - 会话管理 (conversations Map)                           │  │
│  │  - 自动清理 (定时器)                                       │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    server.js 消息处理                      │  │
│  │  1. 消息解析                                               │  │
│  │  2. 命令识别 (_parseCommand)                               │  │
│  │  3. 会话获取/创建                                          │  │
│  │  4. Provider 选择                                          │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                     Connector (iflow)                      │  │
│  │  1. 构建命令参数                                           │  │
│  │  2. 启动子进程 (spawn)                                     │  │
│  │  3. 通过 stdin 传递消息                                    │  │
│  │  4. 监听 stdout/stderr                                     │  │
│  │  5. 解析 JSONL 事件流                                      │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    IFlow CLI 进程                                │
│                 (执行 AI 任务，生成事件流)                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   事件处理回调 (onEvent)                    │  │
│  │  - assistant: AI 回复内容                                  │  │
│  │  - result: 最终结果                                        │  │
│  │  - thinking: 思考过程                                     │  │
│  │  - tool_start: 工具调用开始                                │  │
│  │  - tool_output: 工具输出                                   │  │
│  │  - send_file: 文件发送 (QQ only)                          │  │
│  │  - session_end: 会话结束                                   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   消息格式化                               │  │
│  │  - 钉钉: Markdown/Text 格式                                │  │
│  │  - QQ: Text/图片/文件                                      │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   发送响应                                 │  │
│  │  - 钉钉: Webhook (POST)                                    │  │
│  │  - QQ: API (sendMessage/sendDirectMessage/sendC2CMessage) │  │
│  │  - 重试机制 (指数退避)                                     │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      用户 (钉钉/QQ)                              │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 钉钉消息处理时序图

```
用户          钉钉服务器      DingTalkIntegration    server.js    Connector    IFlow
 │                │                  │                │            │            │
 │ 发送消息       │                  │                │            │            │
 │───────────────>│                  │                │            │            │
 │                │                  │                │            │            │
 │                │ WebSocket 推送   │                │            │            │
 │                │─────────────────>│                │            │            │
 │                │                  │                │            │            │
 │                │                  │ 立即响应       │            │            │
 │                │<─────────────────│                │            │            │
 │                │                  │                │            │            │
 │                │                  │ messageHandler │            │            │
 │                │                  │───────────────>│            │            │
 │                │                  │                │            │            │
 │                │                  │                │ 解析命令   │            │
 │                │                  │                │            │            │
 │                │                  │                │ 获取会话   │            │
 │                │                  │                │            │            │
 │                │                  │                │ startSession│            │
 │                │                  │                │───────────>│            │
 │                │                  │                │            │            │
 │                │                  │                │            │ spawn 进程 │
 │                │                  │                │            │            │
 │                │                  │                │            │───────────>│
 │                │                  │                │            │            │
 │                │                  │                │            │            │ 执行 AI 任务
 │                │                  │                │            │            │
 │                │                  │                │            │            │ 事件流 (JSONL)
 │                │                  │                │            │<───────────│
 │                │                  │                │            │            │
 │                │                  │                │ onEvent    │            │
 │                │                  │                │<───────────│            │
 │                │                  │                │            │            │
 │                │                  │                │ 格式化     │            │
 │                │                  │                │            │            │
 │                │                  │ send()         │            │            │
 │                │                  │<───────────────│            │            │
 │                │                  │                │            │            │
 │                │   Webhook POST   │                │            │            │
 │                │<─────────────────│                │            │            │
 │                │                  │                │            │            │
 │ 接收回复       │                  │                │            │            │
 │<───────────────│                  │                │            │            │
 │                │                  │                │            │            │
 │                │                  │                │ onComplete │            │
 │                │                  │                │<───────────│            │
 │                │                  │                │            │            │
 │                │                  │                │ 保存会话   │            │
 │                │                  │                │            │            │
```

### 8.3 QQ Bot 消息处理时序图

```
用户           QQ服务器       QQBotClient      QQBotIntegration    server.js    Connector    IFlow
 │               │                │                  │                │            │            │
 │ 发送消息      │                │                  │                │            │            │
 │──────────────>│                │                  │                │            │            │
 │               │                │                  │                │            │            │
 │               │ WebSocket 推送 │                  │                │            │            │
 │               │───────────────>│                  │                │            │            │
 │               │                │                  │                │            │            │
 │               │                │ handleMessage    │                │            │            │
 │               │                │  (解析事件)      │                │            │            │
 │               │                │                  │                │            │            │
 │               │                │ emit('message')  │                │            │            │
 │               │                │─────────────────>│                │            │            │
 │               │                │                  │                │            │            │
 │               │                │                  │ _handleMessage │            │            │
 │               │                │                  │                │            │            │
 │               │                │                  │ messageHandler │            │            │
 │               │                │                  │───────────────>│            │            │
 │               │                │                  │                │            │            │
 │               │                │                  │                │ 解析命令   │            │
 │               │                │                  │                │            │            │
 │               │                │                  │                │ 获取会话   │            │
 │               │                │                  │                │            │            │
 │               │                │                  │                │ startSession│            │
 │               │                │                  │                │───────────>│            │
 │               │                │                  │                │            │            │
 │               │                │                  │                │            │ spawn 进程 │
 │               │                │                  │                │            │            │
 │               │                │                  │                │            │───────────>│
 │               │                │                  │                │            │            │
 │               │                │                  │                │            │            │ 执行 AI 任务
 │               │                │                  │                │            │            │
 │               │                │                  │                │            │ 事件流 (JSONL)
 │               │                │                  │                │            │<───────────│
 │               │                │                  │                │            │            │
 │               │                │                  │                │ onEvent    │            │
 │               │                │                  │                │<───────────│            │
 │               │                │                  │                │            │            │
 │               │                │                  │                │ 处理事件   │            │
 │               │                │                  │                │            │            │
 │               │                │                  │                │ send_file? │            │
 │               │                │                  │                │            │            │
 │               │                │                  │  uploadFile    │            │            │
 │               │                │<─────────────────│                │            │            │
 │               │                │                  │                │            │            │
 │               │                │  上传文件到 QQ    │                │            │            │
 │               │                │─────────────────>│                │            │            │
 │               │                │                  │                │            │            │
 │               │                │                  │ _sendQQBotReply│            │            │
 │               │                │<─────────────────│                │            │            │
 │               │                │                  │                │            │            │
 │               │                │ sendMessage      │                │            │            │
 │               │                │─────────────────>│                │            │            │
 │               │                │                  │                │            │            │
 │               │   HTTPS POST   │                  │                │            │            │
 │               │<───────────────│                  │                │            │            │
 │               │                │                  │                │            │            │
 │ 接收回复      │                │                  │                │            │            │
 │<──────────────│                │                  │                │            │            │
```

### 8.4 会话管理流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                        会话生命周期                              │
└─────────────────────────────────────────────────────────────────┘

首次对话                    继续对话                    会话结束
│                           │                          │
│ 用户发送消息               │ 用户发送消息              │
│ ────────────────>          │ ────────────────>        │
│                           │                          │
│ getSession(conversationId) │ getSession(convId)       │
│ 返回 null                  │ 返回 { sessionId,        │
│                           │        provider }         │
│                           │                          │
│ 设置 provider = default    │ 使用已有 provider        │
│ ────────────────>          │                          │
│                           │                          │
│ connector.startSession()   │ connector.continueSession()│
│ ───────────────────────────────────────────────────────────────>│
│                           │                          │
│ 生成临时 sessionId         │ 使用真实 sessionId       │
│ ────────────────>          │ ────────────────>        │
│                           │                          │
│ IFlow 返回真实 session_id │                          │
│ ────────────────>          │                          │
│                           │                          │
│ setSession(realId)         │                          │
│ ────────────────>          │                          │
│                           │                          │
│ 保存到 Map                │ 已保存在 Map              │
│ ────────────────>          │ ────────────────>        │
│                           │                          │
│ 持久化到磁盘              │                          │
│ ────────────────>          │                          │
│                           │                          │
│ onEvent(system)           │                          │
│ 捕获 session_id           │                          │
│ ────────────────>          │                          │
│                           │                          │
│ session_end 事件           │ session_end 事件          │
│ ───────────────────────────────────────────────────────────────>│
│                           │                          │
│ 会话保存在 Map 中          │ 会话保存在 Map 中         │
│ 等待下次对话              │ 等待下次对话              │
│ ────────────────>          │ ────────────────>        │
│                           │                          │
│ 24小时后自动清理           │ 24小时后自动清理          │
│ ───────────────────────────────────────────────────────────────>│
```

---

## 9. 关键技术点

### 9.1 消息去重机制

**钉钉和 QQ 都使用 `BoundedMap` 实现消息去重：**

```javascript
// 初始化时创建
this.processedMessages = new BoundedMap(1000, {
  evictionPolicy: 'fifo',  // 先进先出
  onEvict: (key) => {
    this.logger.debug('Processed message evicted: ${key}')
  }
})

// 检查是否已处理
isProcessed(messageId) {
  return this.processedMessages.has(messageId)
}

// 标记为已处理
markAsProcessed(messageId) {
  this.processedMessages.set(messageId, Date.now())
}
```

**优势：**
- 自动内存管理，防止内存泄漏
- FIFO 淘汰策略，保留最新消息
- 时间戳记录，便于调试

### 9.2 会话持久化

**钉钉使用会话持久化，服务重启后恢复会话：**

```javascript
// 初始化
async init(messageHandler = null) {
  this.sessionStore = await createSessionPersistence(this.logger)
  await this._restoreSessions()  // 恢复历史会话
}

// 保存会话
setSession(conversationId, sessionId, provider) {
  this.conversations.set(conversationId, {
    sessionId,
    provider,
    startTime: Date.now()
  })

  // 持久化到磁盘
  this._persistSession(conversationId, {
    sessionId,
    provider,
    startTime: Date.now(),
    updatedAt: Date.now()
  })
}
```

### 9.3 重试机制

**钉钉和 QQ 都使用指数退避重试：**

```javascript
async send(sessionWebhook, message, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await axios.post(sessionWebhook, message)
      return  // 成功，退出
    } catch (error) {
      if (attempt === maxRetries) throw error

      // 指数退避：1s, 2s, 4s（最大5s）
      const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
      await this.sleep(waitTime)
    }
  }
}
```

### 9.4 自动清理机制

**定期清理过期消息和会话，防止内存泄漏：**

```javascript
// 启动定时器（每5分钟）
startAutoCleanup() {
  this.cleanupTimer = setInterval(() => {
    this.performCleanup()
  }, 5 * 60 * 1000)
}

// 执行清理
async performCleanup() {
  const now = Date.now()

  // 清理1小时前的消息
  for (const [messageId, timestamp] of this.processedMessages.entries()) {
    if (now - timestamp > 60 * 60 * 1000) {
      this.processedMessages.delete(messageId)
    }
  }

  // 清理24小时前的会话
  for (const [conversationId, session] of this.conversations.entries()) {
    if (now - session.startTime > 24 * 60 * 60 * 1000) {
      this.conversations.delete(conversationId)
    }
  }
}
```

---

## 10. 总结

### 10.1 核心流程总结

1. **初始化阶段**
   - 创建集成模块实例
   - 注册消息处理器
   - 建立 WebSocket 连接
   - 启动自动清理

2. **消息接收阶段**
   - WebSocket 推送消息
   - 消息去重检查
   - 立即响应平台（钉钉60秒限制）
   - 异步处理消息

3. **消息处理阶段**
   - 解析消息内容
   - 识别命令或普通消息
   - 获取/创建会话
   - 选择 AI Provider

4. **Agent 调用阶段**
   - 调用 Connector 的会话方法
   - 启动 iflow 子进程
   - 通过 stdin 传递消息
   - 监听 stdout/stderr

5. **事件处理阶段**
   - 解析 JSONL 事件流
   - 处理各种事件类型
   - 提取和格式化内容
   - 捕获真实 sessionId

6. **响应发送阶段**
   - 格式化消息
   - 发送到平台（Webhook/API）
   - 失败重试（指数退避）
   - 保存会话状态

### 10.2 设计亮点

1. **模块化设计**：集成模块、连接器、服务器分离
2. **异步处理**：立即响应平台，异步处理消息
3. **内存管理**：BoundedMap + 自动清理
4. **容错机制**：消息去重、重试机制、错误处理
5. **会话持久化**：服务重启后恢复会话
6. **流式输出**：实时发送 AI 回复，提升用户体验

---

## 附录：配置示例

### .env 配置

```bash
# 钉钉配置
DINGTALK_ENABLED=true
DINGTALK_CLIENT_ID=your_client_id
DINGTALK_CLIENT_SECRET=your_client_secret

# QQ Bot 配置
QQBOT_ENABLED=true
QQBOT_APP_ID=your_app_id
QQBOT_CLIENT_SECRET=your_client_secret
QQBOT_SANDBOX=false

# Provider 配置
DEFAULT_PROVIDER=iflow
IFLOW_PATH=iflow
WORK_DIR=D:/space
```

---

**文档生成时间：** 2026-03-07
**项目版本：** oprcli v1.0
**作者：** Claude Code Analysis
