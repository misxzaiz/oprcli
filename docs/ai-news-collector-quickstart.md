# 🤖 智能资讯收集器 - 3分钟上手

> ⚡ 使用 AI 深度分析科技资讯，直接推送核心内容

---

## ⚡ 60秒启用

```bash
# 1. 配置钉钉 Webhook
export NOTIFICATION_DINGTALK_WEBHOOK=你的webhook地址

# 2. 修改任务配置（使用智能分析版）
vim scheduler/tasks.json
# 修改 message 中的脚本路径为：
# node D:/space/oprcli/tasks/news-collector-with-analysis.js

# 3. 重新加载配置
curl -X POST http://localhost:13579/api/tasks/reload

# 4. 立即测试
tasks run daily-news-collector
```

---

## 🎯 核心功能

### 1. 自动收集
✅ Hacker News 热门资讯（5条精选）
✅ 提取标题、链接、评分、评论数

### 2. AI 智能分析
✅ **核心摘要**（1-2句话，不超过50字）
✅ **关键要点**（3-5个要点）
✅ **推荐指数**（⭐1-5星）

### 3. 钉钉推送
✅ Markdown 格式美化
✅ 包含 AI 分析结果
✅ 今日推荐 TOP 3

---

## 📝 输出示例

### 你会收到这样的消息：

```markdown
# 📰 今日科技热点分析

**⏰ 分析时间**: 2026-03-05 04:30:00
**📊 资讯数量**: 5 条
**🤖 分析引擎**: IFlow AI

---

## 1. Nvidia PersonaPlex 7B on Apple Silicon

🔗 **链接**: https://blog.ivan.digital/nvidia-personaplex-7b
📊 **数据**: 👍 217分 💬 67条
🕐 **时间**: 2026-03-05 14:30:00
📱 **来源**: Hacker News

### 🤖 AI 智能分析

**核心摘要**:
Nvidia 发布 PersonaPlex 7B 模型，可在 Apple Silicon 上运行，实现全双工语音到语音对话。

**关键要点**:
- 支持 Apple Silicon 芯片
- 全双工语音交互
- 开源可商用
- 性能优化
- Swift 语言实现

**推荐指数**: ⭐⭐⭐⭐⭐

---

## 2. Google Workspace CLI

🔗 **链接**: https://github.com/googleworkspace/cli
📊 **数据**: 👍 714分 💬 240条
🕐 **时间**: 2026-03-05 09:15:00
📱 **来源**: Hacker News

### 🤖 AI 智能分析

**核心摘要**:
Google 发布官方命令行工具，用于管理 Google Workspace 服务。

**关键要点**:
- 官方支持
- 命令行操作
- 支持所有 Workspace 服务
- 开源项目
- Python 实现

**推荐指数**: ⭐⭐⭐⭐

---

## 💡 今日推荐

1. Nvidia PersonaPlex 7B (217⭐)
2. Google Workspace CLI (714⭐)
3. The L in "LLM" Stands for Lying (394⭐)
```

---

## ⚙️ 配置说明

### 默认配置

| 参数 | 值 | 说明 |
|------|-----|------|
| **任务ID** | daily-news-collector | 任务标识 |
| **执行时间** | 30 4 * * * | 每天 4:30 |
| **数据源** | Hacker News | 1个平台 |
| **收集数量** | 5条 | 精选高质量 |
| **AI 分析** | 是 | 每条深度分析 |
| **执行时间** | 5-10分钟 | 包括 AI 分析 |

### 修改执行时间

```bash
# 编辑配置
vim scheduler/tasks.json

# 修改 schedule 字段
"schedule": "0 8 * * *"  # 改为早上 8 点

# 常用时间：
# "30 4 * * *"   - 凌晨 4:30（默认）
# "0 8 * * *"    - 早上 8:00
# "0 21 * * *"   - 晚上 21:00
# "0 12 * * *"   - 中午 12:00

# 重新加载
curl -X POST http://localhost:13579/api/tasks/reload
```

### 修改收集数量

```bash
# 编辑脚本
vim tasks/news-collector-with-analysis.js

# 找到这一行：
const hnItems = await getHackerNews(5);

# 修改数字（推荐 3-10 条）：
const hnItems = await getHackerNews(8);
```

---

## 🎯 使用场景

### 场景 1：早晨通勤阅读

**配置**：
- 时间：早上 8:00
- 数量：5 条
- 用途：上班路上了解热点

**优势**：
- AI 已提炼核心内容
- 无需点击链接
- 5-10 分钟读完

---

### 场景 2：睡前科技速览

**配置**：
- 时间：晚上 21:00
- 数量：3 条
- 用途：睡前放松阅读

**优势**：
- 精选最重要资讯
- 不会信息过载
- 轻松无压力

