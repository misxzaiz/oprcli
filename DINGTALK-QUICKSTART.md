# 钉钉 Stream 模式集成 - 快速开始

## 📦 第一步：安装依赖

```bash
npm install dingtalk-stream
```

## 🔑 第二步：创建钉钉应用

### 1. 访问钉钉开发者平台
前往：https://open-dev.dingtalk.com/

### 2. 创建应用
- 点击"创建应用"
- 选择"企业内部应用"
- 应用类型：机器人
- 填写应用名称和描述

### 3. 获取凭证
在应用详情页找到：
- **Client ID**（AppKey）：类似 `dingxxxxxxxxx`
- **Client Secret**（AppSecret）：点击查看获取

### 4. 配置权限
在"权限管理"中添加：
- `chat:read` - 读取聊天消息
- `chat:write` - 发送聊天消息

### 5. 启用 Stream 模式
在"消息接收"设置中：
- 选择 **Stream 模式**
- 保存并发布应用

## ⚙️ 第三步：配置项目

### 1. 复制配置文件模板
```bash
cp .claude-connector-dingtalk.json.example .claude-connector.json
```

### 2. 编辑配置文件
编辑 `.claude-connector.json`，填入你的信息：

```json
{
  "claudeCmdPath": "C:\\Users\\YourUsername\\AppData\\Roaming\\npm\\claude.cmd",
  "workDir": "D:\\MyProject",
  "gitBinPath": "C:\\Program Files\\Git\\bin\\bash.exe",
  "dingtalk": {
    "clientId": "dingxxxxxxxxxxxxxxxx",
    "clientSecret": "你的ClientSecret",
    "enabled": true
  }
}
```

**配置说明**：
- `claudeCmdPath`：claude 命令的路径（Windows 通常是 `C:\Users\用户名\AppData\Roaming\npm\claude.cmd`）
- `workDir`：工作目录（Claude 会在此目录执行命令）
- `gitBinPath`：Git Bash 路径（Windows 必需）
- `dingtalk.clientId`：从钉钉开发者平台获取
- `dingtalk.clientSecret`：从钉钉开发者平台获取

## 🚀 第四步：启动服务

```bash
node web-server-dingtalk.js
```

**预期输出**：
```
========================================
  Claude Connector Web Server
  with DingTalk Stream Integration
========================================

🌐 Web 服务器运行在: http://localhost:3000
[DingTalk] 正在连接...
[DingTalk] ✅ WebSocket 连接成功
[DingTalk] ✅ 初始化成功
✅ 钉钉 Stream 模式已启用

按 Ctrl+C 停止服务器
```

## 📱 第五步：添加机器人到钉钉群

### 1. 在钉钉群中添加机器人
- 打开群设置
- 选择"智能群助理" → "添加机器人"
- 找到你创建的应用
- 添加到群

### 2. 测试发送消息
在群里发送：
```
@机器人 你好
```

**预期行为**：
1. 机器人回复：`🤖 正在思考中...`
2. 几秒后回复 Claude 的响应

## 🧪 测试用例

### 测试 1：基本对话
```
@机器人 你是谁？
```

### 测试 2：文件操作
```
@机器人 在D:/temp创建一个文件hello.txt，内容是"Hello World"
```

### 测试 3：会话记忆
```
@机器人 刚才创建了什么文件？
```
（应该记得之前创建的 `hello.txt`）

### 测试 4：复杂任务
```
@机器人 列出当前目录的所有文件
```

## 🔍 调试技巧

### 查看日志
服务器会输出详细的日志：
```
[DingTalk] 📩 收到消息: {...}
[DingTalk] 💬 张三: 你好
[DingTalk] 📝 会话: xxx, Claude Session: 新会话
[DingTalk] 🆔 新会话ID: yyy
[DingTalk] ✅ Claude 完成，退出码: 0
[DingTalk] ✅ 回复已发送 (123 字符)
```

### 常见问题

#### 1. 钉钉未初始化
**错误**：`[DingTalk] 未配置 clientId 或 clientSecret`

**解决**：
- 检查 `.claude-connector.json` 文件是否存在
- 确认 `clientId` 和 `clientSecret` 是否正确填写
- 格式必须是 `"dingxxxxx..."`

#### 2. WebSocket 连接失败
**错误**：`[DingTalk] ❌ 初始化失败: connect failed`

**可能原因**：
- Client ID 或 Client Secret 错误
- 网络问题
- 应用未发布或未启用 Stream 模式

**解决**：
- 重新确认凭证是否正确
- 检查应用是否已发布
- 检查应用是否启用 Stream 模式
- 检查网络连接

#### 3. Claude 连接失败
**错误**：`未连接，请先调用 /api/connect`

**解决**：
- 确认 `claudeCmdPath` 是否正确
- 确认 Claude Code CLI 已安装
- 测试命令：在终端运行 `claude --version`

#### 4. 消息无响应
**可能原因**：
- Claude CLI 进程卡死
- workDir 权限问题
- 系统资源不足

**解决**：
- 检查服务器日志
- 按 Ctrl+C 停止并重启服务
- 检查 workDir 是否有权限

## 📊 API 端点

### 获取状态
```bash
curl http://localhost:3000/api/status
```

**响应**：
```json
{
  "connected": true,
  "activeSessions": [],
  "currentSessionId": null,
  "dingtalk": {
    "enabled": true,
    "connected": true,
    "activeSessions": []
  }
}
```

### 获取钉钉状态
```bash
curl http://localhost:3000/api/dingtalk/status
```

**响应**：
```json
{
  "enabled": true,
  "connected": true,
  "activeSessions": [
    {
      "conversationId": "xxx",
      "sessionId": "yyy"
    }
  ]
}
```

## 🔐 安全建议

### 1. 保护配置文件
```bash
# 将配置文件添加到 .gitignore
echo ".claude-connector.json" >> .gitignore
```

### 2. 使用环境变量（可选）
修改代码支持环境变量：
```javascript
const clientId = process.env.DINGTALK_CLIENT_ID || config.dingtalk.clientId;
const clientSecret = process.env.DINGTALK_CLIENT_SECRET || config.dingtalk.clientSecret;
```

### 3. 限制工作目录
确保 `workDir` 不会访问敏感目录：
```json
{
  "workDir": "D:\\safe\\directory"
}
```

## 🎯 下一步

### 1. 查看完整文档
阅读 `DINGTALK-INTEGRATION-PLAN.md` 了解更多细节

### 2. 自定义功能
- 修改 `handleDingTalkMessage()` 函数自定义消息处理
- 添加命令支持（如 `/reset`, `/help`）
- 实现 Markdown 卡片回复

### 3. 部署到生产环境
- 使用 PM2 保持服务运行
```bash
npm install -g pm2
pm2 start web-server-dingtalk.js --name claude-dingtalk
pm2 save
pm2 startup
```

- 配置日志
```bash
pm2 logs claude-dingtalk
```

---

**需要帮助？**
- 查看钉钉官方文档：https://open.dingtalk.com/document/development/introduction-to-stream-mode
- 查看 dingtalk-stream NPM：https://npmjs.com/package/dingtalk-stream
