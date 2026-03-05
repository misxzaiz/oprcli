const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

/**
 * 配置管理器
 * 负责系统配置的加载、保存、热更新和验证
 *
 * 🆕 新增功能（2026-03-05 自动升级优化）：
 * - 文件监听和自动重载
 * - 防抖机制避免频繁重载
 * - 配置变更通知
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

    // 🆕 热重载相关
    this.fileWatcher = null;
    this.reloadTimer = null;
    this.reloadDebounceMs = 1000; // 防抖延迟 1 秒
    this.isReloading = false;
    this.reloadCount = 0;
    this.lastReloadTime = null;
    this.changeListeners = []; // 🆕 配置变更监听器
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

  // ==================== 🆕 热重载功能 ====================

  /**
   * 启动文件监听（热重载）
   */
  startWatch() {
    try {
      // 先检查文件是否存在
      if (!fsSync.existsSync(this.configPath)) {
        this.logger.warning('CONFIG', '配置文件不存在，将在创建后启动监听');
        // 延迟启动，等待文件创建
        setTimeout(() => this.startWatch(), 5000);
        return;
      }

      // 使用 fs.watch 监听文件变化
      this.fileWatcher = fsSync.watch(this.configPath, (eventType, filename) => {
        if (eventType === 'change') {
          this.handleFileChange();
        }
      });

      this.logger.success('CONFIG', '✓ 配置文件监听已启动（支持热重载）');
    } catch (error) {
      this.logger.error('CONFIG', '启动文件监听失败', error);
      // 降级方案：使用定时轮询
      this.startPolling();
    }
  }

  /**
   * 停止文件监听
   */
  stopWatch() {
    try {
      if (this.fileWatcher) {
        this.fileWatcher.close();
        this.fileWatcher = null;
        this.logger.info('CONFIG', '配置文件监听已停止');
      }

      // 清除防抖定时器
      if (this.reloadTimer) {
        clearTimeout(this.reloadTimer);
        this.reloadTimer = null;
      }

      // 停止轮询（如果正在使用）
      if (this.pollingTimer) {
        clearInterval(this.pollingTimer);
        this.pollingTimer = null;
      }
    } catch (error) {
      this.logger.error('CONFIG', '停止监听失败', error);
    }
  }

  /**
   * 处理文件变化（带防抖）
   */
  handleFileChange() {
    // 清除之前的定时器（防抖）
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
    }

    // 设置新的定时器
    this.reloadTimer = setTimeout(() => {
      this.debouncedReload();
    }, this.reloadDebounceMs);

    this.logger.debug('CONFIG', '检测到配置文件变化，准备重载...');
  }

  /**
   * 防抖重载配置
   */
  async debouncedReload() {
    // 防止重载中重复触发
    if (this.isReloading) {
      this.logger.warning('CONFIG', '配置重载中，跳过本次重载');
      return;
    }

    this.isReloading = true;
    const oldConfig = JSON.stringify(this.config);

    try {
      this.logger.info('CONFIG', '🔄 正在自动重载配置...');

      // 读取文件修改时间和大小
      const stats = await fs.stat(this.configPath);
      const fileInfo = {
        size: stats.size,
        modifiedTime: stats.mtime,
        modifiedTimeISO: stats.mtime.toISOString()
      };

      // 执行重载
      await this.reload();

      // 记录统计
      this.reloadCount++;
      this.lastReloadTime = new Date();

      const newConfig = JSON.stringify(this.config);
      const hasChanged = oldConfig !== newConfig;

      // 通知监听器
      this.notifyConfigChange({
        hasChanged,
        fileInfo,
        reloadCount: this.reloadCount,
        timestamp: this.lastReloadTime
      });

      if (hasChanged) {
        this.logger.success('CONFIG', `✓ 配置自动重载成功（第 ${this.reloadCount} 次）`);
      } else {
        this.logger.info('CONFIG', '配置内容未变化，跳过更新');
      }
    } catch (error) {
      this.logger.error('CONFIG', '自动重载配置失败', error);
      // 通知监听器重载失败
      this.notifyConfigChange({
        hasChanged: false,
        error: error.message,
        timestamp: new Date()
      });
    } finally {
      this.isReloading = false;
      this.reloadTimer = null;
    }
  }

  /**
   * 启动轮询模式（降级方案）
   */
  startPolling() {
    this.logger.warning('CONFIG', '使用轮询模式（降级方案）');

    let lastMtime = null;

    this.pollingTimer = setInterval(async () => {
      try {
        const stats = await fs.stat(this.configPath);

        if (lastMtime && stats.mtime > lastMtime) {
          this.handleFileChange();
        }

        lastMtime = stats.mtime;
      } catch (error) {
        // 文件不存在，忽略
      }
    }, 5000); // 每 5 秒检查一次
  }

  /**
   * 添加配置变更监听器
   * @param {Function} callback - 回调函数，接收变更信息对象
   */
  addChangeListener(callback) {
    if (typeof callback === 'function') {
      this.changeListeners.push(callback);
      this.logger.debug('CONFIG', '✓ 已添加配置变更监听器');
    }
  }

  /**
   * 移除配置变更监听器
   */
  removeChangeListener(callback) {
    const index = this.changeListeners.indexOf(callback);
    if (index >= 0) {
      this.changeListeners.splice(index, 1);
      this.logger.debug('CONFIG', '✓ 已移除配置变更监听器');
    }
  }

  /**
   * 通知配置变更
   */
  notifyConfigChange(changeInfo) {
    for (const listener of this.changeListeners) {
      try {
        listener(changeInfo);
      } catch (error) {
        this.logger.error('CONFIG', '配置变更监听器执行失败', error);
      }
    }
  }

  /**
   * 获取重载统计信息
   */
  getReloadStats() {
    return {
      reloadCount: this.reloadCount,
      lastReloadTime: this.lastReloadTime,
      isReloading: this.isReloading,
      isWatching: !!this.fileWatcher || !!this.pollingTimer,
      changeListeners: this.changeListeners.length
    };
  }

  /**
   * 手动触发重载（用于测试）
   */
  async triggerReload() {
    this.logger.info('CONFIG', '手动触发配置重载');
    await this.debouncedReload();
  }
}

module.exports = ConfigManager;
