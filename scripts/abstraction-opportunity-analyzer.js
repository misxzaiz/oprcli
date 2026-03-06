/**
 * OPRCLI 抽象机会分析器
 * 识别代码抽象和重构机会
 */

const fs = require('fs');
const path = require('path');

class AbstractionAnalyzer {
  constructor(projectDir) {
    this.projectDir = projectDir;
    this.analysis = {
      timestamp: new Date().toISOString(),
      opportunities: [],
      designPatterns: [],
      interfaces: [],
      recommendations: [],
      summary: {}
    };
  }

  analyze() {
    console.log('🎨 开始抽象机会分析...\n');

    this.analyzeConnectors();
    this.analyzeUtilityFunctions();
    this.analyzeConfigManagement();
    this.analyzeLoggingPatterns();
    this.analyzeErrorHandling();
    this.analyzeMessageProcessing();
    this.identifyDesignPatterns();
    this.generateRecommendations();
    this.calculateSummary();

    return this.analysis;
  }

  analyzeConnectors() {
    console.log('🔍 分析连接器抽象...');

    const connectorsDir = path.resolve(this.projectDir, 'connectors');
    if (!fs.existsSync(connectorsDir)) return;

    const baseConnectorPath = path.join(connectorsDir, 'base-connector.js');
    const claudeConnectorPath = path.join(connectorsDir, 'claude-connector.js');
    const iflowConnectorPath = path.join(connectorsDir, 'iflow-connector.js');

    if (!fs.existsSync(baseConnectorPath)) {
      this.analysis.opportunities.push({
        category: 'connector_abstraction',
        priority: 'high',
        title: '创建 BaseConnector 抽象基类',
        description: '缺少统一的连接器基类，导致代码重复',
        recommendation: '创建 BaseConnector 类定义通用接口',
        affectedFiles: ['claude-connector.js', 'iflow-connector.js'],
        estimatedBenefit: '减少 30% 重复代码'
      });
      return;
    }

    const baseConnector = fs.readFileSync(baseConnectorPath, 'utf8');
    const claudeConnector = fs.readFileSync(claudeConnectorPath, 'utf8');
    const iflowConnector = fs.readFileSync(iflowConnectorPath, 'utf8');

    // 检查共同方法
    const commonMethods = this.findCommonMethods([baseConnector, claudeConnector, iflowConnector]);

    if (commonMethods.length > 0) {
      this.analysis.interfaces.push({
        type: 'connector_interface',
        methods: commonMethods,
        implementations: 2,
        coverage: Math.round((commonMethods.length / 10) * 100),
        status: 'partially_implemented'
      });
    }

    // 简化版本：直接分析连接器
    this.analyzeConnectorContent(claudeConnector, 'claude');
    this.analyzeConnectorContent(iflowConnector, 'iflow');
  }

  findCommonMethods(contents) {
    const commonMethods = [];
    const methodPattern = /(\w+)\s*\([^)]*\)\s*{/g;

    const firstFileMethods = [];
    let match;
    while ((match = methodPattern.exec(contents[0])) !== null) {
      firstFileMethods.push(match[1]);
    }

    // 检查其他文件是否也有这些方法
    firstFileMethods.forEach(method => {
      let inAll = true;
      for (let i = 1; i < contents.length; i++) {
        if (!contents[i].includes(method + '(')) {
          inAll = false;
          break;
        }
      }
      if (inAll) {
        commonMethods.push(method);
      }
    });

    return commonMethods;
  }

  analyzeConnectorContent(content, name) {
    // 分析连接器内容，查找抽象机会
    const hasRetry = content.includes('retry');
    const hasCache = content.includes('cache');
    const hasLogger = content.includes('logger');

    if (hasRetry && hasCache && hasLogger) {
      this.analysis.interfaces.push({
        type: 'connector_features',
        connector: name,
        features: { retry: true, cache: true, logger: true },
        status: 'well_implemented'
      });
    }
  }

