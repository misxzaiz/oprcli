# OPRCLI

统一 AI CLI 连接器服务器，支持多 AI 提供商和机器人平台集成。

## 特性

- **多 AI 支持**：Claude Code、IFlow、Codex、Agent 引擎
- **平台集成**：钉钉机器人、QQ 机器人
- **定时任务**：支持 cron 表达式和简写间隔的任务调度
- **语音识别**：QQ 语音消息转文字（百度语音）
- **Web 配置**：可视化配置管理界面

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

或直接启动，访问配置页面进行配置：

```
http://localhost:12480/config/config.html
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
QQBOT_APP_ID=xxx
QQBOT_CLIENT_SECRET=xxx
```

## 注册与获取凭证

以下服务均提供免费额度：

| 服务 | 用途 | 注册地址 |
|------|------|----------|
| **QQ 机器人** | QQ 平台机器人接入 | [q.qq.com/qqbot](https://q.qq.com/qqbot/openclaw/index.html) |
| **IFlow** | AI 对话服务 | [iflow.cn](https://iflow.cn/) |
| **IFlow CLI** | IFlow 命令行工具 | [cli.iflow.cn](https://cli.iflow.cn/) |
| **钉钉开放平台** | 钉钉机器人接入 | [open-dev.dingtalk.com](https://open-dev.dingtalk.com/) |
| **百度语音** | 语音识别服务 | [百度 AI 控制台](https://console.bce.baidu.com/ai-engine/speech/overview/index) |

### 凭证获取说明

**QQ 机器人：**
1. 访问 QQ 开放平台，登录后创建机器人应用
2. 获取 `App ID` 和 `Client Secret`

**IFlow：**
1. 支持账号登录或 APPKEY 方式
2. 在控制台获取 API Key

**钉钉机器人：**
1. 创建企业内部应用
2. 获取 `Client ID` 和 `Client Secret`

**百度语音：**
1. 创建语音识别应用
2. 获取 `API Key` 和 `Secret Key`

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

配置页面：`http://localhost:12480/config/config.html`

## 机器人命令

发送 `help` 查看所有可用命令。

**常用命令：**
- `claude` `iflow` `codex` `agent` - 切换 AI 提供商
- `path {path}` - 修改工作目录
- `tasks` - 查看定时任务列表
- `task add <id> <间隔> <消息>` - 创建定时任务
- `task rm <id>` - 删除定时任务
- `restart` `rs` `重启` - 重启服务（仅 PM2 模式支持）

**定时任务间隔格式：**
- 简写：`30s`（30秒）、`10m`（10分钟）、`1h`（1小时）
- Cron：`0 9 * * *`（每天9点）

## 项目结构

```
oprcli/
├── server.js           # 入口文件
├── connectors/         # AI 连接器
├── agents/             # Agent 引擎
├── integrations/       # 平台集成（钉钉、QQ）
├── scheduler/          # 定时任务
├── server/             # 服务器模块
├── public/             # Web 配置页面
├── system-prompts/     # 系统提示词
└── utils/              # 工具模块
```

## 配置项

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PROVIDER` | AI 提供商 | `claude` |
| `PORT` | 服务端口 | `12480` |
| `DEFAULT_WORK_DIR` | 默认工作目录 | - |
| `CLAUDE_CMD_PATH` | Claude 命令路径 | - |
| `IFLOW_PATH` | IFlow 命令路径 | - |
| `CODEX_PATH` | Codex 命令路径 | - |
| `DINGTALK_CLIENT_ID` | 钉钉 Client ID | - |
| `DINGTALK_CLIENT_SECRET` | 钉钉 Secret | - |
| `QQBOT_APP_ID` | QQ Bot App ID | - |
| `QQBOT_CLIENT_SECRET` | QQ Bot Secret | - |
| `SCHEDULER_ENABLED` | 启用定时任务 | `true` |
| `STREAM_ENABLED` | 启用流式输出 | `true` |
| `LOG_LEVEL` | 日志级别 | `DEBUG` |

更多配置见 `.env.example`。

## 致谢

感谢以下开源项目和服务：

- [Claude Code](https://www.anthropic.com/claude) - Anthropic AI 编程助手
- [IFlow](https://iflow.cn/) - 智能 AI 助手平台
- [OpenAI Codex](https://github.com/openai/codex) - OpenAI 编程模型
- [QQ 开放平台](https://q.qq.com/) - 腾讯 QQ 机器人平台
- [钉钉开放平台](https://open.dingtalk.com/) - 阿里巴巴企业协作平台
- [百度 AI](https://ai.baidu.com/) - 百度智能云语音服务

## License

MIT