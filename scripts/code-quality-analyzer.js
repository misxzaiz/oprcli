/**
 * OPRCLI 代码质量分析器
 * 分析代码重复、复杂度、命名规范等
 */

const fs = require('fs');
const path = require('path');

class CodeQualityAnalyzer {
  constructor(projectDir) {
    this.projectDir = projectDir;
    this.analysis = {
      timestamp: new Date().toISOString(),
      files: [],
      duplicates: [],
      complexity: [],
      naming: [],
      summary: {}
    };
  }

  analyzeAll() {
    console.log('🔍 开始代码质量分析...\n');

    this.analyzeDirectory('./utils', 'Utils');
    this.analyzeDirectory('./connectors', 'Connectors');
    this.analyzeDirectory('./integrations', 'Integrations');
    this.analyzeDirectory('./plugins/core', 'Plugins');

    this.findDuplicatePatterns();
    this.calculateMetrics();
    this.generateRecommendations();

    return this.analysis;
  }

  analyzeDirectory(dirPath, category) {
    const fullPath = path.resolve(this.projectDir, dirPath);
    if (!fs.existsSync(fullPath)) return;

    const files = fs.readdirSync(fullPath).filter(f => f.endsWith('.js'));

    files.forEach(file => {
      const filePath = path.join(fullPath, file);
      this.analyzeFile(filePath, category);
    });
  }

  analyzeFile(filePath, category) {
    const content = fs.readFileSync(filePath, 'utf8');
    const stats = fs.statSync(filePath);
    const fileName = path.basename(filePath);

    const fileAnalysis = {
      path: filePath,
      category,
      name: fileName,
      size: stats.size,
      lines: content.split('\n').length,
      functions: this.extractFunctions(content),
      imports: this.extractImports(content),
      exports: this.extractExports(content),
      hasJSDoc: this.hasJSDoc(content),
      complexity: this.calculateComplexity(content)
    };

    this.analysis.files.push(fileAnalysis);
  }

