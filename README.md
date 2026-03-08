# OPRCLI - Unified AI CLI Connector

**统一 AI CLI 连接器服务器** - 支持 Claude Code、IFlow、Codex 和 Agent 引擎，提供钉钉和 QQ 机器人集成。

[![Version](https://img.shields.io/badge/version-2.0.7-blue.svg)](https://github.com)
[![Node](https://img.shields.io/badge/node-%3E=14.0.0-green.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-purple.svg)](LICENSE)

---

## ✨ 特性

- 🤖 **多 AI 支持**：Claude Code、IFlow、Codex、Agent 引擎
- 🔧 **Agent 引擎**：基于 LLM + Tools 的智能代理，支持 iFlow、DeepSeek、OpenAI
- 📱 **钉钉集成**：流式事件实时推送
- 💬 **QQ 机器人**：支持私聊、频道、AT 消息，集成百度语音识别
- ⏰ **定时任务**：支持 cron 表达式的任务调度系统
- 🔌 **统一接口**：抽象连接器层，易于扩展
- 📝 **单一配置**：`.env` 环境变量
- 🎯 **零重复代码**：模块化设计

---

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# 选择提供商：claude | iflow | codex | agent
PROVIDER=iflow

# Claude 配置
CLAUDE_CMD_PATH="C:\Users\YourName\AppData\Roaming\npm\claude.cmd"
CLAUDE_WORK_DIR="D:\MyProject"
CLAUDE_GIT_BIN_PATH="C:\Program Files\Git\bin\bash.exe"

# Agent 配置（使用 agent provider 时）
AGENT_LLM_PROVIDER=iflow
AGENT_MODEL=glm-4-flash

# 钉钉配置（可选）
DINGTALK_CLIENT_ID=your-client-id
DINGTALK_CLIENT_SECRET=your-client-secret

# QQ Bot 配置（可选）
QQBOT_UIN=your-bot-qq
QQBOT_TOKEN=your-bot-token

# 百度语音配置（可选，用于 QQ 语音消息）
BAIDU_SPEECH_APP_ID=your-app-id
BAIDU_SPEECH_API_KEY=your-api-key
BAIDU_SPEECH_SECRET_KEY=your-secret-key
```

### 3. 启动服务器

```bash
npm start
```

服务运行在：**http://localhost:12480**

---

## 📁 项目结构

```
oprcli/
├── connectors/              # 连接器实现
│   ├── base-connector.js    # 抽象基类
│   ├── claude-connector.js  # Claude Code
│   ├── iflow-connector.js   # IFlow
│   ├── codex-connector.js   # OpenAI Codex CLI
│   └── agent-connector.js   # Agent 引擎
│
├── agents/                  # Agent 引擎模块
│   ├── index.js             # Agent 入口
│   ├── llm-providers/       # LLM 提供商
│   │   ├── base-provider.js # 抽象基类
│   │   ├── iflow-provider.js
│   │   ├── deepseek-provider.js
│   │   └── openai-provider.js
│   └── tools/               # 工具系统
│       └── tool-manager.js  # 工具管理器
│
├── integrations/            # 集成模块
│   ├── dingtalk.js          # 钉钉机器人
│   ├── qqbot.js             # QQ 机器人
│   ├── qqbot/               # QQ Bot 客户端
│   │   └── qqbot-client.js
│   ├── audit-logger.js      # 审计日志
│   └── logger.js            # 日志系统
│
├── scheduler/               # 定时任务
│   ├── index.js             # 调度器入口
│   └── task-manager.js      # 任务管理
│
├── server/                  # 服务器模块
│   ├── commands.js          # 命令定义
│   ├── http-routes.js       # HTTP 路由
│   └── command-dispatcher.js# 命令分发
│
├── system-prompts/          # 系统提示词
│   ├── oprcli.universal.md  # 通用模式
│   ├── oprcli.dev.md        # 开发模式
│   └── oprcli.ops.md        # 运维模式
│
├── utils/                   # 工具模块
│   ├── config.js            # 配置加载
│   └── baidu-speech.js      # 百度语音识别
│
├── scripts/                 # 辅助脚本
├── .state/                  # 状态存储
├── server.js                # 统一服务器 ⭐
├── .env                     # 环境配置
└── .env.example             # 配置模板
```

---

## 🤖 Provider 使用

### **Claude Connector**

```javascript
const ClaudeConnector = require('./connectors/claude-connector');

const connector = new ClaudeConnector({
  claudeCmdPath: 'C:\\Users\\...\\claude.cmd',
  workDir: 'D:\\MyProject',
  gitBinPath: 'C:\\Program Files\\Git\\bin\\bash.exe'
});

await connector.connect();
await connector.startSession('Hello, Claude!', {
  onEvent: (event) => console.log(event)
});
```

### **IFlow Connector**

```javascript
const IFlowConnector = require('./connectors/iflow-connector');

const connector = new IFlowConnector({
  iflowPath: 'iflow',
  workDir: 'D:\\MyProject',
  includeDirectories: ['D:\\tmp1', 'D:\\tmp2']
});

await connector.connect();
await connector.startSession('你好，请帮我分析项目', {
  onEvent: (event) => console.log(event)
});
```

### **Codex Connector**

```javascript
const CodexConnector = require('./connectors/codex-connector');

const connector = new CodexConnector({
  codexPath: 'codex',
  workDir: 'D:\\MyProject'
});

await connector.connect();
await connector.startSession('Write a hello world', {
  onEvent: (event) => console.log(event)
});
```

### **Agent Connector**

```javascript
const AgentConnector = require('./connectors/agent-connector');

const connector = new AgentConnector({
  llmProvider: 'iflow',  // iflow | deepseek | openai
  model: 'glm-4-flash',
  workDir: 'D:\\MyProject'
});

await connector.connect();
await connector.startSession('帮我分析代码', {
  onEvent: (event) => console.log(event)
});
```

---

## 🌐 API 端点

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/connect` | 连接到 CLI |
| GET | `/api/status` | 获取状态 |
| POST | `/api/message` | 发送消息 |
| POST | `/api/interrupt` | 中断会话 |
| POST | `/api/reset` | 重置会话 |
| GET | `/api/dingtalk/status` | 钉钉状态 |
| GET | `/api/qqbot/status` | QQ Bot 状态 |

### **示例：发送消息**

```bash
curl -X POST http://localhost:12480/api/message \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, AI!",
    "sessionId": null
  }'
```

---

## 💬 命令列表

| 命令 | 说明 |
|------|------|
| `/claude` | 切换到 Claude |
| `/iflow` | 切换到 IFlow |
| `/codex` | 切换到 Codex |
| `/agent` | 切换到 Agent |
| `/agent-{model}` | 切换 Agent 并指定模型 |
| `/mode {mode}` | 切换提示词模式 (universal/dev/ops) |
| `/path {path}` | 修改工作目录 |
| `/tasks` | 查看定时任务 |
| `/tasks add` | 添加定时任务 |
| `/tasks remove {id}` | 删除定时任务 |
| `/help` | 查看帮助 |

---

## 🔄 切换提供商

修改 `.env` 中的 `PROVIDER` 变量：

```env
# 使用 Claude Code
PROVIDER=claude

# 使用 IFlow
PROVIDER=iflow

# 使用 Codex
PROVIDER=codex

# 使用 Agent 引擎
PROVIDER=agent
```

---

## 🔸 钉钉集成配置

### 1. 创建钉钉应用

1. 登录 [钉钉开放平台](https://open.dingtalk.com)
2. 创建应用，获取 `Client ID` 和 `Client Secret`
3. 配置消息接收地址

### 2. 配置环境变量

```env
DINGTALK_CLIENT_ID=your-client-id
DINGTALK_CLIENT_SECRET=your-client-secret

# 流式输出配置
STREAM_ENABLED=true
STREAM_MODE=realtime
STREAM_INTERVAL=2000
STREAM_MAX_LENGTH=5000
```

---

## 🔸 QQ Bot 集成配置

### 1. 配置环境变量

```env
QQBOT_UIN=your-bot-qq
QQBOT_TOKEN=your-bot-token
```

### 2. 支持的消息类型

- 私聊消息 (c2c)
- 频道消息 (guild)
- AT 消息
- 语音消息（需配置百度语音）

### 3. 百度语音配置（可选）

```env
BAIDU_SPEECH_APP_ID=your-app-id
BAIDU_SPEECH_API_KEY=your-api-key
BAIDU_SPEECH_SECRET_KEY=your-secret-key
```

---

## 🔧 配置选项

### **核心配置**

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PROVIDER` | AI 提供商 (claude\|iflow\|codex\|agent) | `iflow` |
| `PORT` | 服务器端口 | `12480` |

### **Claude 配置**

| 变量 | 说明 | 必填 |
|------|------|------|
| `CLAUDE_CMD_PATH` | claude.cmd 路径 | ✅ |
| `CLAUDE_WORK_DIR` | 工作目录 | ✅ |
| `CLAUDE_GIT_BIN_PATH` | Git Bash 路径 | ❌ |

### **IFlow 配置**

| 变量 | 说明 | 必填 |
|------|------|------|
| `IFLOW_PATH` | iflow 命令路径 | ❌ |
| `IFLOW_WORK_DIR` | 工作目录 | ✅ |
| `IFLOW_INCLUDE_DIRS` | 包含目录（逗号分隔） | ❌ |

### **Codex 配置**

| 变量 | 说明 | 必填 |
|------|------|------|
| `CODEX_PATH` | codex 命令路径 | ❌ |
| `CODEX_WORK_DIR` | 工作目录 | ✅ |

### **Agent 配置**

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `AGENT_LLM_PROVIDER` | LLM 提供商 (iflow\|deepseek\|openai) | `iflow` |
| `AGENT_MODEL` | 模型名称 | `glm-4-flash` |

### **钉钉配置**

| 变量 | 说明 | 必填 |
|------|------|------|
| `DINGTALK_CLIENT_ID` | 应用 Client ID | ✅ |
| `DINGTALK_CLIENT_SECRET` | 应用 Client Secret | ✅ |

### **QQ Bot 配置**

| 变量 | 说明 | 必填 |
|------|------|------|
| `QQBOT_UIN` | 机器人 QQ 号 | ✅ |
| `QQBOT_TOKEN` | 机器人 Token | ✅ |

### **百度语音配置**

| 变量 | 说明 | 必填 |
|------|------|------|
| `BAIDU_SPEECH_APP_ID` | 应用 ID | ✅ |
| `BAIDU_SPEECH_API_KEY` | API Key | ✅ |
| `BAIDU_SPEECH_SECRET_KEY` | Secret Key | ✅ |

### **流式输出配置**

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `STREAM_ENABLED` | 启用流式输出 | `true` |
| `STREAM_MODE` | 模式 (realtime\|batch) | `realtime` |
| `STREAM_INTERVAL` | 发送间隔（毫秒） | `2000` |
| `STREAM_MAX_LENGTH` | 最大输出长度 | `5000` |

### **日志配置**

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LOG_LEVEL` | 日志级别 | `EVENT` |
| `LOG_COLORED` | 彩色日志 | `true` |

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📄 许可证

MIT License

---

## 🎉 致谢

- [Claude Code](https://claude.ai/code) - Anthropic
- [IFlow](https://iflow.dev) - IFlow Team
- [OpenAI Codex](https://openai.com) - OpenAI
- [钉钉开放平台](https://open.dingtalk.com) - 钉钉
- [QQ 开放平台](https://bot.q.qq.com) - 腾讯

---

**版本**: v2.0.7  
**最后更新**: 2026-03-08