# 钉钉流式响应配置指南

## 📋 配置文件位置

配置文件：`.claude-connector.json`

## 🎯 完整配置示例

```json
{
  "claudeCmdPath": "C:\\Users\\YourUsername\\AppData\\Roaming\\npm\\claude.cmd",
  "workDir": "D:\\MyProject",
  "gitBinPath": "C:\\Program Files\\Git\\bin\\bash.exe",

  "dingtalk": {
    "clientId": "dingxxxxxxxxxxxxxxxx",
    "clientSecret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "enabled": true,

    "streaming": {
      "enabled": true,
      "mode": "realtime",
      "sendInterval": 2000,
      "maxOutputLength": 500,
      "showThinking": true,
      "showTools": true,
      "showTime": true
    },

    "logging": {
      "level": "EVENT",
      "colored": true,
      "file": null
    }
  }
}
```

---

## 🔧 配置项说明

### 1. 基础配置（Claude Code CLI）

| 配置项 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `claudeCmdPath` | string | ✅ | Claude CLI 命令路径 |
| `workDir` | string | ✅ | 工作目录（Claude 执行命令的目录）|
| `gitBinPath` | string | ✅ | Git Bash 路径（Windows 必需）|

#### 示例

```json
{
  "claudeCmdPath": "C:\\Users\\YourName\\AppData\\Roaming\\npm\\claude.cmd",
  "workDir": "D:\\MyProject",
  "gitBinPath": "C:\\Program Files\\Git\\bin\\bash.exe"
}
```

---

### 2. 钉钉基础配置

| 配置项 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `clientId` | string | ✅ | 钉钉应用的 Client ID（AppKey）|
| `clientSecret` | string | ✅ | 钉钉应用的 Client Secret（AppSecret）|
| `enabled` | boolean | ❌ | 是否启用钉钉功能（默认 true）|

#### 获取方式

