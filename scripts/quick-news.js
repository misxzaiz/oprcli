const https = require('https');

async function getHNTopStories() {
  try {
    // 获取热门故事 ID
    const ids = await new Promise((resolve, reject) => {
      https.get('https://hacker-news.firebaseio.com/v0/topstories.json', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });

    // 获取前 5 个故事详情
    const stories = await Promise.all(
      ids.slice(0, 5).map(id =>
        new Promise((resolve, reject) => {
          https.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              try {
                resolve(JSON.parse(data));
              } catch (e) {
                reject(e);
              }
            });
          }).on('error', reject);
        })
      )
    );

    return stories;
  } catch (error) {
    console.error('获取失败:', error.message);
    return [];
  }
}

async function main() {
  console.log('📡 正在获取 Hacker News 热门资讯...\n');

  const stories = await getHNTopStories();

  if (stories.length === 0) {
    console.log('❌ 未能获取到资讯，请检查网络连接');
    return;
  }

  console.log('📰 **Hacker News 热门资讯**');
  console.log(`⏰ ${new Date().toLocaleString('zh-CN')}\n`);

  stories.forEach((story, index) => {
    console.log(`${index + 1}. **${story.title}**`);
    if (story.url) {
      console.log(`   🔗 ${story.url}`);
    } else {
      console.log(`   🔗 https://news.ycombinator.com/item?id=${story.id}`);
    }
    console.log(`   👍 ${story.score} 分 | 💬 ${story.descendants || 0} 评论`);
    console.log(`   🕐 ${new Date(story.time * 1000).toLocaleString('zh-CN')}`);
    console.log('');
  });

  console.log('---');
  console.log('🤖 **其他推荐平台**：');
  console.log('• GitHub Trending: https://github.com/trending');
  console.log('• OpenAI Blog: https://openai.com/blog');
  console.log('• Product Hunt: https://producthunt.com');
  console.log('• 知乎热榜: https://www.zhihu.com/hot');
  console.log('• 掘金: https://juejin.cn');
}

main().catch(console.error);
