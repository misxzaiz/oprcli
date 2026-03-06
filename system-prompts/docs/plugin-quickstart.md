# 插件系统快速开始

> 5分钟上手 OPRCLI 插件系统

## 🎯 什么是插件系统？

OPRCLI 插件系统让你可以：
- ✅ **动态扩展功能**：无需修改核心代码
- ✅ **配置管理**：集中管理配置，支持热更新
- ✅ **跨会话记忆**：保存和共享上下文信息

---

## 🚀 5分钟上手

### Step 1: 查看已安装插件（30秒）

```bash
# 通过 API 查看
curl http://localhost:13579/api/plugins
```

**响应示例**：
```json
{
  "success": true,
  "plugins": [
    {
      "name": "config-manager",
      "version": "1.0.0",
      "description": "配置管理系统"
    },
    {
      "name": "context-memory",
      "version": "1.0.0",
      "description": "上下文记忆系统"
    }
  ]
}
```

### Step 2: 创建第一个插件（2分钟）

```bash
# 创建插件目录
mkdir -p plugins/custom

# 创建插件文件
cat > plugins/custom/hello.js << 'EOF'
module.exports = {
  name: 'hello',
  version: '1.0.0',
  description: '我的第一个插件',
  author: 'Your Name',

  init: async (server) => {
    server.logger.success('PLUGIN', 'Hello World! 我的插件已加载')

    // 保存一些数据到记忆
    await server.contextMemory.set('hello:initialized', true, {
      metadata: { type: 'plugin-state' }
    })

    // 获取配置
    const port = server.configManager.get('server.port')
    server.logger.info('PLUGIN', `服务器运行在端口: ${port}`)
  }
}
EOF
```

### Step 3: 重启服务器（30秒）

```bash
# 停止服务器（Ctrl+C）
# 然后重启
node server.js
```

**查看日志**：
```
[PLUGIN] ✓ 配置管理器已初始化
[PLUGIN] ✓ 上下文记忆已初始化
[PLUGIN] Hello World! 我的插件已加载
[PLUGIN] 服务器运行在端口: 13579
```

### Step 4: 验证插件（1分钟）

```bash
# 再次查看插件列表
curl http://localhost:13579/api/plugins
```

**应该看到**：
```json
{
  "plugins": [
    ...,
    {
      "name": "hello",
      "version": "1.0.0",
      "description": "我的第一个插件"
    }
  ]
}
```

### Step 5: 使用核心功能（1分钟）

```bash
# 测试配置管理
curl http://localhost:13579/api/config?key=server.port

# 测试记忆系统
curl http://localhost:13579/api/memory/stats

# 设置配置
curl -X POST http://localhost:13579/api/config \
  -H "Content-Type: application/json" \
  -d '{"key":"test.value","value":"hello from plugin"}'
```

---

## 📚 下一步

### 学习更多

```bash
# 查看完整文档
cat system-prompts/docs/plugin-system.md

# 查看 ConfigManager 文档
cat system-prompts/docs/plugins/config-manager.md

# 查看 ContextMemory 文档
cat system-prompts/docs/plugins/context-memory.md
```

### 创建更复杂的插件

**插件模板**：

```javascript
module.exports = {
  // 必需字段
  name: 'my-plugin',
  version: '1.0.0',
  description: '插件描述',
  author: 'Your Name',

  // 可选：API 文档
  api: {
    myFunction: '函数说明',
    anotherFunction: '另一个函数说明'
  },

  // 可选：配置选项
  config: {
    option1: '选项说明',
    option2: '选项说明'
  },

  // 可选：初始化函数
  init: async (server) => {
    // 插件加载时执行

    // 使用配置管理器
    const config = server.configManager.get('my-plugin.config')

    // 使用记忆系统
    await server.contextMemory.set('my-plugin:data', {...})

    server.logger.info('PLUGIN', 'My plugin initialized')
  },

  // 可选：销毁函数
  destroy: async (server) => {
    // 插件卸载时执行
    server.logger.info('PLUGIN', 'My plugin destroyed')
  }
}
```

