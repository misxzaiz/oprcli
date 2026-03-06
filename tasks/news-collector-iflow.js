/**
 * 资讯收集器 - IFlow 增强版
 *
 * 使用 IFlow + MCP Browser 收集多平台资讯
 * 每天凌晨 4:30 执行，推送到钉钉
 *
 * @version 2.0.0
 * @created 2026-03-05
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { sendDingTalkNotification } = require('../scripts/notify');

// 配置文件路径
const CACHE_DIR = path.join(__dirname, '../.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'news-items-v2.json');

// 翻译缓存
const translationCache = new Map();

/**
 * 简单翻译（基于关键词映射）
 */
function translateToChinese(text) {
  if (!text) return text;
  
  // 如果已缓存，直接返回
  if (translationCache.has(text)) {
    return translationCache.get(text);
  }
  
  // 常见科技词汇映射
  const techTerms = {
    // AI 相关
    'AI': '人工智能',
    'Machine Learning': '机器学习',
    'Deep Learning': '深度学习',
    'Neural Network': '神经网络',
    'GPT': 'GPT',
    'LLM': '大语言模型',
    'OpenAI': 'OpenAI',
    'ChatGPT': 'ChatGPT',
    'Claude': 'Claude',
    'Anthropic': 'Anthropic',
    
    // 编程相关
    'JavaScript': 'JavaScript',
    'Python': 'Python',
    'Rust': 'Rust',
    'Go': 'Go',
    'TypeScript': 'TypeScript',
    'React': 'React',
    'Vue': 'Vue',
    'Node.js': 'Node.js',
    'Docker': 'Docker',
    'Kubernetes': 'Kubernetes',
    'K8s': 'K8s',
    'API': 'API',
    'SDK': 'SDK',
    'CLI': 'CLI',
    'GUI': '图形界面',
    'Database': '数据库',
    'SQL': 'SQL',
    'NoSQL': 'NoSQL',
    
    // 公司/产品
    'Google': '谷歌',
    'Microsoft': '微软',
    'Apple': '苹果',
    'Amazon': '亚马逊',
    'Meta': 'Meta',
    'Facebook': 'Facebook',
    'Tesla': '特斯拉',
    'GitHub': 'GitHub',
    'Linux': 'Linux',
    'Windows': 'Windows',
    'MacOS': 'macOS',
    'Android': 'Android',
    'iOS': 'iOS',
    
    // 通用词汇
    'Release': '发布',
    'Update': '更新',
    'New': '新',
    'Best': '最佳',
    'Top': '顶级',
    'How to': '如何',
    'Why': '为什么',
    'What': '什么是',
    'Guide': '指南',
    'Tutorial': '教程',
    'Introduction': '介绍',
    'Show HN': '展示项目',
    'Ask HN': '提问',
    'Tell HN': '分享',
    
    // 技术概念
    'Framework': '框架',
    'Library': '库',
    'Tool': '工具',
    'Plugin': '插件',
    'Extension': '扩展',
    'Open Source': '开源',
    'Security': '安全',
    'Privacy': '隐私',
    'Performance': '性能',
    'Optimization': '优化',
    'Architecture': '架构',
    'Design': '设计',
    'Pattern': '模式',
    'Algorithm': '算法',
    'Data': '数据',
    'Cloud': '云',
    'Server': '服务器',
    'Client': '客户端',
    'Frontend': '前端',
    'Backend': '后端',
    'Full Stack': '全栈',
    'DevOps': 'DevOps',
    'CI/CD': '持续集成/部署',
    'Testing': '测试',
    'Debug': '调试',
    'Bug': 'Bug',
    'Feature': '功能',
    
    // 时间相关
    '2024': '2024年',
    '2025': '2025年',
    '2026': '2026年',
    'Today': '今天',
    'Yesterday': '昨天',
    'This Week': '本周',
    'This Month': '本月'
  };
  
  let translated = text;
  
  // 按词汇长度降序排序，优先替换长词
  const sortedTerms = Object.entries(techTerms)
    .sort((a, b) => b[0].length - a[0].length);
  
  for (const [en, zh] of sortedTerms) {
    const regex = new RegExp(en, 'gi');
    translated = translated.replace(regex, zh);
  }
  
  // 缓存结果
  translationCache.set(text, translated);
  return translated;
}

/**
 * 生成内容摘要
 */