1. 访问 [钉钉开发者平台](https://open-dev.dingtalk.com/)
2. 创建企业内部应用
3. 在应用详情页获取 Client ID 和 Client Secret

#### 示例

```json
{
  "dingtalk": {
    "clientId": "dingxxxxxxxxxxxxxxxx",
    "clientSecret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "enabled": true
  }
}
```

---

### 3. 流式响应配置（streaming）

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | boolean | `true` | 是否启用流式响应 |
| `mode` | string | `"realtime"` | 流式模式：`realtime`（实时）\| `batch`（批量）|
| `sendInterval` | number | `2000` | 批量模式下的发送间隔（毫秒）|
| `maxOutputLength` | number | `500` | 工具输出最大长度（超过会截断）|
| `showThinking` | boolean | `true` | 是否显示思考过程 |
| `showTools` | boolean | `true` | 是否显示工具调用 |
| `showTime` | boolean | `true` | 是否显示时间戳 |

#### enabled: 是否启用流式响应

- `true`：实时发送 Claude 的处理过程（思考、工具、回复）
- `false`：等待完成后一次性返回结果

**对比**：

```json
// 流式模式（推荐）
{
  "streaming": {
    "enabled": true
  }
}
```

钉钉显示：
```
💭 [思考 1] 让我分析一下...
🖥️ [工具 2] Bash
ls -la
✅ [完成 3] Bash 退出码: 0
💬 [回复 4] 分析结果如下...
```

```json
// 非流式模式
{
  "streaming": {
    "enabled": false
  }
}
```

钉钉显示：
```
💬 分析结果如下...（完整回复，不显示过程）
```

#### mode: 流式模式

- `"realtime"`：实时模式（推荐）- 每个事件立即发送
- `"batch"`：批量模式 - 累积一定时间后发送

#### maxOutputLength: 输出截断长度

防止工具输出过长刷屏：

```json
{
  "streaming": {
    "maxOutputLength": 500  // 最多显示 500 字符
  }
}
```

效果：
```
📤 [输出 1]
total 16
drwxr-xr-x 2 user group 4096 Mar  1 23:00 .
drwxr-xr-x 5 user group 4096 Mar  1 22:00 ..
-rw-r--r-- 1 user group  123 Mar  1 23:00 file.txt
... (已截断，共 2048 字符)
```

#### showThinking / showTools / showTime: 显示控制

```json
{
  "streaming": {
    "showThinking": true,   // 显示思考过程
    "showTools": true,      // 显示工具调用
    "showTime": true        // 显示时间戳
  }
}
```

如果想简化输出，可以关闭部分显示：

```json
{
  "streaming": {
    "showThinking": false,  // 不显示思考过程
    "showTools": true,      // 只显示工具调用
    "showTime": false       // 不显示时间
  }
}
```

效果对比：

**全部显示**：
```
💭 [思考 1] 我需要查看文件列表
⏱️ 0.5s

🖥️ [工具 2] Bash
ls -la
⏱️ 0.6s

✅ [完成 3] Bash 退出码: 0
⏱️ 0.8s
```

**只显示工具**：
```
🖥️ [工具 1] Bash
ls -la

✅ [完成 2] Bash 退出码: 0
```

---

### 4. 日志配置（logging）

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `level` | string | `"EVENT"` | 日志级别：`DEBUG` \| `INFO` \| `EVENT` \| `SUCCESS` \| `WARNING` \| `ERROR` |
| `colored` | boolean | `true` | 是否启用彩色日志 |
| `file` | string \| null | `null` | 日志文件路径（null 表示不输出到文件）|

#### level: 日志级别

控制日志输出详细程度：

| 级别 | 显示内容 | 适用场景 |
|------|----------|----------|
| `DEBUG` | 所有信息（包括完整的工具输出）| 开发调试 |
| `INFO` | 基本信息 | 日常使用 |
| `EVENT` | 重要事件（推荐）| 生产环境 |
| `SUCCESS` | 仅成功消息 | 简化监控 |
| `WARNING` | 仅警告和错误 | 错误追踪 |
| `ERROR` | 仅错误 | 最简输出 |

#### 示例

**开发调试**（最详细）：
```json
{
  "logging": {
    "level": "DEBUG",
    "colored": true
  }
}
```

服务器日志：
```
[23:45:12.123] 🔍 [DEBUG] [TOOL] 📤 工具输出 #3
{
  "output": "total 16\ndrwxr-xr-x 2 user group 4096...",
  "truncated": false,
  "elapsed": "0.5s"
}
```

**日常使用**（推荐）：
```json
{
  "logging": {
    "level": "EVENT",
    "colored": true
  }
}
```

服务器日志：
```
[23:45:12.123] 📡 [EVENT] [THINKING] 思考过程 #1
[23:45:12.456] 📡 [EVENT] [TOOL] 🔧 工具调用 #2: Bash
[23:45:12.789] ✅ [SUCCESS] [ASSISTANT] 💬 Claude 回复 #3
```

**生产环境**（简化）：
```json
{
  "logging": {
    "level": "WARNING",
    "colored": false
  }
}
```

服务器日志：
```
[23:45:12.123] ⚠️ [WARNING] [DINGTALK] ⚠️ 消息内容为空
[23:45:13.456] ❌ [ERROR] [SESSION] ❌ Claude 错误
```

#### colored: 彩色日志

- `true`：终端显示彩色日志（推荐）
- `false`：纯文本日志（适合日志文件）

#### file: 日志文件输出

```json
{
  "logging": {
    "level": "EVENT",
    "colored": true,
    "file": "dingtalk.log"  // 输出到文件
  }
}
```

日志文件内容：
```
2026-03-01T23:45:12.123Z [EVENT] [DINGTALK] 💬 收到消息: 张三
2026-03-01T23:45:12.456Z [EVENT] [TOOL] 🔧 工具调用 #1: Bash
2026-03-01T23:45:12.789Z [SUCCESS] [ASSISTANT] 💬 Claude 回复 #2
```

---

## 🎨 推荐配置方案

### 方案 1：开发者配置（最详细）

适合：开发、调试、学习

```json
{
  "dingtalk": {
    "streaming": {
      "enabled": true,
      "mode": "realtime",
      "maxOutputLength": 1000,
      "showThinking": true,
      "showTools": true,
      "showTime": true
    },
    "logging": {
      "level": "DEBUG",
      "colored": true,
      "file": "dingtalk-debug.log"
    }
  }
}
```

### 方案 2：日常使用（推荐）

适合：日常使用、团队协作

```json
{
  "dingtalk": {
    "streaming": {
      "enabled": true,
      "mode": "realtime",
      "maxOutputLength": 500,
      "showThinking": true,
      "showTools": true,
      "showTime": true
    },
    "logging": {
      "level": "EVENT",
      "colored": true
    }
  }
}
```

### 方案 3：生产环境（简化）

适合：生产环境、减少干扰

```json
{
  "dingtalk": {
    "streaming": {
      "enabled": true,
      "mode": "realtime",
      "maxOutputLength": 300,
      "showThinking": false,
      "showTools": true,
      "showTime": false
    },
    "logging": {
      "level": "WARNING",
      "colored": false,
      "file": "dingtalk.log"
    }
  }
}
```

### 方案 4：最小干扰（最简）

适合：只关心最终结果

```json
{
  "dingtalk": {
    "streaming": {
      "enabled": false  // 关闭流式，一次性返回
    },
    "logging": {
      "level": "ERROR"
    }
  }
}
```

---

## 🔍 配置验证

### 检查配置是否生效

启动服务器后查看日志：

```
[DingTalk] 正在连接...
[Claude] 正在初始化连接...
[Claude] ✅ 连接成功
[DingTalk] ✅ 初始化成功
✅ 钉钉 Stream 模式已启用
```

### 测试流式响应

在钉钉群发送：
```
@机器人 列出当前目录的文件
```

如果流式响应启用，你会看到多条消息：
1. "🤖 开始处理您的请求..."
2. "🖥️ [工具 1] Bash"
3. "✅ [完成 2] Bash 退出码: 0"
4. "💬 [回复 3] ..."
5. "✅ 处理完成！"

如果流式响应关闭，只会看到：
1. 一条完整的回复消息

---

## ⚠️ 常见问题

### 1. 配置文件不生效

**原因**：JSON 格式错误或路径错误

**解决**：
```bash
# 验证 JSON 格式
node -e "console.log(require('./.claude-connector.json'))"
```

### 2. 流式响应没有效果

**检查**：
- `streaming.enabled` 是否为 `true`
- 服务器是否重启（修改配置后需要重启）

### 3. 日志太多/太少

**调整**：
- 修改 `logging.level`
- 选择合适的级别（DEBUG < INFO < EVENT < SUCCESS < WARNING < ERROR）

### 4. 工具输出被截断

**调整**：
- 增加 `streaming.maxOutputLength`
- 设置为更大的值（如 2000）

---

## 📝 配置文件位置

- **配置文件**：`.claude-connector.json`
- **模板文件**：`.claude-connector-dingtalk.json.example`
- **注意**：配置文件已在 `.gitignore` 中，不会被提交到 Git

---

**文档版本**: 1.0.0
**更新日期**: 2026-03-01
