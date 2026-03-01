# 钉钉 Stream 模式集成 Claude Code 实现方案

## 📋 项目概述

**目标**：在现有的 `web-server.js` 服务中集成钉钉 Stream 模式，让用户可以通过钉钉机器人直接调用 Claude Code CLI。

**优势**：
- ✅ 无需公网服务器、域名、IP 等资源
- ✅ 使用 WebSocket 长连接，实时通讯
- ✅ 集成简单，只需添加 dingtalk-stream SDK
- ✅ 复用现有的 ClaudeConnector 模块

---

## 🔍 现有架构分析

### 当前项目结构

```
oprcli/
├── claude-connector.js    # 核心：与 Claude Code CLI 交互
├── web-server.js           # Web 服务器
├── public/
│   └── index.html          # Web 界面
├── package.json
└── .claude-connector.json  # 配置文件
```

### 现有 API

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/connect` | POST | 连接 Claude Code |
| `/api/status` | GET | 获取连接状态 |
| `/api/message` | POST | 发送消息（支持会话管理） |
| `/api/reset` | POST | 重置会话 |
| `/api/interrupt` | POST | 中断会话 |

### ClaudeConnector 核心方法

```javascript
// 连接到 Claude Code
await connector.connect()

// 开启新会话
await connector.startSession(message, {
  systemPrompt,
  onEvent: (event) => { /* 处理事件 */ },
  onComplete: (exitCode) => { /* 完成回调 */ }
})

// 继续会话
await connector.continueSession(sessionId, message, options)
```

---

## 🎯 集成方案设计

### 1. 架构设计

```
┌─────────────┐         WebSocket          ┌──────────────┐
│   钉钉服务器 │ ◄─────────────────────────► │ web-server.js│
│             │    dingtalk-stream SDK     │              │
└─────────────┘                             └──────┬───────┘
                                                    │
                                                    │ 调用
                                                    ▼
                                            ┌───────────────┐
                                            │ ClaudeConnector│
                                            └───────┬───────┘
                                                    │ spawn
                                                    ▼
                                            ┌───────────────┐
                                            │ claude CLI    │
                                            └───────────────┘
```

### 2. 数据流程

```
用户在钉钉发送消息
    │
    ▼
钉钉服务器推送（Stream 模式）
    │
    ▼
web-server.js 监听到消息
    │
    ▼
解析消息内容（文本、@机器人等）
    │
    ▼
调用 connector.startSession() 或 continueSession()
    │
    ▼
Claude CLI 处理并返回事件
    │
    ▼
web-server.js 收集事件内容
    │
    ▼
通过 dingtalk-stream 发送回复到钉钉
    │
    ▼
用户在钉钉看到回复
```

---

## 🛠️ 技术实现细节

### 步骤 1：安装依赖

```bash
npm install dingtalk-stream
```

### 步骤 2：配置文件扩展

在 `.claude-connector.json` 或新建 `.dingtalk-config.json`：

```json
{
  "claudeCmdPath": "C:\\Users\\...\\claude.cmd",
  "workDir": "D:\\MyProject",
  "gitBinPath": "C:\\Program Files\\Git\\bin\\bash.exe",

  // 钉钉配置
  "dingtalk": {
    "clientId": "dingxxxxxxxxx",
    "clientSecret": "xxxxxxxxxxxxxxxxxxxx",
    "enabled": true
  }
}
```

### 步骤 3：代码实现（核心部分）

#### 3.1 在 web-server.js 中集成钉钉 Stream 客户端

```javascript
// web-server.js 新增代码

const express = require('express');
const { StreamClient } = require('dingtalk-stream');
const ClaudeConnector = require('./claude-connector');

const app = express();
const PORT = 3000;

// 全局变量
let connector = null;
let currentSessionId = null;
let dingtalkClient = null;

// 会话映射：钉钉 conversationId -> Claude sessionId
const sessionMap = new Map();

/**
 * 初始化钉钉 Stream 客户端
 */
async function initDingTalkStream() {
  try {
    // 从配置文件读取
    const config = require('./.claude-connector.json');
    const { clientId, clientSecret } = config.dingtalk || {};

    if (!clientId || !clientSecret) {
      console.log('[DingTalk] 未配置钉钉，跳过初始化');
      return false;
    }

    // 创建 Stream 客户端
    dingtalkClient = new StreamClient({
      clientId,
      clientSecret
    });

    // 监听机器人消息
    dingtalkClient.on('bot', async (event) => {
      console.log('[DingTalk] 收到消息:', event);
      await handleDingTalkMessage(event);
    });

    // 连接钉钉
    await dingtalkClient.connect();
    console.log('[DingTalk] Stream 客户端已连接');
    return true;

  } catch (error) {
    console.error('[DingTalk] 初始化失败:', error.message);
    return false;
  }
}

/**
 * 处理钉钉消息
 */