function generateSummary(item) {
  const summaries = [];
  
  // 基于标题生成摘要
  const title = item.title || '';
  const titleLower = title.toLowerCase();
  
  // AI 相关
  if (titleLower.includes('ai') || titleLower.includes('gpt') || titleLower.includes('llm')) {
    summaries.push('🤖 AI技术动态');
  }
  // 编程语言
  else if (titleLower.includes('javascript') || titleLower.includes('python') || 
           titleLower.includes('rust') || titleLower.includes('golang')) {
    summaries.push('💻 编程语言');
  }
  // 开源项目
  else if (titleLower.includes('github') || titleLower.includes('open source') || 
           titleLower.includes('release')) {
    summaries.push('📦 开源项目');
  }
  // 安全相关
  else if (titleLower.includes('security') || titleLower.includes('privacy') || 
           titleLower.includes('vulnerability')) {
    summaries.push('🔒 安全资讯');
  }
  // 工具
  else if (titleLower.includes('tool') || titleLower.includes('framework') || 
           titleLower.includes('library')) {
    summaries.push('🛠️ 开发工具');
  }
  // 产品
  else if (titleLower.includes('product') || titleLower.includes('launch') || 
           titleLower.includes('startup')) {
    summaries.push('🚀 产品动态');
  }
  // 默认
  else {
    summaries.push('📰 科技资讯');
  }
  
  // 添加评分信息
  if (item.score) {
    if (item.score > 500) {
      summaries.push('🔥 热门');
    } else if (item.score > 200) {
      summaries.push('📈 关注度高');
    }
  }
  
  // 添加评论热度
  if (item.comments && item.comments > 100) {
    summaries.push('💬 讨论热烈');
  }
  
  return summaries.join(' | ');
}

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
 * 获取 GitHub Trending（通过 API）
 */
async function getGithubTrending(limit = 10) {
  try {
    console.log('📡 获取 GitHub Trending...');

    // 使用 GitHub Trending API
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0];

    // 这里返回引导链接，因为 GitHub Trending 需要爬虫
    return [{
      id: `gh-trending-${Date.now()}`,
      platform: 'GitHub',
      category: 'opensource',
      title: '🔥 今日 GitHub Trending',
      url: 'https://github.com/trending',
      description: '点击查看今日最热门的开源项目',
      time: new Date().toLocaleString('zh-CN'),
      timestamp: Math.floor(Date.now() / 1000)
    }];
  } catch (error) {
    console.error('GitHub Trending 获取失败:', error.message);
    return [];
  }
}

/**
 * 获取 Reddit 热门（通过 API）
 */
async function getRedditHot(subreddit = 'technology', limit = 5) {
  try {
    console.log(`📡 获取 Reddit r/${subreddit}...`);

    const posts = await fetchJSON(`https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}`);
    if (!posts?.data?.children) return [];

    return posts.data.children.slice(0, limit).map(post => ({
      id: `reddit-${post.data.id}`,
      platform: 'Reddit',
      category: 'social',
      title: post.data.title,
      url: `https://reddit.com${post.data.permalink}`,
      score: post.data.ups,
      comments: post.data.num_comments,
      time: new Date(post.data.created_utc * 1000).toLocaleString('zh-CN'),
      timestamp: post.data.created_utc
    }));
  } catch (error) {
    console.error(`Reddit r/${subreddit} 获取失败:`, error.message);
    return [];
  }
}

/**
 * 获取 Hacker Front Page
 */
