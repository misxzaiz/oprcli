# Agent 抽象化系统

## 📖 概述

这是一个可扩展的 AI Agent 抽象系统，支持多个 AI 后端和工具调用。

### 特性

- ✅ **统一接口** - 所有 Agent 遵循相同的接口
- ✅ **多后端支持** - Claude Code、OpenAI、DeepSeek 等
- ✅ **工具系统** - 文件操作、命令执行等
- ✅ **灵活配置** - 文件或环境变量配置
- ✅ **无缝切换** - 运行时动态切换 Agent
- ✅ **钉钉集成** - 多 Agent 钉钉机器人

---

## 🏗️ 架构

```
agents/
├── BaseAgent.js           # 抽象基类
├── ClaudeCodeAgent.js     # Claude Code 实现
├── OpenAIAgent.js         # OpenAI/DeepSeek 实现
├── AgentFactory.js        # Agent 工厂
├── AgentConfig.js         # 配置管理
├── index.js               # 主入口
└── tools/
    ├── ToolManager.js     # 工具管理器
    ├── ReadFileTool.js    # 文件读取
    ├── WriteFileTool.js   # 文件写入
    └── ...
```

---

## 🚀 快速开始

### 1. 基础使用

```javascript
const { createManager } = require('./agents');

// 初始化
const manager = await createManager();

// 发送消息
const result = await manager.chat('你好');
console.log(result.response);
```

### 2. 配置 Agent

#### 方法1：配置文件（agent-config.json）

```json
{
  "default": "claude-code",
  "agents": [
    {
      "id": "claude-code",
      "type": "claude-code",
      "enabled": true
    },
    {
      "id": "deepseek",
      "type": "deepseek",
      "apiKey": "your-api-key",
      "enabled": true
    }
  ]
}
```

#### 方法2：环境变量

```bash
# DeepSeek
export DEEPSEEK_API_KEY=your-key

# OpenAI
export OPENAI_API_KEY=your-key

# 默认 Agent
export DEFAULT_AGENT=deepseek
```

### 3. 切换 Agent

```javascript
// 列出所有 Agent
const agents = manager.listAgents();
console.log(agents);

// 切换 Agent
manager.switchAgent('deepseek');

// 获取当前 Agent
const current = manager.getCurrentAgent();
console.log(current.name);
```

---

## 🛠️ 可用的 Agent

### ClaudeCodeAgent

**最强大的代码助手**

```javascript
const agent = new ClaudeCodeAgent({
  workDir: process.cwd()
});

await agent.connect();
const result = await agent.chat('帮我优化这段代码');
```

**能力：**
- ✅ 流式响应
- ✅ 工具调用（文件操作、命令执行）
- ✅ 代码执行
- ✅ 多文件编辑

### OpenAIAgent

**OpenAI 协议兼容（支持 DeepSeek）**

```javascript
const agent = new OpenAIAgent({
  name: 'DeepSeek',
  provider: 'deepseek',
  apiKey: 'your-api-key',
  model: 'deepseek-chat'
});

await agent.connect();
const result = await agent.chat('介绍一下 Rust 语言');
```

**支持：**
- OpenAI (GPT-4, GPT-3.5)
- DeepSeek
- 其他兼容 OpenAI API 的服务

---

## 🔧 工具系统

### 内置工具

```javascript
const toolManager = manager.getToolManager();

// 读取文件
const result = await toolManager.execute('read_file', {
  filePath: './package.json'
});

// 写入文件
await toolManager.execute('write_file', {
  filePath: './output.txt',
  content: 'Hello World'
});

// 列出目录
const dir = await toolManager.execute('list_directory', {
  dirPath: './src'
});

// 执行命令
const output = await toolManager.execute('execute_command', {
  command: 'npm test',
  timeout: 60000
});

// 搜索文件
const matches = await toolManager.execute('search_files', {
  pattern: 'TODO',
  dirPath: './src'
});
```

### 自定义工具

```javascript
const { Tool } = require('./agents/tools/ToolManager');

class MyTool extends Tool {
  constructor() {
    super('my_tool', '我的自定义工具', {
      type: 'object',
      properties: {
        param1: { type: 'string' }
      }
    });
  }

  async execute({ param1 }) {
    // 实现你的逻辑
    return { success: true, result: '...' };
  }
}

// 注册工具
manager.getToolManager().register(new MyTool());
```

