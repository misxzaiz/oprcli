# OPRCLI 功能文档索引

本目录包含 OPRCLI 项目的详细功能文档，采用按需查阅的设计。

## 📚 文档列表

### 快速开始
- **[快速入门](./quick-start.md)** - 5 分钟快速上手指南

### 核心功能
1. **[MCP Browser 工具](./mcp-browser.md)** - 浏览器自动化
   - 页面操作、截图、数据提取

2. **[定时任务管理](./scheduler.md)** - 周期性任务调度
   - 创建任务、Cron 表达式、自动重载

3. **[通知功能](./notification.md)** - 钉钉消息通知
   - 发送通知、签名验证、最佳实践

4. **[插件系统](./plugin-system.md)** - 可扩展插件架构 ⭐
   - 插件管理、配置管理、上下文记忆
   - [快速开始](./plugin-quickstart.md)

### 参考文档
- **[项目架构](./architecture.md)** - 项目结构和设计
- **[约束条件](./constraints.md)** - 重要规则和限制
- **[故障排查](./troubleshooting.md)** - 常见问题解决

## 🎯 如何使用

### Agent 查阅文档

当你需要了解某个功能时，使用 `cat` 命令阅读文档：

```bash
# 查看文档索引
cat system-prompts/docs/README.md

# 查看特定功能文档
cat system-prompts/docs/scheduler.md
cat system-prompts/docs/mcp-browser.md
cat system-prompts/docs/notification.md
```

### 为什么这样设计

- **节省 Token**：核心提示词精简，详细文档按需加载
- **易于维护**：每个功能独立文档，更新方便
- **灵活高效**：Agent 根据需求查阅相关信息

---

**提示**：本文档用于 Agent 查阅，保持简洁清晰。