async function handleDingTalkMessage(event) {
  const {
    conversationId,
    senderId,
    content,
    msgType,
    conversationType
  } = event;

  // 只处理文本消息
  if (msgType !== 'text') {
    return;
  }

  // 提取消息内容（去除 @机器人的部分）
  const message = content.text.replace(/@.*?\s/, '').trim();

  if (!message) {
    return;
  }

  try {
    // 发送"正在处理"状态
    await sendToDingTalk(conversationId, {
      msgType: 'text',
      text: '🤖 正在思考中...'
    });

    // 检查是否有该会话的 sessionId
    let sessionId = sessionMap.get(conversationId);
    const isResume = !!sessionId;

    console.log(`[DingTalk] 处理消息: ${message.substring(0, 50)}...`);
    console.log(`[DingTalk] 会话ID: ${conversationId}, Claude Session: ${sessionId || '新会话'}`);

    // 调用 Claude
    let claudeResponse = '';
    await new Promise((resolve, reject) => {
      const options = {
        onEvent: (event) => {
          // 处理 assistant 消息
          if (event.type === 'assistant') {
            const text = event.message.content
              .filter(c => c.type === 'text')
              .map(c => c.text)
              .join('');
            claudeResponse += text;
          }
        },
        onComplete: (exitCode) => {
          console.log(`[DingTalk] Claude 完成，退出码: ${exitCode}`);
          resolve();
        },
        onError: (err) => {
          console.error('[DingTalk] Claude 错误:', err);
          reject(err);
        }
      };

      if (isResume) {
        connector.continueSession(sessionId, message, options);
      } else {
        const result = connector.startSession(message, options);

        // 捕获真实的 sessionId
        options.onEvent = (event) => {
          if (event.type === 'system' && event.session_id) {
            sessionId = event.session_id;
            sessionMap.set(conversationId, sessionId);
            console.log(`[DingTalk] 新会话ID: ${sessionId}`);
          }
        };
      }
    });

    // 发送回复到钉钉
    await sendToDingTalk(conversationId, {
      msgType: 'text',
      text: claudeResponse || '🤔 我思考了一下，但没有生成回复'
    });

  } catch (error) {
    console.error('[DingTalk] 处理消息失败:', error);
    await sendToDingTalk(conversationId, {
      msgType: 'text',
      text: `❌ 处理失败: ${error.message}`
    });
  }
}

/**
 * 发送消息到钉钉
 */
async function sendToDingTalk(conversationId, message) {
  if (!dingtalkClient) {
    console.error('[DingTalk] 客户端未初始化');
    return;
  }

  try {
    await dingtalkClient.sendMessage({
      conversationId,
      ...message
    });
    console.log('[DingTalk] 消息已发送');
  } catch (error) {
    console.error('[DingTalk] 发送消息失败:', error.message);
  }
}

// 启动服务器
app.listen(PORT, async () => {
  console.log('\n========================================');
  console.log('  Claude Connector Web Server');
  console.log('========================================');
  console.log(`\n服务器运行在: http://localhost:${PORT}`);

  // 初始化钉钉 Stream
  const dingtalkEnabled = await initDingTalkStream();
  if (dingtalkEnabled) {
    console.log('✅ 钉钉 Stream 模式已启用');
  } else {
    console.log('⚠️  钉钉未配置或配置失败，仅 Web 模式可用');
  }

  console.log('\n按 Ctrl+C 停止服务器\n');
});

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n正在关闭服务器...');

  // 关闭 Claude 连接
  if (connector) {
    const sessions = connector.getActiveSessions();
    sessions.forEach(sid => connector.interruptSession(sid));
  }

  // 关闭钉钉连接
  if (dingtalkClient) {
    await dingtalkClient.close();
    console.log('[DingTalk] Stream 客户端已关闭');
  }

  process.exit(0);
});
```

### 步骤 4：新增 API 端点（可选）

```javascript
/**
 * API: 获取钉钉状态
 */
app.get('/api/dingtalk/status', (req, res) => {
  res.json({
    enabled: !!dingtalkClient,
    connected: dingtalkClient?.connected || false,
    activeSessions: Array.from(sessionMap.keys())
  });
});

/**
 * API: 手动发送消息到钉钉（测试用）
 */
