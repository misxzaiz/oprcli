/**
 * 资讯收集器 - IFlow 智能分析版
 *
 * 使用 IFlow AI 引擎收集、分析、总结多平台资讯
 * 每天凌晨 4:30 执行，推送详细分析报告到钉钉
 *
 * @version 3.0.0
 * @created 2026-03-05
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { sendDingTalkNotification } = require('../scripts/notify');

// 配置文件路径
const CACHE_DIR = path.join(__dirname, '../.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'news-analyzed.json');
const IFlowConnector = require('../connectors/iflow-connector');

/**
 * 🔥 优化：异步加载缓存，不阻塞事件循环
 */
async function loadCache() {
  try {
    await fs.promises.access(CACHE_FILE);
    const content = await fs.promises.readFile(CACHE_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    // 文件不存在或其他错误，返回默认值
    return { items: [], lastUpdate: null };
  }
}

/**
 * 🔥 优化：异步保存缓存，不阻塞事件循环
 */
async function saveCache(cache) {
  try {
    await fs.promises.mkdir(CACHE_DIR, { recursive: true });
    cache.lastUpdate = new Date().toISOString();
    await fs.promises.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (error) {
    console.error('保存缓存失败:', error.message);
  }
}

/**
 * HTTPS GET 请求
 */
async function fetchJSON(url) {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    return response.data;
  } catch (error) {
    console.error(`获取失败: ${url} - ${error.message}`);
    return null;
  }
}

/**
 * 获取 Hacker News 热门故事
 */
async function getHackerNews(limit = 10) {
  try {
    console.log('📡 获取 Hacker News...');

    const storyIds = await fetchJSON('https://hacker-news.firebaseio.com/v0/topstories.json');
    if (!storyIds) return [];

    const stories = await Promise.all(
      storyIds.slice(0, limit).map(id =>
        fetchJSON(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
      )
    );

    return stories.filter(Boolean).map(story => ({
      id: `hn-${story.id}`,
      platform: 'Hacker News',
      category: 'tech',
      title: story.title,
      url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
      score: story.score,
      comments: story.descendants,
      time: new Date(story.time * 1000).toLocaleString('zh-CN'),
      timestamp: story.time
    }));
  } catch (error) {
    console.error('Hacker News 获取失败:', error.message);
    return [];
  }
}

/**
 * 使用 IFlow AI 分析资讯内容
 */
async function analyzeItemWithAI(item, connector) {
  try {
    console.log(`🤖 分析: ${item.title.substring(0, 30)}...`);

    const prompt = `请分析以下科技资讯，提供简洁的中文摘要和要点：

**标题**: ${item.title}
**来源**: ${item.platform}
**链接**: ${item.url}
**评分**: ${item.score || 'N/A'}
**评论数**: ${item.comments || 'N/A'}

请提供：
1. **核心摘要**（1-2句话，不超过50字）
2. **关键要点**（3-5个要点，每个不超过20字）
3. **推荐指数**（⭐1-5星，基于评分和话题热度）

格式要求：
- 简洁明了
- 突出重点
- 适合快速阅读

直接开始分析，不要有开场白。`;

    // 创建 IFlow 会话
    const result = await new Promise((resolve, reject) => {
      connector.startSession(prompt, {
        onEvent: (event) => {
          if (event.type === 'assistant' && event.message) {
            const content = event.message.content
              .filter(block => block.type === 'text')
              .map(block => block.text)
              .join('');

            resolve(content);
          }
        },
        onError: reject,
        onComplete: () => resolve(null)
      });
    });

    // 等待分析完成（最多30秒）
    await new Promise(resolve => setTimeout(resolve, 30000));

    if (result) {
      console.log(`✅ 分析完成: ${item.title.substring(0, 20)}...`);
      return {
        ...item,
        analysis: result
      };
    }

    // 如果 AI 分析失败，返回简单摘要
    return {
      ...item,
      analysis: `**核心摘要**: ${item.title}\n\n**关键要点**:\n- 评分: ${item.score || 'N/A'}⭐\n- 评论: ${item.comments || 'N/A'}条\n- 来源: ${item.platform}\n\n**推荐指数**: ⭐⭐⭐`
    };

  } catch (error) {
    console.error(`分析失败: ${error.message}`);
    return {
      ...item,
      analysis: null
    };
  }
}

/**
 * 批量分析资讯（限制并发数）
 */
async function analyzeItems(items, connector, maxConcurrent = 3) {
  const results = [];

  for (let i = 0; i < items.length; i += maxConcurrent) {
    const batch = items.slice(i, i + maxConcurrent);
    const analyzedBatch = await Promise.all(
      batch.map(item => analyzeItemWithAI(item, connector))
    );
    results.push(...analyzedBatch);

    // 批次间暂停，避免过载
    if (i + maxConcurrent < items.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  return results;
}

/**
 * 收集所有平台资讯
 */
async function collectAllNews() {
  console.log('🚀 开始收集多平台资讯...\n');

  const allItems = [];

  // 1. Hacker News 热门（5条，用于深度分析）
  const hnItems = await getHackerNews(5);
  allItems.push(...hnItems);
  console.log(`✅ Hacker News: ${hnItems.length} 条`);

  console.log(`\n📊 总计收集: ${allItems.length} 条待分析资讯`);

  return allItems;
}

/**
 * 过滤新内容
 */
function filterNewItems(items, cache) {
  const sentIds = new Set(cache.items.map(item => item.id));
  return items.filter(item => !sentIds.has(item.id));
}

/**
 * 格式化为 Markdown（增强版，包含 AI 分析）
 */
function formatMarkdownWithAnalysis(items) {
  if (!items || items.length === 0) {
    return null;
  }

  let markdown = `# 📰 今日科技热点分析\n\n`;
  markdown += `**⏰ 分析时间**: ${new Date().toLocaleString('zh-CN')}\n`;
  markdown += `**📊 资讯数量**: ${items.length} 条\n`;
  markdown += `**🤖 分析引擎**: IFlow AI\n\n`;

  markdown += `---\n\n`;

  // 逐条展示资讯（包含 AI 分析）
  items.forEach((item, index) => {
    markdown += `## ${index + 1}. ${item.title}\n\n`;

    if (item.url && !item.url.includes('news.ycombinator.com')) {
      markdown += `🔗 **链接**: [${item.url}](${item.url})\n\n`;
    } else if (item.url) {
      markdown += `🔗 **链接**: ${item.url}\n\n`;
    }

    markdown += `📊 **数据**: `;
    if (item.score) markdown += `👍 ${item.score}分 `;
    if (item.comments) markdown += `💬 ${item.comments}条 `;
    markdown += `\n`;

    markdown += `🕐 **时间**: ${item.time}\n`;
    markdown += `📱 **来源**: ${item.platform}\n\n`;

    // AI 分析结果
    if (item.analysis) {
      markdown += `### 🤖 AI 智能分析\n\n`;
      markdown += `${item.analysis}\n\n`;
    }

    markdown += `---\n\n`;
  });

  // 推荐阅读
  const topItems = items.filter(i => i.score).sort((a, b) => b.score - a.score).slice(0, 3);
  if (topItems.length > 0) {
    markdown += `## 💡 今日推荐\n\n`;
    topItems.forEach((item, index) => {
      markdown += `${index + 1}. **${item.title}** (${item.score}⭐)\n`;
    });
    markdown += `\n`;
  }

  markdown += `---\n\n`;
  markdown += `**📚 数据来源**: Hacker News\n`;
  markdown += `**🤖 分析工具**: IFlow AI\n`;
  markdown += `**💾 缓存策略**: 自动去重，保留最近分析\n`;

  return markdown;
}

/**
 * 主函数
 */
async function main() {
  let iflowConnector = null;

  try {
    console.log('🌟 资讯收集器 v3.0 启动（智能分析版）\n');
    console.log('='.repeat(60));

    // 初始化 IFlow 连接器
    console.log('🔧 初始化 IFlow AI 引擎...');
    iflowConnector = new IFlowConnector({
      workDir: 'D:/space/oprcli',
      iflowPath: 'iflow'
    });

    await iflowConnector.connect();
    console.log('✅ IFlow AI 引擎已就绪\n');

    // 加载缓存
    const cache = loadCache();
    console.log(`💾 缓存: ${cache.items.length} 条历史记录\n`);

    // 收集资讯
    const allItems = await collectAllNews();

    // 过滤新内容
    const newItems = filterNewItems(allItems, cache);
    console.log(`\n🆕 新内容: ${newItems.length} 条`);

    if (newItems.length === 0) {
      console.log('\n✅ 没有新内容，无需分析');
      return;
    }

    // 使用 AI 分析每条资讯
    console.log('\n🤖 开始 AI 智能分析...\n');
    const analyzedItems = await analyzeItems(newItems, iflowConnector);
    console.log(`\n✅ 分析完成: ${analyzedItems.length} 条`);

    // 格式化消息（包含 AI 分析）
    const markdown = formatMarkdownWithAnalysis(analyzedItems);

    if (!markdown) {
      console.log('\n⚠️  消息格式化失败');
      return;
    }

    // 发送到钉钉
    console.log('\n📤 发送到钉钉...');
    const result = await sendDingTalkNotification(markdown, {
      type: 'markdown',
      title: '📰 今日科技热点分析'
    });

    if (result.success) {
      console.log('✅ 钉钉通知发送成功');

      // 更新缓存
      cache.items.unshift(...analyzedItems);
      // 只保留最近 100 条
      cache.items = cache.items.slice(0, 100);
      saveCache(cache);

      console.log(`💾 缓存已更新，当前缓存 ${cache.items.length} 条`);
    } else {
      console.error('❌ 钉钉通知发送失败:', result.error);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ 任务完成！\n');

  } catch (error) {
    console.error('\n❌ 执行失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // 清理 IFlow 连接
    if (iflowConnector) {
      console.log('🔧 清理 IFlow 连接...');
      // IFlow 连接器会自动清理
    }
  }
}

// 运行
if (require.main === module) {
  main().catch(error => {
    console.error('❌ 发生错误:', error.message);
    process.exit(1);
  });
}

module.exports = { main, analyzeItems, formatMarkdownWithAnalysis };
