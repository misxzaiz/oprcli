# 资讯收集定时任务 - 完整使用指南

> 📅 创建时间：2026-03-05
> 🎯 功能：使用 IFlow 引擎自动收集全球科技资讯并推送到钉钉

---

## 📋 系统概述

### 核心功能

✅ **自动化资讯收集**
- 每天凌晨 4:30 自动执行
- 收集 6+ 个主流平台资讯
- 智能去重，避免重复推送

✅ **多平台覆盖**
- Hacker News（10条热门）
- GitHub Trending（引导链接）
- Reddit Technology（5条）
- Reddit Programming（5条）
- Product Hunt（引导链接）
- OpenAI Blog（引导链接）

✅ **钉钉推送**
- Markdown 格式美化
- 按分类整理展示
- 包含评分和评论数
- 推荐高赞内容

---

## 🚀 快速开始

### 第一步：配置钉钉机器人

1. **创建钉钉群机器人**
   ```
   群设置 → 智能群助手 → 添加机器人 → 自定义
   ```

2. **设置安全关键词**
   ```
   必须包含：科技资讯
   ```

3. **获取 Webhook 地址**
   ```
   复制 Webhook URL
   ```

### 第二步：设置环境变量

```bash
# 方式 1：修改 .env 文件
echo "NOTIFICATION_DINGTALK_WEBHOOK=你的webhook地址" >> .env
echo "NOTIFICATION_DINGTALK_SECRET=你的密钥(可选)" >> .env

# 方式 2：使用 set 命令（Windows）
set NOTIFICATION_DINGTALK_WEBHOOK=你的webhook地址

# 方式 3：使用 export（Linux/Mac）
export NOTIFICATION_DINGTALK_WEBHOOK=你的webhook地址
```

### 第三步：启用定时任务

**方式 A：使用钉钉命令**
```
tasks enable daily-news-collector
tasks reload
```

**方式 B：手动修改配置**
```bash
# 编辑任务配置
vim scheduler/tasks.json

# 修改两个 enabled 字段为 true
{
  "enabled": true,  // ← 改为 true
  "tasks": [{
    "enabled": true,  // ← 改为 true
    ...
  }]
}

# 重新加载
curl -X POST http://localhost:13579/api/tasks/reload
```

### 第四步：测试执行

```bash
# 方式 A：立即执行一次
tasks run daily-news-collector

# 方式 B：直接运行脚本
node tasks/news-collector-iflow.js

# 方式 C：查看任务状态
tasks status
```

---

## 📊 数据源详解

### 1️⃣ Hacker News（10条）

**API**: https://hacker-news.firebaseio.com/v0/topstories.json

**内容**：
- 标题
- 链接
- 评分（score）
- 评论数（descendants）
- 发布时间

**分类**: 科技热点

---

### 2️⃣ GitHub Trending（引导链接）

**URL**: https://github.com/trending

**内容**：
- 热门项目引导链接
- 今日趋势提示

**分类**: 开源项目

---

### 3️⃣ Reddit Technology（5条）

**API**: https://www.reddit.com/r/technology/hot.json?limit=5

**内容**：
- 标题
- 链接
- 评分（ups）
- 评论数（num_comments）

**分类**: 科技讨论

---

### 4️⃣ Reddit Programming（5条）

**API**: https://www.reddit.com/r/programming/hot.json?limit=5

**内容**：
- 标题
- 链接
- 评分（ups）
- 评论数（num_comments）

**分类**: 编程技术

---

### 5️⃣ Product Hunt（引导链接）

**URL**: https://producthunt.com

**内容**：
- 今日新产品引导
- 创业灵感提示

**分类**: 产品发现

---

### 6️⃣ OpenAI Blog（引导链接）

**URL**: https://openai.com/blog

**内容**：
- AI 研究动态引导
- 前沿技术提示

**分类**: AI 前沿

---

## 📝 消息格式示例

### 钉钉消息预览

