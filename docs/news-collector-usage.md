# 资讯收集器使用说明

> 📅 创建时间：2026-03-05
> 🎯 功能：自动收集科技资讯并推送到钉钉

---

## 📖 功能简介

这是一个自动化的资讯收集系统，可以从多个平台获取最新资讯，并通过钉钉机器人推送到你的群组。

### ✨ 核心功能

- ✅ 自动获取 Hacker News 热门科技资讯
- ✅ 获取 GitHub Trending 热门项目
- ✅ 获取 OpenAI Blog AI 动态
- ✅ 智能过滤已发送内容
- ✅ 支持定时任务
- ✅ 推送到钉钉群组

---

## 🚀 快速开始

### 第一步：配置钉钉机器人

1. **创建钉钉群机器人**
   - 打开钉钉群设置
   - 选择"智能群助手" → "添加机器人"
   - 选择"自定义"机器人
   - 安全设置选择"加签"或"自定义关键词"
   - 获取 Webhook 地址

2. **配置 Webhook**
   ```bash
   # 方式 1：环境变量
   export DINGTALK_WEBHOOK=你的webhook地址
   export DINGTALK_SECRET=你的加签密钥

   # 方式 2：修改配置文件
   vim config/news-config.json
   ```

### 第二步：运行收集器

```bash
# 手动运行
node scripts/news-collector.js

# 或使用 npm script（如果已配置）
npm run news:collect
```

### 第三步：设置定时任务

```bash
# 使用 OPRCLI 定时任务系统
tasks add news-collector "node scripts/news-collector.js" --cron "0 */2 * * *"

# 或使用系统 cron
crontab -e

# 添加以下行（每2小时执行一次）
0 */2 * * * cd /path/to/oprcli && node scripts/news-collector.js >> logs/news-collector.log 2>&1
```

---

## ⚙️ 配置说明

### 配置文件：`config/news-config.json`

```json
{
  "dingtalk": {
    "webhook": "",           // 钉钉 Webhook 地址（必填）
    "secret": "",            // 加签密钥（可选）
    "enabled": true          // 是否启用钉钉推送
  },
  "sources": {
    "hackerNews": {
      "enabled": true,       // 是否启用 Hacker News
      "limit": 5,            // 获取数量
      "description": "Hacker News 热门科技资讯"
    },
    "github": {
      "enabled": true,       // 是否启用 GitHub Trending
      "limit": 3,            // 获取数量
      "description": "GitHub Trending 热门项目"
    },
    "openai": {
      "enabled": true,       // 是否启用 OpenAI Blog
      "limit": 2,            // 获取数量
      "description": "OpenAI Blog AI 动态"
    }
  },
  "schedule": {
    "enabled": true,
    "cron": "0 */2 * * *",   // Cron 表达式（每2小时）
    "description": "每2小时执行一次"
  },
  "filter": {
    "keywords": [],          // 关键词过滤（包含这些词的内容）
    "excludeKeywords": [],   // 排除关键词（不包含这些词的内容）
    "minScore": 10           // 最低评分（仅 Hacker News）
  }
}
```

### Cron 表达式说明

```
* * * * * *
| | | | | |
| | | | | +-- 星期几 (0-7, 1-7, 周日可为 0 或 7)
| | | | +---- 月份 (1-12)
| | | +------ 日期 (1-31)
| | +-------- 小时 (0-23)
| +---------- 分钟 (0-59)
+------------ 秒 (0-59, 可选)

常用示例：
0 */2 * * *    每2小时
0 9,18 * * *   每天 9:00 和 18:00
0 */6 * * *    每6小时
0 8 * * 1-5    周一到周五每天 8:00
```

---

## 📊 消息格式示例

### 钉钉消息预览

```markdown
📰 **科技资讯速递**
⏰ 2026/3/5 22:50:30

🔥 **科技热点**
1. [Nvidia PersonaPlex 7B on Apple Silicon](https://blog.ivan.digital/...)
   👍 217 分 | 2026/3/5 14:30:00
2. [Google Workspace CLI](https://github.com/googleworkspace/cli)
   👍 714 分 | 2026/3/5 9:15:00
3. [The L in "LLM" Stands for Lying](https://acko.net/blog/...)
   👍 394 分 | 2026/3/5 12:20:00

💻 **开源项目**
1. [🔥 GitHub Trending](https://github.com/trending)
   请访问查看今日热门项目

🤖 **AI 动态**
1. [🤖 OpenAI Blog](https://openai.com/blog)
   OpenAI 官方博客 - AI 前沿动态

📊 数据来源: Hacker News, GitHub, OpenAI
```

---

## 🔧 高级功能

### 1. 关键词过滤

只接收特定关键词的资讯：

```json
{
  "filter": {
    "keywords": ["AI", "机器学习", "Python"],
    "excludeKeywords": ["广告", "招聘"]
  }
}
```

