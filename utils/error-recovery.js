/**
 * 错误恢复和重试机制
 * 提供智能错误恢复、重试策略和熔断器模式
 *
 * @version 1.0.0
 * @lastUpdated 2026-03-05
 */

/**
 * 重试策略配置
 */
const RetryStrategies = {
  // 固定间隔重试
  FIXED: 'fixed',

  // 指数退避重试
  EXPONENTIAL: 'exponential',

  // 线性退避重试
  LINEAR: 'linear'
}

/**
 * 重试器类
 */
class Retryer {
  constructor(options = {}) {
    this.maxAttempts = options.maxAttempts || 3
    this.strategy = options.strategy || RetryStrategies.EXPONENTIAL
    this.baseDelay = options.baseDelay || 1000
    this.maxDelay = options.maxDelay || 30000
    this.retryableErrors = options.retryableErrors || []
    this.onRetry = options.onRetry || null
  }

  /**
   * 计算重试延迟
   */
  calculateDelay(attempt) {
    let delay

    switch (this.strategy) {
      case RetryStrategies.FIXED:
        delay = this.baseDelay
        break

      case RetryStrategies.EXPONENTIAL:
        delay = Math.min(
          this.baseDelay * Math.pow(2, attempt),
          this.maxDelay
        )
        break

      case RetryStrategies.LINEAR:
        delay = Math.min(
          this.baseDelay * (attempt + 1),
          this.maxDelay
        )
        break

      default:
        delay = this.baseDelay
    }

    // 添加随机抖动（避免雷群效应）
    const jitter = delay * 0.1 * Math.random()
    return delay + jitter
  }

  /**
   * 检查错误是否可重试
   */
  isRetryableError(error) {
    // 默认可重试的错误类型
    const defaultRetryableErrors = [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'EAI_AGAIN'
    ]

    const allRetryableErrors = [
      ...defaultRetryableErrors,
      ...this.retryableErrors
    ]

    // 检查错误代码
    if (error.code && allRetryableErrors.includes(error.code)) {
      return true
    }

    // 检查错误消息
    const retryablePatterns = [
      /timeout/i,
      /network/i,
      /connection/i,
      /temporary/i
    ]

    for (const pattern of retryablePatterns) {
      if (pattern.test(error.message)) {
        return true
      }
    }

    return false
  }

  /**
   * 执行带重试的异步操作
   */
  async execute(fn) {
    let lastError

    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      try {
        return await fn(attempt)
      } catch (error) {
        lastError = error

        // 检查是否可重试
        if (attempt < this.maxAttempts - 1 && this.isRetryableError(error)) {
          const delay = this.calculateDelay(attempt)

          // 调用重试回调
          if (this.onRetry) {
            this.onRetry(attempt + 1, this.maxAttempts, error, delay)
          }

          // 等待后重试
          await this.sleep(delay)
        } else {
          // 不可重试或已达到最大尝试次数
          throw error
        }
      }
    }

    throw lastError
  }

  /**
   * 延迟函数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * 熔断器状态
 */
const CircuitState = {
  CLOSED: 'closed',     // 正常状态
  OPEN: 'open',         // 熔断状态
  HALF_OPEN: 'half_open' // 半开状态（尝试恢复）
}

