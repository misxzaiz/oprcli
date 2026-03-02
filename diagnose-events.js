/**
 * 事件流诊断脚本
 * 用于查看 Claude 和 IFlow 的实际事件流
 */

require('dotenv').config()
const config = require('./utils/config')

console.log('========================================')
console.log('  AI 模型事件流诊断')
console.log('========================================\n')

// 模拟事件流
const sampleEvents = {
  claude: [
    {
      type: 'system',
      session_id: 'sess-123',
      model: 'claude-sonnet-4-6'
    },
    {
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: '你好！我是 Claude，由 Anthropic 开发的 AI 助手。' }
        ]
      }
    },
    {
      type: 'result',
      result: '你好！我是 Claude，由 Anthropic 开发的 AI 助手。'
    },
    {
      type: 'session_end'
    }
  ],
  iflow: [
    {
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: '正在分析您的项目...' }
        ]
      }
    },
    {
      type: 'result',  // ← IFlow 可能也有这个！
      result: '分析完成。项目包含 3 个文件。'
    },
    {
      type: 'session_end'
    }
  ]
}

function analyzeEventFlow(model, events) {
  console.log(`\n📊 ${model.toUpperCase()} 模型事件流分析`)
  console.log('━'.repeat(60))

  let eventNum = 0
  const contentMap = new Map()

  for (const event of events) {
    eventNum++
    console.log(`\n事件 #${eventNum}: ${event.type}`)

    // 提取内容
    let content = ''
    let contentHash = ''

    if (event.type === 'assistant') {
      content = event.message?.content
        ?.filter(c => c.type === 'text')
        ?.map(c => c.text)
        ?.join('') || ''
      contentHash = hashContent(content)
      console.log(`  内容长度: ${content.length} 字符`)
      console.log(`  内容预览: ${content.substring(0, 50)}...`)
      console.log(`  内容哈希: ${contentHash}`)

      contentMap.set('assistant', contentHash)
    }
    else if (event.type === 'result') {
      content = event.result || ''
      contentHash = hashContent(content)
      console.log(`  内容长度: ${content.length} 字符`)
      console.log(`  内容预览: ${content.substring(0, 50)}...`)
      console.log(`  内容哈希: ${contentHash}`)

      contentMap.set('result', contentHash)
    }
    else if (event.type === 'session_end') {
      console.log(`  会话结束`)
    }
    else {
      console.log(`  数据: ${JSON.stringify(event).substring(0, 100)}...`)
    }
  }

  // 检测重复
  console.log('\n🔍 重复检测:')
  const assistantHash = contentMap.get('assistant')
  const resultHash = contentMap.get('result')

  if (assistantHash && resultHash) {
    if (assistantHash === resultHash) {
      console.log('  ⚠️  检测到重复：assistant 和 result 内容相同')
      console.log(`  • assistant 哈希: ${assistantHash}`)
      console.log(`  • result 哈希: ${resultHash}`)
    } else {
      console.log('  ✅ 无重复：assistant 和 result 内容不同')
      console.log(`  • assistant 哈希: ${assistantHash}`)
      console.log(`  • result 哈希: ${resultHash}`)
    }
  } else if (assistantHash && !resultHash) {
    console.log('  ℹ️  只有 assistant，没有 result')
  } else if (!assistantHash && resultHash) {
    console.log('  ℹ️  只有 result，没有 assistant')
  }

  console.log(`\n📋 事件统计:`)
  console.log(`  • 总事件数: ${eventNum}`)
  console.log(`  • 有文本内容的事件: ${contentMap.size}`)
}

function hashContent(content) {
  // 简单哈希，用于检测内容是否相同
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return hash.toString(16)
}

// 分析两个模型
analyzeEventFlow('Claude', sampleEvents.claude)
analyzeEventFlow('IFlow', sampleEvents.iflow)

console.log('\n' + '='.repeat(60))
console.log('💡 结论：')
console.log('  如果 IFlow 也有 result 事件，那么它也会有重复问题')
console.log('  需要在事件处理层添加去重逻辑')
console.log('='.repeat(60) + '\n')

// 检查当前配置
console.log('📋 当前配置:')
console.log(`  默认模型: ${config.provider}`)
console.log(`  流式输出: ${config.streaming.enabled}`)
console.log(`  显示完成: ${config.streaming.showCompletionSummary}`)
console.log('')

// 提供诊断建议
console.log('🔧 诊断建议：')
console.log('  1. 添加详细日志，打印每个事件的内容')
console.log('  2. 运行实际测试，查看日志')
console.log('  3. 对比 assistant 和 result 的实际内容')
console.log('  4. 实施去重方案')
console.log('')
