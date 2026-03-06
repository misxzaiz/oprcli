# OPRCLI 系统问题清单

最后更新：2026-03-06 23:40

## 当前问题

### 高优先级 ⚠️

#### ISS-033: 敏感信息脱敏不完整 🔴
- **文件**: `utils/config.js` (行 454-486)
- **问题**: getSafeConfig 仅脱敏部分字段，敏感信息可能泄露
- **严重程度**: 高
- **影响**: 安全性、敏感信息泄露
- **修复建议**: 审计 sanitizer 实现，使用正则替换所有 token/secret 参数
- **优化价值**: 高（安全风险）

#### ISS-021: 日志系统混用 🔴
- **文件**:
  - `connectors/iflow-connector.js` (32处)
  - `connectors/claude-connector.js` (24处)
  - `utils/cache-manager.js` (1处)
  - `utils/notification-queue.js` (2处)
- **问题**: 大量使用 console.log/error/warn，未使用统一的 Logger 系统
- **严重程度**: 高
- **影响**: 日志系统、调试效率、生产环境监控
- **修复建议**: 将所有 console.* 替换为 this.logger.*，在构造函数中注入 Logger 实例
- **优化价值**: 高（统一日志管理）

无
- **文件**: `utils/cache-manager.js` (行359-369)
- **问题**: 异步操作结果立即计数，但实际是异步的
- **严重程度**: 高
- **影响**: 统计准确性
- **修复建议**: 使用 Promise.allSettled 等待所有异步操作完成
- **优化价值**: 高（修复统计bug）

#### ISS-011: 定时器泄漏风险
- **文件**: `connectors/iflow-connector.js` (行264-395)
- **问题**: JSONL 监控定时器未正确清理，导致泄漏
- **严重程度**: 高
- **影响**: 内存管理、长期稳定性
- **修复建议**: 统一定时器管理机制
- **优化价值**: 高（防止内存泄漏）

### 中优先级

#### ISS-022: 同步文件操作阻塞事件循环
- **文件**: `utils/config.js` (行 153, 409, 421)
- **问题**: _loadSystemPromptFromFile 使用 fs.readFileSync，阻塞读取文件
- **严重程度**: 中
- **影响**: 配置加载性能、系统响应性
- **修复建议**: 改用 fs.promises.readFile，将 getSystemPrompt 改为异步方法
- **优化价值**: 高（提升并发性能）

#### ISS-026: 配置热重载缺少输入验证
- **文件**: `plugins/core/config-manager.js` (行 563-619)
- **问题**: handleFileChange 和 debouncedReload 缺少文件内容验证
- **严重程度**: 中
- **影响**: 安全性、稳定性
- **修复建议**: 在重载前先验证 JSON 格式和配置 schema，验证失败时保留旧配置
- **优化价值**: 中（提升配置安全性）

#### ISS-032: 配置验证规则硬编码重复
- **文件**:
  - `utils/config.js` (行 259-401)
  - `plugins/core/config-manager.js` (行 865-973)
- **问题**: 两个文件中都有配置验证逻辑，规则重复且不共享
- **严重程度**: 中
- **影响**: 代码维护性、配置验证一致性
- **修复建议**: 提取独立的 config-validator.js 模块，定义 JSON Schema 验证规则
- **优化价值**: 中（减少代码重复）

#### ISS-034: 连接器进程信号处理缺失
- **文件**:
  - `connectors/iflow-connector.js` (行 269-302)
  - `connectors/claude-connector.js` (行 327-346)
- **问题**: 子进程的 close 和 error 事件未处理 SIGTERM/SIGINT 信号
- **严重程度**: 中
- **影响**: 资源清理、优雅关闭
- **修复建议**: 在服务器 graceful-shutdown 中遍历所有活动会话，先 interruptSession 再退出
- **优化价值**: 中（防止僵尸进程）

#### ISS-023: 定时器泄漏风险 - 缺乏统一清理机制
- **文件**:
  - `connectors/iflow-connector.js` (行 115-124)
  - `utils/cache-manager.js` (行 269-273)
  - `utils/notification-queue.js` (行 257-270, 322-326)
- **问题**: 多处手动管理 setTimeout/setInterval，缺乏统一的定时器生命周期管理
- **严重程度**: 中
- **影响**: 内存泄漏、长时间运行稳定性
- **修复建议**: 实现 TimerManager 工具类，统一管理所有定时器的创建和清理
- **优化价值**: 中（防止内存泄漏）

