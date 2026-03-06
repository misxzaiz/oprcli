# Codex Connector 使用指南

## 📖 概述

Codex Connector 是 OPRCLI 项目的新增组件，用于连接和集成 [Codex CLI](https://github.com/openai/codex) 工具。

## ✨ 特性

- ✅ 完整的会话管理（创建、续接、中断）
- ✅ 流式输出实时解析
- ✅ 系统提示词支持
- ✅ 平台兼容（Windows/Linux）
- ✅ 与现有 OPRCLI 架构无缝集成

## 🚀 快速开始

### 1. 安装 Codex CLI

```bash
# 使用 pip 安装
pip install codex

# 或使用其他安装方式
# 参考：https://github.com/openai/codex#installation
```

### 2. 配置环境变量

在 `.env` 文件中添加：

```bash
# 设置提供商为 codex
PROVIDER=codex

# Codex 配置
CODEX_PATH=codex
CODEX_WORK_DIR=D:/space/workspace
CODEX_SYSTEM_PROMPT_FILE=./system-prompts/codex.txt

# 模型配置（可选）
CODEX_MODEL=gpt-5-codex
CODEX_MODEL_PROVIDER=anyrouter
```

### 3. 配置 Codex

Codex 需要配置 API 提供商。创建 `~/.codex/config.toml`：

```toml
model = "gpt-5-codex"
model_provider = "anyrouter"
preferred_auth_method = "apikey"

[model_providers.anyrouter]
name = "Any Router"
base_url = "https://api.777114.xyz/v1"
wire_api = "chat"
api_key = "your-api-key-here"
```

### 4. 启动服务

```bash
node server.js
```

### 5. 测试连接

```bash
# 运行测试脚本
node scripts/test-codex.js
```

## 📋 可用命令

通过钉钉机器人发送：

| 命令 | 说明 |
|------|------|
| `codex` | 切换到 Codex 提供商 |
| `status` | 查看系统状态 |
| `help` | 查看帮助信息 |

## 🔧 配置选项

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `CODEX_PATH` | Codex 命令路径 | `codex` |
| `CODEX_WORK_DIR` | 工作目录 | 当前目录 |
| `CODEX_SYSTEM_PROMPT_FILE` | 系统提示词文件 | - |
| `CODEX_MODEL` | 模型名称 | - |
| `CODEX_MODEL_PROVIDER` | 模型提供商 | - |

### 系统提示词

默认提示词文件：`system-prompts/codex.txt`

你可以根据需要自定义：
- 项目特定规则
- 代码风格指南
- 工作流程约定

## 🏗️ 架构说明

### 连接器结构

```
connectors/
├── base-connector.js      # 抽象基类
├── claude-connector.js    # Claude 连接器
├── iflow-connector.js     # IFlow 连接器
└── codex-connector.js     # Codex 连接器（新增）
```

### 核心方法

CodexConnector 实现了以下抽象方法：

```javascript
class CodexConnector extends BaseConnector {
  async _connectInternal(options)           // 建立连接
  async _startSessionInternal(message, opts) // 启动会话
  async _continueSessionInternal(id, msg, opts) // 继续会话
  _interruptSessionInternal(sessionId)      // 中断会话
}
```

### 事件流

```
用户消息
  ↓
Codex CLI 进程
  ↓
stdout/stderr 解析
  ↓
事件转换（_processOutput）
  ↓
统一事件格式
  ↓
钉钉推送
```

## 🧪 测试

### 运行测试

```bash
# 完整测试
node scripts/test-codex.js

# 或使用 npm script（如果配置了）
npm test:codex
```

### 测试覆盖

测试脚本验证以下功能：

1. ✅ 连接测试（版本检测）
2. ✅ 会话创建（基本消息发送）
3. ✅ 会话中断（进程终止）
4. ✅ 会话列表（活动会话查询）

### 自定义测试

```javascript
const CodexConnector = require('../connectors/codex-connector');

const connector = new CodexConnector({
  codexPath: 'codex',
  workDir: process.cwd()
});

// 连接
await connector.connect();

// 启动会话
const session = await connector.startSession('你好', {
  onEvent: (event) => {
    console.log('收到事件:', event);
  },
  onComplete: (code) => {
    console.log('完成，退出码:', code);
  }
});

// 中断会话
connector.interruptSession(session.sessionId);
```

## 🐛 故障排查

### 问题：Codex 命令不可用

**错误**：`Codex 命令不可用，请确保 codex 已安装并在 PATH 中`

**解决**：
```bash
# 检查安装
codex --version

# 如果未安装
pip install codex

# 或指定完整路径
CODEX_PATH=/path/to/codex
```

### 问题：API 认证失败

**错误**：`401 Unauthorized`

**解决**：
1. 检查 `~/.codex/config.toml` 中的 API key
2. 确认 API 提供商的 URL 正确
3. 验证网络连接

### 问题：输出格式不匹配

**症状**：收到乱码或无法解析的输出

**解决**：
1. 检查 Codex 版本兼容性
2. 查看 Codex 文档了解输出格式
3. 调整 `_parseCodexEvent` 方法

### 问题：进程无法终止

**症状**：会话中断后进程仍在运行

**解决**：
1. Windows: 使用任务管理器结束 `codex.exe`
2. Linux/Mac: 使用 `killall codex`
3. 检查 `_terminateProcess` 方法实现

## 📝 开发指南

### 添加新功能

1. 在 `CodexConnector` 类中添加方法
2. 更新系统提示词（如需要）
3. 添加测试用例
4. 更新文档

### 输出格式扩展

如果 Codex 有新的输出格式：

1. 更新 `_processOutput` 方法
2. 添加新的 `_parseXxxEvent` 方法
3. 更新事件流转换逻辑

### 贡献代码

欢迎提交 Pull Request！

## 📚 相关资源

- [OPRCLI 主文档](../README.md)
- [BaseConnector 文档](../connectors/base-connector.js)
- [Codex CLI 官方文档](https://github.com/openai/codex)
- [系统提示词目录](../system-prompts/)

## 📄 许可证

与 OPRCLI 项目相同

---

**提示**：如有问题，请查看 [故障排查](#-故障排查) 部分或提交 Issue。