async function getHackerFrontPage(limit = 10) {
  try {
    console.log('📡 获取 Hacker News Front Page...');

    const storyIds = await fetchJSON('https://hacker-news.firebaseio.com/v0/topstories.json');
    if (!storyIds) return [];

    const stories = await Promise.all(
      storyIds.slice(0, 30).map(id =>
        fetchJSON(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
      )
    );

    return stories.filter(Boolean).map(story => ({
      id: `hn-front-${story.id}`,
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
    console.error('Hacker Front Page 获取失败:', error.message);
    return [];
  }
}

/**
 * 获取 Product Hunt（通过引导）
 */
async function getProductHunt() {
  try {
    console.log('📡 获取 Product Hunt...');

    return [{
      id: `ph-${Date.now()}`,
      platform: 'Product Hunt',
      category: 'product',
      title: '🚀 Product Hunt 今日热门',
      url: 'https://producthunt.com',
      description: '点击查看今日最新产品和创业灵感',
      time: new Date().toLocaleString('zh-CN'),
      timestamp: Math.floor(Date.now() / 1000)
    }];
  } catch (error) {
    console.error('Product Hunt 获取失败:', error.message);
    return [];
  }
}

/**
 * 获取 OpenAI Blog（通过引导）
 */
async function getOpenAIBlog() {
  try {
    console.log('📡 获取 OpenAI Blog...');

    return [{
      id: `openai-${Date.now()}`,
      platform: 'OpenAI',
      category: 'ai',
      title: '🤖 OpenAI Blog',
      url: 'https://openai.com/blog',
      description: 'OpenAI 官方博客 - AI 前沿研究发布',
      time: new Date().toLocaleString('zh-CN'),
      timestamp: Math.floor(Date.now() / 1000)
    }];
  } catch (error) {
    console.error('OpenAI Blog 获取失败:', error.message);
    return [];
  }
}

/**
 * 收集所有平台资讯
 */
async function collectAllNews() {
  console.log('🚀 开始收集多平台资讯...\n');

  const allItems = [];

  // 1. Hacker News 热门（10条）
  const hnItems = await getHackerNews(10);
  allItems.push(...hnItems);
  console.log(`✅ Hacker News: ${hnItems.length} 条`);

  // 2. GitHub Trending（引导链接）
  const ghItems = await getGithubTrending(1);
  allItems.push(...ghItems);
  console.log(`✅ GitHub Trending: ${ghItems.length} 条`);

  // 3. Reddit Technology（5条）
  const redditTechItems = await getRedditHot('technology', 5);
  allItems.push(...redditTechItems);
  console.log(`✅ Reddit Technology: ${redditTechItems.length} 条`);

  // 4. Reddit Programming（5条）
  const redditProgItems = await getRedditHot('programming', 5);
  allItems.push(...redditProgItems);
  console.log(`✅ Reddit Programming: ${redditProgItems.length} 条`);

  // 5. Product Hunt（引导链接）
  const phItems = await getProductHunt();
  allItems.push(...phItems);
  console.log(`✅ Product Hunt: ${phItems.length} 条`);

  // 6. OpenAI Blog（引导链接）
  const openaiItems = await getOpenAIBlog();
  allItems.push(...openaiItems);
  console.log(`✅ OpenAI Blog: ${openaiItems.length} 条`);

  console.log(`\n📊 总计收集: ${allItems.length} 条资讯`);

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
 * 格式化为 Markdown
 */
function formatMarkdown(items) {
  if (!items || items.length === 0) {
    return null;
  }

  // 按分类分组
  const grouped = {
    tech: items.filter(i => i.category === 'tech' || i.category === 'social'),
    opensource: items.filter(i => i.category === 'opensource'),
    ai: items.filter(i => i.category === 'ai'),
    product: items.filter(i => i.category === 'product')
  };

  let markdown = `# 📰 全球科技资讯速递\n\n`;
  markdown += `**⏰ 时间**: ${new Date().toLocaleString('zh-CN')}\n\n`;
  markdown += `**📊 本期资讯**: ${items.length} 条\n\n`;

  markdown += `---\n\n`;

  // 科技热点
  if (grouped.tech.length > 0) {
    markdown += `## 🔥 科技热点\n\n`;
    grouped.tech.forEach((item, index) => {
      // 翻译标题
      const titleCN = translateToChinese(item.title);
      const summary = generateSummary(item);
      
      markdown += `${index + 1}. **${titleCN}**\n`;
      markdown += `   📝 *原文*: ${item.title}\n`;
      if (item.url && !item.url.includes('reddit.com')) {
        markdown += `   🔗 [查看详情](${item.url})\n`;
      } else if (item.url) {
        markdown += `   🔗 ${item.url}\n`;
      }
      markdown += `   🏷️ ${summary}\n`;
      if (item.score) markdown += `   👍 ${item.score} 分`;
      if (item.comments) markdown += ` | 💬 ${item.comments} 评论`;
      markdown += `\n   📱 ${item.platform} | 🕐 ${item.time}\n\n`;
    });
  }

  // 开源项目
  if (grouped.opensource.length > 0) {
    markdown += `## 💻 开源项目\n\n`;
    grouped.opensource.forEach((item, index) => {
      const titleCN = translateToChinese(item.title);
      markdown += `${index + 1}. **${titleCN}**\n`;
      if (item.url) markdown += `   🔗 ${item.url}\n`;
      if (item.description) {
        const descCN = translateToChinese(item.description);
        markdown += `   📝 ${descCN}\n`;
      }
      markdown += `   📱 ${item.platform} | 🕐 ${item.time}\n\n`;
    });
  }

  // AI 前沿
  if (grouped.ai.length > 0) {
    markdown += `## 🤖 AI 前沿\n\n`;
    grouped.ai.forEach((item, index) => {
      const titleCN = translateToChinese(item.title);
      markdown += `${index + 1}. **${titleCN}**\n`;
      if (item.url) markdown += `   🔗 ${item.url}\n`;
      if (item.description) {
        const descCN = translateToChinese(item.description);
        markdown += `   📝 ${descCN}\n`;
      }
      markdown += `   📱 ${item.platform} | 🕐 ${item.time}\n\n`;
    });
  }

  // 产品发现
  if (grouped.product.length > 0) {
    markdown += `## 🚀 产品发现\n\n`;
    grouped.product.forEach((item, index) => {
      const titleCN = translateToChinese(item.title);
      markdown += `${index + 1}. **${titleCN}**\n`;
      if (item.url) markdown += `   🔗 ${item.url}\n`;
      if (item.description) {
        const descCN = translateToChinese(item.description);
        markdown += `   📝 ${descCN}\n`;
      }
      markdown += `   📱 ${item.platform} | 🕐 ${item.time}\n\n`;
    });
  }

  markdown += `---\n\n`;
  markdown += `**💡 本期精选**（按热度排序）:\n\n`;
  const topItems = items.filter(i => i.score).sort((a, b) => b.score - a.score).slice(0, 3);
  topItems.forEach((item, index) => {
    const titleCN = translateToChinese(item.title);
    markdown += `${index + 1}. **${titleCN}**\n`;
    markdown += `   ⭐ ${item.score} 分 | 📱 ${item.platform}\n`;
    if (item.url && !item.url.includes('reddit.com')) {
      markdown += `   🔗 [查看详情](${item.url})\n`;
    }
    markdown += `\n`;
  });

  markdown += `---\n\n`;
  markdown += `**📚 数据来源**:\n`;
  markdown += `- Hacker News - 硅谷科技社区热门\n`;
  markdown += `- GitHub Trending - 开源项目趋势\n`;
  markdown += `- Reddit - 技术讨论社区\n`;
  markdown += `- Product Hunt - 新产品发现\n`;
  markdown += `- OpenAI Blog - AI 研究前沿\n\n`;
  markdown += `💡 提示：点击链接查看原文详情`;

  return markdown;
}

/**
 * 主函数
 */
async function main() {
  try {
    console.log('🌟 资讯收集器 v2.0 启动\n');
    console.log('=' .repeat(50));

    // 加载缓存
    const cache = loadCache();
    console.log(`💾 缓存: ${cache.items.length} 条历史记录\n`);

    // 收集所有资讯
    const allItems = await collectAllNews();

    // 过滤新内容
    const newItems = filterNewItems(allItems, cache);
    console.log(`\n🆕 新内容: ${newItems.length} 条`);

    if (newItems.length === 0) {
      console.log('\n✅ 没有新内容，无需发送');
      return;
    }

    // 格式化消息
    const markdown = formatMarkdown(newItems);

    if (!markdown) {
      console.log('\n⚠️  消息格式化失败');
      return;
    }

    // 发送到钉钉
    console.log('\n📤 发送到钉钉...');
    const result = await sendDingTalkNotification(markdown, {
      type: 'markdown',
      title: '📰 全球科技资讯速递'
    });

    if (result.success) {
      console.log('✅ 钉钉通知发送成功');

      // 更新缓存
      cache.items.unshift(...newItems);
      // 只保留最近 200 条
      cache.items = cache.items.slice(0, 200);
      saveCache(cache);

      console.log(`💾 缓存已更新，当前缓存 ${cache.items.length} 条`);
    } else {
      console.error('❌ 钉钉通知发送失败:', result.error);
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ 任务完成！\n');

  } catch (error) {
    console.error('\n❌ 执行失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行
if (require.main === module) {
  main().catch(error => {
    console.error('❌ 发生错误:', error.message);
    process.exit(1);
  });
}

module.exports = { main, collectAllNews, formatMarkdown };
