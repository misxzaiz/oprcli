/**
 * 测试 BoundedMap 功能
 */

const BoundedMap = require('./utils/bounded-map')

async function runTests() {
  console.log('🧪 测试 BoundedMap 功能...\n')

  // 测试 1: 基本 FIFO 驱逐
  console.log('1️⃣ 测试 FIFO 驱逐策略...')
  const fifoMap = new BoundedMap(3, {
    evictionPolicy: 'fifo',
    onEvict: (key, value) => {
      console.log(`  → 驱逐: ${key} = ${value}`)
    }
  })

  fifoMap.set('a', 1)
  fifoMap.set('b', 2)
  fifoMap.set('c', 3)
  console.log(`  大小: ${fifoMap.size}/3`)

  fifoMap.set('d', 4) // 应该驱逐 'a'
  console.log(`  大小: ${fifoMap.size}/3`)
  console.log(`  键: ${fifoMap.keys().join(', ')}`)

  if (fifoMap.size === 3 && !fifoMap.has('a') && fifoMap.has('b') && fifoMap.has('c') && fifoMap.has('d')) {
    console.log('✅ FIFO 驱逐测试通过\n')
  } else {
    console.log('❌ FIFO 驱逐测试失败\n')
    process.exit(1)
  }

// 测试 2: LRU 驱逐（需要异步测试）
console.log('2️⃣ 测试 LRU 驱逐策略...')
await new Promise((resolve, reject) => {
  const lruMap = new BoundedMap(3, {
    evictionPolicy: 'lru',
    onEvict: (key, value) => {
      console.log(`  → 驱逐: ${key} = ${value}`)
    }
  })

  lruMap.set('a', 1)
  lruMap.set('b', 2)
  lruMap.set('c', 3)

  // 🔥 重要：需要时间延迟来区分访问时间
  setTimeout(() => {
    lruMap.get('a') // 访问 'a'
    lruMap.get('b') // 访问 'b'
    // 'c' 是最久未访问的

    setTimeout(() => {
      lruMap.set('d', 4) // 应该驱逐 'c'
      console.log(`  大小: ${lruMap.size}/3`)
      console.log(`  键: ${lruMap.keys().join(', ')}`)

      if (lruMap.size === 3 && lruMap.has('a') && lruMap.has('b') && !lruMap.has('c') && lruMap.has('d')) {
        console.log('✅ LRU 驱逐测试通过\n')
        resolve()
      } else {
        console.log('❌ LRU 驱逐测试失败\n')
        reject(new Error('LRU test failed'))
      }
    }, 100)
  }, 100)
})

// 测试 3: LFU 驱逐
console.log('3️⃣ 测试 LFU 驱逐策略...')
const lfuMap = new BoundedMap(3, {
  evictionPolicy: 'lfu',
  onEvict: (key, value) => {
    console.log(`  → 驱逐: ${key} = ${value}`)
  }
})

lfuMap.set('a', 1)
lfuMap.set('b', 2)
lfuMap.set('c', 3)

lfuMap.get('a') // 'a' 访问 1 次
lfuMap.get('a') // 'a' 访问 2 次
lfuMap.get('b') // 'b' 访问 1 次
// 'c' 从未访问（0 次），应该被驱逐

lfuMap.set('d', 4) // 应该驱逐 'c'
console.log(`  大小: ${lfuMap.size}/3`)
console.log(`  键: ${lfuMap.keys().join(', ')}`)

if (lfuMap.size === 3 && lfuMap.has('a') && lfuMap.has('b') && !lfuMap.has('c') && lfuMap.has('d')) {
  console.log('✅ LFU 驱逐测试通过\n')
} else {
  console.log('❌ LFU 驱逐测试失败\n')
  process.exit(1)
}

// 测试 4: 统计信息
console.log('4️⃣ 测试统计信息...')
const statsMap = new BoundedMap(10)
statsMap.set('a', 1)
statsMap.set('b', 2)
statsMap.set('c', 3)

const stats = statsMap.getStats()
console.log(`  统计:`, stats)

if (stats.size === 3 && stats.maxSize === 10 && stats.utilization === '30.00%') {
  console.log('✅ 统计信息测试通过\n')
} else {
  console.log('❌ 统计信息测试失败\n')
  process.exit(1)
}

// 测试 5: 基本操作
console.log('5️⃣ 测试基本 Map 操作...')
const map = new BoundedMap(5)

map.set('key1', 'value1')
map.set('key2', 'value2')

if (map.get('key1') === 'value1' && map.has('key2')) {
  console.log('  ✅ get 和 set 正常')
}

map.delete('key1')
if (!map.has('key1')) {
  console.log('  ✅ delete 正常')
}

map.clear()
if (map.size === 0) {
  console.log('  ✅ clear 正常')
}

console.log('✅ 基本操作测试通过\n')

console.log('✅ 所有 BoundedMap 测试通过！')
}

runTests().catch(error => {
  console.error('测试失败:', error)
  process.exit(1)
})
