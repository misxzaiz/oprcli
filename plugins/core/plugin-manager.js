const fs = require('fs').promises;
const path = require('path');

/**
 * 插件管理器
 * 负责插件的注册、加载、卸载和生命周期管理
 */
class PluginManager {
  constructor(server, logger) {
    this.server = server;
    this.logger = logger;
    this.plugins = new Map();
    this.hooks = new Map();
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
    try {
      // 验证插件
      this.validatePlugin(plugin);

      // 检查是否已注册
      if (this.plugins.has(plugin.name)) {
        this.logger.warning('PLUGIN', `插件已存在，将覆盖: ${plugin.name}`);
        await this.unregisterPlugin(plugin.name);
      }

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

      this.logger.success('PLUGIN', `✓ 插件已注册: ${plugin.name} v${plugin.version}`);
      return true;
    } catch (error) {
      this.logger.error('PLUGIN', `插件注册失败: ${plugin.name}`, error);
      throw error;
    }
  }

  /**
   * 注销插件
   */
  async unregisterPlugin(name) {
    try {
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

      this.logger.info('PLUGIN', `✓ 插件已注销: ${name}`);
      return true;
    } catch (error) {
      this.logger.error('PLUGIN', `插件注销失败: ${name}`, error);
      throw error;
    }
  }

  /**
   * 加载插件目录
   */
  async loadPluginsFromDir(dir) {
    try {
      const files = await fs.readdir(dir);
      let loaded = 0;

      for (const file of files) {
        if (file.endsWith('.js') && !file.startsWith('.')) {
          try {
            const pluginPath = path.join(dir, file);
            delete require.cache[require.resolve(pluginPath)];
            const plugin = require(pluginPath);
            await this.registerPlugin(plugin);
            loaded++;
          } catch (error) {
            this.logger.error('PLUGIN', `加载插件失败: ${file}`, error.message);
          }
        }
      }

      if (loaded > 0) {
        this.logger.success('PLUGIN', `从 ${dir} 加载了 ${loaded} 个插件`);
      }

      return loaded;
    } catch (error) {
      this.logger.error('PLUGIN', `加载插件目录失败: ${dir}`, error);
      return 0;
    }
  }

  /**
   * 获取插件
   */
  getPlugin(name) {
    return this.plugins.get(name);
  }

  /**
   * 检查插件是否存在
   */
  hasPlugin(name) {
    return this.plugins.has(name);
  }

  /**
   * 列出所有插件
   */
  listPlugins() {
    return Array.from(this.plugins.values()).map(p => ({
      name: p.name,
      version: p.version,
      description: p.description,
      author: p.author || 'Unknown',
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
      try {
        await callback(data);
      } catch (error) {
        this.logger.error('PLUGIN', `钩子执行失败: ${hookName}`, error);
      }
    }
  }

  /**
   * 验证插件
   */
  validatePlugin(plugin) {
    if (!plugin || typeof plugin !== 'object') {
      throw new Error('插件必须是一个对象');
    }
    if (!plugin.name || typeof plugin.name !== 'string') {
      throw new Error('插件必须有 name 属性（字符串）');
    }
    if (!plugin.version || typeof plugin.version !== 'string') {
      throw new Error('插件必须有 version 属性（字符串）');
    }
    if (!plugin.description || typeof plugin.description !== 'string') {
      throw new Error('插件必须有 description 属性（字符串）');
    }

    // 检查插件名称是否合法
    if (!/^[a-z0-9-]+$/.test(plugin.name)) {
      throw new Error('插件名称只能包含小写字母、数字和连字符');
    }
  }

  /**
   * 生成插件文档
   */
  async generatePluginDoc(plugin) {
    try {
      const docsDir = path.join(__dirname, '../../system-prompts/docs/plugins');

      // 确保目录存在
      await fs.mkdir(docsDir, { recursive: true });

      const docPath = path.join(docsDir, `${plugin.name}.md`);

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

${this.formatAPI(plugin.api)}

## 配置选项

${this.formatConfig(plugin.config)}

## 更新日志

- 注册时间: ${new Date().toLocaleString('zh-CN')}
`;

      await fs.writeFile(docPath, doc, 'utf-8');

      // 更新插件索引
      await this.updatePluginIndex(plugin.name, docsDir);

      this.logger.debug('PLUGIN', `文档已生成: ${plugin.name}.md`);
    } catch (error) {
      this.logger.warning('PLUGIN', `生成文档失败: ${plugin.name}`, error.message);
    }
  }

  /**
   * 格式化 API 文档
   */
  formatAPI(api) {
    if (!api || typeof api !== 'object') {
      return '暂无 API 文档';
    }

    let text = '';
    for (const [key, value] of Object.entries(api)) {
      text += `- \`${key}\`: ${value}\n`;
    }

    return text || '暂无 API 文档';
  }

  /**
   * 格式化配置文档
   */
  formatConfig(config) {
    if (!config || typeof config !== 'object') {
      return '无配置选项';
    }

    let text = '';
    for (const [key, value] of Object.entries(config)) {
      text += `- \`${key}\`: ${value}\n`;
    }

    return text || '无配置选项';
  }

  /**
   * 更新插件索引
   */
  async updatePluginIndex(pluginName, docsDir) {
    const indexPath = path.join(docsDir, 'README.md');

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
    const plugin = this.plugins.get(pluginName);
    const newEntry = `- [${pluginName}](./${pluginName}.md): ${plugin.description}\n`;

    if (!index.includes('## 可用插件')) {
      index = '# 插件系统\n\n本系统支持以下插件：\n\n## 可用插件\n\n' + newEntry;
    } else {
      // 在"可用插件"部分之后添加
      const lines = index.split('\n');
      const insertIndex = lines.findIndex(line => line.startsWith('##'));

      if (insertIndex >= 0) {
        lines.splice(insertIndex + 2, 0, newEntry);
        index = lines.join('\n');
      } else {
        index += newEntry;
      }
    }

    await fs.writeFile(indexPath, index, 'utf-8');
  }

  /**
   * 获取插件统计信息
   */
  getStats() {
    return {
      total: this.plugins.size,
      plugins: this.listPlugins(),
      hooks: Array.from(this.hooks.keys()).map(name => ({
        name,
        callbacks: this.hooks.get(name).length
      }))
    };
  }
}

module.exports = PluginManager;
