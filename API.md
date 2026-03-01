# Claude Connector API 文档

## 模块 API

### ClaudeConnector

主连接器类，用于与 Claude Code CLI 交互。

#### 构造函数

```javascript
new ClaudeConnector(options)
```

**参数：**
- `options.claudeCmdPath` (string) - claude.cmd 路径
- `options.workDir` (string) - 工作目录
- `options.gitBinPath` (string, 可选) - Git Bash 路径
- `options.configPath` (string, 可选) - 配置文件路径

**示例：**
```javascript
const connector = new ClaudeConnector({
  claudeCmdPath: 'C:\\Users\\...\\npm\\claude.cmd',
  workDir: 'D:\\MyProject'
});
```

#### 方法

##### connect()

连接到 Claude Code CLI。

**返回：** `Promise<{success: boolean, version?: string, error?: string}>`

**示例：**
```javascript
const result = await connector.connect();
if (result.success) {
  console.log('版本:', result.version);
}
```

##### startSession(message, options)

启动新会话。

**参数：**
- `message` (string) - 用户消息
- `options.systemPrompt` (string, 可选) - 系统提示词
- `options.onEvent` (function) - 事件回调
- `options.onError` (function, 可选) - 错误回调
- `options.onComplete` (function, 可选) - 完成回调

**返回：** `Promise<{sessionId: string, process: ChildProcess}>`

**事件类型：**
```javascript
onEvent: (event) => {
  // event.type: 'system' | 'assistant' | 'result' | 'session_end'
  if (event.type === 'assistant') {
    // 提取文本
    for (const content of event.message.content) {
      if (content.type === 'text') {
        console.log(content.text);
      }
    }
  }
}
```

**示例：**
```javascript
const { sessionId } = await connector.startSession('Hello!', {
  onEvent: (event) => console.log(event.type),
  onComplete: (code) => console.log('完成，退出码:', code)
});
```

##### continueSession(sessionId, message, options)

继续已有会话。

**参数：**
- `sessionId` (string) - 会话 ID
- `message` (string) - 用户消息
- `options` - 同 startSession

**返回：** `Promise<{process: ChildProcess}>`

**示例：**
```javascript
await connector.continueSession(sessionId, 'Tell me more', {
  onEvent: (event) => { /* ... */ }
});
```

##### interruptSession(sessionId)

中断会话。

**参数：**
- `sessionId` (string) - 会话 ID

**返回：** `boolean`

##### getActiveSessions()

获取活动会话列表。

**返回：** `string[]`

## Web API

### POST /api/connect

连接到 Claude Code。

**请求体：**
```json
{
  "claudeCmdPath": "C:\\Users\\...\\claude.cmd",
  "workDir": "D:\\MyProject",
  "gitBinPath": "C:\\Program Files\\Git\\bin\\bash.exe"
}
```

**响应：**
```json
{
  "success": true,
  "version": "2.1.63"
}
```

### GET /api/status

获取连接状态。

**响应：**
```json
{
  "connected": true,
  "activeSessions": ["session-id"],
  "currentSessionId": "session-id"
}
```

### POST /api/message

发送消息。

**请求体：**
```json
{
  "message": "Hello, Claude!",
  "systemPrompt": "You are helpful"
}
```

**响应：**
```json
{
  "success": true,
  "sessionId": "xxx",
  "isResume": false,
  "events": [...],
  "exitCode": 0
}
```

### POST /api/reset

重置会话。

**响应：**
```json
{
  "success": true
}
```

## 事件结构

### system 事件

```javascript
{
  type: "system",
  session_id: "xxx",
  model: "claude-sonnet-4-6"
}
```

### assistant 事件

```javascript
{
  type: "assistant",
  message: {
    content: [
      { type: "text", text: "回复内容" }
    ]
  }
}
```

### result 事件

```javascript
{
  type: "result",
  result: "最终结果",
  duration_ms: 1234
}
```

## 配置文件

**.claude-connector.json**
```json
{
  "claudeCmdPath": "C:\\Users\\...\\claude.cmd",
  "workDir": "D:\\MyProject",
  "gitBinPath": "C:\\Program Files\\Git\\bin\\bash.exe"
}
```

## 使用示例

### 模块方式

```javascript
const ClaudeConnector = require('./claude-connector');

const connector = new ClaudeConnector();
await connector.connect();

await connector.startSession('Hello!', {
  onEvent: (event) => {
    if (event.type === 'assistant') {
      const text = event.message.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('');
      console.log(text);
    }
  }
});
```

### Web 方式

```bash
npm run web
# 访问 http://localhost:3000
```
