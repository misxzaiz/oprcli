# context-memory

**版本**: 1.0.0
**作者**: OPRCLI Team
**描述**: 上下文记忆系统

## 功能说明

上下文记忆系统

## 使用方法

```
// 在对话中使用
@context-memory [参数]
```

## API

- `set`: async (key, value) => await server.contextMemory.set(key, value)
- `get`: async (key) => await server.contextMemory.get(key)
- `saveSession`: async (id, ctx) => await server.contextMemory.saveSession(id, ctx)


## 配置选项

无配置选项

## 更新日志

- 注册时间: 2026/3/5 01:09:41