app.post('/api/dingtalk/send', async (req, res) => {
  const { conversationId, message } = req.body;

  if (!dingtalkClient) {
    return res.status(400).json({
      success: false,
      error: '钉钉未启用'
    });
  }

  try {
    await sendToDingTalk(conversationId, message);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

---

## 📝 钉钉开放平台配置步骤

### 1. 创建应用

1. 访问 [钉钉开发者平台](https://open-dev.dingtalk.com/)
2. 创建"企业内部应用"
3. 选择"机器人"类型

### 2. 获取凭证

- **Client ID**（AppKey）
- **Client Secret**（AppSecret）

### 3. 配置权限

在应用权限中添加：
- `chat:read` - 读取聊天消息
- `chat:write` - 发送聊天消息

### 4. 配置 Stream 模式

在应用开发设置中：
- 选择"消息接收模式"为 **Stream 模式**
- 保存并发布应用

### 5. 添加机器人到群聊

1. 在钉钉群设置中添加机器人
2. 选择你创建的应用
3. 完成添加

---

## 🧪 测试流程

### 测试步骤

1. **启动服务**
   ```bash
   npm run web
   ```

2. **检查日志**
   ```
   [DingTalk] Stream 客户端已连接
   ✅ 钉钉 Stream 模式已启用
   ```

3. **在钉钉群中发送消息**
   ```
   @机器人 你好
   ```

4. **预期行为**
   - 机器人回复"🤖 正在思考中..."
   - 几秒后回复 Claude 的响应

### 测试用例

| 场景 | 输入 | 预期输出 |
|------|------|----------|
| 新会话 | `@机器人 在D:/temp创建文件test.txt` | ✅ 创建成功 |
| 继续会话 | `@机器人 刚才创建了什么文件？` | ✅ 记得之前的操作 |
| 复杂任务 | `@机器人 分析当前目录结构` | ✅ 返回目录列表 |
| 错误处理 | `@机器人 执行一个不存在的命令` | ⚠️ 友好的错误提示 |

---

## ⚠️ 注意事项

### 1. 会话管理

- **钉钉 conversationId vs Claude sessionId**：
  - 钉钉的 `conversationId` 是群聊或单聊的唯一标识
  - Claude 的 `sessionId` 是 CLI 会话的唯一标识
  - 需要维护两者的映射关系（使用 `sessionMap`）

### 2. 消息去重

- 钉钉可能会重复推送消息
- 建议添加 `messageId` 去重逻辑

### 3. 长消息处理

- Claude 可能返回很长的响应
- 钉钉有消息长度限制（建议分段发送或使用 Markdown 卡片）

### 4. 并发控制

- 如果用户同时发送多条消息，可能导致进程冲突
- 建议使用消息队列或锁机制

### 5. 错误处理

- Claude CLI 可能失败（网络、权限等）
- 需要友好的错误提示返回给钉钉

### 6. 权限和目录

- Claude CLI 的工作目录（`workDir`）
- 确保有权限访问用户指定的目录

---

## 🚀 后续优化方向

### 1. 支持流式响应

```javascript
// 实时发送 Claude 的输出
options.onEvent = async (event) => {
  if (event.type === 'assistant') {
    const text = extractText(event);
    await sendToDingTalk(conversationId, {
      msgType: 'text',
      text: text  // 实时发送
    });
  }
};
```

### 2. 支持 Markdown 卡片

```javascript
await sendToDingTalk(conversationId, {
  msgType: 'markdown',
  title: 'Claude 回复',
  text: formatMarkdown(claudeResponse)
});
```

### 3. 支持文件操作反馈

- 当 Claude 创建文件时，发送文件链接到钉钉
- 支持 @文件 消息，让 Claude 处理文件

### 4. 支持多用户隔离

- 为每个用户维护独立的会话
- 支持个性化 system prompt

### 5. 添加管理命令

```
@机器人 /reset     # 重置会话
@机器人 /status    # 查看状态
@机器人 /help      # 帮助信息
```

---

## 📦 依赖清单

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "dingtalk-stream": "latest"  // 新增
  }
}
```

---

## 🔗 参考资源

### 官方文档

- [钉钉 Stream 模式介绍](https://open.dingtalk.com/document/development/introduction-to-stream-mode)
- [dingtalk-stream NPM 包](https://npmjs.com/package/dingtalk-stream)
- [开发 Stream 模式推送服务端](https://open.dingtalk.com/document/isvapp/develop-stream-mode-push-server)

### 教程资源

- [2025年最新钉钉开放平台钉钉机器人stream搭建部署详细教程](https://blog.csdn.net/xxx)（CSDN）
- [服务打通钉钉群机器人Stream模式（无需服务器）](https://blog.csdn.net/yyy)（CSDN）

---

## ✅ 实施检查清单

- [ ] 安装 dingtalk-stream 依赖
- [ ] 创建钉钉企业内部应用
- [ ] 获取 Client ID 和 Client Secret
- [ ] 配置 .claude-connector.json
- [ ] 实现 initDingTalkStream() 函数
- [ ] 实现 handleDingTalkMessage() 函数
- [ ] 实现 sendToDingTalk() 函数
- [ ] 添加会话映射管理
- [ ] 测试新会话创建
- [ ] 测试会话继续
- [ ] 测试错误处理
- [ ] 部署到生产环境

---

**文档版本**: 1.0.0
**创建日期**: 2026-03-01
**最后更新**: 2026-03-01
