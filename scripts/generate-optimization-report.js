/**
 * OPRCLI 综合优化分析报告生成器
 * 整合所有分析结果，生成优先级队列
 */

const fs = require('fs');
const path = require('path');

class ReportGenerator {
  constructor(projectDir) {
    this.projectDir = projectDir;
    this.report = {
      timestamp: new Date().toISOString(),
      summary: {},
      testResults: {},
      codeQuality: {},
      performance: {},
      abstraction: {},
      priorityQueue: [],
      quickWins: [],
      longTermGoals: []
    };
  }

  generate() {
    console.log('📊 生成综合优化分析报告...\n');

    this.loadAnalysisResults();
    this.generateSummary();
    this.generatePriorityQueue();
    this.generateQuickWins();
    this.generateLongTermGoals();
    this.saveReport();

    return this.report;
  }

  loadAnalysisResults() {
    console.log('📂 加载分析结果...');

    const tasksDir = path.resolve(this.projectDir, 'tasks');
    if (!fs.existsSync(tasksDir)) {
      console.log('❌ 未找到分析结果目录');
      return;
    }

    const files = fs.readdirSync(tasksDir);

    // 加载测试结果
    const testResultFile = files.find(f => f.startsWith('test-results-'));
    if (testResultFile) {
      try {
        const testContent = fs.readFileSync(path.join(tasksDir, testResultFile), 'utf8');
        this.report.testResults = JSON.parse(testContent);
        console.log('✅ 测试结果已加载');
      } catch (e) {
        console.log('⚠️  测试结果加载失败');
      }
    }

    // 加载代码质量分析
    const qualityFile = files.find(f => f.startsWith('code-quality-analysis-'));
    if (qualityFile) {
      try {
        const qualityContent = fs.readFileSync(path.join(tasksDir, qualityFile), 'utf8');
        this.report.codeQuality = JSON.parse(qualityContent);
        console.log('✅ 代码质量分析已加载');
      } catch (e) {
        console.log('⚠️  代码质量分析加载失败');
      }
    }

    // 加载性能分析
    const perfFile = files.find(f => f.startsWith('performance-analysis-'));
    if (perfFile) {
      try {
        const perfContent = fs.readFileSync(path.join(tasksDir, perfFile), 'utf8');
        this.report.performance = JSON.parse(perfContent);
        console.log('✅ 性能分析已加载');
      } catch (e) {
        console.log('⚠️  性能分析加载失败');
      }
    }

    // 加载抽象分析
    const abstractionFile = files.find(f => f.startsWith('abstraction-analysis-'));
    if (abstractionFile) {
      try {
        const abstractionContent = fs.readFileSync(path.join(tasksDir, abstractionFile), 'utf8');
        this.report.abstraction = JSON.parse(abstractionContent);
        console.log('✅ 抽象分析已加载');
      } catch (e) {
        console.log('⚠️  抽象分析加载失败');
      }
    }
  }

  generateSummary() {
    console.log('📋 生成摘要...');

    const summary = {
      project: {
        name: 'OPRCLI',
        version: '2.0.7',
        location: this.projectDir
      },
      health: {
        overall: this.calculateOverallHealth(),
        tests: this.getTestHealth(),
        codeQuality: this.getCodeQualityHealth(),
        performance: this.getPerformanceHealth(),
        architecture: this.getArchitectureHealth()
      },
      metrics: {
        testPassRate: this.calculateTestPassRate(),
        codeDuplication: this.getCodeDuplicationRate(),
        performanceScore: this.getPerformanceScore(),
        technicalDebt: this.estimateTechnicalDebt()
      }
    };

    this.report.summary = summary;
  }

  calculateOverallHealth() {
    const scores = [
      this.getTestHealth() === 'excellent' ? 100 : this.getTestHealth() === 'good' ? 80 : 60,
      this.getCodeQualityHealth() === 'excellent' ? 100 : this.getCodeQualityHealth() === 'good' ? 80 : 60,
      this.getPerformanceHealth() === 'excellent' ? 100 : this.getPerformanceHealth() === 'good' ? 80 : 60,
      this.getArchitectureHealth() === 'excellent' ? 100 : this.getArchitectureHealth() === 'good' ? 80 : 60
    ];

    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    if (avgScore >= 90) return 'excellent';
    if (avgScore >= 75) return 'good';
    if (avgScore >= 60) return 'fair';
    return 'poor';
  }