---

## 🤖 钉钉集成

### 多 Agent 钉钉机器人

```bash
node dingtalk-stream-multi-agent.js
```

### 命令支持

- `/agents` - 列出所有 Agent
- `/agent <id>` - 切换 Agent
- `/help` - 显示帮助

**示例对话：**

```
你: /agents
机器人: 📋 可用的 Agent:
        ✅ claude-code: ClaudeCode [当前]
        ✅ deepseek: DeepSeek

你: /agent deepseek
机器人: ✅ 已切换到 Agent: DeepSeek (deepseek)

你: 帮我写一个快速排序
机器人: [DeepSeek 回复...]
```

---

## 🧪 测试

### 运行测试

```bash
# 完整测试
node test-agents.js

# 测试 DeepSeek
DEEPSEEK_API_KEY=your-key node test-agents.js
```

### 测试覆盖率

- ✅ Agent 创建和初始化
- ✅ 聊天功能（非流式）
- ✅ 工具调用
- ✅ Agent 切换
- ✅ 配置加载

---

## 📊 对比表

| 特性 | ClaudeCodeAgent | OpenAIAgent |
|------|----------------|-------------|
| 流式响应 | ✅ | ✅ |
| 工具调用 | ✅ (原生) | ✅ (OpenAI) |
| 代码执行 | ✅ | ❌ |
| 文件操作 | ✅ | ❌ |
| API 成本 | 免费 | 付费 |
| 响应速度 | 中等 | 快 |
| 推荐场景 | 代码开发 | 通用对话 |

---

## 🔌 API 参考

### AgentManager

```javascript
// 初始化
const manager = await createManager();

// 聊天
const result = await manager.chat(message, {
  sessionId,      // 会话 ID（可选）
  systemPrompt,   // 系统提示词（可选）
  tools: true     // 启用工具
});

// 流式聊天
for await (const chunk of manager.stream(message)) {
  if (chunk.type === 'content') {
    console.log(chunk.text);
  }
}

// 列出 Agent
const agents = manager.listAgents();

// 切换 Agent
manager.switchAgent('deepseek');

// 清理
manager.cleanup();
```

### BaseAgent（所有 Agent 的基类）

```javascript
// 连接
await agent.connect();

// 非流式聊天
const result = await agent.chat(message, options);

// 流式聊天
for await (const chunk of agent.stream(message, options)) {
  // 处理流式数据
}

// 获取信息
const info = agent.getInfo();

// 获取能力
const capabilities = agent.getCapabilities();

// 清理
agent.cleanup();
```

---

## 💡 最佳实践

### 1. 选择合适的 Agent

- **代码开发** → ClaudeCodeAgent
- **快速对话** → DeepSeek/OpenAIAgent
- **复杂任务** → ClaudeCodeAgent（带工具）

### 2. 启用工具

```javascript
const result = await manager.chat('分析项目结构', {
  tools: true  // 允许使用文件操作等工具
});
```

### 3. 使用会话

```javascript
// 第一次对话
let result = await manager.chat('帮我写一个函数');
const sessionId = result.sessionId;

// 继续对话
result = await manager.chat('增加错误处理', {
  sessionId
});
```

### 4. 错误处理

```javascript
try {
  const result = await manager.chat(message);
} catch (error) {
  if (error.message.includes('API 密钥')) {
    console.error('请配置 API 密钥');
  } else {
    console.error('发生错误:', error);
  }
}
```

---

## 🎯 路线图

### v1.0（当前）

- ✅ 基础 Agent 抽象
- ✅ Claude Code 集成
- ✅ OpenAI/DeepSeek 集成
- ✅ 工具系统
- ✅ 钉钉多 Agent 支持

### v1.1（计划中）

- ⏳ 更多工具（数据库、HTTP 请求）
- ⏳ Agent 并发控制
- ⏳ 消息持久化
- ⏳ 性能监控

### v2.0（未来）

- ⏳ 多模态支持（图片、音频）
- ⏳ Agent 编排（多 Agent 协作）
- ⏍ 自定义 Agent DSL
- ⏍ Web UI 控制台

---

## 📝 许可证

MIT

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📧 联系

有问题？创建 Issue 或查看文档。
