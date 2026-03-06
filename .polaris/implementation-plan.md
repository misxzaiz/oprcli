# 🚀 OPRCLI 可扩展系统 - 具体实施方案

## 📋 总体方案

### 核心目标

重新定义的"自进化系统" → **可扩展插件系统**

**三大核心能力**：
1. ✅ **插件管理**：方便地添加/移除功能
2. ✅ **配置持久化**：记住用户配置
3. ✅ **上下文记忆**：跨会话共享信息

**不做的**：
- ❌ AI 自动修改代码
- ❌ 完全热加载（避免过度设计）
- ❌ 自动执行升级（保持可控）

---

## 🏗️ 架构设计

### 整体架构

```
OPRCLI Server
│
├── PluginManager (插件管理)
│   ├── 注册插件
│   ├── 加载插件
│   ├── 生成文档
│   └── 生命周期管理
│
├── ConfigManager (配置管理)
│   ├── 加载配置
│   ├── 保存配置
│   ├── 热更新配置
│   └── 配置验证
│
├── ContextMemory (上下文记忆)
│   ├── 保存上下文
│   ├── 加载上下文
│   ├── 共享上下文
│   └── 语义搜索
│
└── UpgradeSuggester (升级建议)
    ├── 分析任务
    ├── 检测模式
    ├── 生成建议
    └── 发送通知
```

### 数据流

```
用户操作
  ↓
PluginManager / ConfigManager
  ↓
持久化存储 (JSON/SQLite)
  ↓
ContextMemory (跨会话)
  ↓
下次会话自动加载
```

---

## 📁 文件结构

```
D:/space/oprcli/
│
├── plugins/                    # 🆕 插件目录
│   ├── core/                   # 核心插件
│   │   ├── plugin-manager.js
│   │   ├── config-manager.js
│   │   ├── context-memory.js
│   │   └── upgrade-suggester.js
│   │
│   ├── custom/                 # 自定义插件
│   │   └── .gitkeep
│   │
│   └── builtin/                # 内置插件
│       ├── mcp-browser.js
│       └── notification.js
│
├── config/                     # 🆕 配置目录
│   ├── default.json            # 默认配置
│   ├── user.json               # 用户配置
│   └── schema.json             # 配置 Schema
│
├── memory/                     # 🆕 记忆存储
│   ├── context.db              # 上下文数据库
│   ├── upgrades.json           # 升级记录
│   └── patterns.json           # 模式库
│
├── system-prompts/
│   ├── base.txt
│   └── docs/
│       ├── plugin-system.md    # 🆕 插件系统文档
│       ├── config-manager.md   # 🆕 配置管理文档
│       └── context-memory.md   # 🆕 上下文记忆文档
│
└── server.js                   # 修改：集成插件系统
```

---

## 🔧 实施步骤

### 阶段1：基础架构 (2天)

#### Step 1.1: 创建插件管理器

**文件**: `plugins/core/plugin-manager.js`