  getTestHealth() {
    if (!this.report.testResults.summary) return 'unknown';
    const passRate = (this.report.testResults.summary.passed / this.report.testResults.summary.total) * 100;
    if (passRate >= 95) return 'excellent';
    if (passRate >= 80) return 'good';
    if (passRate >= 60) return 'fair';
    return 'poor';
  }

  getCodeQualityHealth() {
    if (!this.report.codeQuality.summary) return 'unknown';
    const { avgComplexity, highComplexityFiles, jsdocCoverage } = this.report.codeQuality.summary;
    const complexityScore = avgComplexity < 20 ? 100 : avgComplexity < 30 ? 80 : 60;
    const jsdocScore = jsdocCoverage >= 90 ? 100 : jsdocCoverage >= 70 ? 80 : 60;
    return ((complexityScore + jsdocScore) / 2) >= 80 ? 'good' : 'fair';
  }

  getPerformanceHealth() {
    if (!this.report.performance.summary) return 'unknown';
    return this.report.performance.summary.performanceHealth || 'unknown';
  }

  getArchitectureHealth() {
    if (!this.report.abstraction.summary) return 'unknown';
    const { totalOpportunities, highPriority } = this.report.abstraction.summary;
    if (highPriority === 0) return 'excellent';
    if (highPriority <= 2) return 'good';
    if (highPriority <= 5) return 'fair';
    return 'poor';
  }

  calculateTestPassRate() {
    if (!this.report.testResults.summary) return 0;
    const { total, passed } = this.report.testResults.summary;
    return Math.round((passed / total) * 100);
  }

  getCodeDuplicationRate() {
    if (!this.report.codeQuality.summary) return 0;
    const { totalFiles, duplicatePatterns } = this.report.codeQuality.summary;
    return Math.round((duplicatePatterns / totalFiles) * 100);
  }

  getPerformanceScore() {
    if (!this.report.performance.summary) return 0;
    const { performanceHealth } = this.report.performance.summary;
    const scores = { excellent: 100, good: 80, fair: 60, poor: 40 };
    return scores[performanceHealth] || 50;
  }

  estimateTechnicalDebt() {
    let debt = 0;

    // 从代码质量问题计算
    if (this.report.codeQuality.highComplexityFiles) {
      debt += this.report.codeQuality.highComplexityFiles * 2;
    }

    // 从性能问题计算
    if (this.report.performance.highImpactBottlenecks) {
      debt += this.report.performance.highImpactBottlenecks * 3;
    }

    // 从抽象机会计算
    if (this.report.abstraction.highPriority) {
      debt += this.report.abstraction.highPriority * 1;
    }

    return debt;
  }

  generatePriorityQueue() {
    console.log('🎯 生成优先级队列...');

    const queue = [];

    // 从性能分析中添加高影响项目
    if (this.report.performance.bottlenecks) {
      this.report.performance.bottlenecks
        .filter(b => b.impact === 'high')
        .forEach(b => {
          queue.push({
            priority: 'critical',
            category: 'performance',
            title: b.description,
            description: b.recommendation,
            file: b.file,
            estimatedEffort: '1-2 days',
            impact: 'high',
            risk: 'low'
          });
        });
    }

    // 从代码质量分析中添加高复杂度文件
    if (this.report.codeQuality.recommendations) {
      this.report.codeQuality.recommendations
        .filter(r => r.priority === 'high')
        .slice(0, 5)
        .forEach(r => {
          queue.push({
            priority: 'high',
            category: 'quality',
            title: r.title,
            description: r.description,
            file: r.file,
            estimatedEffort: '2-3 days',
            impact: 'medium',
            risk: 'medium'
          });
        });
    }

    // 从抽象分析中添加高优先级项目
    if (this.report.abstraction.recommendations) {
      this.report.abstraction.recommendations
        .filter(r => r.priority === 'high')
        .slice(0, 3)
        .forEach(r => {
          queue.push({
            priority: 'high',
            category: 'architecture',
            title: r.title,
            description: r.description,
            affectedFiles: r.affectedFiles,
            estimatedEffort: r.implementation ? r.implementation.estimatedTime : '2-3 days',
            impact: 'high',
            risk: r.implementation ? r.implementation.risk : 'medium'
          });
        });
    }

    // 排序：critical > high > medium > low
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    queue.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    this.report.priorityQueue = queue;
  }

