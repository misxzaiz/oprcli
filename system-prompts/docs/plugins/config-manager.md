# ConfigManager - 配置管理系统

**版本**: 1.0.0
**作者**: OPRCLI Team
**描述**: 集中化配置管理系统，支持热更新和持久化

## 功能说明

ConfigManager 提供完整的配置管理能力：
- ✅ 配置加载与保存
- ✅ 配置热更新（自动保存）
- ✅ 配置验证
- ✅ 配置监听（watch）
- ✅ 工具管理
- ✅ 插件配置管理

## 使用方法

### 基本操作

```javascript
// 获取配置
const port = server.configManager.get('server.port', 13579)

// 设置配置（自动保存）
await server.configManager.set('server.port', 8080)

// 批量设置
await server.configManager.setMultiple({
  'server.port': 8080,
  'server.host': 'localhost'
})

// 获取所有配置
const all = server.configManager.getAll()
```

### 配置监听

```javascript
// 监听配置变更
server.configManager.watch('server.port', (newValue) => {
  console.log(`端口已更改为: ${newValue}`)
})

// 取消监听
server.configManager.unwatch('server.port', callback)
```

### 工具管理

```javascript
// 添加工具配置
await server.configManager.addTool({
  name: 'my-tool',
  path: '/path/to/tool',
  description: '我的工具'
})

// 移除工具
await server.configManager.removeTool('my-tool')
```

### 插件配置

```javascript
// 添加插件配置
await server.configManager.addPluginConfig('my-plugin', {
  option1: 'value1',
  option2: 'value2'
})

// 获取插件配置
const config = server.configManager.getPluginConfig('my-plugin')
```

### 高级操作

```javascript
// 重载配置
await server.configManager.reload()

// 重置为默认配置
await server.configManager.reset()

// 导出配置
const configString = server.configManager.export()

// 导入配置
await server.configManager.import(configString)
```

## HTTP API

### 获取配置

```bash
# 获取所有配置
curl http://localhost:13579/api/config

# 获取特定配置
curl http://localhost:13579/api/config?key=server.port
```

### 设置配置

```bash
curl -X POST http://localhost:13579/api/config \
  -H "Content-Type: application/json" \
  -d '{"key": "server.port", "value": 8080}'
```

## 配置文件

### 默认配置
**位置**: `config/default.json`

```json
{
  "server": {
    "port": 13579,
    "host": "0.0.0.0"
  },
  "plugins": {
    "enabled": [
      "config-manager",
      "context-memory"
    ]
  }
}
```

### 用户配置
**位置**: `config/user.json`

运行时自动生成和更新。

## 配置结构

```
config/
├── default.json    # 默认配置（只读）
├── user.json       # 用户配置（自动生成）
└── schema.json     # 配置验证 Schema
```

## 最佳实践

1. **使用默认值**
   ```javascript
   // ✅ 推荐：提供默认值
   const value = server.configManager.get('my.key', 'default')

   // ❌ 不推荐：不提供默认值
   const value = server.configManager.get('my.key')
   ```

2. **监听关键配置**
   ```javascript
   // 监听需要实时响应的配置
   server.configManager.watch('server.port', async (newPort) => {
     // 重启服务
   })
   ```

3. **使用命名空间**
   ```javascript
   // ✅ 推荐：使用点号分隔的命名空间
   server.configManager.set('my-plugin.feature.enabled', true)

   // ❌ 不推荐：使用复杂的嵌套
   server.configManager.set('myPlugin.features.enabled', true)
   ```

## 注意事项

- ⚠️ 配置更改会立即保存到文件
- ⚠️ 敏感配置应该加密存储
- ⚠️ 配置监听器可能导致内存泄漏，记得取消监听

## API 参考

| 方法 | 说明 |
|------|------|
| `get(key, defaultValue)` | 获取配置值 |
| `set(key, value)` | 设置配置值 |
| `setMultiple(updates)` | 批量设置配置 |
| `watch(key, callback)` | 监听配置变更 |
| `unwatch(key, callback)` | 取消监听 |
| `addTool(config)` | 添加工具配置 |
| `removeTool(name)` | 移除工具 |
| `addPluginConfig(name, config)` | 添加插件配置 |
| `getPluginConfig(name)` | 获取插件配置 |
| `reload()` | 重载配置 |
| `reset()` | 重置配置 |
| `export()` | 导出配置 |
| `import(configString)` | 导入配置 |

## 相关文档

- [插件系统概述](../plugin-system.md)
- [ContextMemory](./context-memory.md)
- [快速开始](../plugin-quickstart.md)

## 更新日志

- 初始版本: 2026/3/5
