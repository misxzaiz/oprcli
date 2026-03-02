# OPRCLI - Unified AI CLI Connector

**统一 AI CLI 连接器服务器** - 支持 Claude Code 和 IFlow，提供 Web 界面和钉钉机器人集成。

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com)
[![Node](https://img.shields.io/badge/node-%3E=14.0.0-green.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-purple.svg)](LICENSE)

---

## ✨ 特性

- 🤖 **多 AI 支持**：Claude Code、IFlow（易扩展）
- 🌐 **Web 界面**：简洁的 Web UI
- 📱 **钉钉集成**：流式事件实时推送
- 🔌 **统一接口**：抽象连接器层
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
# 选择提供商：claude | iflow
PROVIDER=claude

# Claude 配置
CLAUDE_CMD_PATH="C:\Users\YourName\AppData\Roaming\npm\claude.cmd"
CLAUDE_WORK_DIR="D:\MyProject"
CLAUDE_GIT_BIN_PATH="C:\Program Files\Git\bin\bash.exe"

# 钉钉配置（可选）
DINGTALK_CLIENT_ID=your-client-id
DINGTALK_CLIENT_SECRET=your-client-secret
```

### 3. 启动服务器

```bash
npm start
```

访问：**http://localhost:3000**

---

## 📁 项目结构

```
oprcli/
├── connectors/              # 连接器实现
│   ├── base-connector.js    # 抽象基类
│   ├── claude-connector.js  # Claude Code
│   └── iflow-connector.js   # IFlow
│
├── integrations/            # 集成模块
│   ├── dingtalk.js          # 钉钉机器人
│   └── logger.js            # 日志系统
│
├── utils/                   # 工具模块
│   ├── config.js            # 配置加载
│   ├── rate-limiter.js      # 速率限制
│   └── message-formatter.js # 消息格式化
│
├── server.js                # 统一服务器 ⭐
├── .env                     # 环境配置
├── .env.example             # 配置模板
└── public/
    └── index.html           # Web UI
```

---

## 🔌 作为模块使用

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

### **示例：发送消息**

```bash
curl -X POST http://localhost:3000/api/message \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, AI!",
    "sessionId": null
  }'
```

---

## 🔄 切换提供商

只需修改 `.env` 中的 `PROVIDER` 变量：

```env
# 使用 Claude Code
PROVIDER=claude

# 或使用 IFlow
PROVIDER=iflow
```

然后重启服务器：

```bash
npm start
```

---

## 🔸 钉钉集成配置

### 1. 创建钉钉应用

1. 登录 [钉钉开放平台](https://open.dingtalk.com)
2. 创建应用，获取 `Client ID` 和 `Client Secret`
3. 配置消息接收地址（如：`https://your-domain.com/api/dingtalk/webhook`）

### 2. 配置环境变量

```env
DINGTALK_CLIENT_ID=your-client-id
DINGTALK_CLIENT_SECRET=your-client-secret

# 流式输出配置
STREAM_ENABLED=true
STREAM_MODE=realtime
STREAM_INTERVAL=2000
STREAM_MAX_LENGTH=5000
STREAM_SHOW_THINKING=true
STREAM_SHOW_TOOLS=true
STREAM_SHOW_TIME=true
```

### 3. 启动服务器

服务器启动后会自动连接钉钉 Stream，成功后会显示：

```
[DINGTALK] ✅ WebSocket 连接成功
```

---

## 🔧 配置选项

### **核心配置**

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PROVIDER` | AI 提供商 (claude\|iflow) | `claude` |
| `PORT` | 服务器端口 | `3000` |

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

### **钉钉配置**

| 变量 | 说明 | 必填 |
|------|------|------|
| `DINGTALK_CLIENT_ID` | 应用 Client ID | ✅ |
| `DINGTALK_CLIENT_SECRET` | 应用 Client Secret | ✅ |

### **流式输出配置**

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `STREAM_ENABLED` | 启用流式输出 | `true` |
| `STREAM_MODE` | 模式 (realtime\|batch) | `realtime` |
| `STREAM_INTERVAL` | 发送间隔（毫秒） | `2000` |
| `STREAM_MAX_LENGTH` | 最大输出长度 | `5000` |
| `STREAM_SHOW_THINKING` | 显示思考过程 | `true` |
| `STREAM_SHOW_TOOLS` | 显示工具调用 | `true` |
| `STREAM_SHOW_TIME` | 显示时间 | `true` |
| `STREAM_USE_MARKDOWN` | 使用 Markdown | `false` |

### **日志配置**

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LOG_LEVEL` | 日志级别 | `EVENT` |
| `LOG_COLORED` | 彩色日志 | `true` |

---

## 📚 相关文档

- [📖 API 文档](./API.md)
- [🔄 迁移指南](./MIGRATION.md) - 从 v1.0 升级到 v2.0

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
- [钉钉开放平台](https://open.dingtalk.com) - 钉钉

---

**版本**: v2.0.0
**最后更新**: 2026-03-02
