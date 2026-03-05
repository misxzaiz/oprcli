/**
 * 请求重试辅助器
 *
 * 为 HTTP 请求提供自动重试功能，使用指数退避策略
 *
 * @example
 * ```js
 * const retry = new RetryHelper();
 * const response = await retry.execute(async () => {
 *   return await axios.get('https://api.example.com');
 * });
 * ```
 */

class RetryHelper {
  constructor(options = {}) {
    this.options = {
      maxRetries: options.maxRetries || 3,
      initialDelay: options.initialDelay || 1000,
      maxDelay: options.maxDelay || 30000,
      factor: options.factor || 2,
      retryableStatusCodes: options.retryableStatusCodes || [408, 429, 500, 502, 503, 504],
      retryableErrors: options.retryableErrors || ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'],
      onRetry: options.onRetry || null,
      ...options
    }
  }

  /**
   * 执行带重试的异步操作
   * @param {Function} operation - 要执行的异步操作
   * @param {Object} options - 覆盖默认选项
   */
  async execute(operation, options = {}) {
    const config = { ...this.options, ...options }
    let lastError = null

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        // 执行操作
        const result = await operation()

        // 如果是响应对象，检查状态码
        if (result && result.status && config.retryableStatusCodes.includes(result.status)) {
          throw new Error(`HTTP ${result.status}: ${result.statusText}`)
        }

        // 成功则返回结果
        return result
      } catch (error) {
        lastError = error

        // 检查是否应该重试
        const shouldRetry = attempt < config.maxRetries && this._shouldRetry(error, config)

        if (!shouldRetry) {
          // 不重试，直接抛出错误
          throw error
        }

        // 计算延迟时间
        const delay = this._calculateDelay(attempt, config)

        // 调用回调
        if (config.onRetry) {
          config.onRetry({
            attempt: attempt + 1,
            maxRetries: config.maxRetries,
            delay,
            error
          })
        }

        // 等待后重试
        await this._sleep(delay)
      }
    }

    // 所有重试都失败
    throw lastError
  }

  /**
   * 判断是否应该重试
   */
  _shouldRetry(error, config) {
    // 检查错误码
    if (error.code && config.retryableErrors.includes(error.code)) {
      return true
    }

    // 检查 HTTP 状态码
    if (error.response && error.response.status) {
      return config.retryableStatusCodes.includes(error.response.status)
    }

    // 检查错误消息
    const message = error.message?.toLowerCase() || ''
    const retryableMessages = ['network', 'timeout', 'econnreset', 'etimedout']
    return retryableMessages.some(msg => message.includes(msg))
  }

  /**
   * 计算延迟时间（指数退避）
   */
  _calculateDelay(attempt, config) {
    // 指数退避：initialDelay * (factor ^ attempt)
    const delay = Math.min(
      config.initialDelay * Math.pow(config.factor, attempt),
      config.maxDelay
    )

    // 添加少量随机抖动（避免同时重试）
    const jitter = Math.random() * 0.3 * delay

    return Math.floor(delay + jitter)
  }

  /**
   * 等待指定时间
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * 创建 axios 重试拦截器
 * @param {Object} axiosInstance - axios 实例
 * @param {Object} options - 配置选项
 */
function createAxiosRetryInterceptor(axiosInstance, options = {}) {
  const retryHelper = new RetryHelper(options)

  // 请求拦截器（添加重试次数到请求配置）
  axiosInstance.interceptors.request.use(config => {
    config._retry = config._retry || 0
    config._retryCount = config._retryCount || 0
    return config
  })

  // 响应拦截器（处理重试）
  axiosInstance.interceptors.response.use(
    response => response,
    async error => {
      const config = error.config

      // 如果没有配置或已重试多次，直接返回错误
      if (!config || config._retryCount >= (options.maxRetries || 3)) {
        return Promise.reject(error)
      }

      // 检查是否应该重试
      const shouldRetry = retryHelper._shouldRetry(error, retryHelper.options)

      if (!shouldRetry) {
        return Promise.reject(error)
      }

      // 增加重试计数
      config._retryCount++

      // 计算延迟
      const delay = retryHelper._calculateDelay(config._retryCount - 1, retryHelper.options)

      // 调用回调
      if (options.onRetry) {
        options.onRetry({
          attempt: config._retryCount,
          maxRetries: options.maxRetries || 3,
          delay,
          error
        })
      }

      // 等待后重试
      await retryHelper._sleep(delay)

      // 重新发起请求
      return axiosInstance(config)
    }
  )

  return retryHelper
}

/**
 * 装饰器：为函数添加重试功能
 * @param {Object} options - 配置选项
 */
function withRetry(options = {}) {
  return function (target, propertyKey, descriptor) {
    const originalMethod = descriptor.value
    const retryHelper = new RetryHelper(options)

    descriptor.value = async function (...args) {
      return retryHelper.execute(() => originalMethod.apply(this, args), options)
    }

    return descriptor
  }
}

module.exports = {
  RetryHelper,
  createAxiosRetryInterceptor,
  withRetry
}
