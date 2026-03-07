# OPRCLI 机器人调用 Agent 流程图（Mermaid 版本）

## 1. 系统架构图

```mermaid
graph TB
    User[用户<br/>钉钉/QQ] --> Platform[钉钉/QQ服务器]
    Platform -->|WebSocket推送| DT[DingTalkIntegration<br/>548行]
    Platform -->|WebSocket推送| QB[QQBotIntegration<br/>302行]

    DT --> Server[server.js<br/>2667行]
    QB --> Server

    DT --> DTClient[dingtalk-stream<br/>SDK]
    QB --> QBClient[qqbot-client<br/>998行]

    Server --> Connector[Connectors]
    Connector --> Claude[claude-connector]
    Connector --> IFlow[iflow-connector<br/>606行]
    Connector --> Codex[codex-connector]

    IFlow --> Process[IFlow CLI进程]
    Process -->|执行AI任务| Events[事件流JSONL]

    Events --> Server
    Server -->|格式化| DT
    Server -->|格式化| QB

    DT -->|Webhook| Platform
    QB -->|API| Platform
    Platform --> User

    style Server fill:#4CAF50,color:#fff
    style DT fill:#2196F3,color:#fff
    style QB fill:#9C27B0,color:#fff
    style IFlow fill:#FF9800,color:#fff
```

## 2. 初始化流程

```mermaid
sequenceDiagram
    participant Main as server.js
    participant DT as DingTalkIntegration
    participant QB as QQBotIntegration
    participant Connector as Connectors

    Main->>Main: start()
    Main->>DT: init(handleDingTalkMessage)
    activate DT

    DT->>DT: 创建会话持久化
    DT->>DT: 恢复历史会话
    DT->>DT: 创建 DWClient
    DT->>DT: 注册消息监听器
    DT->>DT: 连接到钉钉服务器
    DT->>DT: 启动自动清理
    DT-->>Main: 初始化完成

    deactivate DT

    Main->>QB: init(handleQQBotMessage)
    activate QB

    QB->>QB: 加载 QQBotClient
    QB->>QB: 注册事件监听器
    QB->>QB: 连接到 QQ 服务器
    QB->>QB: 启动自动清理
    QB-->>Main: 初始化完成

    deactivate QB

    Main->>Connector: _initConnectors()
    Connector-->>Main: 所有连接器就绪
```

## 3. 钉钉消息处理完整流程

```mermaid
sequenceDiagram
    participant User as 用户
    participant DTServer as 钉钉服务器
    participant DT as DingTalkIntegration
    participant Server as server.js
    participant Connector as IFlowConnector
    participant Process as IFlow进程

    User->>DTServer: 发送消息
    DTServer->>DT: WebSocket推送消息

    Note over DT: 立即响应（60秒限制）
    DT->>DTServer: socketCallBackResponse

    DT->>DT: 消息去重检查
    alt 消息已处理
        DT-->>DTServer: 跳过
    else 消息未处理
        DT->>DT: markAsProcessed

        DT->>Server: handleDingTalkMessage(message)
        activate Server

        Server->>Server: 解析消息内容
        Server->>Server: 识别命令

        alt 是命令
            Server->>Server: _handleCommand()
            Server-->>DT: 返回命令结果
        else 是普通消息
            Server->>Server: 获取会话
            Server->>Server: 选择Provider

            alt 会话存在
                Server->>Connector: continueSession(sessionId, message)
            else 首次对话
                Server->>Connector: startSession(message)
            end

            activate Connector

            Connector->>Connector: 构建命令参数
            Connector->>Process: spawn(iflow命令)
            activate Process

            Connector->>Process: stdin.write(消息内容)

            loop 事件流处理
                Process->>Connector: stdout/stderr数据
                Connector->>Server: onEvent(event)

                alt assistant事件
                    Server->>Server: 提取文本内容
                    Server->>Server: 格式化消息
                    Server->>DT: send(webhook, message)
                    DT->>DTServer: POST发送到钉钉
                    DTServer->>User: 显示回复
                else result事件
                    Server->>Server: 检查内容去重
                    Server->>Server: 格式化并发送
                else system事件
                    Server->>Server: 捕获sessionId
                    Server->>DT: setSession(realSessionId)
                else session_end事件
                    Server->>Server: 标记会话结束
                end
            end

            Process-->>Connector: 进程结束(exitCode)
            deactivate Process

            Connector->>Server: onComplete(exitCode)
            deactivate Connector

            Server->>Server: 保存会话状态
            deactivate Server
        end
    end
```

