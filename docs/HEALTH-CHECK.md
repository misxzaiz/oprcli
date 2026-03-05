# 增强健康检查系统文档

## 概述

OPRCLI v2.0.0 增强版健康检查系统提供了全面的服务监控能力，包括：
- 依赖服务状态监控
- 系统资源监控
- 健康检查结果缓存
- 历史趋势记录

## 新增 API 端点

### 1. GET /health/enhanced
**综合健康检查（包含所有注册的检查项）**

```bash
curl http://localhost:3000/health/enhanced
```

**响应示例**：
```json
{
  "status": "healthy",
  "timestamp": "2026-03-05T10:30:00.000Z",
  "totalChecks": 4,
  "healthy": 4,
  "unhealthy": 0,
  "errors": 0,
  "checks": [
    {
      "name": "dingtalk_connection",
      "status": "healthy",
      "message": "钉钉客户端已连接",
      "duration": 2,
      "timestamp": "2026-03-05T10:30:00.000Z"
    },
    {
      "name": "default_connector",
      "status": "healthy",
      "message": "默认连接器就绪",
      "details": { "provider": "claude" },
      "duration": 1,
      "timestamp": "2026-03-05T10:30:00.000Z"
    },
    {
      "name": "memory_usage",
      "status": "healthy",
      "message": "内存使用正常: 45.23%",
      "details": { "heapUsedPercent": 45.23 },
      "duration": 0,
      "timestamp": "2026-03-05T10:30:00.000Z"
    },
    {
      "name": "event_loop",
      "status": "healthy",
      "message": "事件循环正常: 2.15ms",
      "details": { "delay": 2.15 },
      "duration": 3,
      "timestamp": "2026-03-05T10:30:00.000Z"
    }
  ]
}
```

**查询参数**：
- `?refresh=true` - 强制刷新缓存

---

### 2. GET /health/dependencies/status
**依赖服务状态（钉钉、连接器等）**

```bash
curl http://localhost:3000/health/dependencies/status
```

**响应示例**：
```json
{
  "status": "ok",
  "total": 2,
  "healthy": 2,
  "dependencies": [
    {
      "name": "dingtalk",
      "status": "connected",
      "message": "Connected",
      "details": { "clientId": "configured" }
    },
    {
      "name": "claude",
      "type": "connector",
      "status": "ready",
      "message": "Connected and ready",
      "details": {
        "connected": true,
        "activeSessions": 0
      }
    }
  ]
}
```

---

### 3. GET /health/resources/status
**系统资源状态（内存、CPU等）**

```bash
curl http://localhost:3000/health/resources/status
```

**响应示例**：
```json
{
  "status": "ok",
  "resources": {
    "memory": {
      "total": 16,
      "used": 8,
      "free": 8,
      "usagePercent": 50.0
    },
    "cpu": {
      "cores": 8,
      "loadAverage": {
        "1min": "2.15",
        "5min": "2.10",
        "15min": "2.05"
      }
    },
    "process": {
      "uptime": "2.5h",
      "pid": 12345,
      "platform": "win32",
      "arch": "x64",
      "nodeVersion": "v24.13.0"
    },
    "timestamp": "2026-03-05T10:30:00.000Z"
  }
}
```

---

### 4. GET /health/trends
**健康趋势数据**

```bash
curl http://localhost:3000/health/trends?limit=20
```

**响应示例**：
```json
{
  "status": "ok",
  "count": 20,
  "trends": [
    {
      "status": "healthy",
      "timestamp": "2026-03-05T10:30:00.000Z",
      "healthy": 4,
      "unhealthy": 0,
      "errors": 0
    },
    // ... 更多历史记录
  ]
}
```

**查询参数**：
- `?limit=20` - 返回的记录数量（默认 20）

---

### 5. POST /health/check
**手动触发健康检查（强制刷新）**

```bash
curl -X POST http://localhost:3000/health/check
```

