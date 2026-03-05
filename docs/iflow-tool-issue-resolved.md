# ✅ IFlow 工具调用问题已解决

> 📅 解决时间：2026-03-05
> 🎯 问题：IFlow 调用外部脚本出现 "工具失败：undefined 退出码：undefined"

---

## 🔍 问题分析

### 错误现象
```
❌ 工具失败：undefined 退出码：undefined
```

### 根本原因

经过诊断测试发现：

1. **平台兼容性问题**
   - IFlow 默认使用 `bash -c` 执行命令
   - Windows 系统可能没有 `bash` 或不在 PATH 中
   - 导致命令执行失败

2. **调用方式问题**
   - 直接调用 `scripts/notify.js`
   - 使用了不兼容的 shell 命令
   - 返回值解析失败

3. **路径解析问题**
   - 相对路径在不同上下文中解析不一致
   - 工作目录不确定

---

## ✅ 解决方案

### 创建了跨平台包装器

**文件**：`tasks/iflow-tool-wrapper.js`

**功能**：
- ✅ 自动检测平台（Windows/Linux/Mac）
- ✅ 选择合适的 shell（cmd/bash）
- ✅ 统一的 JSON 格式输出
- ✅ 完善的错误处理

**使用方法**：
```bash
# 发送通知
node tasks/iflow-tool-wrapper.js notify "消息"

# 发送 Markdown 通知
node tasks/iflow-tool-wrapper.js notify-markdown "标题" "内容"

# 执行资讯收集
node tasks/iflow-tool-wrapper.js collect-news
```

---

## 📊 诊断结果

### 测试了 5 种场景

| 测试 | 结果 | 说明 |
|------|------|------|
| 直接调用 notify.js | ✅ 通过 | 命令行方式正常 |
| 带参数调用 | ✅ 通过 | 参数传递正常 |
| require 方式 | ✅ 通过 | Node.js 模块方式正常 |
| 环境变量检查 | ✅ 通过 | Webhook 已配置 |
| bash -c 方式 | ❌ 失败 | **Windows 上 bash 不可用** |

---

## 🔧 已完成的修改

### 1. 创建工具包装器
✅ **文件**：`tasks/iflow-tool-wrapper.js`
- 跨平台兼容
- JSON 格式输出
- 错误处理完善

### 2. 更新定时任务配置
✅ **文件**：`scheduler/tasks.json`
- 使用包装器替代直接调用
- 添加详细的执行步骤
- 明确错误处理流程

### 3. 创建诊断脚本
✅ **文件**：`tasks/test-iflow-tool-call.js`
- 测试 5 种调用场景
- 自动识别问题
- 提供解决建议

### 4. 编写使用指南
✅ **文件**：`docs/iflow-tool-calling-guide.md`
- 问题原因分析
- 解决方案说明
- 最佳实践建议

---

## 🎯 现在如何使用

### 在 IFlow 任务中

**推荐写法**：
```
执行资讯收集任务：

node tasks/iflow-tool-wrapper.js collect-news

等待执行完成，检查返回值。
如果 success 为 true，表示成功。
如果 success 为 false，表示失败。
```

**避免写法**：
```
❌ 不要这样写：
node scripts/notify.js "消息"

❌ 也不要这样写：
bash -c "node scripts/notify.js '消息'"
```

---

## 📝 返回值格式

### 成功示例
```json
{
  "success": true,
  "message": "✅ 钉钉通知发送成功"
}
```

### 失败示例
```json
{
  "success": false,
  "error": "具体错误信息",
  "message": "❌ 操作失败"
}
```

---

## 💡 最佳实践

### 1. 使用包装器
```javascript
// ✅ 推荐
node tasks/iflow-tool-wrapper.js notify "消息"

// ❌ 避免
node scripts/notify.js "消息"
```

### 2. 检查返回值
```javascript
// IFlow 应该这样处理
const result = 执行命令();
if (result.success) {
  // 成功的处理
} else {
  // 失败的处理
}
```

### 3. 错误处理
```javascript
// 如果失败，发送错误通知
if (!result.success) {
  node tasks/iflow-tool-wrapper.js notify-markdown \
    "❌ 任务失败" \
    "错误详情：" + result.error
}
```

---

## 🧪 测试验证

### 快速测试

```bash
# 测试包装器是否正常
node tasks/iflow-tool-wrapper.js notify "测试消息"

# 应该看到：
# {
#   "success": true,
#   "message": "✅ 钉钉通知发送成功"
# }
```

### 完整诊断

```bash
# 运行完整诊断
node tasks/test-iflow-tool-call.js

# 检查：
# ✅ 4/5 测试通过
# ❌ 1/5 测试失败（bash 在 Windows 上不可用）
```

---

## 📚 相关文档

- [IFlow 工具调用指南](./iflow-tool-calling-guide.md) - 完整使用说明
- [诊断脚本](../tasks/test-iflow-tool-call.js) - 问题诊断工具
- [包装器源码](../tasks/iflow-tool-wrapper.js) - 跨平台包装器
- [定时任务配置](../scheduler/tasks.json) - 已更新的配置

---

## 🎊 总结

### 问题已解决
✅ 创建了跨平台工具包装器
✅ 更新了定时任务配置
✅ 提供了完整的使用指南
✅ 避免了 Windows bash 兼容性问题

### 立即使用
```bash
# 1. 测试包装器
node tasks/iflow-tool-wrapper.js notify "测试"

# 2. 查看更新后的任务
cat scheduler/tasks.json

# 3. 启用任务
tasks enable daily-news-collector
tasks reload

# 4. 测试执行
tasks run daily-news-collector
```

### 后续建议
1. **所有 IFlow 任务**都使用包装器
2. **检查返回值**判断成功/失败
3. **添加错误处理**提高健壮性
4. **定期测试**确保功能正常

---

**版本**: v1.0.0
**解决时间**: 2026-03-05
**状态**: ✅ 已解决

🎉 **IFlow 现在可以正确调用外部工具并发送钉钉通知了！**