  extractFunctions(content) {
    // 简单的函数提取正则
    const patterns = [
      /function\s+(\w+)/g,
      /(\w+)\s*:\s*function/g,
      /(\w+)\s*\(.*\)\s*{/g
    ];

    const functions = [];
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1] && !match[1].match(/^(if|while|for|switch|catch)$/)) {
          functions.push(match[1]);
        }
      }
    });

    return [...new Set(functions)];
  }

  extractImports(content) {
    const imports = [];
    const patterns = [
      /require\(['"]([^'"]+)['"]\)/g,
      /from\s+['"]([^'"]+)['"]/g
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        imports.push(match[1]);
      }
    });

    return [...new Set(imports)];
  }

  extractExports(content) {
    const exports = [];
    const patterns = [
      /module\.exports\.(\w+)/g,
      /exports\.(\w+)/g
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        exports.push(match[1]);
      }
    });

    return [...new Set(exports)];
  }

  hasJSDoc(content) {
    return /\/\*\*/.test(content);
  }

  calculateComplexity(content) {
    // 简单的圈复杂度计算
    let complexity = 1;
    const patterns = [
      /\bif\b/g,
      /\belse\b/g,
      /\bfor\b/g,
      /\bwhile\b/g,
      /\bswitch\b/g,
      /\bcase\b/g,
      /\bcatch\b/g,
      /\?\s*:/g  // 三元运算符
    ];

    patterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    });

    // 计算嵌套深度
    const maxNesting = this.calculateNestingDepth(content);
    complexity += maxNesting * 0.5;

    return Math.round(complexity);
  }

  calculateNestingDepth(content) {
    let maxDepth = 0;
    let currentDepth = 0;

    for (let i = 0; i < content.length; i++) {
      if (content[i] === '{') {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else if (content[i] === '}') {
        currentDepth--;
      }
    }

    return maxDepth;
  }

  findDuplicatePatterns() {
    console.log('🔍 查找重复模式...');

    const fileGroups = {};
    this.analysis.files.forEach(file => {
      const baseName = file.name.replace(/-enhanced|-v\d+|-middleware/g, '').replace(/\.js$/, '');
      if (!fileGroups[baseName]) {
        fileGroups[baseName] = [];
      }
      fileGroups[baseName].push(file);
    });

    Object.entries(fileGroups).forEach(([name, files]) => {
      if (files.length > 1) {
        this.analysis.duplicates.push({
          pattern: name,
          files: files.map(f => ({ name: f.name, size: f.size })),
          totalSize: files.reduce((sum, f) => sum + f.size, 0),
          recommendation: this.getDuplicateRecommendation(files)
        });
      }
    });

    // 查找代码重复
    this.findCodeDuplicates();
  }

  findCodeDuplicates() {
    const commonPatterns = [
      {
        name: '错误处理模式',
        pattern: /try\s*{[\s\S]*?}\s*catch\s*\([^)]*\)\s*{[\s\S]*?}/g,
        description: 'Try-catch 错误处理'
      },
      {
        name: '日志记录模式',
        pattern: /logger\.(log|info|warn|error|debug)\([^)]*\)/g,
        description: '日志记录调用'
      },
      {
        name: '配置读取模式',
        pattern: /config\.\w+(\.\w+)*/g,
        description: '配置对象访问'
      },
      {
        name: 'Promise 链式调用',
        pattern: /\.then\([^)]*\)\.catch\([^)]*\)/g,
        description: 'Promise 错误处理'
      }
    ];

    this.analysis.files.forEach(file => {
      const content = fs.readFileSync(file.path, 'utf8');

      commonPatterns.forEach(pattern => {
        const matches = content.match(pattern.pattern);
        if (matches && matches.length > 3) {
          this.analysis.duplicates.push({
            pattern: pattern.name,
            file: file.name,
            count: matches.length,
            description: pattern.description,
            type: 'code_pattern'
          });
        }
      });
    });
  }

  getDuplicateRecommendation(files) {
    const enhancedFiles = files.filter(f => f.name.includes('-enhanced') || f.name.includes('-v2'));

    if (enhancedFiles.length > 0) {
      return {
        action: 'merge',
        reason: '存在增强版本，建议合并或移除旧版本',
        priority: 'medium'
      };
    }

    return {
      action: 'review',
      reason: '功能相似，建议审查是否可以合并',
      priority: 'low'
    };
  }

  calculateMetrics() {
    console.log('📊 计算质量指标...');

    const totalFiles = this.analysis.files.length;
    const totalLines = this.analysis.files.reduce((sum, f) => sum + f.lines, 0);
    const totalSize = this.analysis.files.reduce((sum, f) => sum + f.size, 0);

    const avgComplexity = this.analysis.files.reduce((sum, f) => sum + f.complexity, 0) / totalFiles;
    const highComplexityFiles = this.analysis.files.filter(f => f.complexity > 20);

    const filesWithJSDoc = this.analysis.files.filter(f => f.hasJSDoc).length;

    this.analysis.summary = {
      totalFiles,
      totalLines,
      totalSize: Math.round(totalSize / 1024), // KB
      avgComplexity: Math.round(avgComplexity * 10) / 10,
      highComplexityFiles: highComplexityFiles.length,
      jsdocCoverage: Math.round((filesWithJSDoc / totalFiles) * 100),
      duplicatePatterns: this.analysis.duplicates.length,
      avgFileSize: Math.round((totalSize / totalFiles) / 1024 * 100) / 100 // KB
    };
  }

  generateRecommendations() {
    console.log('💡 生成优化建议...');

    const recommendations = [];

    // 1. 处理重复文件
    this.analysis.duplicates.forEach(dup => {
      if (dup.files) {
        recommendations.push({
          category: '重复代码',
          priority: 'medium',
          title: `合并重复文件: ${dup.pattern}`,
          description: `发现 ${dup.files.length} 个相似文件，总大小 ${Math.round(dup.totalSize / 1024)}KB`,
          action: 'review_and_merge',
          files: dup.files.map(f => f.name)
        });
      }
    });

    // 2. 处理高复杂度文件
    const highComplexityFiles = this.analysis.files.filter(f => f.complexity > 20);
    highComplexityFiles.forEach(file => {
      recommendations.push({
        category: '代码复杂度',
        priority: 'high',
        title: `降低复杂度: ${file.name}`,
        description: `复杂度为 ${file.complexity}，建议重构为更小的函数`,
        action: 'refactor',
        file: file.name,
        currentComplexity: file.complexity
      });
    });

    // 3. 处理大文件
    const largeFiles = this.analysis.files.filter(f => f.size > 15 * 1024);
    largeFiles.forEach(file => {
      recommendations.push({
        category: '文件大小',
        priority: 'medium',
        title: `拆分大文件: ${file.name}`,
        description: `文件大小为 ${Math.round(file.size / 1024)}KB，建议拆分`,
        action: 'split',
        file: file.name,
        currentSize: Math.round(file.size / 1024)
      });
    });

    // 4. 处理缺少 JSDoc 的文件
    const filesWithoutJSDoc = this.analysis.files.filter(f => !f.hasJSDoc && f.functions.length > 0);
    if (filesWithoutJSDoc.length > 5) {
      recommendations.push({
        category: '文档',
        priority: 'low',
        title: '添加 JSDoc 注释',
        description: `${filesWithoutJSDoc.length} 个文件缺少 JSDoc 注释`,
        action: 'document',
        count: filesWithoutJSDoc.length
      });
    }

    this.analysis.recommendations = recommendations;
  }

  generateReport() {
    console.log('\n📋 代码质量分析报告');
    console.log('=' .repeat(60));

    const { summary, duplicates, recommendations } = this.analysis;

    console.log('\n📊 总体指标:');
    console.log(`  文件总数: ${summary.totalFiles}`);
    console.log(`  总代码行数: ${summary.totalLines}`);
    console.log(`  总大小: ${summary.totalSize}KB`);
    console.log(`  平均复杂度: ${summary.avgComplexity}`);
    console.log(`  高复杂度文件: ${summary.highComplexityFiles}`);
    console.log(`  JSDoc 覆盖率: ${summary.jsdocCoverage}%`);
    console.log(`  重复模式: ${summary.duplicatePatterns}`);

    console.log('\n⚠️  重复模式:');
    if (duplicates.length > 0) {
      duplicates.slice(0, 10).forEach(dup => {
        if (dup.files) {
          console.log(`  • ${dup.pattern}: ${dup.files.length} 个文件`);
        } else if (dup.type === 'code_pattern') {
          console.log(`  • ${dup.pattern}: ${dup.file} (${dup.count} 次)`);
        }
      });
    } else {
      console.log('  未发现重复模式');
    }

    console.log('\n💡 优化建议:');
    recommendations.slice(0, 10).forEach((rec, i) => {
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
  const analyzer = new CodeQualityAnalyzer('D:/space/oprcli');
  const analysis = analyzer.analyzeAll();

  const report = analyzer.generateReport();

  // 保存报告
  const outputDir = path.resolve('D:/space/oprcli/tasks');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, `code-quality-analysis-${Date.now()}.json`);
  analyzer.saveReport(outputPath);
}

module.exports = CodeQualityAnalyzer;
