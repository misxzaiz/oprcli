# 高级功能文档

本文档介绍 OPRCLI 项目的三个新增高级功能：

1. **任务队列系统（TaskQueue）**
2. **统一响应格式工具（ResponseFormatter）**
3. **请求去重中间件（Deduplication Middleware）**

---

## 1. 任务队列系统（TaskQueue）

### 功能特性

- ✅ 并发控制：限制同时执行的任务数量
- ✅ 优先级队列：支持高、中、低三个优先级
- ✅ 失败重试：自动重试失败的任务，支持指数退避
- ✅ 超时控制：防止任务长时间挂起
- ✅ 统计监控：实时查看队列状态和任务统计

### 基本用法

```javascript
const TaskQueue = require('./utils/task-queue');

// 创建任务队列
const queue = new TaskQueue({
  concurrency: 5,    // 并发数
  timeout: 30000,    // 超时时间（毫秒）
  maxRetries: 3,     // 最大重试次数
  retryDelay: 1000   // 重试延迟（毫秒）
});

// 添加任务
const result = await queue.add(async () => {
  // 你的异步任务
  return '任务完成';
}, {
  priority: 1,        // 优先级（1=高，2=中，3=低）
  id: 'custom-id',    // 自定义任务 ID
  metadata: {         // 元数据
    userId: 123
  }
});

console.log(result); // '任务完成'
```

### 高级用法

```javascript
// 查看队列状态
const status = queue.getStatus();
console.log(status);
/*
{
  stats: {
    total: 100,
    completed: 85,
    failed: 10,
    retried: 5,
    timeout: 0,
    successRate: '85.00%',
    avgRetries: '0.05'
  },
  running: 3,
  queued: 12,
  queueByPriority: {
    high: 5,
    medium: 5,
    low: 2
  },
  options: { ... }
}
*/

// 等待所有任务完成
await queue.onIdle();

// 清空队列（不影响正在运行的任务）
queue.clear();

// 暂停/恢复队列
queue.pause();
queue.resume();

// 重置统计信息
queue.resetStats();
```

### 使用场景

- 批量数据处理
- 外部 API 调用（限流场景）
- 耗时计算任务
- 文件处理操作
- 数据库批量操作

---

## 2. 统一响应格式工具（ResponseFormatter）

### 功能特性

- ✅ 标准化响应格式
- ✅ 成功/错误响应
- ✅ 分页支持
- ✅ 验证错误处理
- ✅ 自动添加时间戳和请求 ID

### 基本用法

```javascript
const ResponseFormatter = require('./utils/response-formatter');

const formatter = new ResponseFormatter({
  includeTimestamp: true,  // 包含时间戳
  includeRequestId: true,  // 包含请求 ID
  stackTrace: false        // 生产环境不包含堆栈
});

// 成功响应
res.json(formatter.success(
  { id: 1, name: '测试' },  // 数据
  '操作成功'                // 消息
));

/*
{
  "success": true,
  "message": "操作成功",
  "data": { "id": 1, "name": "测试" },
  "timestamp": "2026-03-05T10:30:00.000Z"
}
*/

// 错误响应
res.json(formatter.error('操作失败', 400));

/*
{
  "success": false,
  "message": "操作失败",
  "error": {
    "code": "BAD_REQUEST",
    "http_status": 400
  },
  "timestamp": "2026-03-05T10:30:00.000Z"
}
*/
```

### 响应类型

```javascript
// 分页响应
res.json(formatter.paginated(
  [1, 2, 3],  // 数据项
  1,           // 当前页
  10,          // 每页大小
  100          // 总数
));

// 验证错误
res.json(formatter.validationError({
  email: '邮箱格式不正确',
  password: '密码长度不能少于 8 位'
}));

// 未授权
res.json(formatter.unauthorized('请先登录'));

// 未找到
res.json(formatter.notFound('用户'));

// 服务器错误
res.json(formatter.serverError('操作失败', error));

// 批量操作结果
res.json(formatter.batchResult(
  85,   // 成功数
  15,   // 失败数
  100   // 总数
));
```

### Express 集成

```javascript
const express = require('express');
const ResponseFormatter = require('./utils/response-formatter');

const app = express();
const formatter = new ResponseFormatter();

// 应用中间件（自动注入请求 ID）
app.use(formatter.middleware());

// 路由中使用
app.get('/api/users', (req, res) => {
  res.json(formatter.success(users));
});

// 错误处理
app.use((err, req, res, next) => {
  res.json(formatter.fromError(err));
});
```

