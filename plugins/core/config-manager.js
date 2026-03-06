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

      // 🆕 ISS-026: 先验证文件格式，验证失败时保留旧配置
      const validationResult = await this._validateConfigFile();
      if (!validationResult.valid) {
        this.logger.error('CONFIG', '配置文件验证失败，重载已中止', {
          errors: validationResult.errors
        });
        // 通知监听器验证失败
        this.notifyConfigChange({
          hasChanged: false,
          error: '配置文件验证失败: ' + validationResult.errors.join(', '),
          timestamp: new Date()
        });
        return;
      }

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

  // ==================== 🆕 配置备份和历史（2026-03-05 优化） ====================

  /**
   * 备份当前配置
   */
  async backup(backupName = null) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const name = backupName || `backup-${timestamp}`;
      const backupPath = path.join(path.dirname(this.configPath), `backups/${name}.json`);

      // 预估配置文件大小（JSON 格式化后约 2 倍）
      const configContent = JSON.stringify(this.config, null, 2);
      const estimatedSize = Buffer.byteLength(configContent, 'utf-8');

      // 确保备份目录存在
      await fs.mkdir(path.dirname(backupPath), { recursive: true });

      // 验证目录可写性（尝试写入临时文件）
      const testPath = backupPath + '.tmp';
      try {
        await fs.writeFile(testPath, 'test', 'utf-8');
        await fs.unlink(testPath);
      } catch (writeError) {
        throw new Error(`备份目录不可写: ${writeError.message}`);
      }

      // 创建备份
      await fs.writeFile(backupPath, configContent, 'utf-8');

      this.logger.success('CONFIG', `✓ 配置已备份: ${name} (${estimatedSize} 字节)`);
      return { success: true, backupPath, name, size: estimatedSize };
    } catch (error) {
      this.logger.error('CONFIG', '配置备份失败', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 列出所有备份
   */
  async listBackups() {
    try {
      const backupDir = path.join(path.dirname(this.configPath), 'backups');

      // 检查备份目录是否存在
      try {
        await fs.access(backupDir);
      } catch {
        return []; // 目录不存在，返回空列表
      }

      const files = await fs.readdir(backupDir);
      const backups = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(backupDir, file);
          const stats = await fs.stat(filePath);

          backups.push({
            name: file.replace('.json', ''),
            path: filePath,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime
          });
        }
      }

      // 按创建时间排序（最新的在前）
      backups.sort((a, b) => b.created - a.created);

      return backups;
    } catch (error) {
      this.logger.error('CONFIG', '列出备份失败', error);
      return [];
    }
  }

  /**
   * 恢复备份
   */
  async restoreBackup(backupName) {
    try {
      const backupPath = path.join(
        path.dirname(this.configPath),
        `backups/${backupName}.json`
      );

      // 读取备份文件
      const content = await fs.readFile(backupPath, 'utf-8');
      const backupConfig = JSON.parse(content);

      // 验证备份配置
      this.config = backupConfig;
      await this.validateConfig();

      // 保存为当前配置
      await this.save();

      this.logger.success('CONFIG', `✓ 配置已从备份恢复: ${backupName}`);
      return { success: true };
    } catch (error) {
      this.logger.error('CONFIG', '恢复备份失败', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 删除备份
   */
  async deleteBackup(backupName) {
    try {
      const backupPath = path.join(
        path.dirname(this.configPath),
        `backups/${backupName}.json`
      );

      await fs.unlink(backupPath);

      this.logger.info('CONFIG', `✓ 备份已删除: ${backupName}`);
      return { success: true };
    } catch (error) {
      this.logger.error('CONFIG', '删除备份失败', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 清理旧备份（保留最新的N个）
   */
  async cleanOldBackups(keepCount = 10) {
    try {
      const backups = await this.listBackups();

      if (backups.length <= keepCount) {
        this.logger.info('CONFIG', `备份数量未超限（${backups.length}/${keepCount}），无需清理`);
        return { success: true, deleted: 0 };
      }

      // 删除多余的备份
      const toDelete = backups.slice(keepCount);
      let deletedCount = 0;

      for (const backup of toDelete) {
        const result = await this.deleteBackup(backup.name);
        if (result.success) {
          deletedCount++;
        }
      }

      this.logger.success('CONFIG', `✓ 已清理 ${deletedCount} 个旧备份（保留 ${keepCount} 个）`);
      return { success: true, deleted: deletedCount };
    } catch (error) {
      this.logger.error('CONFIG', '清理旧备份失败', error);
      return { success: false, error: error.message, deleted: 0 };
    }
  }

  // ==================== 🆕 配置验证增强（2026-03-05 优化） ====================

  /**
   * 深度验证配置（增强版）
   */
  async validateConfigDeep() {
    const errors = [];
    const warnings = [];

    try {
      // 基本验证
      if (!this.config.server) {
        errors.push('缺少 server 配置');
      } else {
        if (!this.config.server.port) {
          errors.push('缺少 server.port 配置');
        } else if (this.config.server.port < 1024 || this.config.server.port > 65535) {
          errors.push('端口号必须在 1024-65535 之间');
        }

        if (this.config.server.host) {
          // 验证主机地址格式
          const hostPattern = /^(\*|[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}|[a-zA-Z0-9.-]+)$/;
          if (!hostPattern.test(this.config.server.host)) {
            warnings.push('server.host 格式可能不正确');
          }
        }
      }

      // 连接器配置验证
      if (this.config.connectors) {
        if (!this.config.connectors.default) {
          warnings.push('未设置默认连接器');
        } else if (!['claude', 'iflow'].includes(this.config.connectors.default)) {
          errors.push('不支持的连接器类型: ' + this.config.connectors.default);
        }

        if (this.config.connectors.timeout) {
          if (this.config.connectors.timeout < 1000 || this.config.connectors.timeout > 600000) {
            warnings.push('连接器超时时间建议在 1-600 秒之间');
          }
        }
      }

      // 插件配置验证
      if (this.config.plugins) {
        if (this.config.plugins.enabled && !Array.isArray(this.config.plugins.enabled)) {
          errors.push('plugins.enabled 必须是数组');
        }

        if (this.config.plugins.config && typeof this.config.plugins.config !== 'object') {
          errors.push('plugins.config 必须是对象');
        }
      }

      // 任务配置验证
      if (this.config.tasks) {
        if (this.config.tasks.concurrent) {
          if (this.config.tasks.concurrent < 1 || this.config.tasks.concurrent > 10) {
            warnings.push('并发任务数建议在 1-10 之间');
          }
        }

        if (this.config.tasks.retryTimes) {
          if (this.config.tasks.retryTimes < 0 || this.config.tasks.retryTimes > 10) {
            warnings.push('重试次数建议在 0-10 之间');
          }
        }
      }

      // 内存配置验证
      if (this.config.memory) {
        if (this.config.memory.maxSize) {
          if (this.config.memory.maxSize < 100 || this.config.memory.maxSize > 10000) {
            warnings.push('内存最大条目数建议在 100-10000 之间');
          }
        }

        if (this.config.memory.defaultTTL) {
          // 默认7天
          const oneWeek = 7 * 24 * 60 * 60 * 1000;
          if (this.config.memory.defaultTTL > oneWeek) {
            warnings.push('默认 TTL 过长，建议不超过 7 天');
          }
        }
      }

      // 生成验证报告
      const report = {
        valid: errors.length === 0,
        errors,
        warnings,
        timestamp: new Date().toISOString()
      };

      if (errors.length > 0) {
        this.logger.error('CONFIG', `配置验证失败：${errors.length} 个错误`, { errors });
      } else if (warnings.length > 0) {
        this.logger.warning('CONFIG', `配置验证通过，但有 ${warnings.length} 个警告`, { warnings });
      } else {
        this.logger.success('CONFIG', '✓ 配置深度验证通过');
      }

      return report;
    } catch (error) {
      this.logger.error('CONFIG', '配置验证失败', error);
      return {
        valid: false,
        errors: [error.message],
        warnings: [],
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 🆕 ISS-026: 验证配置文件格式（热重载前验证）
   * @returns {Promise<{valid: boolean, errors: string[], parsed?: object}>}
   */
  async _validateConfigFile() {
    const errors = [];

    try {
      // 1. 检查文件是否存在
      try {
        await fs.access(this.configPath);
      } catch {
        // 文件不存在，允许使用默认配置
        return { valid: true, errors: [] };
      }

      // 2. 读取文件内容
      let content;
      try {
        content = await fs.readFile(this.configPath, 'utf-8');
      } catch (readError) {
        errors.push(`无法读取配置文件: ${readError.message}`);
        return { valid: false, errors };
      }

      // 3. 验证 JSON 格式
      let parsedConfig;
      try {
        parsedConfig = JSON.parse(content);
      } catch (jsonError) {
        errors.push(`JSON 格式错误: ${jsonError.message}`);
        return { valid: false, errors };
      }

      // 4. 基本结构验证（必须包含 server 配置）
      if (parsedConfig && typeof parsedConfig === 'object') {
        if (!parsedConfig.server) {
          errors.push('缺少必需的 server 配置');
        } else if (!parsedConfig.server.port) {
          errors.push('缺少必需的 server.port 配置');
        } else if (typeof parsedConfig.server.port !== 'number') {
          errors.push('server.port 必须是数字');
        } else if (parsedConfig.server.port < 1024 || parsedConfig.server.port > 65535) {
          errors.push('端口号必须在 1024-65535 之间');
        }
      } else {
        errors.push('配置文件根节点必须是对象');
      }

      // 5. 返回验证结果
      return {
        valid: errors.length === 0,
        errors,
        parsed: parsedConfig
      };
    } catch (error) {
      errors.push(`验证过程出错: ${error.message}`);
      return { valid: false, errors };
    }
  }

  /**
   * 获取配置摘要
   */
  getSummary() {
    return {
      server: {
        port: this.get('server.port'),
        host: this.get('server.host')
      },
      connectors: {
        default: this.get('connectors.default'),
        timeout: this.get('connectors.timeout')
      },
      plugins: {
        enabled: this.get('plugins.enabled', []).length,
        configured: Object.keys(this.get('plugins.config', {})).length
      },
      tasks: {
        concurrent: this.get('tasks.concurrent'),
        retryTimes: this.get('tasks.retryTimes')
      },
      memory: {
        maxSize: this.get('memory.maxSize'),
        defaultTTL: this.get('memory.defaultTTL')
      },
      tools: this.get('tools', []).length,
      stats: this.getStats(),
      reloadStats: this.getReloadStats()
    };
  }
}

module.exports = ConfigManager;
