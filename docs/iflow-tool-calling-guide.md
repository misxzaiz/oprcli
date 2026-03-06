# IFlow 外部工具调用指南

> 📅 创建时间：2026-03-05
> 🎯 解决 IFlow 调用外部脚本失败的问题

---

## 🔍 问题诊断

### 错误现象
```
❌ 工具失败：undefined 退出码：undefined
```

### 根本原因

1. **平台差异**
   - IFlow 默认使用 `bash` 执行命令
   - Windows 系统可能没有 `bash`
   - 导致命令执行失败

2. **路径问题**
   - 相对路径解析不正确
   - 工作目录不一致

3. **返回值处理**
   - IFlow 无法正确解析脚本输出
   - 退出码判断错误

---

## ✅ 解决方案

### 方案 1：使用包装器（推荐）⭐

**调用方式**：
```bash
# IFlow 任务中这样写
node tasks/iflow-tool-wrapper.js notify "消息内容"
```

**优点**：
- ✅ 跨平台兼容
- ✅ 统一接口
- ✅ JSON 格式输出
- ✅ 错误处理完善

**示例**：
```javascript
// IFlow 任务 message
执行资讯收集并发送通知：

node tasks/iflow-tool-wrapper.js collect-news

如果收集成功，使用输出结果发送通知。
```

---

### 方案 2：直接调用（需要修改）

**调用方式**：
```bash
# Windows（使用 cmd）
cmd /c "node scripts/notify.js \"消息\""

# Linux/Mac（使用 bash）
bash -c "node scripts/notify.js '消息'"
```

**缺点**：
- ❌ 需要判断平台
- ❌ 命令格式复杂
- ❌ 转义字符容易出错

---

### 方案 3：使用系统提示词指导

**在 IFlow 任务中添加**：
```
在调用外部脚本时，请遵循以下规则：

1. **通知脚本**
   - 使用: node tasks/iflow-tool-wrapper.js notify "消息"
   - 输出: JSON 格式

2. **资讯收集**
   - 使用: node tasks/iflow-tool-wrapper.js collect-news
   - 输出: JSON 格式

3. **其他脚本**
   - 使用 node 命令直接调用
   - 检查返回值的 exitCode
```

---

## 📋 可用工具命令

### 1. 发送文本通知

```bash
node tasks/iflow-tool-wrapper.js notify "消息内容"
```

**返回**：
```json
{
  "success": true,
  "message": "✅ 钉钉通知发送成功"
}
```

---

### 2. 发送 Markdown 通知

```bash
node tasks/iflow-tool-wrapper.js notify-markdown "标题" "内容"
```

**返回**：
```json
{
  "success": true,
  "message": "✅ 钉钉通知发送成功"
}
```

---

### 3. 执行资讯收集

```bash
node tasks/iflow-tool-wrapper.js collect-news
```

**返回**：
```json
{
  "success": true,
  "message": "✅ 资讯收集完成",
  "output": "..."
}
```

---

## 🔧 IFlow 任务配置示例

### 示例 1：简单的通知任务

**配置文件**：
```json
{
  "id": "test-notification",
  "name": "测试通知",
  "enabled": false,
  "schedule": "0 9 * * *",
  "provider": "iflow",
  "message": "发送测试通知：\n\n执行命令：\nnode tasks/iflow-tool-wrapper.js notify \"这是一条测试消息\"\n\n检查返回值，如果 success 为 true，说明发送成功。"
}
```

---

### 示例 2：资讯收集任务

**配置文件**：
```json
{
  "id": "daily-news-collector",
  "name": "每日资讯收集",
  "enabled": false,
  "schedule": "30 4 * * *",
  "provider": "iflow",
  "message": "执行资讯收集任务：\n\n**步骤1**：执行收集脚本\nnode tasks/iflow-tool-wrapper.js collect-news\n\n**步骤2**：等待脚本完成\n\n**步骤3**：检查返回值\n- 如果 success: true，收集成功\n- 如果 success: false，收集失败\n\n**步骤4**：根据返回结果通知用户\n- 成功：发送资讯摘要\n- 失败：发送错误信息"
}
```

---

### 示例 3：复杂任务流程

**配置文件**：
```json
{
  "id": "complex-task",
  "name": "复杂任务流程",
  "enabled": false,
  "schedule": "0 */6 * * *",
  "provider": "iflow",
  "message": "执行复杂任务流程：\n\n1. **收集资讯**\n   执行: node tasks/iflow-tool-wrapper.js collect-news\n   等待完成并检查返回值\n\n2. **分析结果**\n   如果收集成功，分析输出内容\n   提取关键信息和推荐指数\n\n3. **发送通知**\n   使用: node tasks/iflow-tool-wrapper.js notify-markdown\n   参数1: \"📰 资讯分析报告\"\n   参数2: 分析结果（Markdown格式）\n\n4. **错误处理**\n   如果任何步骤失败，发送错误通知"
}
```