#### ISS-018: notification-queue.js 同步文件操作 ✅ 已修复
- **文件**: `utils/notification-queue.js` (行70-282)
- **问题**: 使用 existsSync/readFileSync/writeFileSync 阻塞事件循环
- **严重程度**: 中
- **影响**: 并发性能、缓存操作阻塞
- **修复内容**:
  - _ensureCacheDir(): fs.mkdirSync → fs.promises.mkdir
  - _loadFailedCache(): fs.readFileSync → fs.promises.readFile
  - _saveFailedCache(): fs.writeFileSync → fs.promises.writeFile
  - 新增 _initializeCache() 异步初始化方法
  - _handleFailedItem() 改为 async
- **优化价值**: 高（避免阻塞事件循环）
- **修复时间**: 2026-03-06
- **测试结果**: ✅ 全部通过

#### ISS-019: config.js 提示词读取阻塞 ✅ 已修复
- **文件**: `utils/config.js` (行148)
- **问题**: 使用 readFileSync 读取提示词，首次访问阻塞
- **严重程度**: 中
- **影响**: 提示词加载性能
- **修复内容**:
  - 新增 _warmupPromptCache() 异步预热方法
  - 在构造函数中异步预加载常用提示词文件（default, provider, provider-slim）
  - 保持同步接口兼容性
  - 后台预热不阻塞构造函数
- **优化价值**: 高（首次访问更快）
- **修复时间**: 2026-03-06
- **测试结果**: ✅ 全部通过（缓存预热3个文件）

#### ISS-015: LRU 缓存效率低 ✅ 已修复
- **文件**: `utils/cache-manager.js` (行71-78, 107-133)
- **问题**: 原LRU基于插入顺序，清理操作O(n)复杂度
- **严重程度**: 中
- **影响**: 性能、缓存命中率
- **修复内容**:
  - 实现真正的LRU策略：get()命中时reinsert到Map末尾（O(1)）
  - 优化清理逻辑：使用迭代器直接遍历（O(cleanupCount)）
  - 修复清理计数bug：确保至少清理1个条目
- **优化价值**: 高（O(n)→O(1)性能提升）
- **修复时间**: 2026-03-06
- **测试结果**: ✅ 全部通过

#### ISS-004: 错误处理不一致
- **文件**: 多个文件
- **问题**: 部分模块使用自定义错误处理，部分使用标准错误
- **严重程度**: 中
- **影响**: 代码质量、可维护性

#### ISS-005: 日志记录不统一 ⚠️ 部分优化
- **文件**: 多个文件
- **问题**: 部分模块使用 console.log，部分使用 Logger
- **严重程度**: 中
- **影响**: 可维护性、生产调试
- **优化价值**: 中（统一日志管理）
- **优化进度**:
  * ✅ error-recovery.js: 添加可选 Logger 支持（2026-03-06）
  * ✅ server.js: 统一启动日志记录（2026-03-06）
  * ⏳ 其他模块：保持现有 console 使用（底层工具类、调试日志）

#### ISS-014: 重复的连接器遍历逻辑
- **文件**: `server.js` (5处)
- **问题**: 连接器遍历逻辑重复5次
- **严重程度**: 中
- **影响**: 代码质量、可维护性
- **修复建议**: 提取为 getConnectedConnectors() 等公共方法
- **优化价值**: 中（减少100+行重复代码）

#### ISS-015: LRU 缓存效率低
- **文件**: `utils/cache-manager.js` (行71-78)
- **问题**: 每次 set 可能触发 O(n) 清理操作
- **严重程度**: 中
- **影响**: 性能
- **修复建议**: 使用 lru-cache 库或实现双向链表+HashMap
- **优化价值**: 中（O(n)→O(1)复杂度）

#### ISS-016: 同步文件操作阻塞 ✅ 已修复
- **文件**: `connectors/iflow-connector.js` (行431-459, 483-508)
- **问题**: 使用 fs.existsSync 和 fs.readdirSync 阻塞事件循环
- **严重程度**: 中
- **影响**: 并发性能
- **修复内容**:
  - _findLatestJsonl(): fs.existsSync/fs.readdirSync → fs.promises.readdir
  - _findSessionJsonl(): fs.existsSync/fs.readdirSync → fs.promises.readdir
  - 使用 try-catch 处理目录不存在的错误
- **优化价值**: 高（提升并发性能）
- **修复时间**: 2026-03-06
- **测试结果**: ✅ 全部通过

#### ISS-017: 代码风格不一致
- **文件**: 多个文件
- **问题**: 模板字符串混用、注释风格不统一、Magic Numbers
- **严重程度**: 中
- **影响**: 代码质量、可维护性
- **优化价值**: 中（提升代码一致性）

#### ISS-007: server.js 文件过大 ⚠️
- **文件**: `server.js` (1921 行)
- **问题**: 主服务器文件过大，包含过多逻辑
- **严重程度**: 中
- **影响**: 可维护性、可读性
- **建议**: 拆分成多个模块（路由、中间件、初始化等）
- **优化价值**: 高（提升可维护性）