### 常见用例

#### 1. 配置管理

```javascript
// 在插件中
const myConfig = server.configManager.get('my-plugin.config', {})

// 监听配置变更
server.configManager.watch('my-plugin.setting', (newValue) => {
  // 配置变更时执行
})
```

#### 2. 上下文记忆

```javascript
// 保存状态
await server.contextMemory.set('my-plugin:state', {
  lastRun: Date.now(),
  count: 0
})

// 跨会话使用
const state = await server.contextMemory.get('my-plugin:state')
```

#### 3. 会话管理

```javascript
// 保存会话上下文
await server.contextMemory.saveSession(sessionId, {
  pluginData: {...},
  userPreferences: {...}
})

// 恢复会话
const session = await server.contextMemory.getSession(sessionId)
```

---

## 🔧 插件位置

```
plugins/
├── core/                   # 核心插件（不要修改）
│   ├── plugin-manager.js
│   ├── config-manager.js
│   └── context-memory.js
│
└── custom/                 # 👈 在这里创建你的插件
    ├── hello.js            # 你的插件
    └── my-plugin.js         # 更多插件
```

---

## 💡 最佳实践

### 1. 使用命名空间

```javascript
// ✅ 推荐：使用插件名作为前缀
await server.contextMemory.set('my-plugin:data', {...})
server.configManager.set('my-plugin.setting', true)

// ❌ 不推荐：使用通用名称
await server.contextMemory.set('data', {...})
```

### 2. 错误处理

```javascript
init: async (server) => {
  try {
    // 你的初始化逻辑
  } catch (error) {
    server.logger.error('PLUGIN', '初始化失败', error)
    throw error
  }
}
```

### 3. 资源清理

```javascript
destroy: async (server) => {
  // 清理定时器
  if (this.timer) {
    clearInterval(this.timer)
  }

  // 清理连接
  if (this.connection) {
    await this.connection.close()
  }
}
```

---

## 🎯 快速参考

### HTTP API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/plugins` | GET | 列出所有插件 |
| `/api/config` | GET | 获取配置 |
| `/api/config` | POST | 设置配置 |
| `/api/memory/stats` | GET | 记忆统计 |

### 核心对象

```javascript
// 在插件中访问
server.logger            // 日志系统
server.configManager     // 配置管理器
server.contextMemory     // 上下文记忆
server.pluginManager     // 插件管理器
server.connectors        // 连接器 Map
server.scheduler         // 定时任务
```

### 常用命令

```bash
# 查看插件
curl http://localhost:13579/api/plugins

# 获取配置
curl http://localhost:13579/api/config?key=xxx

# 设置配置
curl -X POST http://localhost:13579/api/config \
  -H "Content-Type: application/json" \
  -d '{"key":"xxx","value":"yyy"}'

# 记忆统计
curl http://localhost:13579/api/memory/stats
```

---

## ❓ 常见问题

### Q: 插件加载失败怎么办？

**A**: 检查以下几点：
1. 插件名称只能包含小写字母、数字和连字符
2. 必须有 `name`, `version`, `description` 字段
3. 查看服务器日志获取错误信息

### Q: 如何调试插件？

**A**:
1. 使用 `server.logger.debug()` 输出调试信息
2. 查看 `logs/` 目录下的日志文件
3. 使用 `try-catch` 捕获错误

### Q: 插件可以修改核心代码吗？

**A**: 不建议。插件应该通过 API 与核心系统交互，而不是直接修改代码。

### Q: 如何分享插件？

**A**:
1. 将插件文件放到 `plugins/custom/` 目录
2. 重启服务器即可加载
3. 文档会自动生成到 `system-prompts/docs/plugins/`

---

## 🎉 恭喜！

你已经掌握了插件系统的基础知识！

**下一步**：
- 查看 [完整文档](./plugin-system.md)
- 查看 [核心插件文档](./plugins/)
- 创建你自己的插件

---

**最后更新**: 2026-03-05
**版本**: 1.0.0