```javascript
const fs = require('fs').promises;
const path = require('path');

class PluginManager {
  constructor(server, logger) {
    this.server = server;
    this.logger = logger;
    this.plugins = new Map();
    this.hooks = new Map(); // 生命周期钩子
  }

  /**
   * 注册插件
   * @param {Object} plugin - 插件对象
   * @param {string} plugin.name - 插件名称
   * @param {string} plugin.version - 版本号
   * @param {string} plugin.description - 描述
   * @param {Function} plugin.init - 初始化函数
   * @param {Function} plugin.destroy - 销毁函数
   */
  async registerPlugin(plugin) {
    // 验证插件
    this.validatePlugin(plugin);

    // 初始化插件
    if (plugin.init) {
      await plugin.init(this.server);
    }

    // 注册插件
    this.plugins.set(plugin.name, {
      ...plugin,
      registeredAt: Date.now()
    });

    // 执行钩子
    await this.executeHook('plugin:registered', plugin);

    // 生成文档
    await this.generatePluginDoc(plugin);

    this.logger.success('PLUGIN', `插件已注册: ${plugin.name} v${plugin.version}`);
  }

  /**
   * 注销插件
   */
  async unregisterPlugin(name) {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`插件不存在: ${name}`);
    }

    // 销毁插件
    if (plugin.destroy) {
      await plugin.destroy(this.server);
    }

    // 移除插件
    this.plugins.delete(name);

    // 执行钩子
    await this.executeHook('plugin:unregistered', plugin);

    this.logger.info('PLUGIN', `插件已注销: ${name}`);
  }

  /**
   * 加载插件目录
   */
  async loadPluginsFromDir(dir) {
    const files = await fs.readdir(dir);

    for (const file of files) {
      if (file.endsWith('.js')) {
        try {
          const pluginPath = path.join(dir, file);
          const plugin = require(pluginPath);
          await this.registerPlugin(plugin);
        } catch (error) {
          this.logger.error('PLUGIN', `加载插件失败: ${file}`, error);
        }
      }
    }
  }

  /**
   * 获取插件
   */
  getPlugin(name) {
    return this.plugins.get(name);
  }

  /**
   * 列出所有插件
   */
  listPlugins() {
    return Array.from(this.plugins.values()).map(p => ({
      name: p.name,
      version: p.version,
      description: p.description,
      registeredAt: p.registeredAt
    }));
  }

  /**
   * 注册钩子
   */
  registerHook(hookName, callback) {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }
    this.hooks.get(hookName).push(callback);
  }

  /**
   * 执行钩子
   */
  async executeHook(hookName, data) {
    const callbacks = this.hooks.get(hookName) || [];
    for (const callback of callbacks) {
      await callback(data);
    }
  }

  /**
   * 验证插件
   */
  validatePlugin(plugin) {
    if (!plugin.name) {
      throw new Error('插件必须有 name 属性');
    }
    if (!plugin.version) {
      throw new Error('插件必须有 version 属性');
    }
    if (!plugin.description) {
      throw new Error('插件必须有 description 属性');
    }
  }

  /**
   * 生成插件文档
   */
  async generatePluginDoc(plugin) {
    const docPath = path.join(__dirname, '../../system-prompts/docs/plugins', `${plugin.name}.md`);

    const doc = `# ${plugin.name}

**版本**: ${plugin.version}
**作者**: ${plugin.author || 'Unknown'}
**描述**: ${plugin.description}

## 功能说明

${plugin.description}

## 使用方法

\`\`\`
// 在对话中使用
@${plugin.name} [参数]
\`\`\`

## API

${plugin.api ? plugin.api : '暂无文档'}

## 更新日志

- 注册时间: ${new Date(plugin.registeredAt).toLocaleString()}
`;

    await fs.writeFile(docPath, doc);

    // 更新插件索引
    await this.updatePluginIndex(plugin.name, docPath);
  }

  /**
   * 更新插件索引
   */
  async updatePluginIndex(pluginName, docPath) {
    const indexPath = path.join(__dirname, '../../system-prompts/docs/plugins/README.md');

    let index = '';
    try {
      index = await fs.readFile(indexPath, 'utf-8');
    } catch (error) {
      // 文件不存在，创建新文件
    }

    // 检查是否已存在
    if (index.includes(`- [${pluginName}]`)) {
      return;
    }

    // 添加到索引
    const newEntry = `- [${pluginName}](./${pluginName}.md): ${pluginName} 插件\n`;

    if (!index.includes('## 可用插件')) {
      index = '# 插件系统\n\n## 可用插件\n\n' + newEntry;
    } else {
      index += newEntry;
    }

    await fs.writeFile(indexPath, index);
  }
}

module.exports = PluginManager;
```

#### Step 1.2: 创建配置管理器

**文件**: `plugins/core/config-manager.js`

```javascript
const fs = require('fs').promises;
const path = require('path');

class ConfigManager {
  constructor(logger) {
    this.logger = logger;
    this.configPath = path.join(__dirname, '../../config/user.json');
    this.defaultPath = path.join(__dirname, '../../config/default.json');
    this.schemaPath = path.join(__dirname, '../../config/schema.json');

    this.config = null;
    this.watchers = new Map();
  }

