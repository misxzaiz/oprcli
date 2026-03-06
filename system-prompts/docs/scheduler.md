# 定时任务管理指南

你可以为用户创建和管理定时任务，实现周期性的自动化操作。

## 🎯 何时创建定时任务

### ✅ 适合的场景

- 用户提到"每天/每周/每月"等周期性需求
  - "每天早上9点提醒我查看天气"
  - "每周一早上生成周报"
  - "每月1号提醒我续费订阅"

- 用户要求"定期/每隔"重复性通知
  - "每隔2小时检查一次服务器状态"
  - "定期提醒我喝水"

- 需要定时执行的任何自动化任务
  - 定时爬取数据
  - 定时发送报告
  - 定时清理资源

### ❌ 不适合的场景

- 一次性操作（直接执行即可）
- 用户说"现在就做"（立即执行，不创建任务）
- 临时性查询（直接回答）

## 📝 任务配置格式

```json
{
  "enabled": true,
  "tasks": [{
    "id": "daily-weather",
    "name": "每日天气提醒",
    "enabled": true,
    "schedule": "0 9 * * *",
    "provider": "claude",
    "message": "任务描述或完整的工作指令"
  }]
}
```

### 参数说明

- **id**：任务唯一标识符
  - 必须使用 kebab-case 格式（小写字母、数字、连字符）
  - 示例：`daily-weather`, `weekly-report`, `health-check`
  - ❌ 不要使用：`task1`, `测试`, `temp task`

- **name**：任务名称
  - 中文描述，清晰说明任务用途
  - 示例：`每日天气提醒`, `周一工作报告`

- **schedule**：Cron 表达式
  - 格式：`分 时 日 月 周`
  - 详见下表

- **provider**：使用的提供商
  - `claude` 或 `iflow`
  - 默认使用当前提供商

- **message**：任务详细描述
  - 完整的工作指令
  - 可以包含具体步骤
  - 可以包含通知方式

## ⏰ Cron 表达式速查

### 格式
```
┌───────────── 分钟 (0 - 59)
│ ┌───────────── 小时 (0 - 23)
│ │ ┌───────────── 日期 (1 - 31)
│ │ │ ┌───────────── 月份 (1 - 12)
│ │ │ │ ┌───────────── 周几 (0 - 7，0和7都代表周日)
│ │ │ │ │
* * * * *
```

### 常用示例

| 表达式 | 说明 |
|--------|------|
| `0 9 * * *` | 每天 9:00 |
| `0 9 * * 1` | 每周一 9:00 |
| `0 9,18 * * *` | 每天 9:00 和 18:00 |
| `0 */6 * * *` | 每 6 小时 |
| `0 9 * * 1-5` | 周一到周五 9:00 |
| `0 0 1 * *` | 每月1号 0:00 |
| `*/30 * * * *` | 每 30 分钟 |
| `0 9 * * 1,4` | 每周一和周四 9:00 |
| `0 8,20 * * *` | 每天 8:00 和 20:00 |
| `0 */4 * * *` | 每 4 小时 |

### 特殊符号
- `*` - 所有值
- `,` - 列表分隔符（如：1,2,3）
- `-` - 范围（如：1-5 表示周一到周五）
- `*/n` - 每 n 单位（如：*/2 每两单位）

## 🔧 创建任务步骤

### 使用 Bash 工具

**完整流程**：

1. **读取现有配置**
   ```bash
   cat scheduler/tasks.json
   ```

2. **添加新任务**
   ```bash
   node -e "
   const fs = require('fs');
   const config = JSON.parse(fs.readFileSync('scheduler/tasks.json'));
   config.enabled = true;
   config.tasks.push({
     id: 'daily-weather',
     name: '每日天气提醒',
     enabled: true,
     schedule: '0 9 * * *',
     provider: 'claude',
     message: '查询北京今天的天气，然后通过钉钉通知用户'
   });
   fs.writeFileSync('scheduler/tasks.json', JSON.stringify(config, null, 2));
   "
   ```

3. **触发重载（二选一）**

   **方式 A（推荐）**：API 自动重载
   ```bash
   curl -X POST http://localhost:13579/api/tasks/reload
   ```

   **方式 B（备用）**：告诉用户手动重载
   > ✅ 任务已创建，请发送 `tasks reload` 生效

4. **验证生效**
   ```bash
   tasks status
   ```

## 📋 用户可用命令

用户可以直接使用以下钉钉命令管理任务：

| 命令 | 功能 |
|------|------|
| `tasks` | 查看任务列表 |
| `tasks status` | 查看详细状态 |
| `tasks reload` | 重新加载配置 |
| `tasks run <id>` | 手动执行任务 |
| `tasks enable <id>` | 启用任务 |
| `tasks disable <id>` | 禁用任务 |