### 2. 自定义数据源

编辑 `scripts/news-collector.js`，添加新的数据源：

```javascript
async function getCustomSource() {
  // 实现你的数据获取逻辑
  return [
    {
      id: 'custom-1',
      title: '自定义资讯',
      url: 'https://example.com',
      source: 'Custom',
      category: 'tech'
    }
  ];
}
```

### 3. 消息模板自定义

修改 `formatDingTalkMessage` 函数来自定义消息格式。

---

## 🐛 故障排除

### 问题 1：无法获取 Hacker News

**可能原因**：网络连接问题或防火墙限制

**解决方案**：
```bash
# 测试 API 连接
curl https://hacker-news.firebaseio.com/v0/topstories.json

# 如果失败，检查网络或使用代理
export HTTP_PROXY=http://proxy.example.com:8080
export HTTPS_PROXY=http://proxy.example.com:8080
```

### 问题 2：钉钉发送失败

**可能原因**：Webhook 配置错误或机器人被禁用

**解决方案**：
1. 检查 Webhook 地址是否正确
2. 确认机器人未被禁用
3. 检查安全设置（关键词、加签）
4. 查看钉钉群设置

### 问题 3：收到重复消息

**可能原因**：缓存文件损坏或权限问题

**解决方案**：
```bash
# 清除缓存
rm -f .cache/news-items.json

# 重新运行
node scripts/news-collector.js
```

---

## 📈 性能优化

### 1. 减少请求频率

```json
{
  "schedule": {
    "cron": "0 */4 * * *"  // 改为每4小时
  }
}
```

### 2. 限制获取数量

```json
{
  "sources": {
    "hackerNews": {
      "limit": 3  // 减少到 3 条
    }
  }
}
```

### 3. 禁用不需要的数据源

```json
{
  "sources": {
    "github": {
      "enabled": false  // 禁用 GitHub
    }
  }
}
```

---

## 🔐 安全建议

1. **保护 Webhook 地址**
   ```bash
   # 不要将 Webhook 提交到 Git
   echo "config/news-config.json" >> .gitignore
   ```

2. **使用环境变量**
   ```bash
   # 推荐使用环境变量存储敏感信息
   export DINGTALK_WEBHOOK=你的webhook
   export DINGTALK_SECRET=你的密钥
   ```

3. **设置访问权限**
   ```bash
   # 限制配置文件权限
   chmod 600 config/news-config.json
   ```

---

## 📚 扩展阅读

### 相关文档

- [Hacker News API](https://github.com/HackerNews/API)
- [钉钉机器人开发文档](https://open.dingtalk.com/document/robots/custom-robot-access)
- [资讯平台分析报告](./information-sources-analysis.md)

### 参考资源

- [Node.js https 模块](https://nodejs.org/api/https.html)
- [Cron 表达式生成器](https://crontab.guru/)
- [Markdown 语法](https://www.markdownguide.org/)

---

## 💡 使用技巧

### 1. 最佳实践

- ✅ 设置合理的获取频率（建议 2-4 小时）
- ✅ 限制每日获取数量（避免群消息过多）
- ✅ 使用关键词过滤（提高内容相关性）
- ✅ 定期检查日志（及时发现问题）

### 2. 推荐配置

**轻度用户**（每日 3-5 条）：
```json
{
  "sources": {
    "hackerNews": { "limit": 3 },
    "github": { "limit": 1 },
    "openai": { "limit": 1 }
  },
  "schedule": {
    "cron": "0 */4 * * *"
  }
}
```

**重度用户**（每日 10-15 条）：
```json
{
  "sources": {
    "hackerNews": { "limit": 8 },
    "github": { "limit": 5 },
    "openai": { "limit": 2 }
  },
  "schedule": {
    "cron": "0 */2 * * *"
  }
}
```

### 3. 快速命令

```bash
# 立即运行一次
node scripts/news-collector.js

# 查看最近缓存
cat .cache/news-items.json

# 清除缓存重新开始
rm .cache/news-items.json && node scripts/news-collector.js

# 查看日志
tail -f logs/news-collector.log
```

---

## 🎯 下一步

### 可能的改进

- [ ] 添加更多数据源（Reddit、TechCrunch 等）
- [ ] 支持多个钉钉群组推送
- [ ] 添加 Web 管理界面
- [ ] 支持图片和附件
- [ ] 添加统计和分析功能
- [ ] 支持自然语言处理（NLP）分类

### 贡献指南

欢迎提交 Issue 和 Pull Request！

---

## 📞 获取帮助

遇到问题？

1. 查看本文档的"故障排除"部分
2. 检查日志文件 `logs/news-collector.log`
3. 提交 Issue 到项目仓库
4. 联系技术支持

---

**版本**：v1.0.0
**最后更新**：2026-03-05
**维护者**：OPRCLI Team

🎉 享受自动化资讯推送的便利！