---

### 场景 3：周末深度阅读

**配置**：
- 时间：周末任意
- 数量：8-10 条
- 用途：深入了解技术

**优势**：
- 数量适中
- AI 辅助理解
- 可扩展阅读

---

## 📊 与快速收集版对比

### 快速收集版

```
📰 全球科技资讯速递

## 🔥 科技热点
1. 标题
   👍 评分 | 💬 评论
   🔗 链接

...（23 条）
```

**特点**：
- ❌ 无 AI 分析
- ❌ 需要点击链接
- ❌ 需要自己阅读
- ✅ 资讯数量多

---

### 智能分析版（推荐）⭐

```
📰 今日科技热点分析

## 1. 标题
📊 数据
🤖 AI 智能分析
   - 核心摘要
   - 关键要点
   - 推荐指数

...（5 条深度分析）
```

**特点**：
- ✅ AI 深度分析
- ✅ 核心内容提炼
- ✅ 无需点击链接
- ✅ 推荐指数

---

## 🔧 故障排除

### 问题 1：AI 分析失败

**可能原因**：
- IFlow 未安装
- IFlow 配置错误
- 网络连接问题

**解决方法**：
```bash
# 1. 检查 IFlow
iflow --version

# 2. 测试 IFlow
iflow "你好"

# 3. 查看日志
tail -f logs/oprcli.log
```

---

### 问题 2：执行超时

**可能原因**：
- AI 分析时间过长
- 数量设置过多

**解决方法**：
```bash
# 减少收集数量
vim tasks/news-collector-with-analysis.js
# 改为：await getHackerNews(3)  # 减少到 3 条

# 或增加定时任务超时时间
```

---

### 问题 3：消息过长被截断

**可能原因**：
- AI 分析内容过长
- 超过钉钉限制

**解决方法**：
```bash
# 编辑脚本，简化 AI 分析
vim tasks/news-collector-with-analysis.js

# 修改 prompt：
# "提供：1. 核心摘要（30字内）2. 关键要点（2-3个）"
```

---

## 💡 最佳实践

### 1. 数量控制

**推荐**：
- **工作日**：5 条（深度阅读）
- **周末**：8 条（扩展阅读）
- **忙碌时**：3 条（快速浏览）

### 2. 时间选择

**推荐**：
- **早晨**：8:00（通勤阅读）
- **中午**：12:00（午休速览）
- **晚上**：21:00（睡前放松）

### 3. 内容筛选

**AI 会自动**：
- 过滤低质量资讯
- 提取核心要点
- 给出推荐指数
- 按热度排序

---

## 🚀 高级功能

### 自定义 AI 分析

编辑 `news-collector-with-analysis.js`：

```javascript
const prompt = \`请分析以下科技资讯：

**标题**: \${item.title}
**来源**: \${item.platform}
**链接**: \${item.url}

请提供：
1. **核心摘要**（30字内）
2. **技术亮点**（2-3个）
3. **商业价值**（1句话）
4. **推荐指数**（⭐1-5星）

直接开始分析。\`;
```

### 添加自定义评分

```javascript
// 在分析结果中添加
"推荐指数": \${item.score > 500 ? '⭐⭐⭐⭐⭐' : '⭐⭐⭐⭐'}
"趋势判断": \${item.score > 500 ? '🔥 热门' : '📈 上升中'}
```

---

## 📚 相关文档

- [版本对比](./news-collector-versions-comparison.md) - 快速收集 vs 智能分析
- [完整使用指南](./news-collector-iflow-guide.md) - 详细配置说明
- [提示词文档](../tasks/news-collector-prompt.md) - 执行规范

---

## ✅ 验收清单

使用前确认：

- [ ] 钉钉 Webhook 已配置
- [ ] IFlow 已安装并可用
- [ ] 定时任务已更新为智能分析版
- [ ] 配置已重新加载
- [ ] 已测试执行一次

---

## 🎊 总结

### 核心优势

✅ **AI 深度分析** - 不只提供链接，更提供内容
✅ **智能提炼** - 核心摘要 + 关键要点
✅ **推荐指数** - 帮你判断价值
✅ **节省时间** - 无需点击链接
✅ **质量优先** - 5 条精选胜过 25 条

### 立即开始

```bash
# 3 步启用
export NOTIFICATION_DINGTALK_WEBHOOK=你的webhook
vim scheduler/tasks.json  # 修改为智能分析版
tasks reload && tasks run daily-news-collector
```

---

**版本**: v3.0.0 (智能分析版)
**推荐指数**: ⭐⭐⭐⭐⭐
**适用人群**: 所有没有时间逐个阅读链接的用户

🚀 **现在就启用，享受 AI 智能资讯推送！**
