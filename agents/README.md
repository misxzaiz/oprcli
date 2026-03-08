# Agent Connector 使用指南

## 概述

Agent Connector 是基于 LLM + Tools 的 AI Agent 系统，支持多种大模型提供商。

## 支持的 LLM Provider

### 1. iFlow (心流)
- **API 端点**: `https://apis.iflow.cn/v1`
- **获取 API Key**: 访问 [https://iflow.cn](https://iflow.cn) 登录后获取
- **支持的模型**:
  - `tstars2.0` (默认)
  - 其他模型请参考 iFlow 文档

### 2. DeepSeek
- **API 端点**: `https://api.deepseek.com/v1`
- **获取 API Key**: 访问 [https://platform.deepseek.com](https://platform.deepseek.com)
- **支持的模型**:
  - `deepseek-chat` (默认)
  - `deepseek-coder`

### 3. OpenAI
- **API 端点**: `https://api.openai.com/v1`
- **获取 API Key**: 访问 [https://platform.openai.com](https://platform.openai.com)
- **支持的模型**:
  - `gpt-3.5-turbo` (默认)
  - `gpt-4`
  - `gpt-4-turbo`

## 配置步骤

### 1. 复制配置模板
```bash
cp .env.agent.example .env
```

### 2. 编辑 .env 文件
```bash
# 启用 Agent
AGENT_ENABLED=true

# 选择 Provider
AGENT_PROVIDER_TYPE=iflow

# 设置 API Key
AGENT_API_KEY=sk-your-actual-api-key

# 设置模型（可选）
AGENT_MODEL=tstars2.0
```

### 3. 重启服务
```bash
npm start
```

## 内置工具

### 文件操作工具
- `read_file`: 读取文件内容
- `write_file`: 写入文件内容
- `list_files`: 列出目录文件（支持模式匹配）
- `search_in_files`: 在文件中搜索文本

### 定时任务工具
- `add_task`: 添加新的定时任务
- `run_task`: 立即执行指定任务
- `remove_task`: 删除定时任务

## 使用示例

### 通过 QQ Bot 使用

```
# 切换到 Agent
/agent

# 执行任务
帮我读取 todo.md 文件并分析内容

# 创建新文件
创建一个名为 test.txt 的文件，内容为 "Hello World"

# 搜索代码
在所有 .js 文件中搜索 "console.log"
```

### 通过 API 使用

```bash
curl -X POST http://localhost:3000/api/message \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "agent",
    "message": "帮我读取 package.json 并提取依赖列表"
  }'
```

## Agent 工作流程

1. **接收任务**: 用户输入自然语言描述
2. **LLM 推理**: LLM 分析任务并决定使用哪些工具
3. **工具执行**: Agent 调用相应的工具
4. **结果处理**: 将工具结果返回给 LLM
5. **循环迭代**: 如果任务未完成，继续执行步骤 2-4
6. **返回结果**: 任务完成后返回最终结果

## 高级配置

### 修改最大迭代次数
在 `connectors/agent-connector.js` 中:
```javascript
this.maxIterations = options.maxIterations || 10;
```

### 添加自定义工具
在 `agents/tools/tool-manager.js` 中:
```javascript
registerDefaultTools() {
  // 注册文件工具
  this.registerTools(getFileTools());

  // 添加自定义工具
  this.registerTools(getMyCustomTools());
}
```

### 切换 Provider
无需修改代码，只需更改环境变量:
```bash
# 从 iFlow 切换到 DeepSeek
AGENT_PROVIDER_TYPE=deepseek
AGENT_API_KEY=your-deepseek-key
AGENT_MODEL=deepseek-chat
```

## 架构说明

```
agents/
├── llm-providers/         # LLM Provider 层
│   ├── base-provider.js           # 抽象基类
│   ├── openai-compatible.js       # OpenAI 兼容实现
│   └── index.js                   # Provider 工厂
├── tools/                 # 工具层
│   ├── tool-manager.js            # 工具管理器
│   └── file-tools.js              # 文件工具
├── agent-engine.js       # Agent 核心引擎
└── README.md             # 本文档
```

## 故障排除

### 问题：Agent 无法启动
**解决方案**:
1. 检查 `AGENT_ENABLED=true`
2. 检查 `AGENT_API_KEY` 是否正确
3. 查看日志输出

### 问题：工具执行失败
**解决方案**:
1. 确认工作目录权限正确
2. 检查文件路径是否正确
3. 查看详细错误信息

### 问题：API 调用失败
**解决方案**:
1. 检查网络连接
2. 确认 API Key 有效性
3. 检查 API 额度是否充足

## 扩展阅读

- [iFlow API 文档](https://platform.iflow.cn/docs/api-reference)
- [DeepSeek API 文档](https://platform.deepseek.com/docs)
- [OpenAI API 文档](https://platform.openai.com/docs)

## 许可证

MIT
