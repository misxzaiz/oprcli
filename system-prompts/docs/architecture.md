# OPRCLI 项目架构说明

## 📂 工作目录结构

### 当前工作目录（可修改）

```
D:/space/oprcli/              → OPRCLI 工作版本
├── PORT=13579                → 当前运行端口
├── PROVIDER=iflow            → 当前使用 IFlow
├── connectors/               → 连接器实现
│   ├── base-connector.js     → 抽象基类
│   ├── claude-connector.js   → Claude 连接器
│   └── iflow-connector.js    → IFlow 连接器
├── integrations/             → 集成模块
│   ├── dingtalk.js           → 钉钉集成
│   └── logger.js             → 日志系统
├── utils/                    → 工具模块
│   ├── config.js             → 配置管理
├── scheduler/                → 定时任务模块
│   ├── task-manager.js       → 任务管理器
│   ├── index.js              → 模块入口
│   └── tasks.json            → 任务配置
├── scripts/                  → 脚本工具
│   ├── notify.js             → 通知脚本
│   ├── notify-test.js        → 通知测试
│   └── test-api.js           → API 测试
├── server.js                 → 统一服务器
├── system-prompts/           → 系统提示词
│   ├── docs/                 → 功能文档（按需查阅）
│   ├── base.txt              → 核心提示词
│   ├── claude.txt            → Claude 专用
│   ├── iflow.txt             → IFlow 专用
│   └── default.txt           → 默认配置
└── .env                      → 环境配置
```

### 基础版本目录（禁止修改）

```
D:/space/base/oprcli/         → OPRCLI 基础版本
├── PORT=12840                ⚠️ 基础版本端口
├── PROVIDER=claude            → 基础版本使用 Claude
└── 🚫 严格禁止：修改此目录下的任何文件或关闭端口 12840 的应用
```

### MCP 工具目录

```
D:/space/mcp/                 → MCP 工具集根目录
└── mcp-browser/              → 浏览器自动化工具
```

## 🏗️ 系统架构

### 端口分配

| 端口 | 用途 | 可修改 |
|------|------|--------|
| **13579** | 工作版本（oprcli，IFlow） | ✅ |
| **12840** | 基础版本（base/oprcli，Claude） | ❌ 禁止修改 |

### 连接器架构

#### 抽象基类：BaseConnector

**核心接口**：
- `_connectInternal()` - 建立连接
- `_startSessionInternal()` - 启动会话
- `_continueSessionInternal()` - 继续会话
- `_interruptSessionInternal()` - 中断会话

**共享方法**：
- `_generateTempId()` - 生成临时 ID
- `_terminateProcess()` - 终止子进程
- `_testCommandGeneric()` - 通用命令测试
- `getSchedulerTools()` - 定时任务工具定义
- `handleSchedulerTool()` - 定时任务工具处理

#### ClaudeConnector

**特点**：
- 使用 Claude Code 命令行工具
- 支持流式事件处理
- 丰富的工具集成
- 智能代码分析

#### IFlowConnector

**特点**：
- 支持多目录工作空间
- 丰富的文件操作能力
- 强大的代码分析功能
- 中文编程优化

### MCP 工具扩展

**当前支持**：
- `mcp-browser` - 浏览器自动化工具

**架构设计**：
- 工具目录：`D:/space/mcp/`
- 标准接口：MCP (Model Context Protocol)
- 易于添加新工具

### 定时任务模块

**组件**：
- `TaskManager` - 任务调度管理器
  - 添加/删除/更新任务
  - Cron 表达式验证
  - 配置持久化
  - 自动重载 API

**内部 API**：
- `POST /api/tasks/reload` - 重新加载任务配置

### 集成模块

#### DingTalkIntegration

**功能**：
- Stream 模式连接
- 会话管理
- 消息推送
- 命令处理

#### Logger

**功能**：
- 彩色日志输出
- 日志级别控制
- 事件追踪

## 🔧 配置管理

### 环境变量配置（.env）

**核心配置**：
```bash
PROVIDER=iflow              # 当前使用的提供商
PORT=13579                  # 服务器端口
```

**Claude 配置**：
```bash
CLAUDE_CMD_PATH=...          # Claude CLI 路径
CLAUDE_WORK_DIR=D:/space     # 工作目录
```

**IFlow 配置**：
```bash
IFLOW_PATH=...               # IFlow CLI 路径
IFLOW_WORK_DIR=D:/space      # 工作目录
```

**通知配置**：
```bash
NOTIFICATION_ENABLED=true
NOTIFICATION_DINGTALK_WEBHOOK=...
NOTIFICATION_DINGTALK_SECRET=...
```

**系统提示词配置**：
```bash
SYSTEM_PROMPTS_DIR=./system-prompts
```

### 配置加载优先级

**系统提示词**：
1. 模型专用环境变量（`CLAUDE_SYSTEM_PROMPT`）
2. 全局环境变量（`SYSTEM_PROMPT`）
3. 模型专用文件（`claude.txt`）
4. 默认文件（`default.txt`）

## 🔄 工作流程

### 用户请求处理流程

```
用户发送消息到钉钉
    ↓
DingTalkIntegration 接收消息
    ↓
解析消息类型
    ├─ 命令 → _handleCommand()
    │   ├─ tasks commands → TaskManager
    │   └─ 其他命令 → 相应处理
    │
    └─ 普通消息 → Connector.startSession()
        ↓
        Agent 执行（可查阅文档）
        ↓
        流式返回结果
        ↓
        DingTalkIntegration 推送
```

### Agent 文档查阅流程

```
Agent 需要了解功能
    ↓
核心提示词提示：查阅文档
    ↓
Agent：cat system-prompts/docs/xxx.md
    ↓
Agent 阅读文档
    ↓
Agent 按文档操作
```

## 📊 设计原则

### 模块化设计

- **连接器模块**：BaseConnector 抽象，具体实现分离
- **集成模块**：独立封装，易于扩展
- **工具模块**：可复用的工具函数

### 按需加载

- **核心提示词**：精简，仅包含必需信息
- **详细文档**：独立文件，按需查阅
- **节省 Token**：减少 76% 的提示词消耗

### 向后兼容

- **保留旧版**：完整提示词仍可使用
- **渐进迁移**：支持新旧版本并存
- **环境控制**：通过环境变量切换

## 🛠️ 技术栈

**后端**：
- Node.js + Express
-钉钉 Stream SDK

**AI 模型**：
- Claude Code（Anthropic Claude）
- IFlow（心流 AI）

**定时任务**：
- node-cron

**浏览器自动化**：
- Playwright (MCP)

## 📚 相关文档

- [约束条件](./constraints.md) - 重要规则和限制
- [快速入门](./quick-start.md) - 快速上手
- [故障排查](./troubleshooting.md) - 常见问题

---

**架构设计理念**：模块化、可扩展、按需加载