```markdown
# 📰 全球科技资讯速递

**⏰ 时间**: 2026-03-05 04:30:00
**📊 本期资讯**: 25 条

---

## 🔥 科技热点

1. **Nvidia PersonaPlex 7B on Apple Silicon**
   🔗 https://blog.ivan.digital/nvidia-personaplex-7b
   👍 217 分 | 💬 67 条
   🕐 2026-03-05 14:30:00
   📱 Hacker News

2. **Google Workspace CLI**
   🔗 https://github.com/googleworkspace/cli
   👍 714 分 | 💬 240 条
   🕐 2026-03-05 09:15:00
   📱 Hacker News

---

## 💻 开源项目

1. **🔥 GitHub Trending**
   🔗 https://github.com/trending
   📝 点击查看今日热门开源项目
   🕐 2026-03-05 04:30:00

---

## 🤖 AI 前沿

1. **🤖 OpenAI Blog**
   🔗 https://openai.com/blog
   📝 OpenAI 官方博客 - AI 前沿研究发布
   🕐 2026-03-05 04:30:00

---

## 🚀 产品发现

1. **🚀 Product Hunt 今日热门**
   🔗 https://producthunt.com
   📝 点击查看今日最新产品和创业灵感
   🕐 2026-03-05 04:30:00

---

**📚 数据来源**: Hacker News, GitHub, Reddit, Product Hunt, OpenAI

**💡 推荐阅读**:
1. Nvidia PersonaPlex 7B on Apple Silicon (217⭐)
2. Google Workspace CLI (714⭐)
3. The L in "LLM" Stands for Lying (394⭐)
```

---

## ⚙️ 任务管理

### 查看任务状态

```bash
# 查看所有任务
tasks

# 查看详细状态
tasks status

# 查看特定任务
tasks show daily-news-collector
```

### 启用/禁用任务

```bash
# 启用任务
tasks enable daily-news-collector
tasks reload

# 禁用任务
tasks disable daily-news-collector
tasks reload
```

### 手动执行

```bash
# 立即执行一次
tasks run daily-news-collector

# 或直接运行脚本
node tasks/news-collector-iflow.js
```

### 修改执行时间

```bash
# 编辑配置文件
vim scheduler/tasks.json

# 修改 schedule 字段
# 示例：
# "30 4 * * *"   - 每天 4:30
# "0 9 * * *"    - 每天 9:00
# "0 */6 * * *"  - 每6小时
# "0 9,18 * * *" - 每天 9:00 和 18:00

# 重新加载
curl -X POST http://localhost:13579/api/tasks/reload
```

---

## 🔧 高级配置

### 添加自定义平台

编辑 `tasks/news-collector-iflow.js`，添加新的获取函数：

```javascript
async function getCustomPlatform() {
  // 实现你的数据获取逻辑
  return [{
    id: 'custom-1',
    platform: '自定义平台',
    category: 'tech',
    title: '资讯标题',
    url: 'https://example.com',
    score: 100,
    time: new Date().toLocaleString('zh-CN')
  }];
}
```

然后在 `collectAllNews()` 函数中调用：

```javascript
const customItems = await getCustomPlatform();
allItems.push(...customItems);
```

### 修改消息格式

编辑 `formatMarkdown()` 函数来自定义消息格式。

### 调整缓存策略

```javascript
// 修改缓存保留数量
cache.items = cache.items.slice(0, 500);  // 改为 500 条

// 修改缓存文件路径
const CACHE_FILE = path.join(CACHE_DIR, 'custom-cache.json');
```

---

## 📈 监控和日志

### 查看执行日志

```bash
# 查看服务器日志
tail -f logs/oprcli.log

# 过滤资讯收集相关日志
grep "news-collector" logs/oprcli.log

# 查看最近执行记录
cat logs/news-collector.log
```

### 性能监控

脚本会输出详细的执行信息：

```
🌟 资讯收集器 v2.0 启动
==================================================
💾 缓存: 150 条历史记录

📡 获取 Hacker News...
✅ Hacker News: 10 条
📡 获取 GitHub Trending...
✅ GitHub Trending: 1 条
📡 获取 Reddit r/technology...
✅ Reddit Technology: 5 条
📡 获取 Reddit r/programming...
✅ Reddit Programming: 5 条
📡 获取 Product Hunt...
✅ Product Hunt: 1 条
📡 获取 OpenAI Blog...
✅ OpenAI Blog: 1 条

📊 总计收集: 23 条资讯
🆕 新内容: 18 条

📤 发送到钉钉...
✅ 钉钉通知发送成功
💾 缓存已更新，当前缓存 168 条

==================================================
✅ 任务完成！
```

---

## ❓ 常见问题

### Q1: 为什么没有收到消息？

**检查清单**：
1. ✅ 钉钉 Webhook 是否配置正确？
2. ✅ 任务是否已启用？
3. ✅ 配置是否已重新加载？
4. ✅ 关键词"科技资讯"是否设置？
5. ✅ 网络连接是否正常？

