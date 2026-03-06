#!/usr/bin/env node

/**
 * 资讯收集器 - 从多个平台收集最新资讯并推送到钉钉
 *
 * 功能：
 * 1. 从 Hacker News 获取热门科技资讯
 * 2. 从 GitHub Trending 获取热门项目
 * 3. 从 OpenAI Blog 获取 AI 动态
 * 4. 整理成格式化消息
 * 5. 推送到钉钉
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 配置文件路径
const CONFIG_PATH = path.join(__dirname, '../config/news-config.json');
const CACHE_PATH = path.join(__dirname, '../.cache/news-items.json');

/**
 * 加载配置
 */
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (error) {
    console.error('加载配置失败:', error.message);
  }
  return {
    dingtalk: {
      webhook: process.env.DINGTALK_WEBHOOK || '',
      secret: process.env.DINGTALK_SECRET || ''
    },
    sources: {
      hackerNews: {
        enabled: true,
        limit: 5
      },
      github: {
        enabled: true,
        limit: 5
      },
      openai: {
        enabled: true,
        limit: 3
      }
    }
  };
}

/**
 * 加载缓存
 */
function loadCache() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    }
  } catch (error) {
    console.error('加载缓存失败:', error.message);
  }
  return { items: [] };
}

/**
 * 保存缓存
 */
