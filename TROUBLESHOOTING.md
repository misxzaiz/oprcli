# Agent 执行失败诊断指南

## 问题现象
- ✅ 钉钉消息成功接收
- ❌ Agent 没有执行或没有响应

## 快速诊断步骤

### 1. 检查 Connector 状态

运行诊断脚本：
```bash
node diagnose-flow.js
```

这会测试完整的流程并显示详细日志。

### 2. 查看服务器日志

启动服务器后，发送一条测试消息，观察日志输出：

**期望的日志顺序：**
```
[DINGTALK] ========== handleDingTalkMessage 被调用 ==========
[DINGTALK] 收到消息: 用户昵称
[DINGTALK] 消息内容: 你好...
[DINGTALK] 检查 connector 状态
[DINGTALK] 会话模式: 新会话
[DINGTALK] 开始调用 startSession...
[DINGTALK] 调用 startSession
[DINGTALK] ✅ Session 方法已调用，等待事件...
[EVENT] 收到事件 #1: system
[SESSION] 新会话ID: xxx
[EVENT] 收到事件 #2: assistant
...
[SESSION] ✅ 完成，退出码: 0, 耗时: 5.2s, 消息数: 10
```

### 3. 常见问题排查

#### 问题 A: Connector 未连接

**日志：**
```
[DINGTALK] 检查 connector 状态 { hasConnector: true, connected: false }
[DINGTALK] Connector 未连接，无法处理消息
```

**原因：** Connector 初始化失败

**解决方法：**
1. 检查 `.env` 配置是否正确
2. 确认 PROVIDER 对应的工具已安装（claude 或 iflow）
3. 运行 `node diagnose-flow.js` 查看详细错误

#### 问题 B: 没有任何事件

**日志：**
```
[DINGTALK] ✅ Session 方法已调用，等待事件...
（然后就没有任何日志了）
```

**原因：**
- IFlow/Claude 进程启动失败
- 工作目录权限问题
- 命令路径错误

**解决方法：**
1. 检查工作目录是否存在
2. 检查工具命令是否在 PATH 中
3. 尝试手动运行工具命令测试

#### 问题 C: 有事件但没有响应

**日志：**
```
[EVENT] 收到事件 #1: system
[EVENT] 收到事件 #2: tool
...
（但没有 assistant 或 result 事件）
```

**原因：**
- Agent 执行超时
- API 配置错误
- 消息格式问题

**解决方法：**
1. 增加 LOG_LEVEL=DEBUG 查看详细日志
2. 检查 Agent 的 API Key 配置
3. 尝试简单的测试消息

#### 问题 D: 发送到钉钉失败

**日志：**
```
[DINGTALK] 发送失败 { error: '...' }
```

**原因：**
- sessionWebhook 无效
- 钉钉 API 限流
- 网络问题

**解决方法：**
1. 检查钉钉开放平台的 Stream 回调配置
2. 查看钉钉机器人是否被限流
3. 检查网络连接

## 配置检查清单

### Claude 模式
```bash
PROVIDER=claude
CLAUDE_CMD_PATH=C:\Users\...\claude.cmd
CLAUDE_WORK_DIR=D:\temp
```

### IFlow 模式
```bash
PROVIDER=iflow
IFLOW_WORK_DIR=D:\temp
IFLOW_INCLUDE_DIRS=D:\tmp1,D:\tmp2
```

### 钉钉配置
```bash
DINGTALK_CLIENT_ID=ding...
DINGTALK_CLIENT_SECRET=...
```

### 调试配置
```bash
LOG_LEVEL=DEBUG
LOG_COLORED=true
STREAM_ENABLED=true
```

## 手动测试步骤

### 测试 1: 验证工具安装
```bash
# Claude 模式
claude --version

# IFlow 模式
iflow --version
```

### 测试 2: 验证工作目录
```bash
# 确保工作目录存在且有写权限
ls -la D:\temp
```

### 测试 3: 运行诊断脚本
```bash
node diagnose-flow.js
```

### 测试 4: 启动服务器
```bash
npm start
```

然后访问 http://localhost:3000 查看状态

## 获取帮助

如果以上步骤都无法解决问题，请提供：
1. 完整的服务器启动日志
2. 发送测试消息后的日志
3. `diagnose-flow.js` 的输出
4. `.env` 配置文件（隐藏敏感信息）
