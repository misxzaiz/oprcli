/**
 * 高级功能使用示例
 *
 * 演示如何使用任务队列、统一响应格式和请求去重中间件
 */

const TaskQueue = require('../utils/task-queue')
const ResponseFormatter = require('../utils/response-formatter')
const deduplication = require('../utils/deduplication-middleware')

// ============================================================================
// 1. 任务队列使用示例
// ============================================================================

async function taskQueueExample() {
  console.log('\n=== 任务队列示例 ===\n')

  // 创建任务队列（并发数 3）
  const queue = new TaskQueue({
    concurrency: 3,
    timeout: 5000,
    maxRetries: 2
  })

  // 添加任务
  const task1 = queue.add(async () => {
    console.log('任务 1 执行中...')
    await new Promise(resolve => setTimeout(resolve, 1000))
    return '任务 1 完成'
  }, { priority: 1 }) // 高优先级

  const task2 = queue.add(async () => {
    console.log('任务 2 执行中...')
    await new Promise(resolve => setTimeout(resolve, 2000))
    return '任务 2 完成'
  }, { priority: 2 })

  const task3 = queue.add(async () => {
    console.log('任务 3 执行中...')
    await new Promise(resolve => setTimeout(resolve, 500))
    return '任务 3 完成'
  }, { priority: 3 })

  // 等待所有任务完成
  const results = await Promise.all([task1, task2, task3])
  console.log('所有任务完成:', results)

  // 查看统计信息
  console.log('\n任务队列统计:')
  console.log(queue.getStatus())

  // 等待队列空闲
  await queue.onIdle()
  console.log('\n队列已空闲')
}

// ============================================================================
// 2. 统一响应格式使用示例
// ============================================================================

function responseFormatterExample() {
  console.log('\n=== 统一响应格式示例 ===\n')

  const formatter = new ResponseFormatter({
    includeTimestamp: true,
    stackTrace: true
  })

  // 成功响应
  console.log('成功响应:')
  console.log(JSON.stringify(formatter.success({ id: 1, name: '测试' }), null, 2))

  // 错误响应
  console.log('\n错误响应:')
  console.log(JSON.stringify(formatter.error('操作失败', 400), null, 2))

  // 分页响应
  console.log('\n分页响应:')
  console.log(JSON.stringify(formatter.paginated([1, 2, 3], 1, 10, 100), null, 2))

  // 验证错误
  console.log('\n验证错误:')
  console.log(JSON.stringify(formatter.validationError({
    email: '邮箱格式不正确',
    password: '密码长度不能少于 8 位'
  }), null, 2))

  // 批量操作结果
  console.log('\n批量操作结果:')
  console.log(JSON.stringify(formatter.batchResult(85, 15, 100), null, 2))
}

// ============================================================================
// 3. 请求去重中间件使用示例
// ============================================================================

function expressIntegrationExample() {
  console.log('\n=== Express 集成示例 ===\n')

  const express = require('express')
  const app = express()

  app.use(express.json())

  // 应用请求去重中间件（全局）
  app.use(deduplication({
    windowMs: 5000, // 5 秒内
    maxRequests: 1, // 只允许 1 次请求
    includeBody: true // 包含请求体
  }))

  // 应用统一响应格式中间件
  const formatter = new ResponseFormatter()
  app.use(formatter.middleware())

  // 路由示例
  app.post('/api/data', (req, res) => {
    // 使用统一响应格式
    res.json(formatter.success({
      created: true,
      data: req.body
    }, '数据创建成功'))
  })

  app.get('/api/data/:id', (req, res) => {
    // 模拟数据查询
    const data = { id: req.params.id, name: '测试数据' }
    res.json(formatter.success(data))
  })

  // 错误处理
  app.use((err, req, res, next) => {
    res.json(formatter.fromError(err))
  })

  console.log('Express 应用配置完成')
  console.log('监听端口: 3000')

  return app
}

// ============================================================================
// 4. 完整示例：集成所有功能
// ============================================================================

function completeIntegrationExample() {
  console.log('\n=== 完整集成示例 ===\n')

  const express = require('express')
  const app = express()

  // 初始化
  const queue = new TaskQueue({ concurrency: 5 })
  const formatter = new ResponseFormatter()
  const logger = require('../integrations/logger')

  // 中间件
  app.use(express.json())
  app.use(formatter.middleware())

  // 敏感操作路由使用请求去重
  app.post('/api/pay', deduplication({ windowMs: 10000 }), async (req, res) => {
    try {
      // 将耗时任务放入队列
      const result = await queue.add(async () => {
        // 模拟支付处理
        await new Promise(resolve => setTimeout(resolve, 2000))
        return { orderId: 'ORDER_' + Date.now(), status: 'success' }
      }, { priority: 1 })

      res.json(formatter.success(result, '支付成功'))
    } catch (error) {
      res.json(formatter.fromError(error))
    }
  })

  // 批量操作路由
  app.post('/api/batch', async (req, res) => {
    const items = req.body.items || []

    try {
      // 使用队列处理批量任务
      const results = await Promise.all(
        items.map(item =>
          queue.add(async () => {
            await new Promise(resolve => setTimeout(resolve, 500))
            return { id: item.id, processed: true }
          })
        )
      )

      res.json(formatter.batchResult(results.length, 0, items.length, results))
    } catch (error) {
      res.json(formatter.fromError(error))
    }
  })

  // 健康检查（显示队列状态）
  app.get('/health', (req, res) => {
    res.json(formatter.success({
      status: 'healthy',
      queue: queue.getStatus()
    }))
  })

  console.log('完整集成配置完成')
  return app
}

// ============================================================================
// 运行示例
// ============================================================================

async function main() {
  try {
    // 运行任务队列示例
    await taskQueueExample()

    // 运行响应格式示例
    responseFormatterExample()

    // 运行 Express 集成示例
    const app1 = expressIntegrationExample()

    // 运行完整集成示例
    const app2 = completeIntegrationExample()

    console.log('\n✅ 所有示例运行完成\n')
  } catch (error) {
    console.error('示例运行失败:', error)
  }
}

// 如果直接运行此文件，执行示例
if (require.main === module) {
  main()
}

module.exports = {
  taskQueueExample,
  responseFormatterExample,
  expressIntegrationExample,
  completeIntegrationExample
}
