# 钉钉流式响应和详细日志实现方案分析

## 🎯 需求分析

### 核心需求
1. **流式返回**：实时发送 Claude 的处理过程，而不是等待完成后一次性返回
2. **详细过程**：包括思考过程、工具调用、工具返回、最终回复等
3. **详细日志**：在服务器端打印完整的处理日志

### 当前实现的问题

```javascript
// 当前实现 - 等待完成后一次性返回
await new Promise((resolve, reject) => {
  const options = {
    onEvent: (event) => {
      if (event.type === 'assistant') {
        claudeResponse += text;  // 只是累积，不发送
      }
    },
    onComplete: (exitCode) => {
      resolve();  // 完成才发送
    }
  };
  // ... 处理完成
  await sendToDingTalk(sessionWebhook, {
    msgtype: 'text',
    text: { content: claudeResponse }  // 一次性发送
  });
});
```

---

## 📊 Claude Code CLI 事件流分析

### 事件类型（来自现有代码）

```javascript
// ClaudeConnector 处理的事件类型
const eventTypes = {
  'system': '系统事件（session_id 等）',
  'thinking': '思考过程',
  'tool_start': '工具调用开始',
  'tool_end': '工具调用结束',
  'tool_output': '工具输出',
  'assistant': '助手回复',
  'user': '用户消息',
  'error': '错误'
};
```

### 示例事件流

```
1. system           → { session_id: "xxx", type: "system" }
2. thinking         → { content: "让我分析一下...", type: "thinking" }
3. tool_start       → { tool: "Bash", command: "ls -la", type: "tool_start" }
4. tool_output      → { output: "total 16...", type: "tool_output" }
5. tool_end         → { tool: "Bash", exitCode: 0, type: "tool_end" }
6. assistant        → { content: "...", type: "assistant" }
7. complete         → { exitCode: 0 }
```

---

## 🔧 技术方案设计

### 方案 1：实时流式发送（推荐）

#### 实现思路

```javascript
async function handleDingTalkMessage(message) {
  // ... 解析消息

  // 流式发送标志
  let messageCount = 0;
  const startTime = Date.now();

  await new Promise((resolve, reject) => {
    const options = {
      onEvent: async (event) => {
        // 实时处理每个事件
        await streamEventToDingTalk(event, sessionWebhook, {
          messageCount: ++messageCount,
          startTime
        });
      },
      onComplete: (exitCode) => {
        console.log(`[DingTalk] ✅ 完成，共发送 ${messageCount} 条消息`);
        resolve();
      }
    };

    connector.startSession(messageContent, options);
  });
}
```

#### 事件处理函数

```javascript
async function streamEventToDingTalk(event, sessionWebhook, context) {
  const { messageCount, startTime } = context;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // 根据事件类型格式化消息
  const message = formatEventMessage(event, {
    index: messageCount,
    elapsed
  });

  if (!message) return;  // 跳过不需要发送的事件

  // 发送到钉钉
  try {
    await sendToDingTalk(sessionWebhook, message);
    console.log(`[DingTalk] 📤 [${messageCount}] ${event.type} (${elapsed}s)`);
  } catch (error) {
    console.error(`[DingTalk] ❌ 发送失败:`, error.message);
  }
}
```

#### 消息格式化

```javascript
function formatEventMessage(event, context) {
  const { index, elapsed } = context;

  switch (event.type) {
    case 'thinking':
      return {
        msgtype: 'text',
        text: {
          content: `💭 [思考 ${index}] ${event.content}\n\n⏱️ ${elapsed}s`
        }
      };

    case 'tool_start':
      const toolIcon = getToolIcon(event.tool);
      return {
        msgtype: 'text',
        text: {
          content: `${toolIcon} [工具 ${index}] **${event.tool}**\n\`\`\`\n${event.command}\n\`\`\`\n⏱️ ${elapsed}s`
        }
      };

    case 'tool_output':
      // 截断过长的输出
      const output = truncateOutput(event.output, 500);
      return {
        msgtype: 'text',
        text: {
          content: `📤 [输出 ${index}]\n\`\`\`\n${output}\n\`\`\`\n⏱️ ${elapsed}s`
        }
      };

    case 'tool_end':
      const statusIcon = event.exitCode === 0 ? '✅' : '❌';
      return {
        msgtype: 'text',
        text: {
          content: `${statusIcon} [完成 ${index}] **${event.tool}** 退出码: ${event.exitCode}\n⏱️ ${elapsed}s`
        }
      };

    case 'assistant':
      return {
        msgtype: 'text',
        text: {
          content: `💬 [回复 ${index}]\n${event.content}\n⏱️ ${elapsed}s`
        }
      };

    default:
      // 不发送其他事件
      return null;
  }
}