function saveCache(cache) {
  try {
    const dir = path.dirname(CACHE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  } catch (error) {
    console.error('保存缓存失败:', error.message);
  }
}

/**
 * HTTPS GET 请求
 */
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

/**
 * 获取 Hacker News 热门故事
 */
async function getHackerNews(limit = 5) {
  try {
    console.log('📡 获取 Hacker News 热门故事...');

    // 获取热门故事 ID 列表
    const storyIds = await httpsGet(
      'https://hacker-news.firebaseio.com/v0/topstories.json'
    );

    // 获取前 N 个故事的详情
    const stories = await Promise.all(
      storyIds.slice(0, limit).map(id =>
        httpsGet(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
      )
    );

    return stories.map(story => ({
      id: story.id,
      title: story.title,
      url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
      score: story.score,
      time: new Date(story.time * 1000).toLocaleString('zh-CN'),
      source: 'Hacker News',
      category: 'tech'
    }));
  } catch (error) {
    console.error('获取 Hacker News 失败:', error.message);
    return [];
  }
}

/**
 * 获取 GitHub Trending（简化版）
 */
async function getGithubTrending(limit = 5) {
  try {
    console.log('📡 获取 GitHub Trending...');

    // 由于 GitHub Trending 没有 API，这里返回模拟数据
    // 实际使用时可以使用爬虫或第三方 API
    return [
      {
        id: 'gh-1',
        title: '🔥 GitHub Trending',
        url: 'https://github.com/trending',
        description: '请访问查看今日热门项目',
        source: 'GitHub',
        category: 'code'
      }
    ];
  } catch (error) {
    console.error('获取 GitHub Trending 失败:', error.message);
    return [];
  }
}

/**
 * 获取 OpenAI Blog（简化版）
 */
async function getOpenAIBlog(limit = 3) {
  try {
    console.log('📡 获取 OpenAI Blog...');

    // 返回指向 OpenAI Blog 的链接
    return [
      {
        id: 'openai-1',
        title: '🤖 OpenAI Blog',
        url: 'https://openai.com/blog',
        description: 'OpenAI 官方博客 - AI 前沿动态',
        source: 'OpenAI',
        category: 'ai'
      }
    ];
  } catch (error) {
    console.error('获取 OpenAI Blog 失败:', error.message);
    return [];
  }
}

/**
 * 过滤已发送的内容
 */
function filterNewItems(items, cache) {
  const sentIds = new Set(cache.items.map(item => item.id));
  return items.filter(item => !sentIds.has(item.id));
}

/**
 * 格式化钉钉消息
 */
function formatDingTalkMessage(items) {
  if (!items || items.length === 0) {
    return null;
  }

  // 按分类分组
  const grouped = {
    tech: items.filter(i => i.category === 'tech'),
    code: items.filter(i => i.category === 'code'),
    ai: items.filter(i => i.category === 'ai'),
    other: items.filter(i => !i.category || i.category === 'other')
  };

  let text = `📰 **科技资讯速递**\n`;
  text += `⏰ ${new Date().toLocaleString('zh-CN')}\n\n`;

  if (grouped.tech.length > 0) {
    text += `🔥 **科技热点**\n`;
    grouped.tech.forEach((item, index) => {
      text += `${index + 1}. [${item.title}](${item.url})\n`;
      if (item.score) text += `   👍 ${item.score} 分 | ${item.time}\n`;
    });
    text += `\n`;
  }

  if (grouped.code.length > 0) {
    text += `💻 **开源项目**\n`;
    grouped.code.forEach((item, index) => {
      text += `${index + 1}. [${item.title}](${item.url})\n`;
      if (item.description) text += `   ${item.description}\n`;
    });
    text += `\n`;
  }

  if (grouped.ai.length > 0) {
    text += `🤖 **AI 动态**\n`;
    grouped.ai.forEach((item, index) => {
      text += `${index + 1}. [${item.title}](${item.url})\n`;
      if (item.description) text += `   ${item.description}\n`;
    });
    text += `\n`;
  }

  text += `\n📊 数据来源: Hacker News, GitHub, OpenAI`;

  return {
    msgtype: 'markdown',
    markdown: {
      title: '科技资讯速递',
      text: text
    }
  };
}

/**
 * 发送到钉钉
 */
async function sendToDingTalk(message, config) {
  if (!config.dingtalk.webhook) {
    console.log('⚠️  未配置钉钉 Webhook，跳过发送');
    console.log('📝 消息内容：');
    console.log(message.markdown.text);
    return;
  }

  try {
    console.log('📤 发送到钉钉...');

    const data = JSON.stringify(message);

    const options = {
      hostname: 'oapi.dingtalk.com',
      port: 443,
      path: '/robot/send?access_token=' + config.dingtalk.webhook,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          const result = JSON.parse(body);
          if (result.errcode === 0) {
            console.log('✅ 发送成功');
            resolve(result);
          } else {
            console.error('❌ 发送失败:', result.errmsg);
            reject(new Error(result.errmsg));
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  } catch (error) {
    console.error('发送钉钉消息失败:', error.message);
    throw error;
  }
}

/**
 * 主函数
 */
async function main() {
  try {
    console.log('🚀 资讯收集器启动\n');

    // 加载配置
    const config = loadConfig();
    console.log('⚙️  配置加载成功');

    // 加载缓存
    const cache = loadCache();
    console.log('💾 缓存加载成功\n');

    // 收集资讯
    const allItems = [];

    if (config.sources.hackerNews.enabled) {
      const hnItems = await getHackerNews(config.sources.hackerNews.limit);
      allItems.push(...hnItems);
    }

    if (config.sources.github.enabled) {
      const ghItems = await getGithubTrending(config.sources.github.limit);
      allItems.push(...ghItems);
    }

    if (config.sources.openai.enabled) {
      const aiItems = await getOpenAIBlog(config.sources.openai.limit);
      allItems.push(...aiItems);
    }

    console.log(`\n📊 共收集到 ${allItems.length} 条资讯`);

    // 过滤新内容
    const newItems = filterNewItems(allItems, cache);
    console.log(`🆕 新内容 ${newItems.length} 条`);

    if (newItems.length === 0) {
      console.log('✅ 没有新内容，无需发送');
      return;
    }

    // 格式化消息
    const message = formatDingTalkMessage(newItems);

    if (!message) {
      console.log('⚠️  消息格式化失败');
      return;
    }

    // 发送到钉钉
    await sendToDingTalk(message, config);

    // 更新缓存
    cache.items.unshift(...newItems);
    // 只保留最近 100 条
    cache.items = cache.items.slice(0, 100);
    saveCache(cache);

    console.log('\n✅ 任务完成！');
    console.log(`💾 已更新缓存，当前缓存 ${cache.items.length} 条\n`);

  } catch (error) {
    console.error('\n❌ 执行失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行
if (require.main === module) {
  main();
}

module.exports = { main, getHackerNews, formatDingTalkMessage };