  /**
   * 初始化
   */
  async init() {
    // 加载默认配置
    const defaultConfig = await this.loadDefaultConfig();

    // 加载用户配置
    const userConfig = await this.loadUserConfig();

    // 合并配置
    this.config = this.mergeConfig(defaultConfig, userConfig);

    // 验证配置
    await this.validateConfig();

    this.logger.success('CONFIG', '配置加载成功');
  }

  /**
   * 加载默认配置
   */
  async loadDefaultConfig() {
    try {
      const content = await fs.readFile(this.defaultPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      this.logger.warning('CONFIG', '默认配置不存在，使用空配置');
      return {};
    }
  }

  /**
   * 加载用户配置
   */
  async loadUserConfig() {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      this.logger.warning('CONFIG', '用户配置不存在，使用默认配置');
      return {};
    }
  }

  /**
   * 合并配置
   */
  mergeConfig(defaultConfig, userConfig) {
    return {
      ...defaultConfig,
      ...userConfig,
      // 深度合并嵌套对象
      plugins: {
        ...defaultConfig.plugins,
        ...userConfig.plugins
      },
      tasks: {
        ...defaultConfig.tasks,
        ...userConfig.tasks
      }
    };
  }

  /**
   * 验证配置
   */
  async validateConfig() {
    try {
      const schema = JSON.parse(await fs.readFile(this.schemaPath, 'utf-8'));
      // 简单验证，可以使用 ajv 等库进行更复杂的验证
      this.logger.info('CONFIG', '配置验证通过');
    } catch (error) {
      this.logger.warning('CONFIG', '配置 Schema 不存在，跳过验证');
    }
  }

  /**
   * 获取配置
   */
  get(key, defaultValue = null) {
    const keys = key.split('.');
    let value = this.config;

    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k];
      } else {
        return defaultValue;
      }
    }

    return value !== undefined ? value : defaultValue;
  }

  /**
   * 设置配置
   */
  async set(key, value) {
    const keys = key.split('.');
    let config = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!config[keys[i]]) {
        config[keys[i]] = {};
      }
      config = config[keys[i]];
    }

    config[keys[keys.length - 1]] = value;

    // 保存到文件
    await this.save();

    // 触发变更回调
    this.notifyChange(key, value);
  }

  /**
   * 保存配置
   */
  async save() {
    await fs.writeFile(
      this.configPath,
      JSON.stringify(this.config, null, 2),
      'utf-8'
    );
  }

  /**
   * 监听配置变更
   */
  watch(key, callback) {
    if (!this.watchers.has(key)) {
      this.watchers.set(key, []);
    }
    this.watchers.get(key).push(callback);
  }

  /**
   * 通知配置变更
   */
  notifyChange(key, value) {
    const callbacks = this.watchers.get(key) || [];
    callbacks.forEach(cb => cb(value));
  }

  /**
   * 添加工具配置
   */
  async addTool(toolConfig) {
    const tools = this.get('tools', []);

    // 检查是否已存在
    if (tools.find(t => t.name === toolConfig.name)) {
      throw new Error(`工具已存在: ${toolConfig.name}`);
    }

    tools.push(toolConfig);
    await this.set('tools', tools);

    this.logger.success('CONFIG', `工具已添加: ${toolConfig.name}`);
  }

  /**
   * 移除工具配置
   */
  async removeTool(toolName) {
    const tools = this.get('tools', []);
    const filtered = tools.filter(t => t.name !== toolName);

    if (filtered.length === tools.length) {
      throw new Error(`工具不存在: ${toolName}`);
    }

    await this.set('tools', filtered);

    this.logger.info('CONFIG', `工具已移除: ${toolName}`);
  }

  /**
   * 添加插件配置
   */
  async addPluginConfig(pluginName, config) {
    const plugins = this.get('plugins', {});
    plugins[pluginName] = config;

    await this.set('plugins', plugins);

    this.logger.success('CONFIG', `插件配置已添加: ${pluginName}`);
  }

  /**
   * 获取所有配置
   */
  getAll() {
    return { ...this.config };
  }
}