**解决方法**：
```bash
# 检查任务状态
tasks status

# 手动执行测试
tasks run daily-news-collector

# 查看错误日志
cat logs/news-collector.log
```

---

### Q2: 如何修改推送时间？

**方法**：
```bash
# 编辑配置
vim scheduler/tasks.json

# 修改 schedule 字段
"schedule": "0 9 * * *"  # 改为早上 9 点

# 重新加载
curl -X POST http://localhost:13579/api/tasks/reload
```

---

### Q3: 如何添加更多平台？

**步骤**：
1. 在 `news-collector-iflow.js` 中添加获取函数
2. 在 `collectAllNews()` 中调用
3. 测试验证
4. 重新加载任务

---

### Q4: 能否推送到多个群？

**可以**，方法：
1. 为每个群创建一个任务
2. 使用不同的 Webhook
3. 或修改脚本支持多个 Webhook

---

### Q5: 如何过滤不需要的内容？

**方法**：
```javascript
// 在获取函数中添加过滤
return items
  .filter(item => item.score > 50)  // 评分过滤
  .filter(item => !item.title.includes('广告'));  // 关键词过滤
```

---

## 📚 文件结构

```
D:/space/oprcli/
├── tasks/
│   ├── news-collector-iflow.js       # 主脚本
│   └── news-collector-prompt.md      # 提示词文档
├── scheduler/
│   └── tasks.json                    # 定时任务配置
├── scripts/
│   └── notify.js                     # 钉钉通知脚本
├── .cache/
│   └── news-items-v2.json            # 缓存文件
└── docs/
    ├── news-collector-iflow-guide.md # 本文档
    ├── news-collector-usage.md       # 使用说明
    └── information-sources-analysis.md # 平台分析
```

---

## 🎯 最佳实践

### 1. 推送时间选择

**推荐时间**：
- ✅ 凌晨 4:30（用户起床前）
- ✅ 早上 8:00（上班路上）
- ✅ 晚上 9:00（睡前阅读）

**避免时间**：
- ❌ 工作时间（可能打扰）
- ❌ 深夜（影响休息）

---

### 2. 内容数量控制

**轻度用户**（5-10 条）：
- Hacker News: 5 条
- Reddit: 各 2 条
- 其他: 引导链接

**重度用户**（20-30 条）：
- Hacker News: 15 条
- Reddit: 各 5 条
- 其他: 引导链接

---

### 3. 质量过滤

**建议过滤条件**：
- 评分 > 50 分
- 评论数 > 10 条
- 发布时间 < 48 小时
- 非政治/广告内容

---

## 🚀 下一步优化

### 短期（1-2周）

- [ ] 添加国内平台（知乎、掘金）
- [ ] 实现 AI 摘要功能
- [ ] 添加图片支持
- [ ] 优化消息格式

### 中期（1-2月）

- [ ] Web 管理界面
- [ ] 用户偏好学习
- [ ] 多群组推送
- [ ] 统计分析

### 长期（3-6月）

- [ ] 自然语言处理
- [ ] 智能推荐算法
- [ ] 多语言支持
- [ ] 移动端 App

---

## 📞 技术支持

### 遇到问题？

1. **查看文档**
   ```bash
   cat docs/news-collector-iflow-guide.md
   cat docs/news-collector-usage.md
   cat tasks/news-collector-prompt.md
   ```

2. **查看日志**
   ```bash
   cat logs/news-collector.log
   ```

3. **检查配置**
   ```bash
   cat scheduler/tasks.json
   cat .cache/news-items-v2.json
   ```

4. **手动测试**
   ```bash
   node tasks/news-collector-iflow.js
   ```

---

## 🎊 总结

✅ **已完成**：
- 定时任务配置创建
- 资讯收集脚本实现
- 钉钉推送集成
- 完整文档编写

✅ **可立即使用**：
```bash
# 1. 配置钉钉 Webhook
export NOTIFICATION_DINGTALK_WEBHOOK=你的webhook

# 2. 启用任务
tasks enable daily-news-collector
tasks reload

# 3. 测试执行
tasks run daily-news-collector
```

✅ **默认状态**：
- 任务已创建但默认关闭
- 需要手动启用
- 每天 4:30 自动执行

---

**版本**: v2.0.0
**最后更新**: 2026-03-05
**维护者**: OPRCLI Team

🎉 享受自动化资讯推送的便利！
