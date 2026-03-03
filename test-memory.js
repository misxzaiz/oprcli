/**
 * 记忆系统测试脚本
 *
 * 测试功能：
 * 1. CRUD 操作
 * 2. 搜索功能
 * 3. 总结功能
 * 4. Load 命令
 */

const MemorySystem = require('./utils/memory-system')

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function testMemorySystem() {
  console.log('========================================')
  console.log('  永久记忆系统测试')
  console.log('========================================\n')

  // 创建记忆系统实例（使用临时目录）
  const testDataDir = require('path').join(__dirname, '../data/memory-test')
  const memory = new MemorySystem(testDataDir)

  try {
    // ==================== 测试 1: CRUD 操作 ====================
    console.log('📝 测试 1: CRUD 操作')
    console.log('----------------------------------------')

    // 创建
    const mem1 = memory.createMemory('第一条记忆：用户询问了关于钉钉机器人的问题', ['dingtalk', 'robot'])
    console.log(`✅ 创建记忆: ${mem1.id}`)

    const mem2 = memory.createMemory('第二条记忆：用户查看了系统状态', ['status', 'system'])
    console.log(`✅ 创建记忆: ${mem2.id}`)

    const mem3 = memory.createMemory('第三条记忆：用户切换到了Claude模型', ['claude', 'model'])
    console.log(`✅ 创建记忆: ${mem3.id}`)

    await sleep(100) // 确保时间戳不同

    const mem4 = memory.createMemory('第四条记忆：用户使用了load命令', ['load', 'memory'])
    console.log(`✅ 创建记忆: ${mem4.id}`)

    // 读取
    const retrieved = memory.getMemory(mem1.id)
    console.log(`✅ 读取记忆: ${retrieved.content.substring(0, 20)}...`)

    // 更新
    memory.updateMemory(mem1.id, null, ['dingtalk', 'robot', 'updated'])
    const updated = memory.getMemory(mem1.id)
    console.log(`✅ 更新标签: ${updated.tags.join(', ')}`)

    // 删除
    memory.deleteMemory(mem2.id)
    console.log(`✅ 软删除记忆: ${mem2.id}`)

    console.log(`\n原始记忆总数: ${memory.rawMemories.filter(m => !m.deleted).length}\n`)

    // ==================== 测试 2: 搜索功能 ====================
    console.log('🔍 测试 2: 搜索功能')
    console.log('----------------------------------------')

    const results1 = memory.searchMemories('钉钉')
    console.log(`✅ 搜索"钉钉": 找到 ${results1.length} 条`)

    const results2 = memory.searchMemories('claude')
    console.log(`✅ 搜索"claude": 找到 ${results2.length} 条`)

    const results3 = memory.searchMemories('', { tags: ['model'] })
    console.log(`✅ 按标签搜索[model]: 找到 ${results3.length} 条`)

    const results4 = memory.searchMemories('', { limit: 2 })
    console.log(`✅ 限制数量2: 返回 ${results4.length} 条\n`)

    // ==================== 测试 3: 统计信息 ====================
    console.log('📊 测试 3: 统计信息')
    console.log('----------------------------------------')

    const stats = memory.getStats()
    console.log(`原始记忆:`)
    console.log(`  总计: ${stats.raw_memories.total}`)
    console.log(`  未总结: ${stats.raw_memories.unsummarized}`)
    console.log(`  已总结: ${stats.raw_memories.summarized}`)
    console.log(`\n总结层级:`)
    for (let level = 0; level < 5; level++) {
      const count = stats.summaries.by_level[level] || 0
      const threshold = memory.summaryThresholds[level]
      console.log(`  Level ${level} (${threshold.name}): ${count} 条`)
    }
    console.log()

    // ==================== 测试 4: 总结功能 ====================
    console.log('🔄 测试 4: 总结功能')
    console.log('----------------------------------------')

    // 创建更多测试数据
    console.log('创建测试数据...')
    for (let i = 0; i < 10; i++) {
      await sleep(50) // 确保时间戳不同
      memory.createMemory(`测试记忆 ${i + 5}: 这是一些测试内容`, ['test', `batch-${Math.floor(i / 3)}`])
    }
    console.log(`✅ 创建了10条测试记忆`)

    const unsummarized = memory.getUnsummarizedMemories()
    console.log(`未总结记忆: ${unsummarized.length} 条`)

    // 执行 load 命令
    console.log('\n执行 load 命令...')
    const loadResult = await memory.handleLoad()

    console.log(`\n✅ Load 完成:`)
    console.log(`  原始记忆: ${loadResult.raw_memories_count} 条`)
    console.log(`  未总结: ${loadResult.unsummarized_count} 条`)
    console.log(`  新总结: ${loadResult.new_summaries.length} 条`)
    console.log(`  合并总结: ${loadResult.merged_summaries.length} 条`)

    console.log(`\n总结层级分布:`)
    for (let level = 0; level < 5; level++) {
      const summaries = loadResult.current_state[level] || []
      const threshold = memory.summaryThresholds[level]
      if (summaries.length > 0) {
        console.log(`  Level ${level} (${threshold.name}): ${summaries.length} 条`)
        // 显示第一个总结的摘要
        if (summaries[0]) {
          const summary = summaries[0]
          console.log(`    示例: ${summary.content.substring(0, 60)}...`)
        }
      }
    }

    console.log()

    // ==================== 测试 5: 二次 Load ====================
    console.log('🔄 测试 5: 二次 Load（合并总结）')
    console.log('----------------------------------------')

    // 再创建一些记忆
    await sleep(100)
    for (let i = 0; i < 5; i++) {
      await sleep(50)
      memory.createMemory(`新测试记忆 ${i + 1}: 更多测试内容`, ['new-test'])
    }
    console.log(`✅ 创建了5条新测试记忆`)

    console.log('\n执行第二次 load 命令...')
    const loadResult2 = await memory.handleLoad()

    console.log(`\n✅ 第二次 Load 完成:`)
    console.log(`  新总结: ${loadResult2.new_summaries.length} 条`)
    console.log(`  合并总结: ${loadResult2.merged_summaries.length} 条`)

    // ==================== 最终统计 ====================
    console.log('\n📊 最终统计')
    console.log('========================================')

    const finalStats = memory.getStats()
    console.log(`原始记忆:`)
    console.log(`  总计: ${finalStats.raw_memories.total}`)
    console.log(`  未总结: ${finalStats.raw_memories.unsummarized}`)
    console.log(`  已总结: ${finalStats.raw_memories.summarized}`)
    console.log(`\n总结层级:`)
    for (let level = 0; level < 5; level++) {
      const count = finalStats.summaries.by_level[level] || 0
      const threshold = memory.summaryThresholds[level]
      console.log(`  Level ${level} (${threshold.name}): ${count} 条`)
    }
    console.log(`\n存储:`)
    console.log(`  原始记忆: ${(finalStats.storage.raw_size / 1024).toFixed(2)} KB`)
    console.log(`  总结: ${(finalStats.storage.summaries_size / 1024).toFixed(2)} KB`)

    console.log('\n✅ 所有测试完成！')

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message)
    console.error(error.stack)
  }
}

// 运行测试
testMemorySystem()