## 4. QQ Bot 消息处理完整流程

```mermaid
sequenceDiagram
    participant User as 用户
    participant QQServer as QQ服务器
    participant QBClient as QQBotClient
    participant QB as QQBotIntegration
    participant Server as server.js
    participant Connector as IFlowConnector
    participant Process as IFlow进程

    User->>QQServer: 发送消息
    QQServer->>QBClient: WebSocket推送消息

    QBClient->>QBClient: handleMessage(data)
    QBClient->>QBClient: handleEvent(message)

    alt MESSAGE_CREATE
        QBClient->>QB: emit('message', eventData)
    else AT_MESSAGE_CREATE
        QBClient->>QB: emit('at_message', eventData)
    else C2C_MESSAGE_CREATE
        QBClient->>QB: emit('c2c_message', eventData)
    end

    QB->>QB: _handleMessage(message, type)

    Note over QB: 消息去重
    QB->>QB: isProcessed(messageId)
    alt 已处理
        QB-->>QB: 跳过
    else 未处理
        QB->>QB: markAsProcessed

        QB->>Server: handleQQBotMessage(message, type, convId)
        activate Server

        Server->>Server: 解析消息内容
        Server->>Server: 识别命令

        alt 是命令
            Server->>Server: _handleQQBotCommand()
            Server->>QB: _sendQQBotReply()
            QB->>QQServer: API发送消息
            QQServer->>User: 显示回复
        else 是普通消息
            Server->>Server: 获取会话
            Server->>Server: 选择Provider

            alt 会话存在
                Server->>Connector: continueSession(sessionId, message)
            else 首次对话
                Server->>Connector: startSession(message)
            end

            activate Connector

            Connector->>Connector: 构建命令参数
            Connector->>Process: spawn(iflow命令)
            activate Process

            Connector->>Process: stdin.write(消息内容)

            loop 事件流处理
                Process->>Connector: stdout/stderr数据
                Connector->>Server: onEvent(event)

                alt assistant/result事件
                    Server->>Server: 提取文本内容
                    Server->>Server: 暂存回复
                else send_file事件
                    Server->>QBClient: uploadFile()
                    QBClient->>QQServer: 上传文件
                    QQServer-->>QBClient: 文件URL
                    QBClient->>QQServer: sendMessage(含文件)
                    QQServer->>User: 显示文件
                else error事件
                    Server->>QB: _sendQQBotReply(错误信息)
                else session_end事件
                    Server->>QB: _sendQQBotReply(暂存回复)
                    QB->>QQServer: API发送消息
                    QQServer->>User: 显示回复
                end
            end

            Process-->>Connector: 进程结束(exitCode)
            deactivate Process

            Connector->>Server: onComplete(exitCode)
            deactivate Connector

            Server->>Server: 保存会话状态
            deactivate Server
        end
    end
```

## 5. 会话管理流程

