# Polaris 会话记忆问题分析

## 🔍 问题现象

用户报告：
1. 第一次对话：让 AI 在 D:/temp 创建文件写入小舞的介绍 → AI 成功完成
2. 第二次对话：问"刚才的做了什么，总结一下" → AI 说没有之前的记忆

## 📊 问题分析

### Polaris 的会话管理机制

#### 前端会话管理（eventChatStore.ts）

```typescript
// 发送消息逻辑
sendMessage: async (content, workspaceDir) => {
  const { conversationId } = get()  // 🔑 关键：获取当前会话 ID

  if (conversationId) {
    // ✅ 有会话 ID → 继续会话
    await invoke('continue_chat', {
      sessionId: conversationId,
      message: normalizedMessage,
      // ...
    })
  } else {
    // ❌ 没有会话 ID → 开启新会话
    const newSessionId = await invoke('start_chat', {
      message: normalizedMessage,
      // ...
    })
    set({ conversationId: newSessionId })
  }
}
```

#### 后端会话管理（chat.rs）

```rust
// 启动会话
pub async fn start_claude_chat(
    message: &str,
    // ...
) -> Result<String> {
    let session = ChatSession::start(config, message, system_prompt)?;
    let session_id = session.id.clone();  // 临时 ID

    // 后台线程监听真实 session_id
    session.read_events(|event| {
        if let StreamEvent::System { extra, .. } = &event {
            if let Some(real_session_id) = extra.get("session_id") {
                // 更新映射：临时 ID → 真实 ID
                sessions.insert(real_session_id, pid);
            }
        }
    })
}

// 继续会话（使用 --resume 参数）
fn build_node_command_resume(
    node_exe: &str,
    cli_js: &str,
    session_id: &str,  // 🔑 使用真实 session_id
    message: &str,
    // ...
) -> Command {
    cmd.arg(cli_js)
       .arg("--resume")
       .arg(session_id);  // Claude Code CLI 的 resume 参数
}
```

### 🔴 问题根源

#### 1. conversationId 丢失的可能原因

| 原因 | 说明 | 概率 |
|------|------|------|
| **页面刷新/重新打开** | 前端状态重置，conversationId 清空 | ⭐⭐⭐⭐⭐ |
| **会话结束后未保留** | session_end 事件后清空 conversationId | ⭐⭐⭐ |
| **多窗口/多标签** | 不同窗口的 state 不同步 | ⭐⭐ |
| **错误处理导致清空** | 异常时调用 reset() 清空状态 | ⭐⭐⭐ |

#### 2. 会话持久化机制

Polaris **确实有**会话持久化：

```typescript
// 保存到 localStorage
saveToStorage: () => {
  const { messages, conversationId, ... } = get()
  const historyEntry = {
    id: conversationId,
    data: { messages, ... },
    // ...
  }
  localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(history))
}

// 从 localStorage 恢复
restoreFromHistory: async (sessionId: string) => {
  const localSession = localHistory.find(h => h.id === sessionId)
  if (localSession) {
    set({
      messages: localSession.data.messages,
      conversationId: localSession.id,  // 🔑 恢复 conversationId
      // ...
    })
  }
}
```

#### 3. Claude Code CLI 的会话机制

Claude Code CLI 使用 `--resume <session_id>` 参数继续会话：

```bash
# 第一次对话
node cli.js "在D:/temp创建文件"

# 第二次对话（继续会话）
node cli.js --resume <session_id> "刚才做了什么"
```

**关键**：`session_id` 是由 Claude Code CLI 生成的，不是前端随机生成的。

### 📝 可能的问题场景

#### 场景 1：用户刷新了页面

```
第一次对话：
  用户: "在D:/temp创建文件"
  前端: conversationId = null → 调用 start_chat
  后端: 生成 session_id = "abc-123"
  前端: set({ conversationId: "abc-123" })
  前端: 保存到 localStorage

  ✅ AI 创建文件成功

  用户刷新页面 💥
  前端: conversationId = null（state 重置）

第二次对话：
  用户: "刚才做了什么"
  前端: conversationId = null → 调用 start_chat（新会话）❌
  后端: 生成新的 session_id = "xyz-789"
  AI: "我没有之前的记忆" ✅ 正确回答（因为是新会话）
```

#### 场景 2：会话结束后 conversationId 被清空

```typescript
// session_end 事件处理
case 'session_end':
  state.finishMessage()
  set({ isStreaming: false })  // 可能没有保留 conversationId
  break
```

### 🎯 根本原因总结

**最可能的原因**：用户在两次对话之间**刷新了页面**或**重新打开了应用**，导致前端的 `conversationId` 丢失，第二次对话时开启了新的会话。

Claude Code CLI 本身**没有长期记忆**，它只维护当前会话的上下文。如果：
1. 前端没有传递正确的 `session_id`
2. 或者传递的 `session_id` 已经过期/无效

就会创建新会话，导致 AI 失去之前的记忆。

## 🔧 可能的解决方案

### 方案 1：持久化 conversationId（推荐）

```typescript
// 在 session_start 时保存 conversationId 到 localStorage
case 'session_start':
  set({ conversationId: event.sessionId })
  localStorage.setItem('current_conversation_id', event.sessionId)  // ✅
  break

// 在应用启动时恢复
initialize: () => {
  const savedId = localStorage.getItem('current_conversation_id')
  if (savedId) {
    set({ conversationId: savedId })
  }
}
```

### 方案 2：显示当前会话状态

在 UI 上显示：
- 当前会话 ID
- 是否在继续会话
- 会话历史

让用户清楚知道当前状态。

### 方案 3：从历史恢复会话

```typescript
// 在发送消息前检查
sendMessage: async (content, workspaceDir) => {
  let { conversationId } = get()

  // 如果没有 conversationId，尝试从最新历史恢复
  if (!conversationId) {
    const history = get().getUnifiedHistory()
    if (history.length > 0) {
      const latestSession = history[0]
      await get().restoreFromHistory(latestSession.id)
      conversationId = latestSession.id
    }
  }

  // 然后发送消息
  // ...
}
```

### 方案 4：增加会话过期提示

如果尝试继续一个已过期的会话，显示友好的错误提示：
```
⚠️ 此会话已过期，将创建新会话
```

## 📌 建议

1. **短期修复**：在 UI 上明确显示当前会话状态
2. **长期优化**：改进会话管理，自动恢复未完成的会话
3. **用户体验**：添加"新对话"按钮，让用户主动选择是否继续会话

## 🔗 相关代码位置

- 前端会话状态：`src/stores/eventChatStore.ts:1189`
- 后端继续会话：`src-tauri/src/commands/chat.rs:157`
- 事件处理：`src/stores/eventChatStore.ts:389`
- 会话持久化：`src/stores/eventChatStore.ts:1706`