function getToolIcon(tool) {
  const icons = {
    'Bash': '🖥️',
    'Editor': '📝',
    'Browser': '🌐',
    'Computer': '💻',
    'Unknown': '🔧'
  };
  return icons[tool] || icons['Unknown'];
}

function truncateOutput(output, maxLength) {
  if (output.length <= maxLength) return output;
  return output.substring(0, maxLength) + `\n... (已截断，共 ${output.length} 字符)`;
}
```

---

### 方案 2：Markdown 卡片（更美观）

#### 使用 Markdown 格式

```javascript
function formatEventAsMarkdown(event, context) {
  const { index, elapsed } = context;

  switch (event.type) {
    case 'tool_start':
      return {
        msgtype: 'markdown',
        markdown: {
          title: `🔧 工具调用 #${index}`,
          text: `### ${getToolIcon(event.tool)} ${event.tool}\n\n\`\`\`bash\n${event.command}\n\`\`\`\n\n⏱️ ${elapsed}s`
        }
      };

    case 'assistant':
      return {
        msgtype: 'markdown',
        markdown: {
          title: `💬 Claude 回复 #${index}`,
          text: event.content + `\n\n⏱️ ${elapsed}s`
        }
      };

    // ... 其他事件
  }
}
```

#### 优势
- ✅ 更好的格式化显示
- ✅ 支持代码高亮
- ✅ 更易读

#### 劣势
- ⚠️ 钉钉 Markdown 卡片有长度限制
- ⚠️ 某些版本可能不支持 Markdown

---

### 方案 3：分段累积发送（平衡方案）

#### 实现思路

```javascript
let currentMessage = '';
let lastSendTime = 0;
const SEND_INTERVAL = 2000; // 每 2 秒发送一次

async function handleDingTalkMessage(message) {
  await new Promise((resolve, reject) => {
    const options = {
      onEvent: async (event) => {
        // 累积内容
        const content = formatEventContent(event);
        if (content) {
          currentMessage += content + '\n\n';

          // 检查是否应该发送
          const now = Date.now();
          if (now - lastSendTime > SEND_INTERVAL || event.type === 'assistant') {
            await sendToDingTalk(sessionWebhook, {
              msgtype: 'text',
              text: { content: currentMessage }
            });
            currentMessage = '';
            lastSendTime = now;
          }
        }
      },
      onComplete: async () => {
        // 发送剩余内容
        if (currentMessage) {
          await sendToDingTalk(sessionWebhook, {
            msgtype: 'text',
            text: { content: currentMessage }
          });
        }
        resolve();
      }
    };

    connector.startSession(messageContent, options);
  });
}
```

---

## 📝 详细日志方案

### 日志级别设计

```javascript
const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  EVENT: 2,
  SUCCESS: 3,
  WARNING: 4,
  ERROR: 5
};

let currentLogLevel = LogLevel.EVENT;

