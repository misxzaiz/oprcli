# 通知功能使用指南

你可以通过通知脚本发送钉钉消息，用于任务完成通知、异常告警、进度更新等。

## 🎯 功能概述

### 使用场景

- ✅ **任务完成通知**：告知用户任务已完成
- ✅ **异常告警**：立即通知异常情况
- ✅ **进度更新**：关键节点通知用户
- ✅ **结果报告**：发送执行结果

## 📖 发送通知

### 基本用法

```bash
node scripts/notify.js "通知内容"
```

### 使用示例

#### 示例 1：简单通知
```bash
node scripts/notify.js "任务完成"
```

#### 示例 2：包含变量
```bash
node scripts/notify.js "北京今日天气：晴天 20°C"
```

#### 示例 3：多行通知
```bash
node scripts/notify.js "任务报告：
- 状态：成功
- 耗时：2.5秒
- 结果：已保存"
```

#### 示例 4：包含表情符号
```bash
node scripts/notify.js "✅ 备份完成"
node scripts/notify.js "❌ 备份失败"
node scripts/notify.js "⚠️ 警告：CPU使用率85%"
```

## ⚙️ 通知脚本特性

### 核心特性

- ✅ **自动读取配置**：从环境变量读取 webhook URL
- ✅ **自动签名**：支持钉钉加签验证（如果配置）
- ✅ **简单调用**：只需传入通知内容
- ✅ **Agent 自主**：Agent 决定何时通知、通知什么
- ✅ **错误处理**：统一的错误处理和日志记录

### 环境变量配置

通知脚本会自动读取以下环境变量：

```bash
# 通知功能开关
NOTIFICATION_ENABLED=true

# 通知类型
NOTIFICATION_TYPE=dingtalk

# 钉钉机器人 Webhook URL
NOTIFICATION_DINGTALK_WEBHOOK=https://oapi.dingtalk.com/robot/send?access_token=xxx

# 钉钉机器人加签密钥（可选）
NOTIFICATION_DINGTALK_SECRET=SECxxxxxxxxx

# 默认消息类型
NOTIFICATION_DEFAULT_TYPE=text

# 是否记录通知历史
NOTIFICATION_LOG_ENABLED=true
NOTIFICATION_LOG_FILE=logs/notifications.log
```

## 💡 最佳实践

### ✅ 通知时机

- **任务完成时**：告知用户任务已完成
- **发现异常时**：立即通知异常情况
- **重要进度**：关键节点通知用户

### ❌ 避免过度通知

- 不要每一步都通知
- 避免发送大量相似的通知
- 正常的中间步骤不需要通知

### 📝 通知内容

- **简洁明了**：一两句话说清楚
- **包含关键信息**：状态、结果、异常
- **适当使用表情符号**：✅ ❌ ⚠️ 🔄

## 🔄 完整工作流示例

### 场景 1：查询天气并通知

```
1. 查询天气：curl wttr.in/Beijing?format=3
2. 解析结果：☀️ +20°C
3. 发送通知：node scripts/notify.js "北京今日天气：晴天 20°C"
```

### 场景 2：监控服务器状态

```
1. 检查服务器：curl http://server/api/status
2. 解析 JSON，提取 CPU 和内存
3. if (CPU > 80% 或 内存 > 85%) {
     node scripts/notify.js "⚠️ 服务器告警：CPU ${cpu}%，内存 ${mem}%"
   }
```

### 场景 3：定时任务中的通知

**任务配置**：
```json
{
  "message": "1. 查询天气
2. 发送通知：node scripts/notify.js '今日天气：[结果]'
3. 如果失败，发送：node scripts/notify.js '❌ 天气查询失败'"
}
```

## 🔧 高级用法

### 在定时任务中使用

**场景**：每天早上9点提醒查看天气

```json
{
  "id": "daily-weather-reminder",
  "name": "每日天气提醒",
  "schedule": "0 9 * * *",
  "provider": "claude",
  "message": "
    1. 查询北京天气：curl wttr.in/Beijing?format=3
    2. 整理结果
    3. 发送通知：node scripts/notify.js '今日天气：[结果]'
  "
}
```

### 条件通知

**场景**：仅在异常时通知

```json
{
  "message": "
    1. 检查服务器状态
    2. 解析 CPU 和内存
    3. if (CPU > 80%) {
       node scripts/notify.js '⚠️ 警告：CPU使用率过高'
     }
  "
}
```

### 进度通知

**场景**：长时间任务的进度更新

```json
{
  "message": "
    1. node scripts/notify.js '🔄 开始备份数据库'
    2. 执行备份：mysqldump ...
    3. node scripts/notify.js '✅ 备份完成'
  "
}
```

## ⚠️ 注意事项

1. **自动读取配置**：通知脚本会自动读取环境变量配置

2. **不要硬编码**：不要在任务配置中硬编码 webhook URL

3. **通知内容要简洁**：适合移动端快速阅读

4. **如果通知失败**：脚本会返回非零退出码

## 🔍 故障排查

### 通知发送失败

**检查步骤**：

1. **检查环境变量**
   ```bash
   echo $NOTIFICATION_DINGTALK_WEBHOOK
   ```

2. **查看通知日志**
   ```bash
   cat logs/notifications.log
   ```

3. **手动测试**
   ```bash
   node scripts/notify.js "测试消息"
   ```

4. **检查钉钉机器人配置**
   - Webhook URL 是否正确
   - 加签密钥是否匹配
   - 机器人是否被限流

### 常见错误

**错误 1**：`未配置 NOTIFICATION_DINGTALK_WEBHOOK`
- **解决**：在 `.env` 中配置 Webhook URL

**错误 2**：`通知发送失败：HTTP 403`
- **原因**：签名验证失败
- **解决**：检查 `NOTIFICATION_DINGTALK_SECRET` 是否正确

**错误 3**：`通知发送失败：HTTP 429`
- **原因**：钉钉限流
- **解决**：降低通知频率

## 📚 相关文档

- [定时任务管理](./scheduler.md) - 如何在定时任务中使用通知
- [快速入门](./quick-start.md) - 快速上手指南
- [故障排查](./troubleshooting.md) - 常见问题解决

---

**配置文件位置**：`.env`（环境变量配置）
