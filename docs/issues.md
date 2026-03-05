# OPRCLI 系统问题清单

最后更新：2026-03-06 12:00

## 当前问题

### 高优先级

#### ISS-002: 健康检查模块重复 ⚠️
- **文件**: `utils/memory-monitor.js` (293行), `utils/memory-monitor-enhanced.js` (398行)
- **问题**: 存在两个功能重叠的内存监控模块
  - 基础版本：基本监控功能
  - 增强版本：额外包含 GC 跟踪、趋势分析、泄漏检测
- **严重程度**: 中
- **影响**: 可维护性、内存占用
- **建议**: 保留 `memory-monitor-enhanced.js`，删除基础版本
- **优化价值**: 高（减少代码重复，降低维护成本）

#### ISS-002: 健康检查模块重复 ⚠️
- **文件**: `utils/health-check.js` (494行), `utils/health-enhanced.js` (298行)
- **问题**: 两个健康检查模块功能重叠
  - 基础版本：SystemHealthChecker、DiagnosticsCollector、PerformanceMetricsCollector
  - 增强版本：EnhancedHealthChecker（带缓存、历史记录）
- **严重程度**: 中
- **影响**: 可维护性、API 一致性
- **建议**: 合并功能，统一接口
- **优化价值**: 高（提升 API 一致性）

#### ISS-003: ~~速率限制模块命名混淆~~ ✅ 已修复
- **文件**: ~~`utils/rate-limiter.js`~~ → `utils/message-rate-limiter.js`, `utils/rate-limit.js`
- **问题**: 两个模块用途不同但命名相似，容易混淆
  - ~~`rate-limiter.js`~~ → `message-rate-limiter.js` - 钉钉消息发送限流（内部使用）
  - `rate-limit.js` - HTTP API 请求限流（Express 中间件）
- **严重程度**: 低
- **影响**: 代码可读性
- **建议**: ~~重命名使其用途更明确~~ ✅ 已完成
  - ✅ `rate-limiter.js` → `message-rate-limiter.js`
  - `rate-limit.js` 保持不变（已符合 Express 中间件命名约定）
- **优化价值**: 中（提升代码可读性）

### 中优先级

#### ISS-004: 错误处理不一致
- **文件**: 多个文件
- **问题**: 部分模块使用自定义错误处理，部分使用标准错误
- **严重程度**: 中
- **影响**: 代码质量、可维护性

#### ISS-005: 日志记录不统一
- **文件**: 多个文件
- **问题**: 部分模块使用 console.log，部分使用 Logger
- **严重程度**: 低
- **影响**: 可维护性

#### ISS-007: server.js 文件过大 ⚠️ NEW
- **文件**: `server.js` (1921 行)
- **问题**: 主服务器文件过大，包含过多逻辑
- **严重程度**: 中
- **影响**: 可维护性、可读性
- **建议**: 拆分成多个模块（路由、中间件、初始化等）
- **优化价值**: 高（提升可维护性）

#### ISS-008: config-manager.js 复杂度高 ⚠️ NEW
- **文件**: `plugins/core/config-manager.js` (995 行)
- **问题**: 配置管理器复杂度较高
- **严重程度**: 中
- **影响**: 可维护性
- **建议**: 重构为更小的模块
- **优化价值**: 中（提升可读性）

### 低优先级

#### ISS-006: 缺少单元测试
- **文件**: 大部分模块
- **问题**: 测试覆盖率不足
- **严重程度**: 低
- **影响**: 测试

## 已修复问题

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
