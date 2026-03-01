# Claude Connector

独立的 Node.js 模块，提供 Web 界面与 Claude Code CLI 交互。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动 Web 界面

```bash
npm run web
```

访问：http://localhost:3000

### 3. 填写配置并连接

```
Claude CMD 路径: C:\Users\YourName\AppData\Roaming\npm\claude.cmd
工作目录: D:\MyProject
Git Bash 路径: C:\Program Files\Git\bin\bash.exe
```

点击"连接到 Claude Code"，开始对话！

## 作为模块使用

```javascript
const ClaudeConnector = require('./claude-connector');

const connector = new ClaudeConnector();
await connector.connect();

await connector.startSession('Hello!', {
  onEvent: (event) => {
    if (event.type === 'assistant') {
      const text = event.message.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('');
      console.log(text);
    }
  }
});
```

## 配置文件

创建 `.claude-connector.json`：

```json
{
  "claudeCmdPath": "C:\\Users\\...\\claude.cmd",
  "workDir": "D:\\MyProject",
  "gitBinPath": "C:\\Program Files\\Git\\bin\\bash.exe"
}
```

## API 文档

详见 [API.md](API.md)

## 测试

```bash
npm test
```

## 项目结构

```
├── claude-connector.js    # 核心连接器
├── web-server.js          # Web 服务器
├── public/
│   └── index.html         # Web 界面
├── test-simple.js         # 简单测试
└── API.md                 # API 文档
```

## 注意事项

- 不能在 Claude Code 内部运行（嵌套会话限制）
- 需要独立终端运行测试
- Windows 路径使用双反斜杠或正斜杠

## License

MIT
