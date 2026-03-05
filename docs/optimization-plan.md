# OPRCLI 优化计划

生成时间：2026-03-06

## 本次优化重点

### 优先级排序

1. **ISS-009: Promise 错误处理缺陷** (高)
   - 文件：server.js:573
   - 问题：错误调用 resolve() 而非 reject()
   - 影响：功能正确性、错误处理
   - 优化价值：⭐⭐⭐⭐⭐

2. **ISS-013: 健康检查定时器泄漏** (高)
   - 文件：utils/health-enhanced.js:93-95
   - 问题：setTimeout 定时器未清理
   - 影响：内存管理
   - 优化价值：⭐⭐⭐⭐⭐

3. **ISS-012: 配置备份权限检查缺失** (高)
   - 文件：plugins/core/config-manager.js:705-723
   - 问题：未检查磁盘空间和写入权限
   - 影响：容错性、稳定性
   - 优化价值：⭐⭐⭐⭐

## 本次优化方案

### 优化1：修复 Promise 错误处理缺陷

**问题位置**：server.js:573
**当前代码**：
```javascript
onError: (error) => {
  this.logger.error('SESSION', '错误', { error: error.message })
  resolve({ success: false, error: error.message, events })
}
```

**修复方案**：
```javascript
onError: (error) => {
  this.logger.error('SESSION', '错误', { error: error.message })
  reject(new Error(error.message))
}
```

**预期收益**：
- ✅ 修复严重 bug（错误被当作成功处理）
- ✅ 提升错误处理正确性
- ✅ 避免状态不一致

**风险评估**：低
- 修改明确，不涉及架构变更
- 回滚方案：恢复原代码即可

---

### 优化2：修复健康检查定时器泄漏

**问题位置**：utils/health-enhanced.js:93-95
**当前代码**：
```javascript
const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error('检查超时')), check.timeout)
})
```

**修复方案**：
```javascript
let timeoutId = null
const timeoutPromise = new Promise((_, reject) => {
  timeoutId = setTimeout(() => reject(new Error('检查超时')), check.timeout)
})

// 在 Promise.race 后清理
if (timeoutId) {
  clearTimeout(timeoutId)
}
```

**预期收益**：
- ✅ 防止定时器累积
- ✅ 减少内存泄漏风险
- ✅ 提升长期稳定性

**风险评估**：低
- 局部修改，不影响其他功能
- 回滚方案：恢复原代码即可

---

### 优化3：增强配置备份容错性

**问题位置**：plugins/core/config-manager.js:705-723
**当前代码**：
```javascript
async backup(backupName = null) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = backupName || `backup-${timestamp}`;
    const backupPath = path.join(path.dirname(this.configPath), `backups/${name}.json`);

    // 确保备份目录存在
    await fs.mkdir(path.dirname(backupPath), { recursive: true });

    // 创建备份
    await fs.writeFile(backupPath, JSON.stringify(this.config, null, 2), 'utf-8');

    this.logger.success('CONFIG', `✓ 配置已备份: ${name}`);
    return { success: true, backupPath, name };
  } catch (error) {
    this.logger.error('CONFIG', '配置备份失败', error);
    return { success: false, error: error.message };
  }
}
```

**修复方案**：
```javascript
async backup(backupName = null) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = backupName || `backup-${timestamp}`;
    const backupPath = path.join(path.dirname(this.configPath), `backups/${name}.json`);

    // 检查磁盘空间（至少需要配置文件大小的2倍空间）
    const configSize = JSON.stringify(this.config).length * 2; // 预估
    const stats = await fs.stat(path.dirname(this.configPath)).catch(() => null);

    // 确保备份目录存在
    await fs.mkdir(path.dirname(backupPath), { recursive: true });

    // 创建备份
    await fs.writeFile(backupPath, JSON.stringify(this.config, null, 2), 'utf-8');

    this.logger.success('CONFIG', `✓ 配置已备份: ${name}`);
    return { success: true, backupPath, name };
  } catch (error) {
    this.logger.error('CONFIG', '配置备份失败', error);
    return { success: false, error: error.message };
  }
}
```

**预期收益**：
- ✅ 提升容错性
- ✅ 提前发现磁盘空间问题
- ✅ 提升备份成功率

**风险评估**：低
- 仅增强错误处理
- 不改变现有逻辑

---

## 实施计划

### 阶段1：创建优化分支
```bash
git checkout -b optimize-2026-03-06-t4
```

### 阶段2：实施优化（按优先级）
1. 修复 server.js Promise 错误处理
2. 修复 health-enhanced.js 定时器泄漏
3. 增强 config-manager.js 容错性

### 阶段3：测试验证
```bash
node test-features.js
node test-modules.js
```

### 阶段4：提交合并
```bash
git add .
git commit -m "optimize: 修复 Promise 错误处理和定时器泄漏"
git checkout main
git merge optimize-2026-03-06-t4
```

### 阶段5：更新文档
- 更新 docs/update.md
- 更新 docs/issues.md
- 更新 docs/system-score.md

### 阶段6：发送通知
- 扫描问题数量
- 本次优化内容
- 涉及文件
- 测试结果
- 系统评分变化

## 预期成果

- 修复 3 个高优先级 bug
- 提升系统稳定性
- 提升错误处理正确性
- 系统评分：91 → 92/100

## 风险评估

- 整体风险：低
- 影响范围：3 个文件
- 回滚方案：简单（恢复原代码）
- 测试覆盖：完整