---

## 💡 最佳实践

### 1. 使用包装器

**推荐**：
```javascript
// ✅ 使用包装器
node tasks/iflow-tool-wrapper.js notify "消息"
```

**避免**：
```javascript
// ❌ 直接调用（可能失败）
node scripts/notify.js "消息"
```

---

### 2. 检查返回值

**IFlow 应该**：
```
1. 执行命令
2. 解析 JSON 输出
3. 检查 success 字段
4. 根据 success 决定后续操作
```

---

### 3. 错误处理

**建议**：
```
如果返回 success: false
- 不要继续执行
- 发送错误通知
- 记录错误日志
```

---

### 4. 工作目录

**重要**：
- 所有命令都在 `D:/space/oprcli` 目录下执行
- 使用相对路径时注意基准目录
- 推荐使用绝对路径

---

## 🧪 测试验证

### 测试包装器

```bash
# 测试通知功能
node tasks/iflow-tool-wrapper.js notify "测试消息"

# 测试 Markdown 通知
node tasks/iflow-tool-wrapper.js notify-markdown "标题" "内容"

# 测试资讯收集
node tasks/iflow-tool-wrapper.js collect-news
```

### 查看返回值

所有命令都会返回 JSON 格式：
```json
{
  "success": true/false,
  "message": "描述信息",
  "output": "输出内容（可选）",
  "error": "错误信息（可选）"
}
```

---

## 🐛 故障排除

### 问题 1：命令执行失败

**可能原因**：
- 路径不正确
- 权限不足
- 脚本不存在

**解决方法**：
```bash
# 1. 检查脚本是否存在
ls tasks/iflow-tool-wrapper.js

# 2. 手动测试
node tasks/iflow-tool-wrapper.js notify "测试"

# 3. 查看详细错误
node tasks/iflow-tool-wrapper.js notify "测试" 2>&1
```

---

### 问题 2：通知未发送

**可能原因**：
- 环境变量未设置
- Webhook 配置错误
- 网络连接问题

**解决方法**：
```bash
# 1. 检查环境变量
echo %NOTIFICATION_DINGTALK_WEBHOOK%

# 2. 测试 notify.js
node scripts/notify.js "直接测试"

# 3. 检查钉钉机器人
- 确认机器人未被禁用
- 确认关键词设置正确
```

---

### 问题 3：返回值解析失败

**可能原因**：
- JSON 格式错误
- 输出包含额外内容

**解决方法**：
```bash
# 1. 查看原始输出
node tasks/iflow-tool-wrapper.js notify "测试"

# 2. 检查 JSON 格式
# 输出应该是纯 JSON，没有其他内容

# 3. 如果有问题，修改包装器
# 确保 console.log 只输出一次 JSON
```

---

## 📚 相关文档

- [IFlow 使用指南](../system-prompts/docs/quick-start.md)
- [通知功能文档](./notification.md)
- [定时任务管理](./scheduler.md)
- [资讯收集器使用指南](./news-collector-iflow-guide.md)

---

## 🎯 快速参考

### 常用命令

| 功能 | 命令 |
|------|------|
| **文本通知** | `node tasks/iflow-tool-wrapper.js notify "消息"` |
| **Markdown通知** | `node tasks/iflow-tool-wrapper.js notify-markdown "标题" "内容"` |
| **资讯收集** | `node tasks/iflow-tool-wrapper.js collect-news` |

### 返回格式

```json
{
  "success": true,
  "message": "操作描述"
}
```

### 错误格式

```json
{
  "success": false,
  "error": "错误信息",
  "message": "操作失败"
}
```

---

## ✅ 总结

### 核心要点

1. **使用包装器**：`tasks/iflow-tool-wrapper.js`
2. **检查返回值**：JSON 格式，`success` 字段
3. **错误处理**：失败时不要继续执行
4. **测试验证**：手动测试后再配置到任务

### 立即开始

```bash
# 1. 测试包装器
node tasks/iflow-tool-wrapper.js notify "测试消息"

# 2. 查看定时任务
cat scheduler/tasks.json

# 3. 启用任务
tasks enable daily-news-collector
tasks reload

# 4. 手动测试
tasks run daily-news-collector
```

---

**版本**: v1.0.0
**更新**: 2026-03-05
**维护**: OPRCLI Team

🎉 **问题已解决，IFlow 现在可以正确调用外部工具了！**