#### ISS-008: config-manager.js 复杂度高 ⚠️
- **文件**: `plugins/core/config-manager.js` (995 行)
- **问题**: 配置管理器复杂度较高
- **严重程度**: 中
- **影响**: 可维护性
- **建议**: 重构为更小的模块
- **优化价值**: 中（提升可读性）

### 低优先级

#### ISS-024: 缓存预热异步计数不准确
- **文件**: `utils/cache-manager.js` (行 369-377)
- **问题**: warmup 方法中异步 loader 的 results.succeeded++ 在 Promise 回调中执行
- **严重程度**: 低
- **影响**: 缓存预热统计准确性
- **修复建议**: 将异步 warmup 改为 async/await 并使用 Promise.all
- **优化价值**: 低

#### ISS-025: 重复的文件存在性检查逻辑
- **文件**: `utils/config.js` (行 407-425)
- **问题**: _checkFileExists 和 _checkDirectoryExists 有相似的 try-catch 逻辑
- **严重程度**: 低
- **影响**: 代码可维护性
- **修复建议**: 提取为 _checkPathExists(filePath, type = 'any')
- **优化价值**: 低

#### ISS-027: 插件文档生成的异常静默忽略
- **文件**: `plugins/core/plugin-manager.js` (行 246-248)
- **问题**: generatePluginDoc 失败时仅记录 warning，插件注册仍会成功
- **严重程度**: 低
- **影响**: 文档完整性
- **修复建议**: 在开发模式下抛出异常，生产模式下记录警告
- **优化价值**: 低

#### ISS-028: 健康检查的超时定时器清理不完整
- **文件**: `utils/health-enhanced.js` (行 94-106, 119-123)
- **问题**: checkAll 中超时定时器在成功和失败分支都需要清理
- **严重程度**: 低
- **影响**: 内存泄漏风险
- **修复建议**: 使用 Promise.finally 确保定时器一定被清理
- **优化价值**: 低

#### ISS-029: 错误恢复中缺少日志上下文
- **文件**: `utils/error-recovery.js` (行 258-263)
- **问题**: 熔断器状态转换日志仅使用 console.log
- **严重程度**: 低
- **影响**: 日志系统完整性
- **修复建议**: 使用传入的 this.logger 记录所有状态转换
- **优化价值**: 低

#### ISS-030: 缓存 LRU 实现效率问题
- **文件**: `utils/cache-manager.js` (行 127-130)
- **问题**: 真正的 LRU 实现（delete + reinsert）在每次 get 时都执行 Map 操作
- **严重程度**: 低
- **影响**: 缓存性能
- **修复建议**: 考虑使用 Map 的迭代顺序特性，或使用专门的 LRU 库
- **优化价值**: 低

#### ISS-031: 通知队列的失败缓存可能无限增长
- **文件**: `utils/notification-queue.js` (行 277-280)
- **问题**: retryFailed 中先清空再添加，如果重试全部失败会瞬间超过限制
- **严重程度**: 低
- **影响**: 内存使用
- **修复建议**: 在重试前检查 failedCache.length，超过限制时丢弃最旧的条目
- **优化价值**: 低

#### ISS-035: 缓存大小估算不准确
- **文件**: `utils/cache-manager.js` (行 287-294)
- **问题**: _estimateSize 仅估算字符串原始大小，未考虑对象引用、Map 元数据开销
- **严重程度**: 低
- **影响**: 内存管理准确性
- **修复建议**: 添加警告注释说明这是粗略估算
- **优化价值**: 低

#### ISS-036: 配置监听器回调异常未隔离
- **文件**: `plugins/core/config-manager.js` (行 338-348, 669-677)
- **问题**: notifyChange 和 notifyConfigChange 中单个监听器抛异常会影响后续监听器
- **严重程度**: 低
- **影响**: 插件间通信可靠性
- **修复建议**: 记录异常后继续执行下一个监听器
- **优化价值**: 低

#### ISS-006: 缺少单元测试
- **文件**: 大部分模块
- **问题**: 测试覆盖率不足
- **严重程度**: 低
- **影响**: 测试

## 已修复问题

### ✅ ISS-016: 同步文件操作阻塞 (2026-03-06)
- **修复内容**:
  - _findLatestJsonl(): fs.existsSync/fs.readdirSync → fs.promises.readdir
  - _findSessionJsonl(): fs.existsSync/fs.readdirSync → fs.promises.readdir
  - 使用 try-catch 处理目录不存在的错误
- **影响**:
  - 避免阻塞事件循环
  - 提升并发处理能力
  - 减少 I/O 操作的响应延迟
- **测试结果**: ✅ 全部通过
  - 模块加载测试通过
  - 异步操作逻辑测试通过
  - 功能完整性测试通过
  - 源代码验证通过（无同步操作残留）