function log(level, category, message, data) {
  if (level < currentLogLevel) return;

  const timestamp = new Date().toISOString();
  const levelIcon = {
    [LogLevel.DEBUG]: '🔍',
    [LogLevel.INFO]: 'ℹ️',
    [LogLevel.EVENT]: '📡',
    [LogLevel.SUCCESS]: '✅',
    [LogLevel.WARNING]: '⚠️',
    [LogLevel.ERROR]: '❌'
  }[level];

  console.log(`[${timestamp}] ${levelIcon} [${category}] ${message}`);

  if (data && currentLogLevel <= LogLevel.DEBUG) {
    console.log(JSON.stringify(data, null, 2));
  }
}
```

### 事件日志实现

```javascript
function logEvent(event, context) {
  const { index, elapsed } = context;

  switch (event.type) {
    case 'thinking':
      log(LogLevel.EVENT, 'THINKING', `思考过程 #${index}`, {
        content: event.content.substring(0, 100),
        elapsed
      });
      break;

    case 'tool_start':
      log(LogLevel.EVENT, 'TOOL_START', `工具调用 #${index}: ${event.tool}`, {
        command: event.command,
        elapsed
      });
      break;

    case 'tool_output':
      log(LogLevel.DEBUG, 'TOOL_OUTPUT', `工具输出 #${index}`, {
        output: event.output.substring(0, 200),
        truncated: event.output.length > 200,
        elapsed
      });
      break;

    case 'tool_end':
      const status = event.exitCode === 0 ? '成功' : '失败';
      log(LogLevel.EVENT, 'TOOL_END', `工具完成 #${index}: ${event.tool} - ${status}`, {
        exitCode: event.exitCode,
        elapsed
      });
      break;

    case 'assistant':
      log(LogLevel.SUCCESS, 'ASSISTANT', `Claude 回复 #${index}`, {
        length: event.content.length,
        preview: event.content.substring(0, 100),
        elapsed
      });
      break;

    case 'error':
      log(LogLevel.ERROR, 'ERROR', `错误 #${index}`, {
        error: event.message,
        elapsed
      });
      break;
  }
}
```

### 彩色日志（可选）

```javascript
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function logColored(level, category, message, data) {
  const color = {
    [LogLevel.DEBUG]: colors.cyan,
    [LogLevel.INFO]: colors.blue,
    [LogLevel.EVENT]: colors.magenta,
    [LogLevel.SUCCESS]: colors.green,
    [LogLevel.WARNING]: colors.yellow,
    [LogLevel.ERROR]: colors.red
  }[level];

  console.log(`${color}[${category}]${colors.reset} ${message}`);

  if (data) {
    console.log(colors.gray + JSON.stringify(data, null, 2) + colors.reset);
  }
}
```

---

## ⚙️ 配置化设计

### 配置文件扩展

```json
{
  "claudeCmdPath": "...",
  "workDir": "...",
  "gitBinPath": "...",
  "dingtalk": {
    "clientId": "...",
    "clientSecret": "...",
    "streaming": {
      "enabled": true,
      "mode": "realtime",  // realtime | batch | markdown
      "sendInterval": 2000,
      "maxOutputLength": 500,
      "showThinking": true,
      "showTools": true,
      "showTime": true
    },
    "logging": {
      "level": "EVENT",  // DEBUG | INFO | EVENT | SUCCESS | WARNING | ERROR
      "colored": true,
      "file": "dingtalk.log"
    }
  }
}
```

### 配置加载

```javascript
function loadConfig() {
  const config = require('./.claude-connector.json');

  // 默认配置
  const defaults = {
    streaming: {
      enabled: true,
      mode: 'realtime',
      sendInterval: 2000,
      maxOutputLength: 500,
      showThinking: true,
      showTools: true,
      showTime: true
    },
    logging: {
      level: 'EVENT',
      colored: true,
      file: null
    }
  };

  return {
    ...defaults,
    ...config.dingtalk?.streaming,
    logging: {
      ...defaults.logging,
      ...config.dingtalk?.logging
    }
  };
}
```

---

## 🎨 用户体验优化

### 1. 进度提示

```javascript
// 开始时发送
await sendToDingTalk(sessionWebhook, {
  msgtype: 'text',
  text: { content: '🤖 开始处理您的请求...\n\n我将流式返回处理过程，请稍等 ⏳' }
});

// 完成时发送
await sendToDingTalk(sessionWebhook, {
  msgtype: 'text',
  text: { content: `✅ 处理完成！\n\n共发送 ${messageCount} 条消息\n总耗时: ${totalTime}s` }
});
```

### 2. 错误友好提示

```javascript
try {
  // ... 处理
} catch (error) {
  await sendToDingTalk(sessionWebhook, {
    msgtype: 'text',
    text: {
      content: `❌ 处理失败\n\n错误: ${error.message}\n\n请重试或联系管理员`
    }
  });
}
```

### 3. 长内容处理

```javascript
// 分段发送长内容
async function sendLongContent(sessionWebhook, content, maxLength = 2000) {
  const chunks = [];
  for (let i = 0; i < content.length; i += maxLength) {
    chunks.push(content.substring(i, i + maxLength));
  }

  for (let i = 0; i < chunks.length; i++) {
    await sendToDingTalk(sessionWebhook, {
      msgtype: 'text',
      text: {
        content: `📄 [${i + 1}/${chunks.length}]\n\n${chunks[i]}`
      }
    });

    // 避免频率限制
    if (i < chunks.length - 1) {
      await sleep(500);
    }
  }
}
```

---

## ⚠️ 注意事项和限制

### 1. 钉钉消息频率限制

- ⚠️ 钉钉可能有消息发送频率限制
- 💡 建议添加发送间隔和重试机制
- 💡 实现消息队列和速率限制

```javascript
class RateLimiter {
  constructor(maxRequests, perMilliseconds) {
    this.maxRequests = maxRequests;
    this.perMilliseconds = perMilliseconds;
    this.requests = [];
  }

