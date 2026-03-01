# 钉钉模式问题修复与升级方案

## 📋 当前问题总结

### 问题1：AI 响应无法提取
**现象**：发送"你好"后，产生大量事件但最终无钉钉回复
**原因**：
- `extractResponse` 函数对事件结构的假设与实际不符
- 缺少详细的调试日志
- 无法判断是在提取环节失败还是发送环节失败

### 问题2：事件结构不明确
从日志看到的事件类型：system、assistant、user、result，但不知道完整结构

### 问题3：错误处理不足
- 没有记录发送钉钉消息的成功/失败状态
- 异常捕获不完整

---

## ✅ 已完成的修复

### 1. 增强调试日志（dingtalk-stream.js）
- ✅ 前3个事件打印完整 JSON 结构
- ✅ 之后的事件只打印类型
- ✅ 响应提取过程增加详细日志

### 2. 改进响应提取逻辑（extractResponse 函数）
- ✅ 支持更多事件结构变体
- ✅ 增加容错性，尝试多种提取路径
- ✅ 提取过程日志化

### 3. 增强发送日志
- ✅ 发送前记录响应长度和预览
- ✅ 记录发送方式选择（webhook/单聊/群聊）
- ✅ Webhook 响应详细记录

### 4. 创建调试工具
- ✅ `test-dingtalk-debug.js` - 独立的事件提取测试工具

---

## 🚀 进一步升级建议

### 建议1：实现智能重试机制

**问题**：钉钉 API 偶尔会失败，需要重试

**方案**：
```javascript
async function sendWithRetry(sendFn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await sendFn();
      if (result.errcode === 0) return result;
      console.warn(`发送失败，第 ${i + 1} 次重试...`);
      await sleep(1000 * (i + 1)); // 指数退避
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      console.warn(`发送异常，第 ${i + 1} 次重试...`, err.message);
      await sleep(1000 * (i + 1));
    }
  }
}
```

### 建议2：支持 Markdown 格式

**当前**：只支持纯文本
**升级**：支持 Markdown、图片、文件等

```javascript
async function sendMarkdownMessage(webhookUrl, markdown) {
  const postData = JSON.stringify({
    msgtype: 'markdown',
    markdown: {
      title: 'Claude 助手',
      text: markdown
    }
  });
  // ...
}
```

### 建议3：消息持久化与重放

**问题**：进程重启后消息丢失
**方案**：
- 将消息保存到 SQLite 数据库
- 支持消息历史查询
- 失败消息自动重发

### 建议4：流式回复

**当前**：等待完整响应后发送
**升级**：实时流式发送（类似 ChatGPT）

```javascript
async function streamReply(events, senderId) {
  let currentText = '';
  for (const event of events) {
    if (event.type === 'content_block_delta' && event.delta?.text) {
      currentText += event.delta.text;
      // 每 50 个字符发送一次
      if (currentText.length % 50 < 10) {
        await sendDingTalkMessage(senderId, currentText);
      }
    }
  }
}
```

### 建议5：多会话并发支持

**当前**：串行处理消息
**升级**：支持多用户同时对话

```javascript
const processing = new Map();

async function processMessage(conversationId, content, senderId) {
  // 如果有正在处理的会话，先取消
  if (processing.has(conversationId)) {
    console.log(`会话 ${conversationId} 正在处理，取消旧任务`);
    // 取消逻辑...
  }

  const task = processMessageInternal(conversationId, content, senderId);
  processing.set(conversationId, task);

  try {
    const result = await task;
    return result;
  } finally {
    processing.delete(conversationId);
  }
}
```

### 建议6：添加健康检查

```javascript
// 定期检查连接状态
setInterval(async () => {
  try {
    const token = await getAccessToken();
    console.log(`[健康检查] Token 正常，过期时间: ${new Date(accessTokenCache.expiresAt)}`);
  } catch (err) {
    console.error('[健康检查] 获取 token 失败:', err.message);
  }
}, 60000); // 每分钟检查一次
```

### 建议7：优雅关闭

```javascript
process.on('SIGINT', async () => {
  console.log('\n收到退出信号，正在清理...');

  // 等待当前任务完成
  const activeSessions = connector.getActiveSessions();
  console.log(`等待 ${activeSessions.length} 个会话完成...`);

  // 最多等待 5 秒
  await Promise.race([
    Promise.all(activeSessions.map(id => {
      return new Promise(resolve => {
        const check = setInterval(() => {
          if (!connector.getActiveSessions().includes(id)) {
            clearInterval(check);
            resolve();
          }
        }, 100);
      });
    })),
    sleep(5000)
  ]);

  console.log('清理完成，退出');
  process.exit(0);
});
```

---

## 🔧 调试步骤

### 步骤1：运行修复后的代码
```bash
npm run dingtalk
```

### 步骤2：发送测试消息
在钉钉中发送"你好"

### 步骤3：观察日志
关键日志点：
```
[Claude 事件] {...完整的 JSON...}  # 前3个事件的完整结构
[提取] 开始分析 X 个事件
[提取] 找到 assistant 事件
[提取] 从 message.content 提取到 X 字符
[提取] Assistant 模式提取完成，总长度: X
[发送] 准备发送回复，长度: X 字符
[发送] 前100字符预览: ...
[Webhook] URL: ...
[Webhook] 发送内容长度: X 字符
[Webhook] 响应状态: 200
[Webhook] 响应内容: {...}
[Webhook] ✅ 发送成功
```

### 步骤4：如果仍然失败
使用调试工具：
```bash
node test-dingtalk-debug.js
```

---

## 📊 事件结构参考

根据 Claude Code 的 `stream-json` 格式，预期的事件结构：

### Assistant 事件
```json
{
  "type": "assistant",
  "message": {
    "id": "...",
    "content": [
      {
        "type": "text",
        "text": "完整的回复内容"
      }
    ]
  }
}
```

### Content Block Delta 事件（流式）
```json
{
  "type": "content_block_delta",
  "delta": {
    "type": "text_delta",
    "text": "增量文本"
  }
}
```

### Result 事件
```json
{
  "type": "result",
  "result": "最终结果（可能没有）"
}
```

---

## 🎯 预期效果

修复后应该看到：
1. ✅ 清晰的事件结构日志
2. ✅ 成功提取响应内容
3. ✅ 钉钉消息发送成功
4. ✅ 用户收到完整回复

---

## 📝 备注

- 所有修改已完成并保存
- 建议先测试修复效果，再考虑升级方案
- 如需实施升级方案，请告知优先级