### ✅ ISS-015: LRU 缓存效率低 (2026-03-06)
- **修复内容**:
  - 实现真正的LRU（最近最少使用）缓存策略
  - get() 方法命中时 reinsert 条目到Map末尾（O(1)）
  - set() 方法优化清理逻辑，使用迭代器遍历（O(cleanupCount)）
  - 修复清理计数bug：确保至少清理1个条目
- **影响**:
  - 访问更新性能：O(1)（reinsert 技术）
  - 清理操作性能：O(n) → O(cleanupCount)，通常从 O(1000) 降至 O(100)
  - 内存效率：真正按访问频率淘汰，而非插入顺序
  - 缓存命中率：提升（保留热点数据）
- **测试结果**: ✅ 全部通过
  - 基本 LRU 淘汰策略测试通过
  - 重复访问行为测试通过
  - 清理效率测试通过（0ms执行时间）

### ✅ ISS-011: 定时器泄漏风险 (2026-03-06)
- **修复内容**:
  - 新增统一的定时器管理方法
  - 替换所有分散的定时器清理逻辑（6处）
  - 添加资源清理方法（析构）
- **影响**:
  - 防止定时器泄漏
  - 提升内存管理
  - 提升长期稳定性
  - 代码可维护性提升
- **测试结果**: ✅ 通过

### ✅ ISS-009: Promise 错误处理缺陷 (2026-03-06)
- **修复内容**:
  * server.js:573 错误处理改为 reject()
  * 避免错误被当作成功处理
- **影响**:
  * 修复严重 bug（功能正确性）
  * 提升错误处理正确性
  * 避免状态不一致
- **测试结果**: ✅ 通过

### ✅ ISS-013: 健康检查定时器泄漏 (2026-03-06)
- **修复内容**:
  * health-enhanced.js 添加 timeoutId 清理
  * 在成功和失败情况下都清理定时器
- **影响**:
  * 防止定时器累积
  * 减少内存泄漏风险
  * 提升长期稳定性
- **测试结果**: ✅ 通过

### ✅ ISS-012: 配置备份权限检查缺失 (2026-03-06)
- **修复内容**:
  * config-manager.js 添加目录可写性验证
  * 尝试写入临时文件验证权限
  * 返回备份文件大小信息
- **影响**:
  * 提前发现权限问题
  * 提升备份容错性
  * 更好的错误提示
- **测试结果**: ✅ 通过

### ✅ ISS-010: 缓存预热异步计数错误 (2026-03-06)
- **修复内容**:
  - 移除错误的立即计数逻辑
  - 确保异步操作完成后再计数
  - 修复统计准确性问题
- **影响**:
  - 修复统计bug
  - 提升统计准确性
  - 确保预热功能正确工作
- **测试结果**: ✅ 通过

### ✅ ISS-014: 重复的连接器遍历逻辑 (2026-03-06)
- **修复内容**:
  - 新增 `_getConnectedProvidersInfo()` 方法
  - 新增 `_interruptAllSessions()` 方法
  - 新增 `_getAllConnectorMetrics()` 方法
  - 替换3处重复代码
- **影响**:
  - 减少约100行重复代码
  - 提升代码可维护性
  - 提升代码可读性
- **测试结果**: ✅ 通过

### ✅ ISS-002: 健康检查模块重复 (2026-03-06)
- **修复内容**:
  - 删除 `utils/health-check.js` (494 行)
  - 统一使用 `utils/health-enhanced.js`
  - 更新路由文件引用使用解构导入
  - 合并所有功能到单一模块
- **影响**:
  - 减少代码重复 494 行
  - 提升 API 一致性
  - 降低维护成本
  - 统一健康检查接口
- **测试结果**: ✅ 通过

### ✅ ISS-003: 速率限制模块命名混淆 (2026-03-06)
- **修复内容**:
  - 重命名 `utils/rate-limiter.js` → `utils/message-rate-limiter.js`
  - 更新 `server.js` 中的模块引用
  - 明确区分：消息发送限流 vs HTTP API 限流
- **影响**:
  - 提升代码可读性
  - 减少模块命名混淆
  - 降低维护成本
- **测试结果**: ✅ 通过

### ✅ ISS-001: 内存监控模块重复 (2026-03-06)
- **修复内容**:
  - 删除 `utils/memory-monitor.js` (293 行)
  - 统一使用 `utils/memory-monitor-enhanced.js`
  - 更新 `server.js` 引用和实例化代码
- **影响**:
  - 减少代码重复 293 行
  - 提升内存监控能力（GC 跟踪、泄漏检测、趋势分析）
  - 降低维护成本
- **测试结果**: ✅ 通过

## 待观察问题

无
