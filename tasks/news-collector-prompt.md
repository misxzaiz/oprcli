# 资讯收集任务提示词

## 任务概述

使用 IFlow + MCP Browser 收集全球多平台科技资讯，整理成 Markdown 格式推送到钉钉。

## 执行时间

- **Cron 表达式**: `30 4 * * *`
- **执行时间**: 每天凌晨 4:30
- **默认状态**: 关闭（需手动启用）

## 数据源配置

### 核心平台（优先级：⭐⭐⭐⭐⭐）

1. **Hacker News**
   - URL: https://news.ycombinator.com
   - API: https://hacker-news.firebaseio.com/v0/topstories.json
   - 获取数量: 10 条热门
   - 分类: 科技热点
   - 内容标题、链接、评分、评论数、时间

2. **GitHub Trending**
   - URL: https://github.com/trending
   - 获取数量: 引导链接
   - 分类: 开源项目
   - 内容: 今日热门项目引导

3. **Reddit Technology**
   - URL: https://www.reddit.com/r/technology/hot.json
   - API: https://www.reddit.com/r/technology/hot.json?limit=5
   - 获取数量: 5 条
   - 分类: 科技讨论
   - 内容: 标题、链接、评分、评论数

4. **Reddit Programming**
   - URL: https://www.reddit.com/r/programming/hot.json
   - API: https://www.reddit.com/r/programming/hot.json?limit=5
   - 获取数量: 5 条
   - 分类: 编程技术
   - 内容: 标题、链接、评分、评论数

### 次要平台（优先级：⭐⭐⭐⭐）

5. **Product Hunt**
   - URL: https://producthunt.com
   - 获取数量: 引导链接
   - 分类: 产品发现
   - 内容: 今日新产品引导

6. **OpenAI Blog**
   - URL: https://openai.com/blog
   - 获取数量: 引导链接
   - 分类: AI 前沿
   - 内容: AI 研究动态引导

### 备选平台（优先级：⭐⭐⭐）

7. **Hacker News Front Page**
   - API: https://hacker-news.firebaseio.com/v0/topstories.json
   - 获取数量: 30 条（用作备选）

8. **Indie Hackers**
   - URL: https://www.indiehackers.com
   - 分类: 创业讨论

9. **Dev.to**
   - URL: https://dev.to
   - 分类: 开发者社区

10. **Stack Overflow Trending**
    - URL: https://stackoverflow.com
    - 分类: 技术问答

## 收集要求

### 内容筛选标准

**优先收集**：
- AI/机器学习相关
- 编程语言新特性
- 开源项目发布
- 技术架构讨论
- 科技行业动态
- 创业/投资资讯

**过滤掉**：
- 纯政治内容
- 广告/招聘
- 低质量讨论
- 重复内容

### 质量要求

- 评分 > 50 分（Hacker News）
- 评论数 > 10 条
- 发布时间 < 48 小时
- 标题清晰明确
- 链接可访问

## Markdown 格式规范

### 整体结构

```markdown
# 📰 全球科技资讯速递

**⏰ 时间**: 2026-03-05 04:30:00
**📊 本期资讯**: 25 条

---

## 🔥 科技热点

1. **标题**
   🔗 链接
   👍 评分 | 💬 评论数
   🕐 时间
   📱 来源平台

---

## 💻 开源项目

1. **标题**
   🔗 链接
   📝 描述
   🕐 时间

---

## 🤖 AI 前沿

1. **标题**
   🔗 链接
   📝 描述
   🕐 时间

---

## 🚀 产品发现

1. **标题**
   🔗 链接
   📝 描述
   🕐 时间

---

**📚 数据来源**: Hacker News, GitHub, Reddit, Product Hunt, OpenAI

**💡 推荐阅读**:
1. 标题 (评分⭐)
2. 标题 (评分⭐)
3. 标题 (评分⭐)
```

### 格式细节

- 使用二级标题（##）分隔分类
- 每条资讯序号从 1 开始
- 链接使用 Markdown 格式: `[文本](URL)`
- 时间格式: `2026-03-05 14:30:00`
- 评分显示: `👍 217 分`
- 评论显示: `💬 67 条`
- 平台显示: `📱 Hacker News`

## 钉钉推送要求

### 消息类型

- **类型**: markdown
- **标题**: 📰 全球科技资讯速递
- **关键词**: 必须包含 "科技资讯"（钉钉机器人关键词设置）

### 推送时间

- 每天凌晨 4:30 自动推送
- 如有重要资讯可立即推送

### 推送格式

```javascript
{
  msgtype: 'markdown',
  markdown: {
    title: '📰 全球科技资讯速递',
    text: '...'  // Markdown 内容
  }
}
```

## 缓存机制

### 缓存目的

