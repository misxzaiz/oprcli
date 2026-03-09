#!/usr/bin/env node
/**
 * 抖音热榜推送脚本
 * 获取抖音热搜榜并发送到钉钉
 *
 * @version 1.0.0
 * @created 2026-03-09
 *
 * 使用方法:
 *   node scripts/douyin-hot.js           # 获取并发送
 *   node scripts/douyin-hot.js --test    # 仅测试获取，不发送
 *   node scripts/douyin-hot.js --top 10  # 只发送前10条
 */

const axios = require('axios')
const path = require('path')

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

// 导入通知模块
const { sendDingTalkNotification } = require('./notify')

// 抖音热榜 API（使用公开热榜聚合API）
const DOUYIN_HOT_API = 'https://api.vvhan.com/api/hotlist/douyinHot'

/**
 * 获取抖音热榜
 * @returns {Promise<Array>} 热榜列表
 */
async function fetchDouyinHot() {
  try {
    const response = await axios.get(DOUYIN_HOT_API, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })

    if (response.data && response.data.success && Array.isArray(response.data.data)) {
      return response.data.data
    }

    throw new Error('API 返回数据格式错误')
  } catch (error) {
    throw new Error(`获取抖音热榜失败: ${error.message}`)
  }
}

/**
 * 格式化为钉钉 Markdown 消息
 * @param {Array} hotList - 热榜列表
 * @param {number} topN - 只取前N条
 * @returns {string} Markdown 格式消息
 */
function formatMarkdown(hotList, topN = 20) {
  const now = new Date()
  const timeStr = now.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })

  let content = `## 🔥 抖音热榜\n`
  content += `**更新时间**: ${timeStr}\n\n`
  content += `---\n\n`

  const items = hotList.slice(0, topN)

  items.forEach((item, index) => {
    const rank = index + 1
    const emoji = rank <= 3 ? ['🥇', '🥈', '🥉'][index] : `${rank}.`
    const title = item.title || item.name || '未知标题'
    const hot = item.hot || item.hotValue || ''

    // 热度值格式化
    let hotStr = ''
    if (hot) {
      if (typeof hot === 'number') {
        if (hot >= 100000000) {
          hotStr = `(${(hot / 100000000).toFixed(1)}亿)`
        } else if (hot >= 10000) {
          hotStr = `(${(hot / 10000).toFixed(0)}万)`
        } else {
          hotStr = `(${hot})`
        }
      } else {
        hotStr = `(${hot})`
      }
    }

    content += `${emoji} **${title}** ${hotStr}\n`
  })

  content += `\n---\n`
  content += `_数据来源: 抖音热搜_`

  return content
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2)
  const testMode = args.includes('--test')
  const topIndex = args.findIndex(arg => arg === '--top')
  const topN = topIndex !== -1 && args[topIndex + 1] ? parseInt(args[topIndex + 1], 10) : 20

  console.log('正在获取抖音热榜...')

  try {
    const hotList = await fetchDouyinHot()

    if (!hotList || hotList.length === 0) {
      console.error('❌ 热榜数据为空')
      process.exit(1)
    }

    console.log(`✅ 获取成功，共 ${hotList.length} 条热搜`)

    // 测试模式：只显示数据
    if (testMode) {
      console.log('\n--- 热榜预览 ---')
      hotList.slice(0, 10).forEach((item, i) => {
        console.log(`${i + 1}. ${item.title || item.name}`)
      })
      console.log('\n(测试模式，未发送通知)')
      process.exit(0)
    }

    // 格式化消息
    const markdown = formatMarkdown(hotList, topN)

    // 发送到钉钉
    console.log('正在发送到钉钉...')

    const result = await sendDingTalkNotification(markdown, {
      type: 'markdown',
      title: '抖音热榜'
    })

    if (result.success) {
      console.log('✅ 已发送到钉钉')
      process.exit(0)
    } else {
      console.error('❌ 发送失败:', result.error)
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ 错误:', error.message)
    process.exit(1)
  }
}

// 如果直接运行脚本
if (require.main === module) {
  main()
}

// 导出函数供其他模块使用
module.exports = {
  fetchDouyinHot,
  formatMarkdown
}
