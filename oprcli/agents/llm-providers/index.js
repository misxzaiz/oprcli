/**
 * LLM Provider 工厂
 * 统一管理所有 LLM Provider
 */

const OpenAICompatibleProvider = require('./openai-compatible');

/**
 * 预定义的服务配置
 */
const SERVICE_CONFIGS = {
  iflow: {
    baseURL: 'https://apis.iflow.cn/v1',
    defaultModel: 'glm-5',
    serviceName: 'iflow'
  },
  deepseek: {
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    serviceName: 'deepseek'
  },
  openai: {
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-3.5-turbo',
    serviceName: 'openai'
  },
  zhipu: {
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-5',
    serviceName: 'zhipu'
  }
};

/**
 * 创建 Provider 实例
 */
function createProvider(config) {
  const { type = 'iflow', apiKey, model, baseURL } = config;

  // 获取服务配置
  const serviceConfig = SERVICE_CONFIGS[type];

  if (!serviceConfig && !baseURL) {
    throw new Error(`Unknown service type: ${type}. Please provide baseURL.`);
  }

  // 合并配置
  const finalConfig = {
    serviceName: type,
    baseURL: baseURL || serviceConfig.baseURL,
    apiKey,
    model: model || serviceConfig.defaultModel,
    timeout: config.timeout || 60000
  };

  return new OpenAICompatibleProvider(finalConfig);
}

/**
 * 获取支持的服务列表
 */
function getSupportedServices() {
  return Object.keys(SERVICE_CONFIGS);
}

/**
 * 获取服务配置
 */
function getServiceConfig(serviceType) {
  return SERVICE_CONFIGS[serviceType];
}

module.exports = {
  createProvider,
  getSupportedServices,
  getServiceConfig,
  OpenAICompatibleProvider
};