```mermaid
stateDiagram-v2
    [*] --> NoSession: 用户首次发送消息

    NoSession --> CreatingSession: getSession()返回null
    CreatingSession --> SetProvider: 设置provider=default
    SetProvider --> StartSession: connector.startSession()
    StartSession --> TempSession: 生成临时sessionId

    TempSession --> Running: IFlow进程运行
    Running --> CaptureSessionId: 收到system事件
    CaptureSessionId --> UpdateSession: 更新为真实sessionId
    UpdateSession --> ActiveSession: 会话活跃

    ActiveSession --> ContinueSession: 用户继续对话
    ContinueSession --> Running: connector.continueSession()

    ActiveSession --> SessionEnd: 收到session_end
    SessionEnd --> WaitingNext: 等待下次对话

    WaitingNext --> ContinueSession: 用户发送新消息
    WaitingNext --> Expired: 24小时后

    ActiveSession --> Expired: 24小时后
    Expired --> [*]: 自动清理

    note right of TempSession
        临时ID格式: temp_xxx
        用于跟踪进程
    end note

    note right of UpdateSession
        真实ID格式: session_xxx
        由IFlow返回
    end note

    note right of ActiveSession
        保存在Map中
        持久化到磁盘
    end note
```

## 6. Connector 进程管理流程

```mermaid
flowchart TD
    Start([调用会话方法]) --> Check{检查会话类型}

    Check -->|新会话| NewSession[startSession]
    Check -->|继续会话| ContinueSession[continueSession]

    NewSession --> GenTempId[生成临时sessionId]
    GenTempId --> BuildArgs1[构建命令参数<br/>不含--resume]
    BuildArgs1 --> Spawn1[spawn iflow进程]

    ContinueSession --> GetSession[获取旧会话]
    GetSession --> CheckProcess{旧进程存在?}
    CheckProcess -->|是| KillProcess[终止旧进程]
    CheckProcess -->|否| BuildArgs2
    KillProcess --> BuildArgs2[构建命令参数<br/>含--resume sessionId]
    BuildArgs2 --> Spawn2[spawn iflow进程]

    Spawn1 --> RegisterSession[注册会话到Map]
    Spawn2 --> RegisterSession

    RegisterSession --> SetupHandlers[设置事件处理器]
    SetupHandlers --> StdoutHandler[监听stdout]
    SetupHandlers --> StderrHandler[监听stderr]
    SetupHandlers --> CloseHandler[监听close]

    StdoutHandler --> Buffer[累积stdout到buffer]
    StderrHandler --> ParseSessionId[解析真实sessionId]

    ParseSessionId --> FoundId{找到sessionId?}
    FoundId -->|是| UpdateId[更新sessionId]
    FoundId -->|否| Buffer

    UpdateId --> NotifyCallback[通知server.js]
    NotifyCallback --> Running[进程运行中]

    Buffer --> CheckEvents{有JSONL事件?}
    CheckEvents -->|是| ParseEvents[解析JSONL事件]
    CheckEvents -->|否| UseStdout[使用stdout文本]

    ParseEvents --> TriggerEvent[触发onEvent回调]
    UseStdout --> TriggerEvent

    TriggerEvent --> Running

    Running --> ProcessEnd[进程结束]
    ProcessEnd --> SessionEnd[发送session_end事件]
    SessionEnd --> Cleanup[清理资源]
    Cleanup --> Unregister[从Map注销会话]
    Unregister --> Complete[调用onComplete]
    Complete --> End([结束])

    style Start fill:#4CAF50,color:#fff
    style End fill:#f44336,color:#fff
    style Running fill:#2196F3,color:#fff
    style UpdateId fill:#FF9800,color:#fff
```

## 7. 事件处理流程

