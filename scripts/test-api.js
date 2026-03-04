#!/usr/bin/env node

/**
 * 内部 API 测试脚本
 * 测试 /api/tasks/reload 接口
 */

const http = require('http')

const API_URL = 'http://localhost:13579/api/tasks/reload'

console.log('🧪 内部 API 测试\n')
console.log('测试端点:', API_URL)
console.log('')

const req = http.request(API_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': 2
  }
}, (res) => {
  let data = ''

  res.on('data', chunk => {
    data += chunk
  })

  res.on('end', () => {
    console.log('状态码:', res.statusCode)
    try {
      const json = JSON.parse(data)
      console.log('响应:', JSON.stringify(json, null, 2))
    } catch (e) {
      console.log('响应:', data)
    }
    console.log('')

    if (res.statusCode === 200) {
      console.log('✅ API 测试成功！')
      process.exit(0)
    } else if (res.statusCode === 403) {
      console.log('⚠️ 访问被拒绝（可能不是本地请求）')
      process.exit(1)
    } else if (res.statusCode === 503) {
      console.log('⚠️ 定时任务管理器未初始化')
      process.exit(1)
    } else {
      console.log('❌ API 返回错误')
      process.exit(1)
    }
  })
})

req.on('error', (error) => {
  console.log('❌ 请求失败:', error.message)
  console.log('\n💡 提示:')
  console.log('- 确保服务器正在运行（npm start）')
  console.log('- 检查端口是否正确（13579）')
  console.log('- 检查防火墙设置')
  process.exit(1)
})

// 发送空请求体
req.write('{}')
req.end()
