# 命令配置说明

## 问题背景

**之前的问题**：命令使用前缀匹配，导致误触发
- 例如："重启其他服务" 会误触发 `/重启` 命令
- 原因：系统会匹配第一个词 "重启"

**解决方案**：精确匹配 + 灵活匹配双模式

## 匹配模式

### 1. 精确匹配模式（无 `/` 前缀）
- **规则**：输入内容必须**完全等于**命令词
- **适用**：Provider 切换命令（claude、iflow、codex、agent）
- **示例**：
  ```
  claude          ✅ 匹配成功
  claude 你好     ❌ 不匹配（有额外内容）
  重启            ❌ 不匹配（requireSlash: true）
  ```

### 2. 灵活匹配模式（有 `/` 前缀）
- **规则**：支持命令词 + 参数
- **适用**：所有系统命令
- **示例**：
  ```
  /重启           ✅ 匹配成功
  /重启 其他      ✅ 匹配成功，参数="其他"
  /tasks run 1    ✅ 匹配成功，参数="1"
  /claude 你好    ✅ 匹配成功，参数="你好"
  ```

## 配置方式

### 方式 1：命令定义配置（默认）

在 `server/commands.js` 中为每个命令设置 `requireSlash`：

```javascript
const COMMANDS = {
  // Provider 切换命令 - 不需要前缀
  claude: { type: 'switch', provider: 'claude', hasArg: true, requireSlash: false },
  iflow: { type: 'switch', provider: 'iflow', hasArg: true, requireSlash: false },

  // 系统命令 - 需要前缀
  restart: { type: 'restart', requireSlash: true },
  '重启': { type: 'restart', requireSlash: true },
  status: { type: 'status', requireSlash: true },
}
```

### 方式 2：环境变量配置

通过环境变量全局覆盖命令前缀要求：

```bash
# 全局要求所有命令使用 / 前缀
COMMAND_REQUIRE_SLASH=true

# 指定需要前缀的命令列表（黑名单）
COMMAND_REQUIRE_SLASH_LIST=restart,stop,status,help

# 指定不需要前缀的命令列表（白名单，优先级最高）
COMMAND_NO_SLASH_LIST=claude,iflow,codex,agent
```

### 配置优先级

```
1. COMMAND_NO_SLASH_LIST（白名单）           最高优先级
2. COMMAND_REQUIRE_SLASH_LIST（黑名单）
3. COMMAND_REQUIRE_SLASH（全局设置）
4. 命令定义中的 requireSlash                 默认设置
```

## 环境变量说明

| 变量名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `COMMAND_REQUIRE_SLASH` | boolean | `false` | 全局要求所有命令使用 `/` 前缀 |
| `COMMAND_REQUIRE_SLASH_LIST` | string | - | 需要前缀的命令列表（逗号分隔） |
| `COMMAND_NO_SLASH_LIST` | string | - | 不需要前缀的命令列表（逗号分隔） |

## 使用示例

### 示例 1：默认配置

```bash
# .env
# 不需要配置，使用默认设置
```

**效果**：
- `claude` ✅ 切换到 claude
- `重启` ❌ 不触发
- `/重启` ✅ 触发重启

### 示例 2：全局要求前缀

```bash
# .env
COMMAND_REQUIRE_SLASH=true
```

**效果**：
- `claude` ❌ 不触发
- `/claude` ✅ 切换到 claude
- `/重启` ✅ 触发重启

### 示例 3：自定义白名单

```bash
# .env
COMMAND_NO_SLASH_LIST=claude,iflow,status
```

**效果**：
- `claude` ✅ 切换到 claude
- `iflow` ✅ 切换到 iflow
- `status` ✅ 查看状态
- `重启` ❌ 不触发（不在白名单中）
- `/重启` ✅ 触发重启

## 测试用例

### 精确匹配测试

| 输入 | 预期结果 | 说明 |
|------|---------|------|
| `claude` | ✅ 匹配 | 完全匹配命令词 |
| `iflow` | ✅ 匹配 | 完全匹配命令词 |
| `重启` | ❌ 不匹配 | requireSlash: true |
| `重启服务` | ❌ 不匹配 | 有额外内容 |
| `status` | ❌ 不匹配 | requireSlash: true |

### 灵活匹配测试

| 输入 | 预期结果 | 说明 |
|------|---------|------|
| `/重启` | ✅ 匹配 | 基本命令 |
| `/重启 现在` | ✅ 匹配 | 带参数 |
| `/tasks run 1` | ✅ 匹配 | 多词命令+参数 |
| `/claude 你好` | ✅ 匹配 | 带自定义提示词 |

### 特殊模式测试

| 输入 | 预期结果 | 说明 |
|------|---------|------|
| `agent-sonnet` | ✅ 匹配 | Agent 模式（无前缀） |
| `/agent-sonnet` | ✅ 匹配 | Agent 模式（有前缀） |
| `agent-sonnet 你好` | ✅ 匹配 | Agent 模式+参数 |

## 注意事项

1. **命令区分大小写**：所有命令匹配都会转换为小写
2. **中英文命令等效**：`status` 和 `状态` 是同一个命令
3. **Agent 模式特殊处理**：`agent-xxx` 始终支持无前缀匹配
4. **配置生效时机**：修改环境变量后需要重启服务

## 迁移指南

### 从旧版本升级

如果你之前习惯使用无前缀命令（如 `restart`），有两种选择：

**选项 1：添加 `/` 前缀**
```diff
- restart
+ /restart
```

**选项 2：配置白名单**
```bash
# .env
COMMAND_NO_SLASH_LIST=restart,stop,status,help
```

### 推荐配置

**安全模式**（推荐生产环境）：
```bash
COMMAND_REQUIRE_SLASH=true
```

**兼容模式**（保持向后兼容）：
```bash
COMMAND_NO_SLASH_LIST=claude,iflow,codex,agent,restart,stop,status,help,path
```
