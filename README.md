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

## 运行模式

支持两种运行模式：

### 模式一：npm（简单模式）

适合开发测试，手动启动。

```bash
npm start
```

### 模式二：PM2（生产模式）

适合生产环境，支持自动重启、日志管理、开机自启。

```bash
# 安装 PM2
npm install -g pm2
npm install -g pm2-windows-startup

# 启动项目
pm2 start ecosystem.config.js
[或 npm run pm2]

# 设置开机自启
pm2-startup install
pm2 save
```

**PM2 常用命令：**

| 命令 | 说明 |
|------|------|
| `pm2 list` | 查看所有进程 |
| `pm2 restart oprcli` | 重启应用 |
| `pm2 stop oprcli` | 停止应用 |
| `pm2 logs oprcli` | 查看日志 |
| `pm2 monit` | 监控面板 |
| `pm2 save` | 保存进程列表 |

**模式对比：**

| 特性 | npm | PM2 |
|------|-----|-----|
| 重启命令 | ❌ 需手动重启 | ✅ 支持 |
| 开机自启 | ❌ | ✅ |
| 崩溃自动恢复 | ❌ | ✅ |
| 日志管理 | ❌ | ✅ |
| 进程监控 | ❌ | ✅ |

服务运行在 `http://localhost:12480`

## 机器人命令

### 命令前缀规则

**重要更新**：为避免误触发，系统现在采用精确匹配模式。

#### 规则说明

| 模式 | 说明 | 示例 |
|------|------|------|
| **无前缀（精确匹配）** | 输入必须完全等于命令词 | `claude` ✅ <br> `claude 你好` ❌ |
| **有前缀（灵活匹配）** | 支持命令 + 参数 | `/重启` ✅ <br> `/重启 现在` ✅ |

#### 默认配置

- **无需前缀**：Provider 切换命令（`claude`、`iflow`、`codex`、`agent`）
- **需要前缀**：其他系统命令（`/重启`、`/status`、`/help`、`/path`、`/tasks` 等）

> 💡 **为什么这样设计？**
> - 防止误触发：例如 "重启其他服务" 不会误触发重启命令
> - 灵活性：通过 `/` 前缀区分命令和普通对话
> - 可配置：支持通过环境变量自定义前缀规则

### 常用命令

| 命令 | 说明 | 是否需要前缀 |
|------|------|-------------|
| `claude` / `iflow` / `codex` / `agent` | 切换 AI 提供商 | ❌ 可选 |
| `/restart` / `/rs` / `/重启` | 重启服务（PM2 模式） | ✅ 需要 |
| `/status` / `/状态` | 查看状态 | ✅ 需要 |
| `/help` / `/帮助` | 查看帮助 | ✅ 需要 |
| `/path {路径}` / `/路径 {路径}` | 修改工作目录 | ✅ 需要 |
| `/tasks` | 定时任务管理 | ✅ 需要 |

### 自定义配置

通过环境变量调整前缀规则：

```bash
# 方式 1: 全局要求前缀（最严格）
COMMAND_REQUIRE_SLASH=true

# 方式 2: 白名单（指定不需要前缀的命令）
COMMAND_NO_SLASH_LIST=claude,iflow,codex,agent,restart,status

# 方式 3: 黑名单（指定需要前缀的命令）
COMMAND_REQUIRE_SLASH_LIST=restart,stop,path,tasks
```

详细配置说明见 [命令配置文档](docs/COMMAND_CONFIGURATION.md)。

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