/**
 * 熔断器类
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.threshold = options.threshold || 5 // 失败阈值
    this.timeout = options.timeout || 60000 // 熔断超时（毫秒）
    this.halfOpenMaxCalls = options.halfOpenMaxCalls || 3 // 半开状态最大调用数
    this.logger = options.logger || null // 可选的 logger 实例

    this.reset()
  }

  reset() {
    this.state = CircuitState.CLOSED
    this.failureCount = 0
    this.successCount = 0
    this.lastFailureTime = null
    this.lastStateChange = Date.now()
    this.halfOpenCalls = 0
  }

  /**
   * 执行带熔断保护的函数
   */
  async execute(fn) {
    // 检查熔断器状态
    if (this.state === CircuitState.OPEN) {
      // 检查是否可以尝试恢复
      if (Date.now() - this.lastStateChange > this.timeout) {
        this.transitionTo(CircuitState.HALF_OPEN)
      } else {
        throw new Error('熔断器已打开，拒绝请求')
      }
    }

    try {
      const result = await fn()

      // 记录成功
      this.onSuccess()

      return result
    } catch (error) {
      // 记录失败
      this.onFailure()

      throw error
    }
  }

  /**
   * 处理成功
   */
  onSuccess() {
    this.failureCount = 0
    this.successCount++

    // 半开状态下的成功处理
    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenCalls++

      // 如果连续成功次数达到阈值，则关闭熔断器
      if (this.halfOpenCalls >= this.halfOpenMaxCalls) {
        this.transitionTo(CircuitState.CLOSED)
      }
    }
  }

  /**
   * 处理失败
   */
  onFailure() {
    this.failureCount++
    this.lastFailureTime = Date.now()

    // 检查是否需要打开熔断器
    if (this.failureCount >= this.threshold) {
      this.transitionTo(CircuitState.OPEN)
    } else if (this.state === CircuitState.HALF_OPEN) {
      // 半开状态下失败，立即打开熔断器
      this.transitionTo(CircuitState.OPEN)
    }
  }

  /**
   * 转换熔断器状态
   */
  transitionTo(newState) {
    const oldState = this.state
    this.state = newState
    this.lastStateChange = Date.now()

    if (newState === CircuitState.HALF_OPEN) {
      this.halfOpenCalls = 0
    }

    // 状态转换日志（支持可选的 logger）
    const message = `熔断器状态转换: ${oldState} -> ${newState}`
    if (this.logger) {
      this.logger.info('CIRCUIT_BREAKER', message)
    } else {
      console.log(message)
    }
  }

  /**
   * 获取熔断器状态
   */
  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastStateChange: this.lastStateChange,
      timeSinceLastChange: Date.now() - this.lastStateChange
    }
  }
}

/**
 * 错误恢复管理器
 */
class ErrorRecoveryManager {
  constructor(options = {}) {
    this.retryers = new Map()
    this.circuitBreakers = new Map()
    this.fallbacks = new Map()
    this.logger = options.logger || null // 可选的 logger 实例
  }

  /**
   * 创建重试器
   */
  createRetryer(name, options) {
    const retryer = new Retryer(options)
    this.retryers.set(name, retryer)
    return retryer
  }

  /**
   * 创建熔断器
   */
  createCircuitBreaker(name, options) {
    // 将 logger 传递给熔断器
    const circuitBreaker = new CircuitBreaker({
      ...options,
      logger: options.logger || this.logger
    })
    this.circuitBreakers.set(name, circuitBreaker)
    return circuitBreaker
  }

  /**
   * 注册降级函数
   */
  registerFallback(name, fn) {
    this.fallbacks.set(name, fn)
  }

  /**
   * 执行带完整保护的函数
   */
  async execute(name, fn, options = {}) {
    const {
      retry = true,
      circuitBreaker = true,
      fallback = true
    } = options

    try {
      // 应用熔断器
      if (circuitBreaker && this.circuitBreakers.has(name)) {
        const cb = this.circuitBreakers.get(name)
        return await cb.execute(fn)
      }

      // 应用重试
      if (retry && this.retryers.has(name)) {
        const retryer = this.retryers.get(name)
        return await retryer.execute(fn)
      }

      // 直接执行
      return await fn()
    } catch (error) {
      // 应用降级
      if (fallback && this.fallbacks.has(name)) {
        const fallbackFn = this.fallbacks.get(name)
        return await fallbackFn(error)
      }

      throw error
    }
  }

  /**
   * 获取所有保护器状态
   */
  getStatus() {
    return {
      retryers: Array.from(this.retryers.entries()).map(([name, retryer]) => ({
        name,
        maxAttempts: retryer.maxAttempts,
        strategy: retryer.strategy
      })),
      circuitBreakers: Array.from(this.circuitBreakers.entries()).map(([name, cb]) => ({
        name,
        ...cb.getState()
      })),
      fallbacks: Array.from(this.fallbacks.keys())
    }
  }
}

/**
 * 快捷方法：创建带重试的函数
 */
function withRetry(fn, options) {
  const retryer = new Retryer(options)
  return (...args) => retryer.execute(() => fn(...args))
}

/**
 * 快捷方法：创建带熔断保护的函数
 */
function withCircuitBreaker(fn, options) {
  const circuitBreaker = new CircuitBreaker(options)
  return (...args) => circuitBreaker.execute(() => fn(...args))
}

module.exports = {
  RetryStrategies,
  Retryer,
  CircuitBreaker,
  CircuitState,  // 🔥 添加 CircuitState 导出
  ErrorRecoveryManager,
  withRetry,
  withCircuitBreaker
}
