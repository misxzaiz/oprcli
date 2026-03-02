# 多模型切换功能使用指南

## 功能概述

现在支持在运行时动态切换 AI 模型，无需重启服务器。可以在 Claude 和 IFlow 之间自由切换。

## 可用命令

### 🤖 模型切换

```
claude
```
切换到 Claude 模型

```
iflow
```
切换到 IFlow 模型

### 🛑 任务控制

```
end
停止
stop
```
中断当前正在执行的任务

### ℹ️ 信息查询

```
status
状态
```
查看当前系统状态（当前模型、会话状态、可用模型）

```
help
帮助
```
显示命令帮助信息

## 使用示例

### 示例 1：基本切换

```
用户: claude
系统: ✅ 已切换到 CLAUDE 模型
     💡 可用模型：CLAUDE, IFLOW

用户: 你好，请介绍一下你自己
系统: [Claude 回复...]

用户: iflow
系统: ✅ 已切换到 IFLOW 模型
     💡 可用模型：CLAUDE, IFLOW

用户: 分析当前项目
系统: [IFlow 分析...]
```

### 示例 2：中断任务

```
用户: 帮我写一个复杂的爬虫程序
系统: [开始执行...]
     [正在编写代码...]

用户: 停止
系统: ✅ 任务已中断
```

### 示例 3：查看状态

```
用户: status
系统: 📊 系统状态

     • 当前模型：CLAUDE
     • 会话状态：运行中
     • 可用模型：CLAUDE, IFLOW
```

### 示例 4：获取帮助

```
用户: help
系统: 📖 命令帮助

     🤖 模型切换：
       • claude  - 切换到 Claude 模型
       • iflow  - 切换到 IFlow 模型

     🛑 任务控制：
       • end / 停止 / stop  - 中断当前任务

     ℹ️ 信息查询：
       • status / 状态  - 查看当前状态
       • help / 帮助  - 显示此帮助

     💡 可用模型：CLAUDE, IFLOW
```

## 配置要求

### .env 文件

```bash
# 默认模型（首次对话使用）
PROVIDER=claude

# Claude 配置（必需）
CLAUDE_CMD_PATH=C:/Users/.../claude.cmd
CLAUDE_WORK_DIR=D:/temp
CLAUDE_GIT_BIN_PATH=C:/Program Files/Git/usr/bin/bash.exe

# IFlow 配置（可选）
IFLOW_PATH=C:/Users/.../iflow.cmd
IFLOW_WORK_DIR=D:/temp
IFLOW_INCLUDE_DIRS=D:/tmp1,D:/tmp2
```

### 配置说明

- **PROVIDER**: 指定默认模型，新对话将使用此模型
- **CLAUDE_***: Claude Code 的配置（如果使用 Claude）
- **IFLOW_***: IFlow 的配置（如果使用 IFlow）

⚠️ **注意**: 至少需要配置一个模型的配置才能启动服务器。

## 高级特性

### 会话隔离

不同用户/对话可以使用不同的模型：

```
用户A: claude        -> 用户A 使用 Claude
用户B: iflow         -> 用户B 使用 IFlow
用户A: 继续对话      -> 仍然使用 Claude
用户B: 继续对话      -> 仍然使用 IFlow
```

### 模型切换时的会话处理

切换模型时：
1. 自动中断当前任务（如果有）
2. 清空旧模型的 sessionId
3. 切换到新模型
4. 下一条消息将使用新模型

### 部分故障容错

如果某个模型初始化失败，其他模型仍然可用：

```
服务器启动:
  ✅ Claude 初始化成功
  ⚠️  IFlow 初始化失败 (配置错误)

用户: claude      -> ✅ 正常工作
用户: iflow       -> ❌ IFLOW 模型不可用
                  -> 💡 可用模型：CLAUDE
```

## 故障排查

### 问题 1：切换模型时显示"模型不可用"

**原因**: 该模型未正确初始化

**解决方法**:
1. 检查 `.env` 配置是否正确
2. 查看服务器启动日志，确认模型初始化状态
3. 运行 `node test-multi-provider.js` 检查配置

### 问题 2：命令没有识别

**原因**: 命令格式不正确

**解决方法**:
- 确保命令单独一行，不要包含其他内容
- 命令不区分大小写：`CLAUDE`、`claude`、`Claude` 都可以
- 命令前后可以有空格：`  claude  ` 会被识别

### 问题 3：中断命令无效

**原因**: 当前没有运行中的任务

**解决方法**:
- 检查是否有任务正在执行
- 使用 `status` 查看会话状态

## API 变更

### GET /api/status

新的响应格式：

```json
{
  "defaultProvider": "claude",
  "connectors": {
    "claude": {
      "connected": true,
      "activeSessions": []
    },
    "iflow": {
      "connected": true,
      "activeSessions": ["session-id"]
    }
  },
  "conversationProviders": [
    ["conversation-id-1", "claude"],
    ["conversation-id-2", "iflow"]
  ],
  "dingtalk": {
    "enabled": true,
    "connected": true,
    "activeSessions": [
      {
        "conversationId": "conv-id",
        "sessionId": "session-id",
        "provider": "claude"
      }
    ]
  }
}
```

## 测试

运行测试脚本验证功能：

```bash
node test-multi-provider.js
```

测试内容：
- ✅ 命令识别准确性
- ✅ 配置完整性检查
- ✅ 命令语法示例

## 更新日志

- **v1.2.0** - 新增多模型切换功能
  - 支持运行时切换 Claude / IFlow
  - 新增命令：claude, iflow, end, stop, status, help
  - 会话级别模型选择
  - 部分故障容错
  - 完善的状态查询
