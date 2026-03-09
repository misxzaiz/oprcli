# 更新日志

## [版本 2.x] - 2026-03-09

### 🐛 重要修复：命令匹配逻辑优化

**问题描述**
- 之前使用前缀匹配，导致误触发命令
- 例如：发送 "重启其他服务" 会误触发 `/重启` 命令

**解决方案**
- 实现精确匹配 + 灵活匹配双模式
- 无 `/` 前缀：输入必须完全等于命令词
- 有 `/` 前缀：支持命令 + 参数

**影响范围**
- 系统命令现在需要 `/` 前缀（如 `/重启`、`/status`、`/help`）
- Provider 切换命令保持不变（`claude`、`iflow`、`codex`、`agent`）

### ✨ 新增功能

1. **命令前缀配置**
   - 新增环境变量 `COMMAND_REQUIRE_SLASH`：全局要求前缀
   - 新增环境变量 `COMMAND_REQUIRE_SLASH_LIST`：指定需要前缀的命令
   - 新增环境变量 `COMMAND_NO_SLASH_LIST`：指定不需要前缀的命令

2. **更灵活的命令匹配**
   - 精确匹配：`claude` ✅ | `claude 你好` ❌
   - 灵活匹配：`/重启` ✅ | `/重启 现在` ✅（带参数）

### 📝 文档更新

- 新增 [命令配置文档](COMMAND_CONFIGURATION.md)
- 更新 README.md 命令部分
- 更新 .env.example 配置示例
- 新增命令解析器测试用例

### 🔄 迁移指南

**如果之前使用无前缀命令：**

选项 1：添加 `/` 前缀（推荐）
```diff
- restart
+ /restart

- status
+ /status
```

选项 2：配置白名单
```bash
# .env
COMMAND_NO_SLASH_LIST=restart,stop,status,help,path,tasks
```

### 🧪 测试

运行测试验证功能：
```bash
node tests/command-parser.test.js
```

---

## [版本 1.x] - 之前版本

### 初始功能
- 多 AI 提供商支持（Claude、IFlow、Codex、Agent）
- 钉钉和 QQ 机器人集成
- 定时任务调度
- 语音消息识别