module.exports = ConfigManager;
```

#### Step 1.3: 创建上下文记忆

**文件**: `plugins/core/context-memory.js`

```javascript
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class ContextMemory {
  constructor(logger) {
    this.logger = logger;
    this.dbPath = path.join(__dirname, '../../memory/context.db');
    this.memory = new Map();
  }

  /**
   * 初始化
   */
  async init() {
    await this.load();
    this.logger.success('MEMORY', '上下文记忆已加载');
  }

  /**
   * 加载记忆
   */
  async load() {
    try {
      const content = await fs.readFile(this.dbPath, 'utf-8');
      const data = JSON.parse(content);

      this.memory = new Map(Object.entries(data));

      this.logger.info('MEMORY', `已加载 ${this.memory.size} 条记忆`);
    } catch (error) {
      this.logger.warning('MEMORY', '记忆数据库不存在，创建新的');
      this.memory = new Map();
    }
  }

  /**
   * 保存记忆
   */
  async save() {
    const data = Object.fromEntries(this.memory);

    await fs.writeFile(
      this.dbPath,
      JSON.stringify(data, null, 2),
      'utf-8'
    );
  }

  /**
   * 保存上下文
   */
  async set(key, value, options = {}) {
    const entry = {
      value,
      timestamp: Date.now(),
      expiresAt: options.ttl ? Date.now() + options.ttl : null,
      metadata: options.metadata || {}
    };

    this.memory.set(key, entry);

    await this.save();

    this.logger.debug('MEMORY', `记忆已保存: ${key}`);
  }

  /**
   * 获取上下文
   */
  async get(key) {
    const entry = this.memory.get(key);

    if (!entry) {
      return null;
    }

    // 检查是否过期
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      await this.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * 删除上下文
   */
  async delete(key) {
    this.memory.delete(key);
    await this.save();
  }

  /**
   * 清空所有记忆
   */
  async clear() {
    this.memory.clear();
    await this.save();
  }

  /**
   * 保存会话上下文
   */
  async saveSession(sessionId, context) {
    await this.set(`session:${sessionId}`, context, {
      ttl: 7 * 24 * 60 * 60 * 1000, // 7天
      metadata: { type: 'session' }
    });
  }

  /**
   * 获取会话上下文
   */
  async getSession(sessionId) {
    return await this.get(`session:${sessionId}`);
  }

  /**
   * 保存共享上下文
   */
  async saveSharedContext(key, value) {
    await this.set(`shared:${key}`, value, {
      metadata: { type: 'shared' }
    });
  }

  /**
   * 获取共享上下文
   */
  async getSharedContext(key) {
    return await this.get(`shared:${key}`);
  }

  /**
   * 搜索记忆
   */
  async search(pattern) {
    const results = [];

    for (const [key, entry] of this.memory.entries()) {
      if (key.includes(pattern) || JSON.stringify(entry.value).includes(pattern)) {
        results.push({
          key,
          value: entry.value,
          timestamp: entry.timestamp
        });
      }
    }

    return results;
  }

  /**
   * 列出所有记忆
   */
  async list(filter = null) {
    const items = [];

    for (const [key, entry] of this.memory.entries()) {
      if (!filter || filter(entry)) {
        items.push({
          key,
          value: entry.value,
          timestamp: entry.timestamp,
          expiresAt: entry.expiresAt
        });
      }
    }

    return items;
  }

  /**
   * 清理过期记忆
   */
  async cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.memory.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.memory.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      await this.save();
      this.logger.info('MEMORY', `已清理 ${cleaned} 条过期记忆`);
    }
  }

  /**
   * 生成唯一 ID
   */
  generateId() {
    return crypto.randomBytes(16).toString('hex');
  }
}

module.exports = ContextMemory;
```

#### Step 1.4: 集成到服务器

**文件**: `server.js` (修改)

```javascript
// ... 原有 imports

// 🆕 导入核心插件
const PluginManager = require('./plugins/core/plugin-manager');
const ConfigManager = require('./plugins/core/config-manager');
const ContextMemory = require('./plugins/core/context-memory');

class OPRCLIServer {
  constructor() {
    // ... 原有初始化

    // 🆕 初始化核心系统
    this.configManager = new ConfigManager(this.logger);
    this.pluginManager = new PluginManager(this, this.logger);
    this.contextMemory = new ContextMemory(this.logger);
  }

