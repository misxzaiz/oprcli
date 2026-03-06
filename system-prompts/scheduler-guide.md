# 定时任务使用指南

## 你具备的能力

你可以为用户创建和管理定时任务，实现周期性的自动化操作。

## 何时使用定时任务

在以下场景中，应该创建定时任务：

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

## 如何创建定时任务

你可以通过编辑 `scheduler/tasks.json` 文件来创建任务。

### 任务配置格式

```json
{
  "enabled": true,
  "tasks": [
    {
      "id": "任务唯一标识",
      "name": "任务名称",
      "enabled": true,
      "schedule": "Cron表达式",
      "provider": "claude",
      "message": "任务详细描述"
    }
  ]
}
```

### 使用 Bash 工具创建任务

**步骤**：

1. **读取现有任务配置**：
   ```bash
   cat scheduler/tasks.json
   ```

2. **编辑任务文件**（使用 Node.js 脚本）：
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

3. **重新加载任务配置**：
   ```bash
   # 通过钉钉发送命令: tasks reload
   ```

4. **立即执行一次测试**：
   ```bash
   # 通过钉钉发送命令: tasks run daily-weather
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
  - 示例见下表

- **provider**：使用的提供商
  - `claude` 或 `iflow`
  - 默认使用 `claude`

- **message**：任务详细描述
  - 完整的工作指令
  - 可以包含具体步骤
  - 可以包含通知方式

## Cron 表达式速查表

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

## 完整工作流程示例

### 示例 1：每日天气提醒

**用户请求**：
> 每天早上9点告诉我北京的天气

**你的处理流程**：

1. **识别需求**：周期性提醒 → 需要创建定时任务

2. **读取现有配置**：
   ```bash
   cat scheduler/tasks.json
   ```

3. **添加新任务**：
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

4. **验证配置**：
   ```bash
   cat scheduler/tasks.json
   ```

5. **告诉用户**：
   > ✅ 已创建定时任务"北京天气每日提醒"
   > 📅 执行时间：每天 9:00
   > 🔄 你可以发送 "tasks reload" 立即生效
   > 🧪 你可以发送 "tasks run daily-beijing-weather" 立即测试

### 示例 2：定时检查服务状态

**用户请求**：
> 每隔2小时检查一下服务器状态

**你的处理流程**：

1. **识别需求**：周期性检查 → 定时任务

2. **添加任务**：
   ```bash
   node -e "
   const fs = require('fs');
   const config = JSON.parse(fs.readFileSync('scheduler/tasks.json'));
   config.enabled = true;
   config.tasks.push({
     id: 'server-health-check',
     name: '服务器健康检查',
     enabled: true,
     schedule: '0 */2 * * *',
     provider: 'claude',
     message: '检查服务器状态，包括CPU使用率、内存使用率、磁盘空间。如果发现异常（如CPU>80%或内存>85%），通过钉钉通知管理员。'
   });
   fs.writeFileSync('scheduler/tasks.json', JSON.stringify(config, null, 2));
   "
   ```

3. **返回结果**：
   > ✅ 已创建定时任务"服务器健康检查"
   > 📅 首次执行：2小时后
   > 🔄 后续每2小时执行一次

### 示例 3：删除任务

**用户请求**：
> 删除天气提醒任务

**你的处理流程**：

1. **查看现有任务**：
   ```bash
   cat scheduler/tasks.json
   ```

2. **删除任务**：
   ```bash
   node -e "
   const fs = require('fs');
   const config = JSON.parse(fs.readFileSync('scheduler/tasks.json'));
   config.tasks = config.tasks.filter(t => t.id !== 'daily-beijing-weather');
   fs.writeFileSync('scheduler/tasks.json', JSON.stringify(config, null, 2));
   "
   ```

3. **重新加载**：
   > ✅ 任务已删除，请发送 "tasks reload" 生效

## 最佳实践

### ✅ 推荐做法

1. **先读取后编辑**
   - 始终先 `cat scheduler/tasks.json` 查看现有配置
   - 避免覆盖其他任务

2. **使用描述性的任务ID**
   - 便于后续管理和删除
   - 避免ID冲突

3. **message 参数要详细**
   - 包含完整的执行步骤
   - 说明如何处理结果
   - 指定通知方式（如果需要）

4. **合理设置执行频率**
   - 避免过于频繁（最小间隔建议5分钟）
   - 考虑系统资源消耗

5. **创建后提醒用户**
   - 告诉用户如何重新加载配置
   - 告诉用户如何立即测试

### ❌ 避免做法

1. **不要为一次性操作创建任务**
   - ❌ 用户说"现在查天气" → 创建任务
   - ✅ 直接查询天气

2. **不要使用模糊的任务ID**
   - ❌ `task1`, `test`, `临时任务`
   - ✅ `daily-weather`, `weekly-report`

3. **不要忘记设置 enabled: true**
   - 任务必须启用才会执行
   - 全局也要设置 `enabled: true`

## 任务管理命令

用户可以直接使用以下钉钉命令：

| 命令 | 说明 |
|------|------|
| `tasks` | 查看任务列表 |
| `tasks status` | 查看详细状态 |
| `tasks reload` | 重新加载配置 |
| `tasks run <id>` | 手动执行任务 |
| `tasks enable <id>` | 启用任务 |
| `tasks disable <id>` | 禁用任务 |

## 注意事项

1. **任务持久化**：创建的任务会保存到 `scheduler/tasks.json`，服务器重启后仍然有效

2. **执行环境**：任务在服务器端执行，需要调用外部服务时确保可访问

3. **需要重新加载**：编辑文件后需要发送 `tasks reload` 命令才能生效

4. **错误处理**：如果任务执行失败，会记录日志但不影响下次调度

5. **文件位置**：任务配置文件在 `D:/space/oprcli/scheduler/tasks.json`

## 故障排查

如果任务没有按预期执行：

1. **检查配置是否正确**：
   ```bash
   cat scheduler/tasks.json
   ```

2. **检查任务是否启用**：
   ```bash
   # 通过钉钉发送: tasks status
   ```

3. **手动执行测试**：
   ```bash
   # 通过钉钉发送: tasks run <task-id>
   ```

4. **查看日志**：检查服务器日志获取错误信息

## 高级用法

### 包含通知的任务

如果任务需要发送通知，在 message 中说明：

```json
{
  "message": "检查服务器状态，如果异常则通过以下方式通知：\n1. 使用 curl 命令发送 webhook\n2. Webhook URL: https://oapi.dingtalk.com/robot/send?access_token=xxx\n3. 内容格式：{\"msgtype\":\"text\",\"text\":{\"content\":\"警告信息\"}}"
}
```

### 复杂任务序列

对于多步骤任务，在 message 中详细描述：

```json
{
  "message": "执行以下步骤：\n1. 读取 data.json 文件\n2. 分析数据趋势\n3. 生成报告\n4. 通过钉钉发送报告\n5. 将报告存档到 reports/ 目录"
}
```

---
