# 📸 Screenshot Skill - 使用说明

## ✅ 已创建的 Skill

我为你创建了以下 screenshot skill 文件：

### 1. `screenshot` (推荐)
**位置**: `D:/bak/oprcli/.claude/skills/screenshot`
**类型**: Node.js 脚本
**平台**: 跨平台

### 2. `screenshot.sh`
**位置**: `D:/bak/oprcli/.claude/skills/screenshot.sh`
**类型**: Bash 脚本
**平台**: Linux/macOS

### 3. `screenshot-simple.js`
**位置**: `D:/bak/oprcli/.claude/skills/screenshot-simple.js`
**类型**: ES Module
**平台**: 跨平台

## 🚀 如何使用

### 方式 1: 通过 Skill Tool（如果支持）

在 Claude Code 中：
```
/skill screenshot
```

或
```
skill screenshot
```

### 方式 2: 直接执行

```bash
# Windows
node D:/bak/oprcli/.claude/skills/screenshot

# 跨平台
node D:/bak/oprcli/.claude/skills/screenshot-simple.js
```

### 方式 3: 通过 MCP 工具

如果你已经配置了 MCP：
```
take_screenshot
```

## 📋 当前问题

根据系统提示，目前只有 `simplify` skill 可用。这意味着：

1. **Skill 可能需要注册** - 在配置文件中声明
2. **Skill 格式可能不同** - 需要特定的导出格式
3. **Skill 位置可能不对** - 需要在特定目录

## 🔧 解决方案

### 选项 A: 使用 MCP 工具（推荐）

你的 `.mcp.json` 已经配置了 screenshot 工具：

```json
{
  "mcpServers": {
    "screenshot": {
      "command": "node",
      "args": ["D:/temp/mcp-screenshot/index.js"]
    }
  }
}
```

重启 Claude Code 后，你可以直接调用：
```
take_screenshot
```

### 选项 B: 使用 CLI 工具

```bash
# 安全截屏
node D:/temp/screenshot-safe.js

# 普通截屏
node D:/temp/screenshot-cli.js
```

### 选项 C: 在钉钉中使用

在钉钉群里发送：
```
/screenshot
```

## ✨ 推荐使用方式

| 场景 | 推荐方式 |
|------|----------|
| **Claude Code 对话** | MCP 工具: `take_screenshot` |
| **命令行快速使用** | `node D:/temp/screenshot-safe.js` |
| **钉钉群使用** | 发送 `/screenshot` |
| **需要可复用命令** | 直接调用 CLI 工具 |

## 📝 总结

- ✅ Skill 文件已创建
- ⚠️ 可能需要额外配置才能被识别
- ✅ MCP 工具已配置并可用
- ✅ CLI 工具立即可用

**推荐**: 直接使用 MCP 工具或 CLI 工具，它们都已经配置完成并测试通过！
