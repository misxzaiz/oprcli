/**
 * OPRCLI 性能瓶颈分析器
 * 分析代码中的性能瓶颈和优化机会
 */

const fs = require('fs');
const path = require('path');

class PerformanceAnalyzer {
  constructor(projectDir) {
    this.projectDir = projectDir;
    this.analysis = {
      timestamp: new Date().toISOString(),
      bottlenecks: [],
      patterns: [],
      recommendations: [],
      summary: {}
    };
  }

  analyze() {
    console.log('🚀 开始性能分析...\n');

    this.analyzeIOWaitPatterns();
    this.analyzeSynchronousOperations();
    this.analyzeLoopPatterns();
    this.analyzeMemoryLeaks();
    this.analyzeCacheOpportunities();
    this.analyzeConnectorPerformance();
    this.generateRecommendations();
    this.calculateSummary();

    return this.analysis;
  }

  analyzeIOWaitPatterns() {
    console.log('🔍 分析 I/O 等待模式...');

    const criticalFiles = [
      './connectors/iflow-connector.js',
      './integrations/dingtalk.js',
      './server.js'
    ];

    criticalFiles.forEach(filePath => {
      const fullPath = path.resolve(this.projectDir, filePath);
      if (!fs.existsSync(fullPath)) return;

      const content = fs.readFileSync(fullPath, 'utf8');

      // 检查轮询模式
      const setIntervalMatches = content.match(/setInterval\([^)]+\)/g);
      if (setIntervalMatches) {
        setIntervalMatches.forEach(match => {
          const delay = match.match(/,\s*(\d+)\)/);
          if (delay && delay[1] < 500) {
            this.analysis.bottlenecks.push({
              type: 'high_frequency_polling',
              file: filePath,
              code: match,
              impact: 'high',
              description: `高频轮询 (${delay[1]}ms) 可能导致 CPU 占用过高`,
              recommendation: '考虑使用事件驱动或增加轮询间隔'
            });
          }
        });
      }

      // 检查同步文件操作
      const syncFSMatches = content.match(/\b(readFileSync|writeFileSync|existsSync)\(/g);
      if (syncFSMatches) {
        this.analysis.bottlenecks.push({
          type: 'sync_file_operations',
          file: filePath,
          count: syncFSMatches.length,
          impact: 'medium',
          description: `发现 ${syncFSMatches.length} 个同步文件操作`,
          recommendation: '使用异步文件操作提高并发性能'
        });
      }
    });
  }

  analyzeSynchronousOperations() {
    console.log('🔍 分析同步阻塞操作...');

    const utilsDir = path.resolve(this.projectDir, 'utils');
    if (!fs.existsSync(utilsDir)) return;

    const files = fs.readdirSync(utilsDir).filter(f => f.endsWith('.js'));

    files.forEach(file => {
      const filePath = path.join(utilsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');

      // 检查 JSON.parse 在大文件上的使用
      const jsonParseMatches = content.match(/JSON\.parse\([^)]+\)/g);
      if (jsonParseMatches && jsonParseMatches.length > 2) {
        this.analysis.patterns.push({
          type: 'json_parsing',
          file: `utils/${file}`,
          count: jsonParseMatches.length,
          impact: 'low',
          description: '频繁的 JSON 解析操作',
          recommendation: '考虑缓存解析结果或使用流式解析'
        });
      }

      // 检查正则表达式重复编译
      const regexMatches = content.match(/\/[^/]+\/[gimuy]*/g);
      if (regexMatches) {
        const uniqueRegex = new Set(regexMatches);
        if (uniqueRegex.size > 5) {
          this.analysis.patterns.push({
            type: 'regex_compilation',
            file: `utils/${file}`,
            count: uniqueRegex.size,
            impact: 'low',
            description: '多个正则表达式可能被重复编译',
            recommendation: '预编译正则表达式并缓存'
          });
        }
      }
    });
  }

  analyzeLoopPatterns() {
    console.log('🔍 分析循环模式...');

    const heavyFiles = [
      './connectors/iflow-connector.js',
      './utils/message-formatter.js',
      './integrations/dingtalk.js'
    ];

    heavyFiles.forEach(filePath => {
      const fullPath = path.resolve(this.projectDir, filePath);
      if (!fs.existsSync(fullPath)) return;

      const content = fs.readFileSync(fullPath, 'utf8');

      // 检查嵌套循环
      const nestedLoops = this.findNestedLoops(content);
      if (nestedLoops > 3) {
        this.analysis.bottlenecks.push({
          type: 'nested_loops',
          file: filePath,
          complexity: nestedLoops,
          impact: 'high',
          description: `发现 ${nestedLoops} 层嵌套循环`,
          recommendation: '考虑使用 Map 或优化算法减少复杂度'
        });
      }

      // 检查循环中的重复计算
      const loopWithRegex = content.match(/for\s*\([^)]+\)\s*{[\s\S]*?\/[^\/]+\/[\s\S]*?}/g);
      if (loopWithRegex) {
        this.analysis.patterns.push({
          type: 'loop_computation',
          file: filePath,
          count: loopWithRegex.length,
          impact: 'medium',
          description: '循环中可能存在重复计算',
          recommendation: '将不变的计算移出循环'
        });
      }
    });
  }

  findNestedLoops(content) {
    let maxDepth = 0;
    let currentDepth = 0;

    const lines = content.split('\n');
    lines.forEach(line => {
      if (/\b(for|while)\s*\(/.test(line)) {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else if (/^\s*}\s*$/.test(line) && currentDepth > 0) {
        currentDepth--;
      }
    });

    return maxDepth;
  }

  analyzeMemoryLeaks() {
    console.log('🔍 分析内存泄漏风险...');

    const filesToCheck = [
      './server.js',
      './connectors/iflow-connector.js',
      './integrations/dingtalk.js'
    ];

    filesToCheck.forEach(filePath => {
      const fullPath = path.resolve(this.projectDir, filePath);
      if (!fs.existsSync(fullPath)) return;

      const content = fs.readFileSync(fullPath, 'utf8');

      // 检查全局变量
      const globalVars = content.match(/global\.\w+\s*=/g);
      if (globalVars) {
        this.analysis.bottlenecks.push({
          type: 'global_variables',
          file: filePath,
          count: globalVars.length,
          impact: 'high',
          description: `发现 ${globalVars.length} 个全局变量赋值`,
          recommendation: '避免使用全局变量，使用模块作用域'
        });
      }

      // 检查事件监听器
      const eventListeners = content.match(/\.on\(/g);
      if (eventListeners && eventListeners.length > 5) {
        const removeListeners = content.match(/\.off\(/g);
        const ratio = removeListeners ? eventListeners.length / removeListeners.length : eventListeners.length;

        if (ratio > 2) {
          this.analysis.patterns.push({
            type: 'event_listener_leak',
            file: filePath,
            listeners: eventListeners.length,
            impact: 'medium',
            description: `事件监听器可能未正确清理 (比率: ${ratio.toFixed(1)})`,
            recommendation: '确保移除不再需要的事件监听器'
          });
        }
      }

      // 检查定时器清理
      const setIntervalCalls = content.match(/setInterval\(/g);
      const clearIntervalCalls = content.match(/clearInterval\(/g);

      if (setIntervalCalls && (!clearIntervalCalls || setIntervalCalls.length > clearIntervalCalls.length)) {
        this.analysis.bottlenecks.push({
          type: 'timer_leak',
          file: filePath,
          started: setIntervalCalls.length,
          cleared: clearIntervalCalls ? clearIntervalCalls.length : 0,
          impact: 'high',
          description: '定时器可能未正确清理',
          recommendation: '确保在适当时机清理定时器'
        });
      }
    });
  }

  analyzeCacheOpportunities() {
    console.log('🔍 分析缓存机会...');

    const cacheablePatterns = [
      {
        name: '配置读取',
        pattern: /require\(['"].*config['"]\)/g,
        description: '配置文件读取可以缓存'
      },
      {
        name: '消息格式化',
        pattern: /formatMessage\(/g,
        description: '消息格式化模板可以缓存'
      },
      {
        name: '正则表达式',
        pattern: /\/[^\/]+\/[gimuy]*/g,
        description: '正则表达式可以预编译'
      }
    ];

    const utilsDir = path.resolve(this.projectDir, 'utils');
    if (!fs.existsSync(utilsDir)) return;

    const files = fs.readdirSync(utilsDir).filter(f => f.endsWith('.js'));

    files.forEach(file => {
      const filePath = path.join(utilsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');

      cacheablePatterns.forEach(pattern => {
        const matches = content.match(pattern.pattern);
        if (matches && matches.length > 3) {
          this.analysis.patterns.push({
            type: 'cache_opportunity',
            file: `utils/${file}`,
            pattern: pattern.name,
            count: matches.length,
            impact: 'low',
            description: pattern.description,
            recommendation: '考虑使用缓存减少重复计算'
          });
        }
      });
    });
  }

  analyzeConnectorPerformance() {
    console.log('🔍 分析连接器性能...');

    const connectors = [
      { path: './connectors/iflow-connector.js', name: 'IFlow' },
      { path: './connectors/claude-connector.js', name: 'Claude' }
    ];

    connectors.forEach(connector => {
      const fullPath = path.resolve(this.projectDir, connector.path);
      if (!fs.existsSync(fullPath)) return;

      const content = fs.readFileSync(fullPath, 'utf8');

      // 检查 JSONL 监控效率（IFlow 特有）
      if (connector.name === 'IFlow') {
        const pollingPattern = content.match(/setInterval\([^,]+,\s*\d+\)/g);
        if (pollingPattern) {
          pollingPattern.forEach(pattern => {
            const delay = pattern.match(/,\s*(\d+)\)/);
            if (delay && delay[1] === '100') {
              this.analysis.bottlenecks.push({
                type: 'iflow_polling',
                file: connector.path,
                delay: delay[1],
                impact: 'high',
                description: 'IFlow JSONL 监控轮询间隔为 100ms',
                recommendation: '考虑使用文件监听 (fs.watch) 或增加间隔到 500ms'
              });
            }
          });
        }
      }

      // 检查重试机制
      const retryPattern = content.match(/retry|重试/gi);
      if (retryPattern && retryPattern.length > 5) {
        this.analysis.patterns.push({
          type: 'retry_mechanism',
          file: connector.path,
          count: retryPattern.length,
          impact: 'medium',
          description: `发现 ${retryPattern.length} 处重试逻辑`,
          recommendation: '确保重试逻辑有退避策略'
        });
      }
    });
  }

  generateRecommendations() {
    console.log('💡 生成性能优化建议...');

    // 按影响程度排序瓶颈
    const highImpact = this.analysis.bottlenecks.filter(b => b.impact === 'high');
    const mediumImpact = this.analysis.bottlenecks.filter(b => b.impact === 'medium');

    // 高优先级建议
    highImpact.forEach(bottleneck => {
      this.analysis.recommendations.push({
        priority: 'high',
        category: bottleneck.type,
        title: this.getTitleForBottleneck(bottleneck),
        description: bottleneck.description,
        recommendation: bottleneck.recommendation,
        file: bottleneck.file,
        estimatedImpact: 'significant'
      });
    });

    // 中优先级建议
    mediumImpact.forEach(bottleneck => {
      this.analysis.recommendations.push({
        priority: 'medium',
        category: bottleneck.type,
        title: this.getTitleForBottleneck(bottleneck),
        description: bottleneck.description,
        recommendation: bottleneck.recommendation,
        file: bottleneck.file,
        estimatedImpact: 'moderate'
      });
    });

    // 模式优化建议
    const patternGroups = {};
    this.analysis.patterns.forEach(pattern => {
      const key = `${pattern.type}_${pattern.pattern || 'general'}`;
      if (!patternGroups[key]) {
        patternGroups[key] = [];
      }
      patternGroups[key].push(pattern);
    });

    Object.values(patternGroups).forEach(group => {
      if (group.length > 2) {
        this.analysis.recommendations.push({
          priority: 'low',
          category: 'pattern_optimization',
          title: `优化 ${group[0].type} 模式`,
          description: `在 ${group.length} 个文件中发现此模式`,
          recommendation: group[0].recommendation,
          files: group.map(g => g.file),
          estimatedImpact: 'minor'
        });
      }
    });
  }

  getTitleForBottleneck(bottleneck) {
    const titles = {
      high_frequency_polling: '优化高频轮询',
      sync_file_operations: '替换同步文件操作',
      nested_loops: '减少嵌套循环',
      global_variables: '移除全局变量',
      timer_leak: '修复定时器泄漏',
      event_listener_leak: '清理事件监听器',
      iflow_polling: '优化 IFlow 轮询策略'
    };

    return titles[bottleneck.type] || '性能优化';
  }

  calculateSummary() {
    console.log('📊 计算性能指标...');

    const highImpact = this.analysis.bottlenecks.filter(b => b.impact === 'high').length;
    const mediumImpact = this.analysis.bottlenecks.filter(b => b.impact === 'medium').length;
    const lowImpact = this.analysis.patterns.length;

    this.analysis.summary = {
      totalBottlenecks: this.analysis.bottlenecks.length,
      highImpactBottlenecks: highImpact,
      mediumImpactBottlenecks: mediumImpact,
      optimizationPatterns: this.analysis.patterns.length,
      totalRecommendations: this.analysis.recommendations.length,
      criticalIssues: highImpact,
      performanceHealth: this.calculatePerformanceHealth(highImpact, mediumImpact, lowImpact)
    };
  }

  calculatePerformanceHealth(high, medium, low) {
    const score = 100 - (high * 15) - (medium * 5) - (low * 1);
    const normalizedScore = Math.max(0, Math.min(100, score));

    if (normalizedScore >= 80) return 'excellent';
    if (normalizedScore >= 60) return 'good';
    if (normalizedScore >= 40) return 'fair';
    return 'poor';
  }

  generateReport() {
    console.log('\n📋 性能分析报告');
    console.log('=' .repeat(60));

    const { summary, bottlenecks, patterns, recommendations } = this.analysis;

    console.log('\n📊 性能指标:');
    console.log(`  性能健康度: ${summary.performanceHealth.toUpperCase()}`);
    console.log(`  关键瓶颈: ${summary.highImpactBottlenecks}`);
    console.log(`  中等问题: ${summary.mediumImpactBottlenecks}`);
    console.log(`  优化模式: ${summary.optimizationPatterns}`);
    console.log(`  总建议数: ${summary.totalRecommendations}`);

    console.log('\n🔴 关键性能瓶颈:');
    if (bottlenecks.filter(b => b.impact === 'high').length > 0) {
      bottlenecks.filter(b => b.impact === 'high').forEach((b, i) => {
        console.log(`  ${i + 1}. ${b.file}`);
        console.log(`     ${b.description}`);
        console.log(`     建议: ${b.recommendation}`);
      });
    } else {
      console.log('  未发现关键瓶颈');
    }

    console.log('\n💡 优先优化建议:');
    recommendations.slice(0, 5).forEach((rec, i) => {
      const priority = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
      console.log(`  ${i + 1}. ${priority} ${rec.title}`);
      console.log(`     ${rec.description}`);
    });

    console.log('\n' + '='.repeat(60));

    return this.analysis;
  }

  saveReport(outputPath) {
    const reportData = {
      ...this.analysis,
      generatedAt: new Date().toLocaleString('zh-CN')
    };

    fs.writeFileSync(outputPath, JSON.stringify(reportData, null, 2));
    console.log(`\n📄 报告已保存: ${outputPath}`);
  }
}

// 运行分析
if (require.main === module) {
  const analyzer = new PerformanceAnalyzer('D:/space/oprcli');
  const analysis = analyzer.analyze();

  const report = analyzer.generateReport();

  // 保存报告
  const outputDir = path.resolve('D:/space/oprcli/tasks');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, `performance-analysis-${Date.now()}.json`);
  analyzer.saveReport(outputPath);
}

module.exports = PerformanceAnalyzer;
