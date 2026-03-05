# 安全增强功能说明

## 版本 2.0.1 (2026-03-05)

### 🆕 新增功能

本次更新重点增强了系统的安全性和错误处理能力。

### 🔒 安全增强

#### 1. 输入验证 (`utils/input-validator.js`)

新增了全面的输入验证工具，提供以下功能：

- **消息验证**：验证和清理用户输入的消息内容
- **会话 ID 验证**：确保会话 ID 格式正确
- **配置键验证**：验证配置项的键名
- **提供者验证**：验证 AI 提供者名称
- **安全检查**：检测 SQL 注入和命令注入模式
- **批量验证**：支持多个字段的批量验证

**使用示例**：
```javascript
const InputValidator = require('./utils/input-validator')
const validator = new InputValidator(logger)

// 验证消息
const result = validator.validateMessage(userInput)
if (!result.valid) {
  console.error(result.error)
} else {
  const sanitized = result.sanitized
}

// 综合安全检查
const security = validator.performSecurityCheck(input, {
  checkSqlInjection: true,
  checkCommandInjection: true,
  maxLength: 50000
})
```

#### 2. 安全增强器 (`utils/security-enhancer.js`)

提供额外的安全防护功能：

- **增强的安全头**：
  - Content-Security-Policy (CSP)
  - Strict-Transport-Security (HSTS)
  - X-Frame-Options
  - X-XSS-Protection
  - Permissions-Policy

- **安全检查**：
  - 路径遍历检测
  - SSRF (服务端请求伪造) 检测
  - 恶意 User-Agent 检测

- **实用工具**：
  - 生成安全的随机 token
  - 验证请求来源
  - 请求大小限制

**使用示例**：
```javascript
const SecurityEnhancer = require('./utils/security-enhancer')
const enhancer = new SecurityEnhancer(logger)

// 创建安全头中间件
const securityMiddleware = enhancer.createSecurityHeadersMiddleware()
app.use(securityMiddleware)

// 检测路径遍历
if (enhancer.detectPathTraversal(userPath)) {
  console.error('检测到路径遍历攻击')
}

// 检测 SSRF
if (enhancer.detectSSRF(url)) {
  console.error('检测到 SSRF 攻击')
}
```

#### 3. 增强的错误处理 (`utils/error-handler.js`)

统一的错误处理和日志系统：

- **错误分类**：
  - 验证错误
  - 认证/授权错误
  - 未找到错误
  - 速率限制错误
  - 安全错误
  - 超时错误

- **错误严重级别**：
  - Low
  - Medium
  - High
  - Critical

- **错误统计**：
  - 跟踪错误类型和频率
  - 记录最后发生时间
  - 支持错误趋势分析

- **安全错误响应**：
  - 自动清理敏感信息
  - 标准化错误格式
  - 包含请求 ID 用于追踪

**使用示例**：
```javascript
const { ErrorHandler, ValidationError } = require('./utils/error-handler')
const errorHandler = new ErrorHandler(logger)

// 创建错误处理中间件
app.use(errorHandler.createErrorMiddleware())

// 抛出自定义错误
throw new ValidationError('输入无效')

// 异步错误包装
app.get('/api/data', errorHandler.asyncHandler(async (req, res) => {
  // 你的异步代码
}))
```

### 🔄 API 改进

所有 API 端点现在都包含输入验证：

- `POST /api/message` - 消息内容和会话 ID 验证
- `POST /api/config` - 配置键验证
- 其他 API 端点逐步添加验证

**错误响应格式**：
```json
{
  "success": false,
  "error": "错误消息",
  "errorType": "VALIDATION",
  "requestId": "req_xxx",
  "timestamp": "2026-03-05T10:30:00.000Z"
}
```

### 📊 监控和日志

#### 增强的错误日志

所有错误现在都包含：
- 错误类型和严重级别
- 请求上下文信息
- 自动清理敏感信息
- 堆栈跟踪（高严重级别错误）

#### 错误统计

可以通过以下方式获取错误统计：
```javascript
const stats = errorHandler.getErrorStats()
```

### 🛡️ 安全最佳实践

#### 1. 输入验证

```javascript
// ✅ 好的做法：验证所有输入
const validation = validator.validateMessage(userInput)
if (!validation.valid) {
  return res.status(400).json({ error: validation.error })
}

// ❌ 不好的做法：直接使用用户输入
const result = process(userInput)
```

#### 2. 安全错误处理

```javascript
// ✅ 好的做法：使用自定义错误类
throw new ValidationError('输入格式无效')

// ❌ 不好的做法：暴露内部信息
throw new Error(`数据库查询失败: ${sqlQuery}`)
```

#### 3. 清理敏感信息

```javascript
// ✅ 好的做法：使用清理工具
const cleanMessage = errorHandler.sanitizeErrorMessage(errorMessage)

// ❌ 不好的做法：直接记录错误
logger.error('Error', error.message) // 可能包含敏感信息
```

### 🔧 配置选项

#### 环境变量

```bash
# 启用严重错误通知
CRITICAL_ERROR_NOTIFICATION=true

# 安全头配置（已内置，无需额外配置）
# 默认已启用：
# - X-Frame-Options: DENY
# - X-Content-Type-Options: nosniff
# - X-XSS-Protection: 1; mode=block
# - Strict-Transport-Security: max-age=31536000
# - Content-Security-Policy: 默认策略
```

### 📝 迁移指南

#### 对于现有代码

1. **输入验证**：
   - 在所有 API 端点添加输入验证
   - 使用 `InputValidator` 类进行验证
   - 不要信任任何用户输入

2. **错误处理**：
   - 使用新的错误类替代通用 Error
   - 使用 `errorHandler.asyncHandler` 包装异步路由
   - 确保错误消息不包含敏感信息

3. **日志记录**：
   - 使用 `logger.error()` 记录错误
   - 包含请求上下文信息
   - 不要记录敏感数据

#### 示例迁移

**之前**：
```javascript
app.post('/api/data', async (req, res) => {
  const { message } = req.body
  if (!message) {
    return res.status(400).json({ error: '消息不能为空' })
  }
  // 处理逻辑...
})
```

**之后**：
```javascript
const { ValidationError } = require('./utils/error-handler')

app.post('/api/data',
  errorHandler.asyncHandler(async (req, res) => {
    const { message } = req.body

    // 验证输入
    const validation = validator.validateMessage(message)
    if (!validation.valid) {
      throw new ValidationError(validation.error)
    }

    // 使用清理后的输入
    const sanitized = validation.sanitized
    // 处理逻辑...
  })
)
```

### 🚀 性能影响

- **输入验证**：< 1ms 每次请求
- **安全头**：无性能影响（仅在响应头中添加）
- **错误处理**：< 1ms 每次错误
- **总体影响**：可忽略不计

### 📚 相关文档

- [输入验证 API](./input-validator-api.md)
- [安全增强器 API](./security-enhancer-api.md)
- [错误处理 API](./error-handler-api.md)
- [安全最佳实践](./security-best-practices.md)

### 🐛 问题反馈

如果发现安全问题或有改进建议，请：
1. 不要在公共 issue 中披露安全漏洞
2. 发送邮件至安全团队
3. 使用负责任的披露流程

---

**版本**：2.0.1
**更新日期**：2026-03-05
**维护团队**：OPRCLI Team
