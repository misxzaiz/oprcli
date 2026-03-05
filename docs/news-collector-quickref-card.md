# 📰 资讯收集定时任务 - 快速参考

> 一张卡片掌握所有命令

---

## ⚡ 60秒启用

```bash
# 1. 配置钉钉
export NOTIFICATION_DINGTALK_WEBHOOK=你的webhook

# 2. 启用任务
tasks enable daily-news-collector
tasks reload

# 3. 测试执行
tasks run daily-news-collector
```

---

## 📋 常用命令

| 命令 | 功能 |
|------|------|
| `tasks` | 查看任务列表 |
| `tasks status` | 查看详细状态 |
| `tasks run daily-news-collector` | 立即执行一次 |
| `tasks enable daily-news-collector` | 启用任务 |
| `tasks disable daily-news-collector` | 禁用任务 |
| `tasks reload` | 重新加载配置 |

---

## ⏰ 执行时间

**默认**: 每天 4:30（凌晨）

**修改时间**:
```bash
vim scheduler/tasks.json
# 修改 "schedule": "30 4 * * *"
curl -X POST http://localhost:13579/api/tasks/reload
```

常用时间：
- `0 9 * * *` - 早上 9:00
- `0 18 * * *` - 晚上 18:00
- `0 */6 * * *` - 每6小时

---

## 📊 数据源

### 核心平台（6个）
1. **Hacker News** - 10条热门
2. **GitHub Trending** - 引导链接
3. **Reddit Technology** - 5条
4. **Reddit Programming** - 5条
5. **Product Hunt** - 引导链接
6. **OpenAI Blog** - 引导链接

### 总计
- 每天约 **23-25 条**资讯
- 自动去重
- 智能分类

---

## 📝 消息格式

### 钉钉消息示例
```markdown
# 📰 全球科技资讯速递

**⏰ 时间**: 2026-03-05 04:30:00
**📊 本期资讯**: 25 条

## 🔥 科技热点
1. **标题**
   👍 评分 | 💬 评论
   🔗 链接
   🕐 时间
   📱 平台

## 💻 开源项目
## 🤖 AI 前沿
## 🚀 产品发现
```

---

## 🔧 配置文件

### 主要文件
```
D:/space/oprcli/
├── scheduler/tasks.json              # 定时任务配置
├── tasks/news-collector-iflow.js    # 主脚本
├── tasks/news-collector-prompt.md   # 提示词
├── scripts/notify.js                # 钉钉通知
└── .cache/news-items-v2.json        # 缓存
```

### 环境变量
```bash
NOTIFICATION_DINGTALK_WEBHOOK=https://oapi.dingtalk.com/...
NOTIFICATION_DINGTALK_SECRET=SEC...
```

---

## ❓ 故障排除

### 没有收到消息？

**检查清单**：
1. ✅ Webhook 配置正确？
   ```bash
   echo $NOTIFICATION_DINGTALK_WEBHOOK
   ```

2. ✅ 任务已启用？
   ```bash
   tasks status
   ```

3. ✅ 配置已重新加载？
   ```bash
   tasks reload
   ```

4. ✅ 关键词设置？
   - 钉钉机器人必须包含关键词："科技资讯"

### 手动测试
```bash
# 直接运行脚本
node tasks/news-collector-iflow.js

# 查看日志
tail -f logs/oprcli.log

# 查看缓存
cat .cache/news-items-v2.json
```

---

## 💡 最佳实践

### 推送时间
- ✅ 凌晨 4:30（默认）
- ✅ 早上 8:00（上班）
- ✅ 晚上 9:00（睡前）

### 内容数量
- **轻度**: 5-10 条
- **中度**: 15-20 条（默认）
- **重度**: 25-30 条

### 质量过滤
- 评分 > 50 分
- 评论 > 10 条
- 时间 < 48 小时

---

## 📚 完整文档

- [完整使用指南](./news-collector-iflow-guide.md)
- [提示词文档](../tasks/news-collector-prompt.md)
- [平台分析报告](./information-sources-analysis.md)
- [快速参考指南](./information-sources-quickref.md)

---

## 🎯 状态说明

### 当前状态
- **任务ID**: `daily-news-collector`
- **任务名称**: 全球科技资讯收集
- **执行时间**: 每天 4:30
- **使用引擎**: IFlow
- **默认状态**: **关闭**（需手动启用）

### 启用任务
```bash
tasks enable daily-news-collector
tasks reload
```

---

**版本**: v2.0.0
**更新**: 2026-03-05

🚀 立即开始使用吧！