  /**
   * 启动服务器
   */
  async start() {
    // ... 原有启动逻辑

    // 🆕 初始化配置管理器
    await this.configManager.init();

    // 🆕 初始化上下文记忆
    await this.contextMemory.init();

    // 🆕 注册核心插件
    await this.registerCorePlugins();

    // 🆕 加载用户插件
    await this.loadUserPlugins();

    this.logger.success('SERVER', 'OPRCLI 服务器已启动');
  }

  /**
   * 注册核心插件
   */
  async registerCorePlugins() {
    // 注册配置管理器
    await this.pluginManager.registerPlugin({
      name: 'config-manager',
      version: '1.0.0',
      description: '配置管理系统',
      author: 'OPRCLI Team',
      init: async (server) => {
        server.logger.info('PLUGIN', '配置管理器已初始化');
      },
      api: {
        get: (key) => server.configManager.get(key),
        set: (key, value) => server.configManager.set(key, value),
        addTool: (config) => server.configManager.addTool(config)
      }
    });

    // 注册上下文记忆
    await this.pluginManager.registerPlugin({
      name: 'context-memory',
      version: '1.0.0',
      description: '上下文记忆系统',
      author: 'OPRCLI Team',
      init: async (server) => {
        // 定期清理过期记忆
        setInterval(() => {
          server.contextMemory.cleanup();
        }, 60 * 60 * 1000); // 每小时清理一次
      },
      api: {
        set: (key, value) => server.contextMemory.set(key, value),
        get: (key) => server.contextMemory.get(key),
        saveSession: (id, ctx) => server.contextMemory.saveSession(id, ctx)
      }
    });
  }

  /**
   * 加载用户插件
   */
  async loadUserPlugins() {
    const pluginDir = path.join(__dirname, 'plugins/custom');

    try {
      await this.pluginManager.loadPluginsFromDir(pluginDir);
    } catch (error) {
      this.logger.warning('PLUGIN', '用户插件目录不存在或为空');
    }
  }

  // ... 其他方法
}

module.exports = OPRCLIServer;
```

---

### 阶段2：配置文件 (1天)

#### Step 2.1: 创建默认配置

**文件**: `config/default.json`

```json
{
  "server": {
    "port": 13579,
    "host": "0.0.0.0"
  },
  "connectors": {
    "default": "iflow",
    "timeout": 120000
  },
  "plugins": {
    "enabled": [
      "config-manager",
      "context-memory",
      "mcp-browser",
      "notification"
    ],
    "config": {}
  },
  "tasks": {
    "concurrent": 3,
    "retryTimes": 3,
    "timeout": 300000
  },
  "tools": [],
  "memory": {
    "maxSize": 1000,
    "defaultTTL": 604800000
  }
}
```

#### Step 2.2: 创建配置 Schema

**文件**: `config/schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "server": {
      "type": "object",
      "properties": {
        "port": { "type": "number", "minimum": 1024, "maximum": 65535 },
        "host": { "type": "string" }
      }
    },
    "plugins": {
      "type": "object",
      "properties": {
        "enabled": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    }
  }
}
```

---

### 阶段3：升级建议系统 (2天)

#### Step 3.1: 创建升级建议器

**文件**: `plugins/core/upgrade-suggester.js`

```javascript
class UpgradeSuggester {
  constructor(server, logger) {
    this.server = server;
    this.logger = logger;
    this.patternsPath = './memory/patterns.json';
    this.patterns = [];
  }