**响应**：同 `/health/enhanced`

---

### 6. POST /health/cache/clear
**清除健康检查缓存**

```bash
curl -X POST http://localhost:3000/health/cache/clear
```

**响应示例**：
```json
{
  "status": "ok",
  "message": "缓存已清除"
}
```

---

### 7. GET /health/cache/stats
**缓存统计信息**

```bash
curl http://localhost:3000/health/cache/stats
```

**响应示例**：
```json
{
  "status": "ok",
  "stats": {
    "cacheTimeout": 30000,
    "historyCount": 50,
    "historyLimit": 100,
    "registeredChecks": 4
  }
}
```

---

### 8. GET /health/all
**综合健康状态（包含所有信息）**

```bash
curl http://localhost:3000/health/all?refresh=true
```

**响应示例**：
```json
{
  "status": "ok",
  "timestamp": "2026-03-05T10:30:00.000Z",
  "enhanced": { /* 同 /health/enhanced */ },
  "dependencies": { /* 同 /health/dependencies/status */ },
  "resources": { /* 同 /health/resources/status */ },
  "trends": [ /* 最近 5 条趋势数据 */ ]
}
```

**查询参数**：
- `?refresh=true` - 强制刷新缓存

---

## 环境变量配置

```env
# 健康检查缓存超时（毫秒）
HEALTH_CACHE_TIMEOUT=30000

# 健康检查历史记录数量
HEALTH_HISTORY_LIMIT=100
```

---

## 注册自定义健康检查项

在 `server.js` 中添加自定义检查项：

```javascript
// 获取增强健康检查器实例
const enhancedChecker = // ... 从 server 获取

// 注册自定义检查
enhancedChecker.registerCheck('custom_check', async () => {
  // 执行检查逻辑
  const result = await performCustomCheck()

  if (result.isOk) {
    return {
      healthy: true,
      message: '检查通过',
      details: result.data
    }
  } else {
    return {
      healthy: false,
      message: '检查失败',
      details: { error: result.error }
    }
  }
})
```

---

## 健康状态说明

### 状态值
- **healthy** - 服务健康
- **unhealthy** - 服务不健康
- **error** - 检查过程出错
- **unknown** - 状态未知

### 响应 HTTP 状态码
- **200** - 服务健康
- **503** - 服务不健康或降级
- **500** - 检查过程出错

---

## 监控建议

### 1. Kubernetes 探针配置

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
```

### 2. 监控告警规则

建议对以下指标设置告警：
- 内存使用率 > 90%
- 事件循环延迟 > 100ms
- 依赖服务断开连接
- 健康检查连续失败 > 3 次

---

## 性能优化

### 缓存机制
- 默认缓存 30 秒
- 可通过 `HEALTH_CACHE_TIMEOUT` 环境变量配置
- 使用 `?refresh=true` 强制刷新

### 历史记录
- 默认保留 100 条
- 可通过 `HEALTH_HISTORY_LIMIT` 环境变量配置

---

## 故障排查

### 常见问题

**1. 健康检查返回 503**
- 检查依赖服务状态：`GET /health/dependencies/status`
- 检查系统资源：`GET /health/resources/status`
- 查看详细检查结果：`GET /health/enhanced`

**2. 内存使用过高**
- 检查内存详情：`GET /health/resources/status`
- 查看内存趋势：`GET /health/trends`
- 考虑重启服务或增加内存限制

**3. 事件循环延迟**
- 检查是否有阻塞操作
- 查看性能指标：`GET /api/metrics`
- 优化长时间运行的同步操作

---

## 版本历史

- **v2.0.0** (2026-03-05) - 增强版健康检查系统
  - 新增综合健康检查
  - 新增依赖服务监控
  - 新增系统资源监控
  - 新增健康趋势记录
  - 新增缓存机制

---

**文档版本**: 2.0.0
**最后更新**: 2026-03-05