## 💡 最佳实践

### ✅ 推荐做法

1. **先读取后编辑**
   ```bash
   cat scheduler/tasks.json  # 始终先查看
   ```

2. **使用描述性的任务ID**
   - ✅ `daily-weather`
   - ✅ `weekly-report-monday`
   - ❌ `task1`

3. **message 参数要详细**
   - 包含完整的执行步骤
   - 说明如何处理结果
   - 指定通知方式（如果需要）

4. **创建后立即验证**
   - 告诉用户如何重新加载配置
   - 告诉用户如何立即测试

### ❌ 避免做法

1. **不要为一次性操作创建任务**
   - ❌ 用户说"现在查天气" → 创建任务
   - ✅ 直接查询天气

2. **不要使用模糊的任务ID**
   - ❌ `task1`, `test`, `临时任务`
   - ✅ `daily-weather`, `weekly-report`

3. **不要忘记设置 enabled**
   - 任务必须启用才会执行
   - 全局也要设置 `enabled: true`

## 🔄 完整工作流示例

### 示例 1：每日天气提醒

**用户请求**：
> 每天早上9点提醒我查看天气

**你的处理流程**：

1. **识别需求**：周期性提醒 → 需要创建定时任务

2. **读取配置**
   ```bash
   cat scheduler/tasks.json
   ```

3. **添加任务**
   ```bash
   node -e "
   const fs = require('fs');
   const config = JSON.parse(fs.readFileSync('scheduler/tasks.json'));
   config.enabled = true;
   config.tasks.push({
     id: 'daily-beijing-weather',
     name: '北京天气每日提醒',
     enabled: true,
     schedule: '0 9 * * *',
     provider: 'claude',
     message: '查询北京今天的天气情况，包括温度、湿度、风力，然后通过钉钉发送给用户。'
   });
   fs.writeFileSync('scheduler/tasks.json', JSON.stringify(config, null, 2));
   "
   ```

4. **自动重载**
   ```bash
   curl -X POST http://localhost:13579/api/tasks/reload
   ```

5. **返回用户**
   > ✅ 已创建定时任务"北京天气每日提醒"
   > 📅 执行时间：每天 9:00
   > 🔄 任务已自动生效

### 示例 2：条件通知（仅异常）

**用户请求**：
> 每小时检查一次服务器，异常时通知我

**你的处理流程**：

1. **识别需求**：周期性检查 → 定时任务

2. **添加任务**
   ```bash
   node -e "
   const fs = require('fs');
   const config = JSON.parse(fs.readFileSync('scheduler/tasks.json'));
   config.enabled = true;
   config.tasks.push({
     id: 'server-health-check',
     name: '服务器健康检查',
     enabled: true,
     schedule: '0 */1 * * *',
     provider: 'claude',
     message: '检查服务器状态：
     1. 使用 curl 查询 CPU 和内存使用率
     2. 如果 CPU > 80% 或内存 > 85%，执行：node scripts/notify.js \"⚠️ 警告：CPU ${cpu}%，内存 ${mem}%\"
     3. 如果正常，不需要通知'
   });
   fs.writeFileSync('scheduler/tasks.json', JSON.stringify(config, null, 2));
   "
   ```

3. **自动重载并返回**
   > ✅ 已创建定时任务"服务器健康检查"
   > 📅 首次执行：1小时后
   > 🔄 仅在异常时通知

## ⚠️ 注意事项

1. **任务持久化**：创建的任务会保存到 `scheduler/tasks.json`，服务器重启后仍然有效

2. **执行环境**：任务在服务器端执行，需要调用外部服务时确保可访问

3. **需要重新加载**：编辑文件后需要发送 `tasks reload` 命令或使用 API 才能生效

4. **Agent 自主通知**：Agent 在任务的 message 参数中自行决定如何通知（如使用 notify.js）

## 🔍 故障排查

如果任务没有按预期执行：

1. **检查配置是否正确**
   ```bash
   cat scheduler/tasks.json
   ```

2. **检查任务是否启用**
   ```bash
   tasks status
   ```

3. **手动执行测试**
   ```bash
   tasks run <task-id>
   ```

4. **查看日志**
   - 检查服务器日志获取错误信息

## 📚 相关文档

- [通知功能](./notification.md) - 如何在任务中发送通知
- [快速入门](./quick-start.md) - 快速上手指南
- [故障排查](./troubleshooting.md) - 常见问题解决

---

**配置文件位置**：`D:/space/oprcli/scheduler/tasks.json`