- 避免重复推送相同内容
- 追踪已发送的资讯 ID

### 缓存策略

- 使用资讯 ID 去重
- 保留最近 200 条记录
- 每次执行后更新缓存

### 缓存文件

- 路径: `.cache/news-items-v2.json`
- 格式: JSON
- 字段: `id`, `title`, `url`, `timestamp`

## 错误处理

### 网络错误

- 单个平台失败不影响其他平台
- 重试 3 次，间隔 2 秒
- 超时时间: 10 秒

### 数据格式错误

- 跳过格式错误的数据
- 记录错误日志
- 继续处理其他数据

### 钉钉推送失败

- 保存 Markdown 到本地文件
- 记录错误日志
- 不影响下次执行

## 扩展功能

### 未来可添加

1. **国内平台**
   - 知乎热榜
   - 掘金首页
   - 36氪快讯
   - 量子位 AI

2. **更多国外平台**
   - TechCrunch
   - The Verge
   - Ars Technica
   - Wired

3. **AI 摘要**
   - 使用 LLM 生成摘要
   - 提取关键信息
   - 智能分类

4. **个性化推荐**
   - 用户关键词过滤
   - 历史偏好学习
   - 自定义分类

## 技术栈

### 核心
- Node.js
- Axios (HTTP 请求)
- 文件系统 (缓存)

### 可选增强
- MCP Browser (网页抓取)
- Puppeteer (动态页面)
- Cheerio (HTML 解析)
- LLM API (内容摘要)

## 配置文件

### 环境变量

```bash
# 钉钉配置
NOTIFICATION_DINGTALK_WEBHOOK=https://oapi.dingtalk.com/robot/send?access_token=xxx
NOTIFICATION_DINGTALK_SECRET=SECxxxxxxxxx

# 代理配置（可选）
HTTP_PROXY=http://proxy.example.com:8080
HTTPS_PROXY=http://proxy.example.com:8080

# 任务配置
NEWS_COLLECTOR_ENABLED=true
NEWS_COLLECTOR_CRON="30 4 * * *"
```

### JSON 配置

```json
{
  "enabled": false,
  "schedule": "30 4 * * *",
  "sources": {
    "hackerNews": { "enabled": true, "limit": 10 },
    "github": { "enabled": true, "limit": 1 },
    "reddit": { "enabled": true, "limit": 5 },
    "productHunt": { "enabled": true, "limit": 1 },
    "openai": { "enabled": true, "limit": 1 }
  },
  "filters": {
    "minScore": 50,
    "minComments": 10,
    "maxAge": 48
  }
}
```

## 监控和日志

### 日志级别

- `info`: 正常执行信息
- `warn`: 非致命错误
- `error`: 严重错误

### 日志格式

```
[2026-03-05 04:30:00] 🚀 资讯收集器启动
[2026-03-05 04:30:01] 📡 获取 Hacker News...
[2026-03-05 04:30:02] ✅ Hacker News: 10 条
[2026-03-05 04:30:03] 📤 发送到钉钉...
[2026-03-05 04:30:05] ✅ 钉钉通知发送成功
[2026-03-05 04:30:05] ✅ 任务完成！
```

### 性能监控

- 总执行时间
- 各平台耗时
- 成功/失败统计
- 缓存命中率

## 测试

### 手动测试

```bash
# 运行一次
node tasks/news-collector-iflow.js

# 测试模式（不发送钉钉）
node tasks/news-collector-iflow.js --test

# 查看缓存
cat .cache/news-items-v2.json

# 清除缓存
rm .cache/news-items-v2.json
```

### 自动化测试

- 单元测试: 各平台获取函数
- 集成测试: 完整流程
- 性能测试: 大量数据处理

## 维护

### 定期检查

- 每周检查 API 可用性
- 每月优化过滤规则
- 每季度回顾数据源

### 更新日志

- v2.0.0 (2026-03-05): 初始版本
  - 支持 6 个核心平台
  - 自动去重缓存
  - 钉钉 Markdown 推送

## 常见问题

### Q: 为什么某些平台获取失败？

A: 可能原因：
1. 网络连接问题
2. API 限流
3. 需要代理访问
4. API 格式变更

解决方法：
- 检查网络连接
- 配置代理
- 查看错误日志
- 更新 API 地址

### Q: 如何添加新平台？

A: 步骤：
1. 编写获取函数
2. 实现数据解析
3. 添加到主流程
4. 更新缓存策略
5. 测试验证

### Q: 如何自定义推送时间？

A: 方法：
1. 修改 cron 表达式
2. 使用 node-cron 调度
3. 或使用系统 crontab

---

**版本**: v2.0.0
**维护者**: OPRCLI Team
**更新频率**: 按需更新
