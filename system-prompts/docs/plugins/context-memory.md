# ContextMemory - 上下文记忆系统

**版本**: 1.0.0
**作者**: OPRCLI Team
**描述**: 跨会话保存和共享上下文信息

## 功能说明

ContextMemory 提供强大的记忆管理能力：
- ✅ 跨会话保存数据
- ✅ 会话管理
- ✅ 共享上下文
- ✅ 用户偏好
- ✅ 智能搜索
- ✅ 自动过期清理

## 使用方法

### 基本操作

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

### 会话管理

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

### 共享上下文

```javascript
// 保存共享配置
await server.contextMemory.saveSharedContext('default-theme', 'dark')

// 获取共享配置
const theme = await server.contextMemory.getSharedContext('default-theme')

// 跨会话使用
// 会话A: await server.contextMemory.saveSharedContext('user-preference', {...})
// 会话B: const pref = await server.contextMemory.getSharedContext('user-preference')
```

### 用户偏好

```javascript
// 保存用户偏好
await server.contextMemory.saveUserPreference(userId, 'theme', 'dark')

// 获取用户偏好
const theme = await server.contextMemory.getUserPreference(userId, 'theme')
```

### 搜索和列表

```javascript
// 搜索记忆
const results = await server.contextMemory.search('theme')
// 返回: [{ key, value, timestamp, expiresAt }, ...]

// 按类型列出
const sessions = await server.contextMemory.listByType('session')

// 列出所有记忆
const all = await server.contextMemory.list()

// 带过滤条件
const recent = await server.contextMemory.list(entry => {
  return entry.timestamp > Date.now() - 24 * 60 * 60 * 1000
})
```

### 高级操作

```javascript
// 清空所有记忆
await server.contextMemory.clear()

// 手动清理过期记忆
const cleaned = await server.contextMemory.cleanup()

// 导出记忆
const dataString = await server.contextMemory.export()

// 导入记忆
await server.contextMemory.import(dataString)

// 获取统计信息
const stats = server.contextMemory.getStats()
// 返回: { total, expired, active, types, dbPath }
```

## HTTP API

### 获取统计信息

```bash
curl http://localhost:13579/api/memory/stats
```

响应示例：
```json
{
  "success": true,
  "stats": {
    "total": 42,
    "expired": 5,
    "active": 37,
    "types": {
      "session": 10,
      "shared": 5,
      "preference": 22
    },
    "dbPath": "D:/space/oprcli/memory/context.db"
  }
}
```

## 数据结构

### 记忆条目

```javascript
{
  key: string,           // 键
  value: any,            // 值
  timestamp: number,     // 创建时间
  expiresAt: number,     // 过期时间（null = 不过期）
  metadata: {
    type: string,        // 类型: session, shared, preference, etc.
    // ... 其他元数据
  }
}
```

### 键命名规范

```javascript
// 会话上下文
'session:{sessionId}'

// 共享上下文
'shared:{key}'

// 用户偏好
'user:{userId}:preference:{preference}'

// 自定义
'{namespace}:{key}'
```

## TTL 使用

```javascript
// 1小时过期
{ ttl: 60 * 60 * 1000 }

// 1天过期
{ ttl: 24 * 60 * 60 * 1000 }

// 7天过期（默认）
{ ttl: 7 * 24 * 60 * 60 * 1000 }

// 永不过期
{ ttl: 0 }  // 或不传 ttl 参数

// 使用元数据
await server.contextMemory.set('key', 'value', {
  ttl: 3600000,
  metadata: { type: 'temporary', source: 'user-input' }
})
```

## 最佳实践

1. **使用命名空间**
   ```javascript
   // ✅ 推荐：使用命名空间避免冲突
   await server.contextMemory.set('plugin-a:data', {...})
   await server.contextMemory.set('plugin-b:data', {...})

   // ❌ 不推荐：直接使用简单键名
   await server.contextMemory.set('data', {...})
   ```

2. **设置合理的 TTL**
   ```javascript
   // ✅ 推荐：根据数据特性设置 TTL
   // 会话数据: 7天
   // 临时缓存: 1小时
   // 用户偏好: 30天
   // 系统配置: 永不过期

   // ❌ 不推荐：所有数据都永不过期
   ```

3. **定期清理**
   ```javascript
   // 系统会自动每小时清理一次，但也可以手动触发
   await server.contextMemory.cleanup()
   ```

4. **使用类型标记**
   ```javascript
   // ✅ 推荐：在元数据中标记类型
   await server.contextMemory.set('key', 'value', {
     metadata: { type: 'cache', source: 'api-call' }
   })

   // 方便后续按类型筛选
   const caches = await server.contextMemory.listByType('cache')
   ```

## 常见用例

### 1. 会话恢复

```javascript
// 会话结束时保存
await server.contextMemory.saveSession(sessionId, {
  history: conversationHistory,
  context: currentContext,
  timestamp: Date.now()
})

// 下次会话时恢复
const saved = await server.contextMemory.getSession(sessionId)
if (saved) {
  // 恢复上下文
  restoreContext(saved.context)
}
```

### 2. 跨会话配置

```javascript
// 用户在会话A中设置偏好
await server.contextMemory.saveSharedContext('user:theme', 'dark')

// 在会话B中使用
const theme = await server.contextMemory.getSharedContext('user:theme')
applyTheme(theme)
```

### 3. 临时缓存

```javascript
// 缓存 API 结果
const cacheKey = `api:${endpoint}`
let cached = await server.contextMemory.get(cacheKey)

if (!cached) {
  const result = await callAPI(endpoint)
  await server.contextMemory.set(cacheKey, result, {
    ttl: 5 * 60 * 1000  // 5分钟过期
  })
  cached = result
}
```

## 存储位置

```
memory/
└── context.db    # JSON 数据库（自动创建）
```

## 注意事项

- ⚠️ 数据存储在本地文件中，重启后仍然保留
- ⚠️ 敏感数据应该加密存储
- ⚠️ 大量数据会影响性能，建议设置合理的 TTL
- ⚠️ 定期清理过期数据以避免磁盘占用

## API 参考

| 方法 | 说明 |
|------|------|
| `set(key, value, options)` | 保存数据 |
| `get(key)` | 获取数据 |
| `has(key)` | 检查键是否存在 |
| `delete(key)` | 删除数据 |
| `clear()` | 清空所有数据 |
| `saveSession(id, context)` | 保存会话 |
| `getSession(id)` | 获取会话 |
| `deleteSession(id)` | 删除会话 |
| `saveSharedContext(key, value)` | 保存共享上下文 |
| `getSharedContext(key)` | 获取共享上下文 |
| `saveUserPreference(userId, pref, value)` | 保存用户偏好 |
| `getUserPreference(userId, pref)` | 获取用户偏好 |
| `search(pattern)` | 搜索记忆 |
| `list(filter)` | 列出记忆 |
| `listByType(type)` | 按类型列出 |
| `cleanup()` | 清理过期数据 |
| `export()` | 导出数据 |
| `import(dataString)` | 导入数据 |
| `getStats()` | 获取统计信息 |

## 相关文档

- [插件系统概述](../plugin-system.md)
- [ConfigManager](./config-manager.md)
- [快速开始](../plugin-quickstart.md)

## 更新日志

- 初始版本: 2026/3/5
