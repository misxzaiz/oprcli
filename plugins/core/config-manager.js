const fs = require('fs').promises;
const path = require('path');

/**
 * 配置管理器
 * 负责系统配置的加载、保存、热更新和验证
 */
class ConfigManager {
  constructor(logger) {
    this.logger = logger;
    this.configPath = path.join(__dirname, '../../config/user.json');
    this.defaultPath = path.join(__dirname, '../../config/default.json');
    this.schemaPath = path.join(__dirname, '../../config/schema.json');

    this.config = null;
    this.watchers = new Map();
    this.defaultConfig = null;
  }

  /**
   * 初始化
   */
  async init() {
    try {
      // 加载默认配置
      this.defaultConfig = await this.loadDefaultConfig();

      // 加载用户配置
      const userConfig = await this.loadUserConfig();

      // 合并配置
      this.config = this.mergeConfig(this.defaultConfig, userConfig);

      // 验证配置
      await this.validateConfig();

      this.logger.success('CONFIG', '✓ 配置加载成功');
      return true;
    } catch (error) {
      this.logger.error('CONFIG', '配置初始化失败', error);
      throw error;
    }
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
      return this.getDefaultConfig();
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
      this.logger.info('CONFIG', '用户配置不存在，将创建新配置');
      return {};
    }
  }

  /**
   * 获取内置的默认配置
   */
  getDefaultConfig() {
    return {
      server: {
        port: 13579,
        host: '0.0.0.0'
      },
      connectors: {
        default: 'iflow',
        timeout: 120000
      },
      plugins: {
        enabled: ['config-manager', 'context-memory', 'mcp-browser'],
        config: {}
      },
      tasks: {
        concurrent: 3,
        retryTimes: 3,
        timeout: 300000
      },
      tools: [],
      memory: {
        maxSize: 1000,
        defaultTTL: 604800000
      }
    };
  }

  /**
   * 合并配置
   */
  mergeConfig(defaultConfig, userConfig) {
    const merged = { ...defaultConfig };

    for (const key in userConfig) {
      if (typeof userConfig[key] === 'object' && !Array.isArray(userConfig[key])) {
        merged[key] = {
          ...merged[key],
          ...userConfig[key]
        };
      } else {
        merged[key] = userConfig[key];
      }
    }

    return merged;
  }

  /**
   * 验证配置
   */
  async validateConfig() {
    try {
      // 简单验证
      if (!this.config.server) {
        throw new Error('缺少 server 配置');
      }
      if (!this.config.server.port) {
        throw new Error('缺少 server.port 配置');
      }

      // 检查端口范围
      if (this.config.server.port < 1024 || this.config.server.port > 65535) {
        throw new Error('端口号必须在 1024-65535 之间');
      }

      this.logger.debug('CONFIG', '✓ 配置验证通过');
    } catch (error) {
      this.logger.error('CONFIG', '配置验证失败', error);
      throw error;
    }
  }

  /**
   * 获取配置
   * @param {string} key - 配置键，支持点号分隔的路径，如 'server.port'
   * @param {any} defaultValue - 默认值
   */
  get(key, defaultValue = null) {
    try {
      const keys = key.split('.');
      let value = this.config;

      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = value[k];
        } else {
          return defaultValue;
        }
      }

      return value !== undefined ? value : defaultValue;
    } catch (error) {
      this.logger.error('CONFIG', `获取配置失败: ${key}`, error);
      return defaultValue;
    }
  }

  /**
   * 设置配置
   * @param {string} key - 配置键
   * @param {any} value - 配置值
   */
  async set(key, value) {
    try {
      const keys = key.split('.');
      let config = this.config;

      // 导航到父对象
      for (let i = 0; i < keys.length - 1; i++) {
        if (!config[keys[i]] || typeof config[keys[i]] !== 'object') {
          config[keys[i]] = {};
        }
        config = config[keys[i]];
      }

      // 设置值
      config[keys[keys.length - 1]] = value;

      // 保存到文件
      await this.save();

      // 触发变更回调
      this.notifyChange(key, value);

      this.logger.debug('CONFIG', `✓ 配置已更新: ${key} = ${JSON.stringify(value)}`);
      return true;
    } catch (error) {
      this.logger.error('CONFIG', `设置配置失败: ${key}`, error);
      throw error;
    }
  }

  /**
   * 批量设置配置
   */
  async setMultiple(updates) {
    try {
      for (const [key, value] of Object.entries(updates)) {
        await this.set(key, value);
      }

      this.logger.success('CONFIG', `✓ 批量更新了 ${Object.keys(updates).length} 个配置项`);
      return true;
    } catch (error) {
      this.logger.error('CONFIG', '批量设置配置失败', error);
      throw error;
    }
  }

  /**
   * 保存配置
   */
  async save() {
    try {
      // 确保目录存在
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });

      // 保存配置（格式化输出）
      await fs.writeFile(
        this.configPath,
        JSON.stringify(this.config, null, 2),
        'utf-8'
      );

      this.logger.debug('CONFIG', '✓ 配置已保存');
    } catch (error) {
      this.logger.error('CONFIG', '保存配置失败', error);
      throw error;
    }
  }

  /**
   * 重载配置
   */
  async reload() {
    this.logger.info('CONFIG', '正在重载配置...');

    try {
      // 重新加载用户配置
      const userConfig = await this.loadUserConfig();

      // 合并配置
      this.config = this.mergeConfig(this.defaultConfig, userConfig);

      // 验证配置
      await this.validateConfig();

      this.logger.success('CONFIG', '✓ 配置重载成功');
      return true;
    } catch (error) {
      this.logger.error('CONFIG', '配置重载失败', error);
      throw error;
    }
  }

  /**
   * 重置为默认配置
   */
  async reset() {
    this.logger.warning('CONFIG', '正在重置为默认配置...');

    try {
      this.config = { ...this.defaultConfig };
      await this.save();

      this.logger.success('CONFIG', '✓ 配置已重置');
      return true;
    } catch (error) {
      this.logger.error('CONFIG', '配置重置失败', error);
      throw error;
    }
  }

  /**
   * 监听配置变更
   */
  watch(key, callback) {
    if (!this.watchers.has(key)) {
      this.watchers.set(key, []);
    }
    this.watchers.get(key).push(callback);

    this.logger.debug('CONFIG', `✓ 已监听配置变更: ${key}`);
  }

  /**
   * 取消监听
   */
  unwatch(key, callback) {
    if (!this.watchers.has(key)) {
      return;
    }

    const callbacks = this.watchers.get(key);
    const index = callbacks.indexOf(callback);

    if (index >= 0) {
      callbacks.splice(index, 1);
    }

    if (callbacks.length === 0) {
      this.watchers.delete(key);
    }
  }

  /**
   * 通知配置变更
   */
  notifyChange(key, value) {
    const callbacks = this.watchers.get(key) || [];

    for (const callback of callbacks) {
      try {
        callback(value, key);
      } catch (error) {
        this.logger.error('CONFIG', `配置变更回调执行失败: ${key}`, error);
      }
    }
  }

  /**
   * 添加工具配置
   */
  async addTool(toolConfig) {
    try {
      const tools = this.get('tools', []);

      // 检查是否已存在
      if (tools.find(t => t.name === toolConfig.name)) {
        throw new Error(`工具已存在: ${toolConfig.name}`);
      }

      // 验证工具配置
      if (!toolConfig.name) {
        throw new Error('工具配置必须有 name 属性');
      }

      tools.push(toolConfig);
      await this.set('tools', tools);

      this.logger.success('CONFIG', `✓ 工具已添加: ${toolConfig.name}`);
      return true;
    } catch (error) {
      this.logger.error('CONFIG', '添加工具失败', error);
      throw error;
    }
  }

  /**
   * 移除工具配置
   */
  async removeTool(toolName) {
    try {
      const tools = this.get('tools', []);
      const filtered = tools.filter(t => t.name !== toolName);

      if (filtered.length === tools.length) {
        throw new Error(`工具不存在: ${toolName}`);
      }

      await this.set('tools', filtered);

      this.logger.info('CONFIG', `✓ 工具已移除: ${toolName}`);
      return true;
    } catch (error) {
      this.logger.error('CONFIG', '移除工具失败', error);
      throw error;
    }
  }

  /**
   * 添加插件配置
   */
  async addPluginConfig(pluginName, config) {
    try {
      const plugins = this.get('plugins.config', {});
      plugins[pluginName] = config;

      await this.set('plugins.config', plugins);

      this.logger.success('CONFIG', `✓ 插件配置已添加: ${pluginName}`);
      return true;
    } catch (error) {
      this.logger.error('CONFIG', '添加插件配置失败', error);
      throw error;
    }
  }

  /**
   * 获取插件配置
   */
  getPluginConfig(pluginName) {
    return this.get(`plugins.config.${pluginName}`, {});
  }

  /**
   * 获取所有配置
   */
  getAll() {
    return { ...this.config };
  }

  /**
   * 导出配置
   */
  export() {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * 导入配置
   */
  async import(configString) {
    try {
      const config = JSON.parse(configString);

      // 验证配置
      this.config = config;
      await this.validateConfig();

      // 保存配置
      await this.save();

      this.logger.success('CONFIG', '✓ 配置导入成功');
      return true;
    } catch (error) {
      this.logger.error('CONFIG', '配置导入失败', error);
      throw error;
    }
  }

  /**
   * 获取配置统计信息
   */
  getStats() {
    return {
      configPath: this.configPath,
      keys: this.countKeys(this.config),
      watchers: this.watchers.size,
      size: JSON.stringify(this.config).length
    };
  }

  /**
   * 计算配置键的数量
   */
  countKeys(obj, count = 0) {
    for (const key in obj) {
      count++;
      if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        count = this.countKeys(obj[key], count);
      }
    }
    return count;
  }
}

module.exports = ConfigManager;
