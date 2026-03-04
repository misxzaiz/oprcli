# 🔌 OPRCLI 插件系统使用指南

## 📖 概述

OPRCLI 现在支持强大的插件系统，可以方便地扩展系统功能。

### 核心特性

- ✅ **插件管理**：动态注册、加载、卸载插件
- ✅ **配置管理**：集中化的配置系统，支持热更新
- ✅ **上下文记忆**：跨会话保存和共享信息
- ✅ **自动文档**：插件自动生成文档

---

## 🚀 快速开始

### 1. 查看已安装的插件

```bash
# 通过 API
curl http://localhost:13579/api/plugins

# 响应示例
{
  "success": true,
  "plugins": [
    {
      "name": "config-manager",
      "version": "1.0.0",
      "description": "配置管理系统",
      "author": "OPRCLI Team",
      "registeredAt": 1234567890
    },
    {
      "name": "context-memory",
      "version": "1.0.0",
      "description": "上下文记忆系统",
      "author": "OPRCLI Team",
      "registeredAt": 1234567890
    }
  ]
}
```

### 2. 配置管理

#### 获取配置

```bash
# 获取所有配置
curl http://localhost:13579/api/config

# 获取特定配置
curl http://localhost:13579/api/config?key=server.port
```

#### 设置配置

```bash
curl -X POST http://localhost:13579/api/config \
  -H "Content-Type: application/json" \
  -d '{"key": "server.port", "value": 8080}'
```

#### 在代码中使用

```javascript
// 获取配置
const port = server.configManager.get('server.port', 13579)

// 设置配置（自动保存）
await server.configManager.set('server.port', 8080)

// 监听配置变更
server.configManager.watch('server.port', (newValue) => {
  console.log(`端口已更改为: ${newValue}`)
})

// 添加工具配置
await server.configManager.addTool({
  name: 'my-tool',
  path: '/path/to/tool',
  description: '我的自定义工具'
})
```

### 3. 上下文记忆

#### 基本使用

```javascript
// 保存数据（7天过期）
await server.contextMemory.set('my-key', { data: 'value' }, {
  ttl: 7 * 24 * 60 * 60 * 1000
})

// 获取数据
const data = await server.contextMemory.get('my-key')

// 检查键是否存在
const exists = await server.contextMemory.has('my-key')

// 删除数据
await server.contextMemory.delete('my-key')
```

#### 会话管理

```javascript
// 保存会话上下文
await server.contextMemory.saveSession(sessionId, {
  history: [...],
  preference: {...},
  lastUsed: Date.now()
})

// 获取会话上下文
const session = await server.contextMemory.getSession(sessionId)

// 删除会话
await server.contextMemory.deleteSession(sessionId)
```

#### 共享上下文

```javascript
// 保存共享配置
await server.contextMemory.saveSharedContext('default-theme', 'dark')

// 获取共享配置
const theme = await server.contextMemory.getSharedContext('default-theme')
```

#### 搜索和列表

```javascript
// 搜索记忆
const results = await server.contextMemory.search('theme')

// 按类型列出
const sessions = await server.contextMemory.listByType('session')

// 列出所有记忆
const all = await server.contextMemory.list()
```

---

## 🔧 创建自定义插件

### 插件结构

```javascript
// plugins/custom/my-plugin.js

module.exports = {
  // 必需字段
  name: 'my-plugin',
  version: '1.0.0',
  description: '我的自定义插件',
  author: 'Your Name',

  // 可选字段
  api: {
    myFunction: '说明',
    anotherFunction: '说明'
  },

  config: {
    option1: '选项说明',
    option2: '选项说明'
  },

  // 初始化函数（可选）
  init: async (server) => {
    server.logger.info('PLUGIN', 'My plugin initialized')

    // 访问其他插件
    const config = server.configManager.get('my-plugin.config')
  },

  // 销毁函数（可选）
  destroy: async (server) => {
    server.logger.info('PLUGIN', 'My plugin destroyed')
  }
}
```