```mermaid
flowchart TD
    Start([收到事件]) --> Type{事件类型}

    Type -->|assistant| Assistant[处理assistant事件]
    Type -->|result| Result[处理result事件]
    Type -->|thinking| Thinking[处理thinking事件]
    Type -->|tool_start| ToolStart[处理tool_start事件]
    Type -->|tool_output| ToolOutput[处理tool_output事件]
    Type -->|system| System[处理system事件]
    Type -->|send_file| SendFile[处理send_file事件]
    Type -->|error| Error[处理error事件]
    Type -->|session_end| SessionEnd[处理session_end事件]
    Type -->|其他| Other[忽略事件]

    Assistant --> ExtractText[提取文本内容]
    ExtractText --> SaveHash[保存内容哈希]
    SaveHash --> Format1[格式化消息]
    Format1 --> Send1{启用流式?}
    Send1 -->|是| SendToPlatform[发送到平台]
    Send1 -->|否| Discard1[丢弃]

    Result --> ExtractResult[提取结果文本]
    ExtractResult --> CalcHash[计算结果哈希]
    CalcHash --> Compare{与assistant哈希相同?}
    Compare -->|是| Discard2[去重,丢弃]
    Compare -->|否| Format2[格式化消息]
    Format2 --> Send2{启用流式?}
    Send2 -->|是| SendToPlatform
    Send2 -->|否| Discard2

    Thinking --> LogThinking[记录思考过程]
    ToolStart --> LogTool[记录工具调用]
    ToolOutput --> LogOutput[记录工具输出]

    System --> CheckSession{包含session_id?}
    CheckSession -->|是| UpdateSession[更新sessionId]
    CheckSession -->|否| Discard3[丢弃]
    UpdateSession --> SaveSession[保存到Map]

    SendFile --> UploadFile[上传文件]
    UploadFile --> SendFileMsg[发送文件消息]
    SendFileMsg --> RecordSent[记录已发送]

    Error --> SendError[发送错误消息]

    SessionEnd --> CheckComplete{已完成?}
    CheckComplete -->|否| SendSummary[发送完成总结]
    CheckComplete -->|是| Discard4[已完成,跳过]
    SendSummary --> NotifyComplete[通知完成]

    SendToPlatform --> RetrySend{重试成功?}
    RetrySend -->|是| RecordSent
    RetrySend -->|否| LogError[记录错误]

    RecordSent --> End([结束])
    Discard1 --> End
    Discard2 --> End
    Discard3 --> End
    Discard4 --> End
    LogThinking --> End
    LogTool --> End
    LogOutput --> End
    SaveSession --> End
    SendError --> End
    NotifyComplete --> End
    LogError --> End
    Other --> End

    style Start fill:#4CAF50,color:#fff
    style End fill:#f44336,color:#fff
    style SendToPlatform fill:#2196F3,color:#fff
    style UpdateSession fill:#FF9800,color:#fff
    style Error fill:#f44336,color:#fff
```

## 8. 消息发送重试流程

```mermaid
flowchart TD
    Start([准备发送消息]) --> Attempt{当前尝试次数}
    Attempt -->|第1次| Send1[发送消息]
    Attempt -->|第2次| Send2[发送消息]
    Attempt -->|第3次| Send3[发送消息]

    Send1 --> Check1{成功?}
    Send2 --> Check2{成功?}
    Send3 --> Check3{成功?}

    Check1 -->|是| Success[发送成功]
    Check2 -->|是| Success
    Check3 -->|是| Success

    Check1 -->|否| Wait1[等待1秒]
    Check2 -->|否| Wait2[等待2秒]
    Check3 -->|否| Fail[所有重试失败]

    Wait1 --> Send2
    Wait2 --> Send3

    Success --> LogSuccess[记录成功日志]
    Fail --> LogFail[记录失败日志]

    LogSuccess --> End([返回])
    LogFail --> End

    style Start fill:#4CAF50,color:#fff
    style End fill:#f44336,color:#fff
    style Success fill:#4CAF50,color:#fff
    style Fail fill:#f44336,color:#fff
    style Wait1 fill:#FF9800,color:#fff
    style Wait2 fill:#FF9800,color:#fff
```

## 9. 内存清理流程