---

## 3. 请求去重中间件（Deduplication Middleware）

### 功能特性

- ✅ 防止短时间内重复请求
- ✅ 基于内容哈希的去重
- ✅ 可配置的时间窗口
- ✅ 支持 IP/用户级别的去重
- ✅ 自动清理过期记录

### 基本用法

```javascript
const deduplication = require('./utils/deduplication-middleware');
const express = require('express');

const app = express();

// 全局应用
app.use(deduplication({
  windowMs: 5000,      // 5 秒时间窗口
  maxRequests: 1,      // 只允许 1 次请求
  includeBody: true    // 包含请求体
}));

// 特定路由应用
app.post('/api/sensitive', deduplication({ windowMs: 10000 }), (req, res) => {
  res.json({ success: true });
});
```

### 高级配置

```javascript
// 基于 IP 的去重
const { createIpBasedDeduplication } = require('./utils/deduplication-middleware');

app.use(createIpBasedDeduplication({
  windowMs: 60000  // 每分钟每个 IP 只能请求一次
}));

// 基于用户的去重（需要身份验证）
const { createUserBasedDeduplication } = require('./utils/deduplication-middleware');

function extractUserId(req) {
  return req.user?.id || req.session?.userId;
}

app.use(createUserBasedDeduplication(extractUserId, {
  windowMs: 10000  // 每 10 秒每个用户只能请求一次
}));

// 自定义键生成器
app.use(deduplication({
  keyGenerator: (req) => {
    // 自定义去重逻辑
    return `${req.user.id}:${req.path}:${req.body.action}`;
  }
}));
```

### 响应示例

```javascript
// 当请求被拒绝时，返回：
{
  "success": false,
  "message": "请求过于频繁，请稍后再试",
  "error": {
    "code": "TOO_MANY_REQUESTS",
    "http_status": 429,
    "details": {
      "retry_after": "3s",
      "fingerprint": "a1b2c3d4..."
    }
  }
}
```

---

## 完整集成示例

```javascript
const express = require('express');
const TaskQueue = require('./utils/task-queue');
const ResponseFormatter = require('./utils/response-formatter');
const deduplication = require('./utils/deduplication-middleware');

const app = express();

// 初始化
const queue = new TaskQueue({ concurrency: 5 });
const formatter = new ResponseFormatter();

// 中间件
app.use(express.json());
app.use(formatter.middleware());

// 敏感操作路由（使用去重 + 队列）
app.post('/api/pay',
  deduplication({ windowMs: 10000 }),
  async (req, res) => {
    try {
      const result = await queue.add(async () => {
        // 处理支付
        return processPayment(req.body);
      }, { priority: 1 });

      res.json(formatter.success(result, '支付成功'));
    } catch (error) {
      res.json(formatter.fromError(error));
    }
  }
);

// 健康检查
app.get('/health', (req, res) => {
  res.json(formatter.success({
    status: 'healthy',
    queue: queue.getStatus()
  }));
});

app.listen(3000);
```

---

## 性能优化建议

### 1. 任务队列

- 根据服务器资源调整并发数
- 长时间运行的任务应设置合理的超时时间
- 使用优先级队列确保重要任务优先执行

### 2. 响应格式

- 生产环境禁用 stackTrace
- 使用 camelCase 选项适配前端约定
- 大量数据使用分页响应

### 3. 请求去重

- 仅在必要的路由上应用去重
- 根据业务需求调整时间窗口
- 监控去重命中率，避免误伤正常请求

---

## 最佳实践

1. **任务队列**：用于处理批量操作、外部 API 调用等耗时任务
2. **统一响应**：所有 API 端点都使用标准化响应格式
3. **请求去重**：仅在写操作（POST/PUT/DELETE）上应用
4. **监控**：定期查看队列统计和去重效果
5. **日志**：记录关键操作和错误信息

---

## 故障排查

### 任务队列卡住

```javascript
// 检查队列状态
console.log(queue.getStatus());

// 重启队列
queue.pause();
queue.resume();
```

### 去重过于严格

```javascript
// 调整时间窗口
deduplication({
  windowMs: 1000,  // 减少到 1 秒
  maxRequests: 5   // 增加到 5 次
});
```

### 响应格式不符合预期

```javascript
// 检查配置
const formatter = new ResponseFormatter({
  includeTimestamp: true,
  includeRequestId: true
});

// 确保应用了中间件
app.use(formatter.middleware());
```

---

## 更多示例

查看 `examples/advanced-usage.js` 文件获取更多使用示例。