  /**
   * 分析任务执行
   */
  async analyzeTask(task, result, executionLog) {
    const suggestions = [];

    // 1. 检测重复模式
    const repetitivePatterns = this.detectRepetitivePatterns(executionLog);
    if (repetitivePatterns.length > 0) {
      suggestions.push({
        type: 'automation',
        priority: 'high',
        title: '发现重复操作模式',
        description: `检测到 ${repetitivePatterns.length} 个重复操作，可以考虑自动化`,
        patterns: repetitivePatterns,
        suggestion: '创建自定义插件来自动化这些操作'
      });
    }

    // 2. 检测外部工具使用
    const externalTools = this.detectExternalTools(executionLog);
    if (externalTools.length > 0) {
      suggestions.push({
        type: 'integration',
        priority: 'medium',
        title: '可以使用集成工具',
        description: `检测到外部工具使用: ${externalTools.join(', ')}`,
        tools: externalTools,
        suggestion: '考虑将常用工具集成到系统中'
      });
    }

    // 3. 检测配置缺失
    const missingConfigs = this.detectMissingConfigs(executionLog);
    if (missingConfigs.length > 0) {
      suggestions.push({
        type: 'configuration',
        priority: 'low',
        title: '可以添加默认配置',
        description: '某些操作每次都需要输入相同参数',
        configs: missingConfigs,
        suggestion: '将这些参数保存为默认配置'
      });
    }

    // 4. 发送建议
    if (suggestions.length > 0) {
      await this.sendSuggestions(suggestions);
    }

    // 5. 保存模式
    await this.savePatterns(executionLog);

    return suggestions;
  }

  /**
   * 检测重复模式
   */
  detectRepetitivePatterns(log) {
    // 简单实现：统计命令频率
    const commands = {};

    for (const entry of log) {
      if (entry.command) {
        commands[entry.command] = (commands[entry.command] || 0) + 1;
      }
    }

    // 找出执行 3 次以上的命令
    return Object.entries(commands)
      .filter(([_, count]) => count >= 3)
      .map(([command, count]) => ({
        command,
        count,
        description: `"${command}" 执行了 ${count} 次`
      }));
  }

  /**
   * 检测外部工具使用
   */
  detectExternalTools(log) {
    const tools = new Set();

    for (const entry of log) {
      // 检测是否有调用外部命令
      if (entry.type === 'bash' && entry.command) {
        const tool = entry.command.split(' ')[0];
        if (!['node', 'npm', 'git'].includes(tool)) {
          tools.add(tool);
        }
      }
    }

    return Array.from(tools);
  }

  /**
   * 检测配置缺失
   */
  detectMissingConfigs(log) {
    const configs = [];

    // 检测是否有重复的参数
    const params = {};

    for (const entry of log) {
      if (entry.params) {
        const key = JSON.stringify(entry.params);
        params[key] = (params[key] || 0) + 1;
      }
    }

    return Object.entries(params)
      .filter(([_, count]) => count >= 3)
      .map(([params, _]) => ({
        params: JSON.parse(params),
        description: '重复使用的参数'
      }));
  }

  /**
   * 发送建议
   */
  async sendSuggestions(suggestions) {
    const message = this.formatSuggestions(suggestions);

    // 通过钉钉发送
    if (this.server.dingTalkIntegration) {
      await this.server.dingTalkIntegration.sendMessage(message);
    }

    this.logger.info('SUGGESTION', `已发送 ${suggestions.length} 条建议`);
  }

  /**
   * 格式化建议
   */
  formatSuggestions(suggestions) {
    let text = '💡 系统优化建议\n\n';

    for (const suggestion of suggestions) {
      text += `### ${suggestion.title}\n`;
      text += `${suggestion.description}\n`;
      text += `💡 建议: ${suggestion.suggestion}\n`;
      text += `优先级: ${suggestion.priority}\n\n`;
    }

    text += '\n回复 "应用建议 [编号]" 来应用这些建议';
    text += '\n回复 "忽略建议 [编号]" 来忽略';

    return text;
  }

  /**
   * 保存模式
   */
  async savePatterns(log) {
    // 保存到模式库
    const newPatterns = this.extractPatterns(log);

    this.patterns.push(...newPatterns);

    // 持久化
    const fs = require('fs').promises;
    await fs.writeFile(
      this.patternsPath,
      JSON.stringify(this.patterns, null, 2),
      'utf-8'
    );
  }

  /**
   * 提取模式
   */
  extractPatterns(log) {
    // 简单实现：提取命令序列
    const patterns = [];

    for (let i = 0; i < log.length - 1; i++) {
      if (log[i].command && log[i + 1].command) {
        patterns.push({
          from: log[i].command,
          to: log[i + 1].command,
          count: 1
        });
      }
    }

    return patterns;
  }
}

