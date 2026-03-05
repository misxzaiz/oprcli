# 📰 资讯收集器 - 快速开始

> 3 分钟设置，自动获取全球科技资讯并推送到钉钉！

---

## ⚡ 60 秒快速设置

### 步骤 1：配置钉钉机器人（30 秒）

1. 打开钉钉群 → 点击右上角 ⚙️
2. 选择"智能群助手" → "添加机器人"
3. 选择"自定义" → 点击"添加"
4. 机器人名称：`资讯收集器`
5. 安全设置：选择"自定义关键词"，输入 `科技资讯`
6. 点击"完成"，**复制 Webhook 地址**

### 步骤 2：配置系统（30 秒）

```bash
# 1. 设置环境变量
export DINGTALK_WEBHOOK=你的webhook地址

# 2. 测试运行
npm run news:collect
```

**完成！** 🎉 你会立即收到一条测试消息。

---

## 🚀 立即体验

### 方式 1：手动运行一次

```bash
npm run news:collect
```

### 方式 2：设置自动推送（每2小时）

```bash
# 编辑 .env 文件
echo "DINGTALK_WEBHOOK=你的webhook地址" >> .env

# 添加到定时任务（使用 OPRCLI 任务系统）
# 或者手动添加 cron 任务
```

---

## 📊 你将收到的内容

### 示例消息

```
📰 科技资讯速递
⏰ 2026/3/5 22:50:30

🔥 科技热点
1. Nvidia PersonaPlex 7B on Apple Silicon
   👍 217 分 | 2026/3/5 14:30:00

💻 开源项目
1. 🔥 GitHub Trending
   请访问查看今日热门项目

🤖 AI 动态
1. 🤖 OpenAI Blog
   OpenAI 官方博客 - AI 前沿动态
```

---

## ⚙️ 自定义配置

### 修改推送频率

编辑 `config/news-config.json`：

```json
{
  "schedule": {
    "cron": "0 */2 * * *"  // 每2小时
  }
}
```

常用频率：
- `0 */4 * * *` - 每4小时
- `0 9,18 * * *` - 每天 9:00 和 18:00
- `0 */6 * * *` - 每6小时

### 修改获取数量

```json
{
  "sources": {
    "hackerNews": {
      "limit": 5  // 获取前 5 条热门
    }
  }
}
```

### 关键词过滤

```json
{
  "filter": {
    "keywords": ["AI", "Python", "前端"],
    "excludeKeywords": ["广告", "招聘"]
  }
}
```

---

## 🎯 推荐配置

### 配置 A：轻度用户（3-5 条/天）

```json
{
  "sources": {
    "hackerNews": { "limit": 3 },
    "github": { "limit": 1 },
    "openai": { "limit": 1 }
  },
  "schedule": {
    "cron": "0 9,18 * * *"  // 每天 9:00 和 18:00
  }
}
```

### 配置 B：重度用户（10-15 条/天）

```json
{
  "sources": {
    "hackerNews": { "limit": 8 },
    "github": { "limit": 5 },
    "openai": { "limit": 2 }
  },
  "schedule": {
    "cron": "0 */2 * * *"  // 每2小时
  }
}
```

---

## 🔧 常用命令

```bash
# 立即运行一次
npm run news:collect

# 测试运行（不发送钉钉）
npm run news:test

# 查看缓存
cat .cache/news-items.json

# 清除缓存重新开始
rm .cache/news-items.json && npm run news:collect

# 查看日志
tail -f logs/news-collector.log
```

---

## 📚 更多文档

- 📖 [完整使用说明](./news-collector-usage.md)
- 📊 [资讯平台分析报告](./information-sources-analysis.md)
- ⚡ [快速参考指南](./information-sources-quickref.md)

---

## ❓ 常见问题

### Q: 为什么没有收到消息？

**A**: 检查以下几点：
1. Webhook 地址是否正确配置
2. 钉钉机器人是否被禁用
3. 是否设置了关键词（需要在消息中包含该关键词）
4. 查看日志：`cat logs/news-collector.log`

### Q: 可以推送到多个群吗？

**A**: 目前版本只支持单个群组。可以运行多个实例，每个实例配置不同的 Webhook。

### Q: 如何添加更多数据源？

**A**: 编辑 `scripts/news-collector.js`，参考现有代码添加新的数据获取函数。

---

## 🎉 开始使用

现在就运行第一条命令：

```bash
npm run news:collect
```

**祝使用愉快！** 🚀

---

**需要帮助？** 查看 [完整使用说明](./news-collector-usage.md)