```mermaid
flowchart TD
    Start([定时器触发<br/>每5分钟]) --> GetNow[获取当前时间]
    GetNow --> CleanMsg[清理过期消息]
    GetNow --> CleanSession[清理过期会话]

    CleanMsg --> IterateMsg[遍历processedMessages]
    IterateMsg --> CheckMsg{消息时间<br/>> 1小时?}
    CheckMsg -->|是| DeleteMsg[删除消息]
    CheckMsg -->|否| NextMsg[下一个]
    DeleteMsg --> NextMsg
    NextMsg --> IterateMsg

    CleanSession --> IterateSession[遍历conversations]
    IterateSession --> CheckSession{会话时间<br/>> 24小时?}
    CheckSession -->|是| DeleteSession[删除会话]
    CheckSession -->|否| NextSession[下一个]
    DeleteSession --> NextSession
    NextSession --> IterateSession

    IterateMsg --> CalcStats[计算清理统计]
    IterateSession --> CalcStats

    CalcStats --> HasCleaned{清理了内容?}
    HasCleaned -->|是| LogClean[记录清理日志]
    HasCleaned -->|否| Silent[静默结束]

    LogClean --> UpdateStats[更新统计信息]
    Silent --> UpdateStats

    UpdateStats --> End([等待下次触发])

    style Start fill:#4CAF50,color:#fff
    style End fill:#f44336,color:#fff
    style DeleteMsg fill:#FF9800,color:#fff
    style DeleteSession fill:#FF9800,color:#fff
    style LogClean fill:#2196F3,color:#fff
```

## 10. 完整数据流向图

```mermaid
graph LR
    A[用户消息] --> B[钉钉/QQ服务器]
    B --> C[WebSocket推送]
    C --> D[DingTalkIntegration<br/>QQBotIntegration]

    D --> E[消息去重检查]
    E --> F[server.js消息处理]

    F --> G{命令识别}
    G -->|命令| H[命令处理器]
    G -->|普通消息| I[会话管理]

    H --> Z[返回命令结果]

    I --> J[获取Provider]
    J --> K[Connector]

    K --> L[启动iflow进程]
    L --> M[stdin传递消息]
    M --> N[IFlow CLI执行]

    N --> O[stdout/stderr输出]
    O --> P[解析JSONL事件]

    P --> Q[事件分发]
    Q --> R1[assistant事件]
    Q --> R2[result事件]
    Q --> R3[thinking事件]
    Q --> R4[tool事件]
    Q --> R5[system事件]
    Q --> R6[send_file事件]
    Q --> R7[session_end事件]

    R1 --> S[提取文本内容]
    R2 --> S
    R3 --> T[记录思考过程]
    R4 --> U[记录工具调用]
    R5 --> V[更新sessionId]
    R6 --> W[上传并发送文件]
    R7 --> X[会话结束]

    S --> Y[消息格式化]
    Y --> AA[发送到平台]
    W --> AA

    AA --> AB[钉钉Webhook<br/>QQ API]
    AB --> AC[钉钉/QQ服务器]
    AC --> AD[用户接收回复]

    T --> AD
    U --> AD
    V --> AD
    X --> AD
    Z --> AD

    style A fill:#4CAF50,color:#fff
    style D fill:#2196F3,color:#fff
    style F fill:#9C27B0,color:#fff
    style K fill:#FF9800,color:#fff
    style N fill:#f44336,color:#fff
    style S fill:#00BCD4,color:#fff
    style AA fill:#8BC34A,color:#fff
    style AD fill:#4CAF50,color:#fff
```

---

## 使用说明

这些 Mermaid 流程图可以在以下平台查看：

1. **GitHub/GitLab**：原生支持 Mermaid 渲染
2. **VS Code**：安装 "Markdown Preview Mermaid Support" 插件
3. **在线工具**：
   - https://mermaid.live/
   - https://mermaid-js.github.io/mermaid-live-editor/
4. **文档工具**：
   - Notion
   - Obsidian（安装插件）
   - Typora

### 在本地查看

```bash
# 使用 VS Code
code docs/流程图-Mermaid.md

# 或使用在线编辑器
# 复制 Mermaid 代码到 https://mermaid.live/
```

---

**生成时间：** 2026-03-07
**项目：** oprcli v1.0
**作者：** Claude Code Analysis