module.exports = UpgradeSuggester;
```

---

### 阶段4：文档系统 (1天)

#### Step 4.1: 创建文档

**文件**: `system-prompts/docs/plugin-system.md`

```markdown
# 插件系统

OPRCLI 支持强大的插件系统，可以方便地扩展功能。

## 核心插件

### 1. 配置管理器 (config-manager)

管理系统的所有配置。

**使用方法**：
\`\`\`
# 查看配置
@config-manager get server.port

# 设置配置
@config-manager set server.port 8080

# 添加工具
@config-manager addTool '{"name": "my-tool", "path": "/path/to/tool"}'
\`\`\`

### 2. 上下文记忆 (context-memory)

跨会话保存和共享上下文信息。

**使用方法**：
\`\`\`
# 保存上下文
@context-memory set my-key "some value"

# 获取上下文
@context-memory get my-key

# 保存会话
@context-memory saveSession session-id {...}
\`\`\`

## 自定义插件

### 插件结构

\`\`\`javascript
// plugins/custom/my-plugin.js

module.exports = {
  name: 'my-plugin',
  version: '1.0.0',
  description: '我的自定义插件',
  author: 'Your Name',

  // 初始化函数
  init: async (server) => {
    server.logger.info('PLUGIN', 'My plugin initialized');
  },

  // 销毁函数
  destroy: async (server) => {
    server.logger.info('PLUGIN', 'My plugin destroyed');
  },

  // API 文档
  api: {
    myFunction: '说明'
  }
};
\`\`\`

### 注册插件

将插件文件放到 `plugins/custom/` 目录，服务器启动时会自动加载。

或者使用 API：

\`\`\`javascript
await server.pluginManager.registerPlugin(myPlugin);
\`\`\`
```

---

## 📊 实施时间表

| 阶段 | 任务 | 时间 | 负责人 |
|------|------|------|--------|
| **阶段1** | 基础架构 | 2天 | |
| 1.1 | 创建 PluginManager | 0.5天 | |
| 1.2 | 创建 ConfigManager | 0.5天 | |
| 1.3 | 创建 ContextMemory | 0.5天 | |
| 1.4 | 集成到服务器 | 0.5天 | |
| **阶段2** | 配置系统 | 1天 | |
| 2.1 | 创建配置文件 | 0.5天 | |
| 2.2 | 配置验证 | 0.5天 | |
| **阶段3** | 升级建议 | 2天 | |
| 3.1 | 创建 UpgradeSuggester | 1天 | |
| 3.2 | 集成到 TaskManager | 0.5天 | |
| 3.3 | 测试和调优 | 0.5天 | |
| **阶段4** | 文档系统 | 1天 | |
| 4.1 | 创建用户文档 | 0.5天 | |
| 4.2 | 更新系统提示词 | 0.5天 | |
| **总计** | | **6天** | |

---

## ✅ 验收标准

### 功能验收

- [ ] 可以成功注册插件
- [ ] 可以动态加载/卸载插件
- [ ] 配置可以热更新
- [ ] 上下文可以跨会话共享
- [ ] 升级建议可以正常发送
- [ ] 文档自动生成

### 性能验收

- [ ] 插件加载时间 < 1秒
- [ ] 配置更新延迟 < 100ms
- [ ] 上下文读写延迟 < 50ms
- [ ] 内存占用增加 < 50MB

### 稳定性验收

- [ ] 插件错误不影响主系统
- [ ] 配置错误有友好提示
- [ ] 上下文过期自动清理
- [ ] 所有操作有日志记录

---

## 🎯 总结

### 核心价值

1. **可扩展性**：通过插件系统轻松扩展功能
2. **持久化**：配置和上下文自动保存
3. **智能化**：系统主动建议优化方向
4. **可控性**：用户决定是否应用建议

### 技术亮点

- 模块化设计
- 事件驱动架构
- 生命周期管理
- 自动文档生成

### 后续优化

- [ ] 插件市场
- [ ] 依赖管理
- [ ] 版本控制
- [ ] 灰度发布

---

**方案制定时间**: 2026-03-05
**预计完成时间**: 2026-03-11
**负责团队**: OPRCLI 开发组
