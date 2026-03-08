# OPRCLI

统一 AI CLI 连接器服务器，支持多 AI 提供商和机器人平台集成。

## 特性

- **多 AI 支持**：Claude Code、IFlow、Codex、Agent 引擎
- **平台集成**：钉钉机器人、QQ 机器人
- **定时任务**：支持 cron 表达式的任务调度
- **语音识别**：QQ 语音消息转文字（百度语音）

## 快速开始

### 安装

```bash
npm install
```

### 配置

复制配置模板：

```bash
cp .env.example .env
```

编辑 `.env` 文件，主要配置：

```env
# AI 提供商：claude | iflow | codex | agent
PROVIDER=iflow

# IFlow 配置
IFLOW_WORK_DIR=D:\MyProject

# Claude 配置（使用 claude 时）
CLAUDE_CMD_PATH=C:\Users\...\claude.cmd
CLAUDE_WORK_DIR=D:\MyProject

# Agent 配置（使用 agent 时）
AGENT_LLM_PROVIDER=iflow
AGENT_MODEL=glm-4-flash

# 钉钉（可选）
DINGTALK_CLIENT_ID=xxx
DINGTALK_CLIENT_SECRET=xxx

# QQ Bot（可选）
QQBOT_UIN=机器人QQ号
QQBOT_TOKEN=机器人Token
```

### 启动

```bash
npm start
```

服务运行在 `http://localhost:12480`

## 命令

发送 `/help` 查看所有可用命令。

常用命令：
- `/claude` `/iflow` `/codex` `/agent` - 切换 AI 提供商
- `/mode {mode}` - 切换提示词模式
- `/path {path}` - 修改工作目录
- `/tasks` - 定时任务管理

## 项目结构

```
oprcli/
├── server.js           # 入口文件
├── connectors/         # AI 连接器
├── agents/             # Agent 引擎
├── integrations/       # 平台集成（钉钉、QQ）
├── scheduler/          # 定时任务
├── server/             # 服务器模块
├── system-prompts/     # 系统提示词
└── utils/              # 工具模块
```

## 配置项

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PROVIDER` | AI 提供商 | `iflow` |
| `PORT` | 服务端口 | `12480` |
| `IFLOW_WORK_DIR` | IFlow 工作目录 | - |
| `CLAUDE_CMD_PATH` | Claude 命令路径 | - |
| `CLAUDE_WORK_DIR` | Claude 工作目录 | - |
| `AGENT_LLM_PROVIDER` | Agent LLM 提供商 | `iflow` |
| `AGENT_MODEL` | Agent 模型 | `glm-4-flash` |
| `DINGTALK_CLIENT_ID` | 钉钉 Client ID | - |
| `DINGTALK_CLIENT_SECRET` | 钉钉 Secret | - |
| `QQBOT_UIN` | QQ 机器人号 | - |
| `QQBOT_TOKEN` | QQ 机器人 Token | - |

更多配置见 `.env.example`。

## License

MIT