  generateQuickWins() {
    console.log('⚡ 生成快速改进...');

    const quickWins = [];

    // 从性能分析中找出低投入高回报的项目
    if (this.report.performance.bottlenecks) {
      this.report.performance.bottlenecks
        .filter(b => b.impact === 'medium')
        .slice(0, 3)
        .forEach(b => {
          quickWins.push({
            category: 'performance',
            title: b.description,
            effort: 'low',
            impact: 'medium',
            description: b.recommendation
          });
        });
    }

    // 从代码质量中找出容易修复的问题
    if (this.report.codeQuality.duplicates) {
      this.report.codeQuality.duplicates
        .filter(d => d.files && d.files.length === 2)
        .slice(0, 3)
        .forEach(d => {
          quickWins.push({
            category: 'quality',
            title: `合并重复文件: ${d.pattern}`,
            effort: 'low',
            impact: 'medium',
            description: `合并 ${d.files.map(f => f.name).join(' 和 ')}`
          });
        });
    }

    this.report.quickWins = quickWins;
  }

  generateLongTermGoals() {
    console.log('🎯 生成长期目标...');

    const goals = [];

    // 从抽象分析中提取架构改进目标
    if (this.report.abstraction.designPatterns) {
      this.report.abstraction.designPatterns.forEach(pattern => {
        goals.push({
          category: 'architecture',
          title: `实现 ${pattern.name}`,
          description: pattern.opportunity,
          priority: pattern.priority,
          estimatedEffort: '3-5 days',
          benefit: pattern.benefit
        });
      });
    }

    // 从代码质量中提取重构目标
    goals.push({
      category: 'quality',
      title: '降低整体代码复杂度',
      description: '将平均复杂度从当前水平降低到 20 以下',
      priority: 'medium',
      estimatedEffort: '5-7 days',
      benefit: '提高代码可维护性和可测试性'
    });

    goals.push({
      category: 'testing',
      title: '提高测试覆盖率',
      description: '将测试通过率从当前水平提升到 98% 以上',
      priority: 'medium',
      estimatedEffort: '3-4 days',
      benefit: '提高系统稳定性'
    });

    this.report.longTermGoals = goals;
  }

  saveReport() {
    console.log('💾 保存报告...');

    const outputDir = path.resolve(this.projectDir, 'tasks');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, `optimization-analysis-${Date.now()}.md`);
    const jsonPath = path.join(outputDir, `optimization-analysis-${Date.now()}.json`);

    // 生成 Markdown 报告
    const markdown = this.generateMarkdownReport();
    fs.writeFileSync(outputPath, markdown);

    // 保存 JSON 数据
    fs.writeFileSync(jsonPath, JSON.stringify(this.report, null, 2));

    console.log(`\n✅ 报告已生成:`);
    console.log(`   📄 Markdown: ${outputPath}`);
    console.log(`   📊 JSON: ${jsonPath}`);