  async waitForSlot() {
    const now = Date.now();
    this.requests = this.requests.filter(t => now - t < this.perMilliseconds);

    if (this.requests.length >= this.maxRequests) {
      const oldest = this.requests[0];
      const waitTime = this.perMilliseconds - (now - oldest);
      await sleep(waitTime);
      this.requests.shift();
    }

    this.requests.push(now);
  }
}

// 使用
const limiter = new RateLimiter(5, 1000); // 每秒最多 5 条

await limiter.waitForSlot();
await sendToDingTalk(sessionWebhook, message);
```

### 2. 消息顺序保证

- ⚠️ 异步发送可能导致消息乱序
- 💡 使用消息队列保证顺序

```javascript
class MessageQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  async add(fn) {
    this.queue.push(fn);
    if (!this.processing) {
      this.process();
    }
  }

  async process() {
    this.processing = true;
    while (this.queue.length > 0) {
      const fn = this.queue.shift();
      await fn();
    }
    this.processing = false;
  }
}
```

### 3. 性能考虑

- ⚠️ 频繁的网络请求可能影响性能
- 💡 考虑批量发送或使用 WebSocket
- 💡 实现消息缓存和合并

---

## 📊 实现对比

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| **实时流式** | 最及时，用户体验最好 | 消息多，可能刷屏 | 简单任务 |
| **Markdown 卡片** | 美观，格式好 | 兼容性问题，长度限制 | 演示、分享 |
| **分段累积** | 平衡性能和体验 | 有一定延迟 | 中等复杂度任务 |

---

## 🚀 推荐实现方案

### 阶段 1：基础流式（MVP）

```javascript
// 实现要点
1. 在 onEvent 中实时发送
2. 使用文本格式（简单可靠）
3. 基本日志输出
4. 简单的去重和错误处理
```

### 阶段 2：优化体验

```javascript
// 增强功能
1. 支持 Markdown 格式
2. 添加速率限制
3. 彩色日志
4. 配置化开关
```

### 阶段 3：高级特性

```javascript
// 高级功能
1. 消息队列和顺序保证
2. 长内容分段
3. 进度条和统计
4. 日志文件输出
```

---

## 📝 代码结构建议

```
web-server-dingtalk.js
├── handleDingTalkMessage()      # 主处理函数
├── streamEventToDingTalk()       # 事件流式发送
├── formatEventMessage()          # 消息格式化
├── sendToDingTalk()              # 发送到钉钉
│
├── logging/
│   ├── logEvent()               # 事件日志
│   ├── logColored()             # 彩色日志
│   └── LogLevel                 # 日志级别
│
├── utils/
│   ├── RateLimiter              # 速率限制
│   ├── MessageQueue             # 消息队列
│   └── truncateOutput()         # 输出截断
│
└── config/
    ├── loadConfig()             # 加载配置
    └── defaults                 # 默认配置
```

---

## ✅ 实现检查清单

### 核心功能
- [ ] 实时事件捕获
- [ ] 流式消息发送
- [ ] 详细日志输出
- [ ] 错误处理

### 优化功能
- [ ] 速率限制
- [ ] 消息队列
- [ ] Markdown 支持
- [ ] 配置化

### 用户体验
- [ ] 进度提示
- [ ] 友好错误
- [ ] 长内容处理
- [ ] 彩色日志

---

**文档版本**: 1.0.0
**创建日期**: 2026-03-01
**状态**: 分析阶段，待实现
