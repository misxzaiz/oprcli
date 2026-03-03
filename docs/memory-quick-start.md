# 永久记忆系统 - 快速启动指南

## 5分钟快速开始

### 步骤 1: 验证安装

```bash
cd D:/temp/oprcli
node test-memory.js
```

预期输出：
```
✅ 所有测试完成！
```

### 步骤 2: 启动OPRCLI

```bash
cd D:/temp/oprcli
npm start
```

### 步骤 3: 开始使用

在钉钉中发送消息：

```
你好
```

系统会自动记录你的消息。

### 步骤 4: 触发总结

```
load
```

系统会自动：
1. 总结所有未总结的记忆
2. 整合已总结的记忆
3. 生成分层结构

### 步骤 5: 搜索记忆

```
search 钉钉
```

系统会返回所有包含"钉钉"的记忆。

## 常用命令速查

| 命令 | 说明 | 示例 |
|------|------|------|
| `load` | 触发记忆总结 | `load` |
| `search <关键词>` | 搜索记忆 | `search 钉钉` |
| `搜索 <关键词>` | 搜索记忆（中文） | `搜索 机器人` |
| `stats` | 查看统计信息 | `stats` |
| `统计` | 查看统计信息（中文） | `统计` |
| `tag <id> <标签...>` | 添加标签 | `tag abc123 重要` |

## 实际使用场景

### 场景 1: 记录重要对话

1. 与AI讨论项目需求
2. 系统自动记录
3. 手动添加标签：
   ```
   tag abc123 重要 项目需求
   ```

### 场景 2: 定期总结

1. 每天晚上执行：
   ```
   load
   ```
2. 系统自动生成今日总结
3. 长期记忆自动压缩

### 场景 3: 快速检索

1. 需要查找历史信息
2. 搜索关键词：
   ```
   search 钉钉配置
   ```
3. 查看相关记忆

## 数据存储位置

```
oprcli/data/memory/
├── raw-memories.json   # 原始记忆
└── summaries.json       # 总结记忆
```

## 备份和恢复

### 备份
```bash
cd D:/temp/oprcli
cp -r data/memory data/memory-backup-$(date +%Y%m%d)
```

### 恢复
```bash
cd D:/temp/oprcli
cp -r data/memory-backup-20260304/* data/memory/
```

## 常见问题

### Q: Load 命令需要多长时间？
A: 取决于记忆数量
- < 100 条: 几秒
- 100-1000 条: 几十秒
- > 1000 条: 可能需要几分钟

### Q: 搜索不到结果怎么办？
A:
1. 检查关键词是否正确
2. 尝试不同的关键词
3. 使用标签搜索：`search '' --tags tagname`

### Q: 如何清理旧记忆？
A:
1. 查看统计：`stats`
2. 手动删除 `data/memory/` 中的文件
3. 重新启动（会创建新文件）

### Q: 记忆会丢失吗？
A:
- 原始记忆永久保存（软删除）
- 总结记忆在合并时会被标记删除
- 建议定期备份 `data/memory/` 目录

## 下一步

1. 阅读完整指南：`docs/memory-system-guide.md`
2. 了解实现细节：`docs/memory-system-implementation.md`
3. 查看测试代码：`test-memory.js`
4. 探索源代码：`utils/memory-system.js`

## 获取帮助

遇到问题？
1. 查看日志输出
2. 运行测试：`node test-memory.js`
3. 检查数据文件：`data/memory/`

祝你使用愉快！🎉