    return { outputPath, jsonPath };
  }

  generateMarkdownReport() {
    const { summary, priorityQueue, quickWins, longTermGoals, testResults, codeQuality, performance } = this.report;

    return `# OPRCLI 系统优化分析报告

**生成时间**: ${new Date().toLocaleString('zh-CN')}
**项目版本**: ${summary.project.version}
**分析目录**: ${summary.project.location}

---

## 📊 执行摘要

### 系统健康度评估

| 维度 | 状态 | 说明 |
|------|------|------|
| **整体健康度** | ${summary.health.overall.toUpperCase()} | ${this.getHealthDescription(summary.health.overall)} |
| **功能测试** | ${summary.health.tests.toUpperCase()} | 测试通过率: ${summary.metrics.testPassRate}% |
| **代码质量** | ${summary.health.codeQuality.toUpperCase()} | 平均复杂度: ${codeQuality.summary?.avgComplexity || 'N/A'} |
| **性能表现** | ${summary.health.performance.toUpperCase()} | 性能评分: ${summary.metrics.performanceScore}/100 |
| **架构设计** | ${summary.health.architecture.toUpperCase()} | 架构改进机会: ${this.report.abstraction.summary?.totalOpportunities || 0} 个 |

### 关键指标

- **技术债务估算**: ${summary.metrics.technicalDebt} 点
- **代码重复率**: ${summary.metrics.codeDuplication}%
- **高优先级问题**: ${priorityQueue.filter(p => p.priority === 'critical' || p.priority === 'high').length} 个
- **快速改进机会**: ${quickWins.length} 个

---

## 🎯 优先级队列

### 🔴 关键问题 (立即处理)

${priorityQueue.filter(p => p.priority === 'critical').map((item, i) => `
${i + 1}. **${item.title}**
   - **类别**: ${item.category}
   - **文件**: ${item.file || '多个文件'}
   - **描述**: ${item.description}
   - **预计工作量**: ${item.estimatedEffort}
   - **影响**: ${item.impact}
   - **风险**: ${item.risk}
`).join('')}

${priorityQueue.filter(p => p.priority === 'critical').length === 0 ? '*暂无关键问题*' : ''}

### 🟠 高优先级 (本周处理)

${priorityQueue.filter(p => p.priority === 'high').slice(0, 5).map((item, i) => `
${i + 1}. **${item.title}**
   - **类别**: ${item.category}
   - **描述**: ${item.description}
   - **预计工作量**: ${item.estimatedEffort}
   - **影响**: ${item.impact}
   - **风险**: ${item.risk}
`).join('')}

---

## ⚡ 快速改进

${quickWins.map((item, i) => `
${i + 1}. **${item.title}**
   - **类别**: ${item.category}
   - **投入**: ${item.effort}
   - **产出**: ${item.impact}
   - **描述**: ${item.description}
`).join('')}

---

## 🎯 长期目标

${longTermGoals.map((item, i) => `
${i + 1}. **${item.title}**
   - **类别**: ${item.category}
   - **优先级**: ${item.priority}
   - **描述**: ${item.description}
   - **预计工作量**: ${item.estimatedEffort}
   - **收益**: ${item.benefit}
`).join('')}

---

## 📋 详细分析结果

### 功能测试结果

- **总测试数**: ${testResults.summary?.total || 0}
- **通过**: ${testResults.summary?.passed || 0}
- **失败**: ${testResults.summary?.failed || 0}
- **警告**: ${testResults.summary?.warnings || 0}
- **通过率**: ${summary.metrics.testPassRate}%

### 代码质量分析

- **总文件数**: ${codeQuality.summary?.totalFiles || 0}
- **总代码行数**: ${codeQuality.summary?.totalLines || 0}
- **平均复杂度**: ${codeQuality.summary?.avgComplexity || 'N/A'}
- **高复杂度文件**: ${codeQuality.summary?.highComplexityFiles || 0}
- **JSDoc 覆盖率**: ${codeQuality.summary?.jsdocCoverage || 0}%

### 性能分析

- **性能健康度**: ${performance.summary?.performanceHealth?.toUpperCase() || 'N/A'}
- **关键瓶颈**: ${performance.summary?.highImpactBottlenecks || 0}
- **中等问题**: ${performance.summary?.mediumImpactBottlenecks || 0}
- **优化模式**: ${performance.summary?.optimizationPatterns || 0}

---

## 💡 下一步行动

### 本周重点
${priorityQueue.filter(p => p.priority === 'critical' || p.priority === 'high').slice(0, 3).map((item, i) => `
${i + 1}. ${item.title} (${item.estimatedEffort})
`).join('')}

### 建议流程
1. **立即**: 处理所有关键问题
2. **本周**: 完成高优先级项目
3. **本月**: 实施快速改进
4. **长期**: 规划架构改进

---

## 📌 总结

OPRCLI 系统整体状态${summary.health.overall === 'excellent' ? '优秀' : summary.health.overall === 'good' ? '良好' : summary.health.overall === 'fair' ? '一般' : '需要改进'}，${summary.metrics.testPassRate >= 90 ? '功能测试表现优秀' : '功能测试有待改进'}。

**主要优势**:
- ✅ 测试覆盖率较高 (${summary.metrics.testPassRate}%)
- ✅ JSDoc 文档完善 (${codeQuality.summary?.jsdocCoverage || 0}%)
- ✅ 插件系统架构良好

**改进空间**:
- ⚠️ ${performance.summary?.highImpactBottlenecks || 0} 个关键性能瓶颈需要处理
- ⚠️ ${codeQuality.summary?.highComplexityFiles || 0} 个文件复杂度过高
- ⚠️ 代码重复率 ${summary.metrics.codeDuplication}%，建议优化

**建议优先级**:
1. **性能优化**: 解决 IFlow 轮询问题
2. **代码重构**: 降低高复杂度文件的复杂度
3. **架构改进**: 实现推荐的抽象模式

---

*报告由 OPRCLI 自动分析生成*
`;
  }

  getHealthDescription(health) {
    const descriptions = {
      excellent: '系统状态优秀，继续保持',
      good: '系统状态良好，有改进空间',
      fair: '系统状态一般，需要关注',
      poor: '系统状态需要改进'
    };
    return descriptions[health] || '未知状态';
  }
}

// 运行报告生成
if (require.main === module) {
  const generator = new ReportGenerator('D:/space/oprcli');
  const report = generator.generate();

  console.log('\n✅ 综合分析报告生成完成！');
}

module.exports = ReportGenerator;