  analyzeSendPatterns(claudeConnector, iflowConnector) {
    // 检查重复的发送逻辑
    const sendPatterns = [
      { name: 'sendMessage', pattern: /sendMessage\s*\(/g },
      { name: 'sendEvent', pattern: /sendEvent\s*\(/g },
      { name: 'sendResponse', pattern: /sendResponse\s*\(/g }
    ];

    sendPatterns.forEach(pattern => {
      const inClaude = (claudeConnector.match(pattern.pattern) || []).length;
      const inIFlow = (iflowConnector.match(pattern.pattern) || []).length;

      if (inClaude > 0 && inIFlow > 0) {
        this.analysis.opportunities.push({
          category: 'send_logic_abstraction',
          priority: 'medium',
          title: `抽象 ${pattern.name} 方法`,
          description: '两个连接器都实现了相似的发送逻辑',
          recommendation: '将通用发送逻辑移至 BaseConnector',
          affectedFiles: ['claude-connector.js', 'iflow-connector.js', 'base-connector.js'],
          estimatedBenefit: '减少代码重复，提高可维护性'
        });
      }
    });
  }

  analyzeUtilityFunctions() {
    console.log('🔍 分析工具函数抽象...');

    const utilsDir = path.resolve(this.projectDir, 'utils');
    if (!fs.existsSync(utilsDir)) return;

    const files = fs.readdirSync(utilsDir).filter(f => f.endsWith('.js'));

    // 查找相似的工具函数
    const functionGroups = {};

    files.forEach(file => {
      const filePath = path.join(utilsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');

      // 查找导出的函数
      const exports = content.match(/module\.exports\.(\w+)/g);
      if (exports) {
        exports.forEach(exp => {
          const funcName = exp.match(/module\.exports\.(\w+)/)[1];
          if (!functionGroups[funcName]) {
            functionGroups[funcName] = [];
          }
          functionGroups[funcName].push({ file, content: content.substring(0, 500) });
        });
      }
    });

    // 查找重复的函数实现
    Object.entries(functionGroups).forEach(([funcName, implementations]) => {
      if (implementations.length > 1) {
        this.analysis.opportunities.push({
          category: 'utility_function_duplication',
          priority: 'low',
          title: `合并重复的 ${funcName} 函数`,
          description: `在 ${implementations.length} 个文件中发现同名函数`,
          recommendation: '统一实现，移除重复代码',
          affectedFiles: implementations.map(impl => impl.file),
          estimatedBenefit: '减少维护成本'
        });
      }
    });

    // 查找可以提取的通用功能
    const commonPatterns = [
      {
        name: 'retry_wrapper',
        pattern: /retry\s*\([^)]+\)\s*{/g,
        description: '重试包装器'
      },
      {
        name: 'cache_wrapper',
        pattern: /cache\s*\([^)]+\)\s*{/g,
        description: '缓存包装器'
      },
      {
        name: 'validate_wrapper',
        pattern: /validate\s*\([^)]+\)\s*{/g,
        description: '验证包装器'
      }
    ];

    commonPatterns.forEach(pattern => {
      files.forEach(file => {
        const filePath = path.join(utilsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const matches = content.match(pattern.pattern);

        if (matches && matches.length > 2) {
          this.analysis.opportunities.push({
            category: 'common_pattern_abstraction',
            priority: 'medium',
            title: `提取 ${pattern.description} 为高阶函数`,
            description: `在 ${file} 中发现 ${matches.length} 处使用`,
            recommendation: '创建通用的高阶函数包装器',
            affectedFiles: [file],
            estimatedBenefit: '提高代码复用性'
          });
        }
      });
    });
  }

  analyzeConfigManagement() {
    console.log('🔍 分析配置管理抽象...');

    const configFiles = [
      './utils/config.js',
      './config/default.json',
      './config/user.json'
    ];

    let hasConfigManager = false;
    let hasEnvManager = false;

    const utilsDir = path.resolve(this.projectDir, 'utils');
    if (fs.existsSync(utilsDir)) {
      const files = fs.readdirSync(utilsDir);
      hasConfigManager = files.includes('config.js');
      hasEnvManager = files.includes('env-manager.js');
    }

    if (hasConfigManager && hasEnvManager) {
      this.analysis.interfaces.push({
        type: 'config_management',
        status: 'implemented',
        components: ['config.js', 'env-manager.js'],
        coverage: 100
      });
    } else {
      this.analysis.opportunities.push({
        category: 'config_management',
        priority: 'high',
        title: '统一配置管理',
        description: '配置分散在多个文件中，难以维护',
        recommendation: '创建统一的 ConfigManager 类',
        affectedFiles: ['server.js', 'connectors/*.js'],
        estimatedBenefit: '简化配置管理，提高可维护性'
      });
    }

    // 检查配置验证
    const configDir = path.resolve(this.projectDir, 'config');
    if (fs.existsSync(configDir)) {
      const hasSchema = fs.existsSync(path.join(configDir, 'schema.json'));
      if (!hasSchema) {
        this.analysis.opportunities.push({
          category: 'config_validation',
          priority: 'medium',
          title: '添加配置验证 Schema',
          description: '缺少配置验证，可能导致运行时错误',
          recommendation: '使用 JSON Schema 验证配置',
          affectedFiles: ['config/*.json'],
          estimatedBenefit: '提前发现配置错误'
        });
      }
    }
  }

  analyzeLoggingPatterns() {
    console.log('🔍 分析日志模式抽象...');

    const integrationsDir = path.resolve(this.projectDir, 'integrations');
    if (!fs.existsSync(integrationsDir)) return;

    const loggerPath = path.join(integrationsDir, 'logger.js');
    if (!fs.existsSync(loggerPath)) {
      this.analysis.opportunities.push({
        category: 'logging_abstraction',
        priority: 'high',
        title: '创建统一的 Logger 类',
        description: '日志记录分散且不统一',
        recommendation: '实现统一的日志接口',
        affectedFiles: ['*.js'],
        estimatedBenefit: '统一日志格式，便于调试'
      });
      return;
    }

    const loggerCode = fs.readFileSync(loggerPath, 'utf8');

    // 检查日志级别支持
    const logLevels = ['debug', 'info', 'warn', 'error'];
    const implementedLevels = logLevels.filter(level =>
      loggerCode.includes(`${level}(`)
    );

    if (implementedLevels.length < logLevels.length) {
      this.analysis.opportunities.push({
        category: 'logging_levels',
        priority: 'low',
        title: '完善日志级别',
        description: `缺少日志级别: ${logLevels.filter(l => !implementedLevels.includes(l)).join(', ')}`,
        recommendation: '实现完整的日志级别体系',
        affectedFiles: ['integrations/logger.js'],
        estimatedBenefit: '更好的日志控制'
      });
    }

    // 检查结构化日志
    const hasStructuredLogging = loggerCode.includes('JSON.stringify') ||
                                  loggerCode.includes('format');

    if (!hasStructuredLogging) {
      this.analysis.opportunities.push({
        category: 'structured_logging',
        priority: 'medium',
        title: '添加结构化日志支持',
        description: '缺少结构化日志，不便解析和分析',
        recommendation: '支持 JSON 格式的结构化日志',
        affectedFiles: ['integrations/logger.js'],
        estimatedBenefit: '便于日志分析和监控'
      });
    }
  }

  analyzeErrorHandling() {
    console.log('🔍 分析错误处理抽象...');

    const utilsDir = path.resolve(this.projectDir, 'utils');
    if (!fs.existsSync(utilsDir)) return;

    const errorHandlerPath = path.join(utilsDir, 'error-handler.js');
    const errorRecoveryPath = path.join(utilsDir, 'error-recovery.js');

    let hasErrorHandler = fs.existsSync(errorHandlerPath);
    let hasErrorRecovery = fs.existsSync(errorRecoveryPath);

    if (!hasErrorHandler) {
      this.analysis.opportunities.push({
        category: 'error_handling',
        priority: 'high',
        title: '创建统一的错误处理机制',
        description: '错误处理逻辑分散，缺少统一标准',
        recommendation: '实现 ErrorHandler 类和自定义错误类型',
        affectedFiles: ['*.js'],
        estimatedBenefit: '统一错误处理，提高稳定性'
      });
    }

    // 检查自定义错误类型
    if (hasErrorHandler) {
      const errorHandler = fs.readFileSync(errorHandlerPath, 'utf8');
      const hasCustomErrors = errorHandler.includes('class.*Error');

      if (!hasCustomErrors) {
        this.analysis.opportunities.push({
          category: 'custom_error_types',
          priority: 'medium',
          title: '创建自定义错误类型',
          description: '缺少业务特定的错误类型',
          recommendation: '定义 AppError, ConfigError 等自定义错误',
          affectedFiles: ['utils/error-handler.js'],
          estimatedBenefit: '更精确的错误分类和处理'
        });
      }
    }

    // 检查错误恢复策略
    if (!hasErrorRecovery) {
      this.analysis.opportunities.push({
        category: 'error_recovery',
        priority: 'medium',
        title: '实现错误恢复策略',
        description: '缺少自动错误恢复机制',
        recommendation: '添加重试、降级、熔断等恢复策略',
        affectedFiles: ['utils/error-recovery.js'],
        estimatedBenefit: '提高系统容错能力'
      });
    }
  }

  analyzeMessageProcessing() {
    console.log('🔍 分析消息处理抽象...');

    const formatterPath = path.resolve(this.projectDir, 'utils/message-formatter.js');
    if (!fs.existsSync(formatterPath)) {
      this.analysis.opportunities.push({
        category: 'message_formatting',
        priority: 'high',
        title: '创建统一的消息格式化器',
        description: '消息格式化逻辑分散',
        recommendation: '实现 MessageFormatter 类',
        affectedFiles: ['integrations/dingtalk.js', 'connectors/*.js'],
        estimatedBenefit: '统一消息格式，便于维护'
      });
      return;
    }

    const formatter = fs.readFileSync(formatterPath, 'utf8');

    // 检查模板支持
    const hasTemplateSupport = formatter.includes('template') ||
                                formatter.includes('render');

    if (!hasTemplateSupport) {
      this.analysis.opportunities.push({
        category: 'message_templates',
        priority: 'medium',
        title: '添加消息模板支持',
        description: '缺少消息模板机制',
        recommendation: '实现可复用的消息模板',
        affectedFiles: ['utils/message-formatter.js'],
        estimatedBenefit: '简化消息格式化，提高复用性'
      });
    }

    // 检查多格式支持
    const formats = ['markdown', 'html', 'text'];
    const supportedFormats = formats.filter(format =>
      formatter.toLowerCase().includes(format)
    );

    if (supportedFormats.length < 2) {
      this.analysis.opportunities.push({
        category: 'multi_format_support',
        priority: 'low',
        title: '支持多种消息格式',
        description: '当前支持的格式有限',
        recommendation: '支持 Markdown, HTML, Text 等格式',
        affectedFiles: ['utils/message-formatter.js'],
        estimatedBenefit: '更灵活的消息展示'
      });
    }
  }

  identifyDesignPatterns() {
    console.log('🔍 识别设计模式机会...');

    const patterns = [
      {
        name: 'Factory Pattern',
        opportunity: '连接器工厂',
        description: '创建不同类型的连接器',
        location: 'connectors/connector-factory.js',
        priority: 'medium',
        benefit: '简化连接器创建和管理'
      },
      {
        name: 'Strategy Pattern',
        opportunity: '消息格式化策略',
        description: '不同平台使用不同的格式化策略',
        location: 'utils/message-formatter.js',
        priority: 'low',
        benefit: '支持多平台消息格式'
      },
      {
        name: 'Observer Pattern',
        opportunity: '事件监听器',
        description: '监听连接器和系统事件',
        location: 'utils/event-emitter.js',
        priority: 'medium',
        benefit: '解耦事件处理逻辑'
      },
      {
        name: 'Adapter Pattern',
        opportunity: 'API 适配器',
        description: '统一不同 AI 服务的 API',
        location: 'connectors/api-adapter.js',
        priority: 'high',
        benefit: '统一接口，便于扩展'
      },
      {
        name: 'Singleton Pattern',
        opportunity: '配置管理器',
        description: '全局唯一的配置实例',
        location: 'utils/config-manager.js',
        priority: 'low',
        benefit: '避免配置不一致'
      }
    ];

    this.analysis.designPatterns = patterns;
  }

  generateRecommendations() {
    console.log('💡 生成抽象建议...');

    // 按优先级排序
    const highPriority = this.analysis.opportunities.filter(o => o.priority === 'high');
    const mediumPriority = this.analysis.opportunities.filter(o => o.priority === 'medium');
    const lowPriority = this.analysis.opportunities.filter(o => o.priority === 'low');

    // 高优先级建议
    highPriority.forEach(opportunity => {
      this.analysis.recommendations.push({
        priority: 'high',
        category: opportunity.category,
        title: opportunity.title,
        description: opportunity.description,
        recommendation: opportunity.recommendation,
        affectedFiles: opportunity.affectedFiles,
        estimatedBenefit: opportunity.estimatedBenefit,
        implementation: this.getImplementationPlan(opportunity)
      });
    });

    // 中优先级建议
    mediumPriority.slice(0, 5).forEach(opportunity => {
      this.analysis.recommendations.push({
        priority: 'medium',
        category: opportunity.category,
        title: opportunity.title,
        description: opportunity.description,
        recommendation: opportunity.recommendation,
        affectedFiles: opportunity.affectedFiles,
        estimatedBenefit: opportunity.estimatedBenefit,
        implementation: this.getImplementationPlan(opportunity)
      });
    });
  }

  getImplementationPlan(opportunity) {
    const plans = {
      connector_abstraction: {
        steps: [
          '审查现有连接器实现',
          '识别共同接口和方法',
          '设计 BaseConnector 类',
          '重构现有连接器继承基类',
          '测试连接器功能'
        ],
        estimatedTime: '2-3 天',
        risk: 'medium'
      },
      error_handling: {
        steps: [
          '定义错误类型层次结构',
          '实现 ErrorHandler 类',
          '添加全局错误中间件',
          '替换现有的错误处理',
          '编写错误处理测试'
        ],
        estimatedTime: '1-2 天',
        risk: 'low'
      },
      config_management: {
        steps: [
          '设计配置管理接口',
          '实现 ConfigManager 类',
          '迁移现有配置代码',
          '添加配置验证',
          '文档化配置选项'
        ],
        estimatedTime: '1-2 天',
        risk: 'low'
      },
      message_formatting: {
        steps: [
          '分析现有消息格式',
          '设计消息模板系统',
          '实现 MessageFormatter 类',
          '创建常用模板',
          '集成到现有代码'
        ],
        estimatedTime: '2-3 天',
        risk: 'medium'
      }
    };

    return plans[opportunity.category] || {
      steps: [
        '分析现有实现',
        '设计抽象方案',
        '实现抽象类/接口',
        '重构现有代码',
        '测试验证'
      ],
      estimatedTime: '1-2 天',
      risk: 'low'
    };
  }

  calculateSummary() {
    console.log('📊 计算抽象指标...');

    const highPriority = this.analysis.opportunities.filter(o => o.priority === 'high').length;
    const mediumPriority = this.analysis.opportunities.filter(o => o.priority === 'medium').length;
    const lowPriority = this.analysis.opportunities.filter(o => o.priority === 'low').length;

    this.analysis.summary = {
      totalOpportunities: this.analysis.opportunities.length,
      highPriority,
      mediumPriority,
      lowPriority,
      designPatterns: this.analysis.designPatterns.length,
      interfaces: this.analysis.interfaces.length,
      recommendations: this.analysis.recommendations.length,
      abstractionPotential: this.calculateAbstractionPotential(highPriority, mediumPriority, lowPriority)
    };
  }

  calculateAbstractionPotential(high, medium, low) {
    const score = (high * 10) + (medium * 5) + (low * 1);
    if (score > 50) return 'high';
    if (score > 20) return 'medium';
    return 'low';
  }

  generateReport() {
    console.log('\n📋 抽象机会分析报告');
    console.log('=' .repeat(60));

    const { summary, opportunities, designPatterns, interfaces, recommendations } = this.analysis;

    console.log('\n📊 抽象指标:');
    console.log(`  抽象潜力: ${summary.abstractionPotential.toUpperCase()}`);
    console.log(`  总机会数: ${summary.totalOpportunities}`);
    console.log(`  高优先级: ${summary.highPriority}`);
    console.log(`  中优先级: ${summary.mediumPriority}`);
    console.log(`  低优先级: ${summary.lowPriority}`);
    console.log(`  设计模式: ${summary.designPatterns}`);
    console.log(`  接口抽象: ${summary.interfaces}`);

    console.log('\n🎯 抽象机会:');
    opportunities.slice(0, 10).forEach((opp, i) => {
      const priority = opp.priority === 'high' ? '🔴' : opp.priority === 'medium' ? '🟡' : '🟢';
      console.log(`  ${i + 1}. ${priority} ${opp.title}`);
      console.log(`     ${opp.description}`);
    });

    console.log('\n🎨 推荐设计模式:');
    designPatterns.forEach((pattern, i) => {
      const priority = pattern.priority === 'high' ? '🔴' : pattern.priority === 'medium' ? '🟡' : '🟢';
      console.log(`  ${i + 1}. ${priority} ${pattern.name}`);
      console.log(`     ${pattern.opportunity}: ${pattern.description}`);
      console.log(`     收益: ${pattern.benefit}`);
    });

    console.log('\n💡 优先重构建议:');
    recommendations.slice(0, 5).forEach((rec, i) => {
      const priority = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
      console.log(`  ${i + 1}. ${priority} ${rec.title}`);
      console.log(`     ${rec.description}`);
      console.log(`     预计时间: ${rec.implementation.estimatedTime}`);
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
  const analyzer = new AbstractionAnalyzer('D:/space/oprcli');
  const analysis = analyzer.analyze();

  const report = analyzer.generateReport();

  // 保存报告
  const outputDir = path.resolve('D:/space/oprcli/tasks');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, `abstraction-analysis-${Date.now()}.json`);
  analyzer.saveReport(outputPath);
}

module.exports = AbstractionAnalyzer;