### 插件示例：计数器

```javascript
// plugins/custom/counter.js

module.exports = {
  name: 'counter',
  version: '1.0.0',
  description: '简单的计数器插件',
  author: 'Your Name',

  init: async (server) => {
    // 从记忆中加载计数
    const count = await server.contextMemory.get('counter:value') || 0

    server.logger.info('PLUGIN', `Counter initialized with value: ${count}`)
  },

  api: {
    increment: '增加计数',
    decrement: '减少计数',
    get: '获取当前值'
  }
}

// 使用示例
/*
// 在其他地方使用
const counter = server.pluginManager.getPlugin('counter')
const value = await server.contextMemory.get('counter:value')
await server.contextMemory.set('counter:value', value + 1)
*/
```

---

## 📡 API 端点

### 插件相关

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/plugins` | GET | 列出所有插件 |

### 配置相关

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/config` | GET | 获取配置 |
| `/api/config` | POST | 设置配置 |
| `/api/config?key=xxx` | GET | 获取特定配置 |

### 记忆相关

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/memory/stats` | GET | 获取记忆统计 |

---

## 🔍 高级用法

### 1. 配置热更新

```javascript
// 监听配置变更并自动重启服务
server.configManager.watch('server.port', async (newPort) => {
  server.logger.info('SERVER', `端口变更，重启服务...`)

  // 优雅重启
  server.app.close(() => {
    server.app.listen(newPort)
  })
})
```

### 2. 跨会话上下文共享

```javascript
// 在会话A中保存
await server.contextMemory.saveSharedContext('user-theme', 'dark')

// 在会话B中读取
const theme = await server.contextMemory.getSharedContext('user-theme')
```

### 3. 插件间通信

```javascript
// 插件A
await server.contextMemory.set('plugin-a:data', {...})

// 插件B读取插件A的数据
const data = await server.contextMemory.get('plugin-a:data')
```

---

## 📝 配置文件

### 默认配置

```json
{
  "server": {
    "port": 13579,
    "host": "0.0.0.0"
  },
  "connectors": {
    "default": "iflow",
    "timeout": 120000
  },
  "plugins": {
    "enabled": [
      "config-manager",
      "context-memory",
      "mcp-browser",
      "notification"
    ],
    "config": {}
  },
  "tasks": {
    "concurrent": 3,
    "retryTimes": 3,
    "timeout": 300000
  },
  "tools": [],
  "memory": {
    "maxSize": 1000,
    "defaultTTL": 604800000
  }
}
```

### 配置说明

- **server**: 服务器配置
  - `port`: 监听端口
  - `host`: 监听地址

- **plugins**: 插件配置
  - `enabled`: 启用的插件列表
  - `config`: 插件特定配置

- **memory**: 记忆系统配置
  - `maxSize`: 最大记忆条数
  - `defaultTTL`: 默认过期时间（毫秒）

---

## 🛠️ 故障排查

### 插件加载失败

```bash
# 检查插件日志
tail -f logs/oprc*.log | grep PLUGIN

# 常见问题：
# 1. 插件名称不符合规范（只能包含小写字母、数字、连字符）
# 2. 缺少必需字段（name, version, description）
# 3. init 函数抛出异常
```

### 配置未生效

```bash
# 检查配置文件
cat config/user.json

# 重新加载配置
curl -X POST http://localhost:13579/api/config/reload
```

### 记忆丢失

```bash
# 检查记忆数据库
cat memory/context.db

# 查看统计信息
curl http://localhost:13579/api/memory/stats
```

---

## 📚 相关文档

- [插件开发指南](./plugin-development.md)
- [API 参考](./api-reference.md)
- [配置管理](./config-manager.md)
- [上下文记忆](./context-memory.md)

---

**更新时间**: 2026-03-05
**版本**: 1.0.0
