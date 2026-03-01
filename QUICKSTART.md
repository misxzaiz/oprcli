# Agent 抽象化系统 - 快速入门

## 🎯 5 分钟快速上手

### 步骤1：安装依赖

```bash
npm install
```

### 步骤2：配置环境变量

复制示例配置文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，添加你的 API 密钥：

```bash
# DeepSeek（推荐，高性价比）
DEEPSEEK_API_KEY=your-deepseek-api-key

# 或 OpenAI
OPENAI_API_KEY=your-openai-api-key

# 默认使用的 Agent
DEFAULT_AGENT=deepseek
```

### 步骤3：运行测试

```bash
npm run test:agents
```

你应该看到类似输出：

```
========================================
  Agent 系统测试
========================================

1️⃣  初始化 AgentManager...
[AgentManager] Agent deepseek 已连接
[AgentManager] 默认 Agent: deepseek

2️⃣  可用的 Agent:
   - deepseek: DeepSeek [当前] ✅ 已连接

3️⃣  测试当前 Agent: DeepSeek
   能力: {"streaming":true,"tools":true}

4️⃣  发送测试消息...
✅ 响应成功:
───────────────────────────────────────────────────
你好！我是深度求索（DeepSeek）开发的大型语言模型...
───────────────────────────────────────────────────
```

### 步骤4：启动钉钉机器人（多 Agent 版本）

```bash
npm run dingtalk:multi
```

在钉钉中发送消息测试：

```
你: /agents
机器人: 📋 可用的 Agent:
        ✅ deepseek: DeepSeek [当前]
        ✅ claude-code: ClaudeCode

你: 帮我写一个快速排序
机器人: [AI 回复...]
```

---

## 📦 文件结构

```
oprcli/
├── agents/                      # Agent 系统
│   ├── BaseAgent.js            # 抽象基类
│   ├── ClaudeCodeAgent.js      # Claude Code 实现
│   ├── OpenAIAgent.js          # OpenAI/DeepSeek 实现
│   ├── AgentFactory.js         # Agent 工厂
│   ├── AgentConfig.js          # 配置管理
│   ├── index.js                # 主入口
│   └── tools/
│       └── ToolManager.js      # 工具管理器
│
├── dingtalk-stream.js          # 原始钉钉服务
├── dingtalk-stream-multi-agent.js  # 多 Agent 钉钉服务 ✨ 新
├── test-agents.js              # 测试脚本
├── agent-config.example.json   # 配置示例
├── .env                        # 环境变量
└── docs/
    └── AGENT-SYSTEM.md         # 完整文档
```

---

## 💡 常见用法

### 1. 基础聊天

```javascript
const { createManager } = require('./agents');

const manager = await createManager();
const result = await manager.chat('你好，世界！');
console.log(result.response);
```

### 2. 切换 Agent

```javascript
// 列出所有
const agents = manager.listAgents();

// 切换到 DeepSeek
manager.switchAgent('deepseek');

// 切换回 Claude Code
manager.switchAgent('claude-code');
```

### 3. 使用工具

```javascript
const result = await manager.chat('读取 package.json', {
  tools: true  // 启用工具调用
});
```

### 4. 流式响应

```javascript
for await (const chunk of manager.stream('讲个故事')) {
  if (chunk.type === 'content') {
    process.stdout.write(chunk.text);
  }
}
```

---

## 🔧 配置 Agent

### 方法1：环境变量（推荐）

```bash
export DEEPSEEK_API_KEY=your-key
export DEFAULT_AGENT=deepseek
```

### 方法2：配置文件

创建 `agent-config.json`：

```json
{
  "default": "deepseek",
  "agents": [
    {
      "id": "deepseek",
      "type": "deepseek",
      "apiKey": "your-key",
      "enabled": true
    }
  ]
}
```

---

## 🤖 支持的 Agent

| Agent | 说明 | 成本 | 推荐场景 |
|-------|------|------|----------|
| **claude-code** | Claude Code | 免费 | 代码开发、文件操作 |
| **deepseek** | DeepSeek API | 低价 | 通用对话、快速响应 |
| **openai** | GPT-3.5/4 | 中等 | 稳定可靠 |

---

## 📚 更多文档

完整文档请查看：[docs/AGENT-SYSTEM.md](docs/AGENT-SYSTEM.md)

---

## ❓ 常见问题

### Q: 如何获取 DeepSeek API 密钥？

A: 访问 https://platform.deepseek.com 注册并创建 API 密钥。

### Q: 可以同时使用多个 Agent 吗？

A: 可以！使用 `/agent <id>` 命令随时切换。

### Q: 工具调用安全吗？

A: 工具调用在沙箱环境中执行，但建议仅在生产环境信任的代码中使用。

### Q: 如何添加自定义工具？

A: 参考 `docs/AGENT-SYSTEM.md` 中的"自定义工具"章节。

---

## 🎉 完成！

现在你已经可以：

- ✅ 使用多个 AI 后端
- ✅ 在钉钉中动态切换 Agent
- ✅ 使用工具增强 AI 能力
- ✅ 根据需求选择最适合的 Agent

享受吧！ 🚀
