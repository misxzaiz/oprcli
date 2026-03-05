/**
 * OPRCLI 综合功能测试
 * 测试核心功能、边界条件、错误恢复
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// 测试结果记录
const testResults = {
  timestamp: new Date().toISOString(),
  tests: [],
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    warnings: 0
  }
};

// 测试辅助函数
function logTest(category, name, status, details = '') {
  const result = { category, name, status, details, time: new Date().toISOString() };
  testResults.tests.push(result);
  testResults.summary.total++;

  if (status === 'PASS') testResults.summary.passed++;
  else if (status === 'FAIL') testResults.summary.failed++;
  else if (status === 'WARN') testResults.summary.warnings++;

  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} [${category}] ${name}${details ? ` - ${details}` : ''}`);
}

async function testServerConnection() {
  console.log('\n🔍 测试 1: 服务器连接');
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 13579,
      path: '/api/health',
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const health = JSON.parse(data);
            logTest('连接', '服务器健康检查', 'PASS', `状态: ${health.status || 'OK'}`);
            resolve(true);
          } catch (e) {
            logTest('连接', '服务器健康检查', 'WARN', '响应格式异常');
            resolve(true);
          }
        } else {
          logTest('连接', '服务器健康检查', 'FAIL', `状态码: ${res.statusCode}`);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      logTest('连接', '服务器健康检查', 'FAIL', err.message);
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      logTest('连接', '服务器健康检查', 'FAIL', '请求超时');
      resolve(false);
    });

    req.end();
  });
}

function testModuleStructure() {
  console.log('\n🔍 测试 2: 模块结构');

  const criticalModules = [
    { path: './server.js', name: 'Server 主模块' },
    { path: './connectors/base-connector.js', name: 'Base Connector' },
    { path: './connectors/claude-connector.js', name: 'Claude Connector' },
    { path: './connectors/iflow-connector.js', name: 'IFlow Connector' },
    { path: './integrations/dingtalk.js', name: 'DingTalk 集成' },
    { path: './utils/config.js', name: 'Config 模块' },
    { path: './plugins/core/plugin-manager.js', name: 'Plugin Manager' },
    { path: './scheduler/task-manager.js', name: 'Task Manager' }
  ];

  criticalModules.forEach(module => {
    try {
      const fullPath = path.resolve(__dirname, '..', module.path);
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        const size = (stats.size / 1024).toFixed(2);
        logTest('结构', module.name, 'PASS', `大小: ${size}KB`);
      } else {
        logTest('结构', module.name, 'FAIL', '文件不存在');
      }
    } catch (e) {
      logTest('结构', module.name, 'FAIL', e.message);
    }
  });
}

function testCodeQuality() {
  console.log('\n🔍 测试 3: 代码质量分析');

  const utilsDir = path.resolve(__dirname, '..', 'utils');
  if (!fs.existsSync(utilsDir)) {
    logTest('质量', 'Utils 目录检查', 'FAIL', '目录不存在');
    return;
  }

  const files = fs.readdirSync(utilsDir).filter(f => f.endsWith('.js'));

  // 检查文件大小
  files.forEach(file => {
    const filePath = path.join(utilsDir, file);
    const stats = fs.statSync(filePath);
    const sizeKB = stats.size / 1024;

    if (sizeKB > 15) {
      logTest('质量', `Utils/${file}`, 'WARN', `文件过大: ${sizeKB.toFixed(2)}KB`);
    } else {
      logTest('质量', `Utils/${file}`, 'PASS', `大小: ${sizeKB.toFixed(2)}KB`);
    }
  });

  // 检查重复模式
  const duplicateRisks = [
    'rate-limit', 'rate-limiter', 'rate-limiter-memory',
    'memory-monitor', 'memory-monitor-enhanced',
    'health-check', 'health-enhanced'
  ];

  duplicateRisks.forEach(pattern => {
    const matching = files.filter(f => f.includes(pattern));
    if (matching.length > 1) {
      logTest('质量', `重复模式: ${pattern}`, 'WARN', `发现 ${matching.length} 个相似文件`);
    }
  });
}

function testConfigManagement() {
  console.log('\n🔍 测试 4: 配置管理');

  const configFiles = [
    { path: './config/default.json', name: '默认配置' },
    { path: './config/user.json', name: '用户配置' },
    { path: './config/schema.json', name: '配置 Schema' }
  ];

  configFiles.forEach(config => {
    try {
      const fullPath = path.resolve(__dirname, '..', config.path);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        JSON.parse(content); // 验证 JSON 格式
        logTest('配置', config.name, 'PASS');
      } else {
        logTest('配置', config.name, 'WARN', '文件不存在（可选）');
      }
    } catch (e) {
      logTest('配置', config.name, 'FAIL', 'JSON 格式错误');
    }
  });
}

function testDependencies() {
  console.log('\n🔍 测试 5: 依赖检查');

  try {
    const packagePath = path.resolve(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

    const deps = pkg.dependencies || {};
    const depCount = Object.keys(deps).length;
    logTest('依赖', '生产依赖', 'PASS', `${depCount} 个依赖`);

    // 检查关键依赖
    const criticalDeps = ['express', 'axios', 'dotenv'];
    criticalDeps.forEach(dep => {
      if (deps[dep]) {
        logTest('依赖', dep, 'PASS', `版本: ${deps[dep]}`);
      } else {
        logTest('依赖', dep, 'FAIL', '缺少关键依赖');
      }
    });

  } catch (e) {
    logTest('依赖', 'package.json', 'FAIL', e.message);
  }
}

function testPerformanceMetrics() {
  console.log('\n🔍 测试 6: 性能指标');

  try {
    const memUsage = process.memoryUsage();
    const heapUsed = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
    const heapTotal = (memUsage.heapTotal / 1024 / 1024).toFixed(2);
    const external = (memUsage.external / 1024 / 1024).toFixed(2);

    logTest('性能', '堆内存使用', 'PASS', `${heapUsed}MB / ${heapTotal}MB`);

    if (parseFloat(heapUsed) > 100) {
      logTest('性能', '内存使用警告', 'WARN', '堆内存使用超过 100MB');
    }

    logTest('性能', '外部内存', 'PASS', `${external}MB`);

    // 检查性能报告
    const perfReportPath = path.resolve(__dirname, '..', 'performance-report.json');
    if (fs.existsSync(perfReportPath)) {
      const report = JSON.parse(fs.readFileSync(perfReportPath, 'utf8'));
      if (report.metrics) {
        logTest('性能', '性能报告', 'PASS', '报告存在');
      }
    } else {
      logTest('性能', '性能报告', 'WARN', '性能报告不存在');
    }

  } catch (e) {
    logTest('性能', '性能指标', 'FAIL', e.message);
  }
}

async function runAllTests() {
  console.log('🧪 OPRCLI 综合功能测试');
  console.log('=' .repeat(50));

  await testServerConnection();
  testModuleStructure();
  testCodeQuality();
  testConfigManagement();
  testDependencies();
  testPerformanceMetrics();

  // 生成报告
  console.log('\n📊 测试摘要');
  console.log('=' .repeat(50));
  console.log(`总计: ${testResults.summary.total}`);
  console.log(`✅ 通过: ${testResults.summary.passed}`);
  console.log(`❌ 失败: ${testResults.summary.failed}`);
  console.log(`⚠️  警告: ${testResults.summary.warnings}`);

  const passRate = ((testResults.summary.passed / testResults.summary.total) * 100).toFixed(1);
  console.log(`通过率: ${passRate}%`);

  // 保存测试结果
  const resultsDir = path.resolve(__dirname, '..', 'tasks');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const resultsPath = path.join(resultsDir, `test-results-${Date.now()}.json`);
  fs.writeFileSync(resultsPath, JSON.stringify(testResults, null, 2));
  console.log(`\n📄 测试结果已保存: ${resultsPath}`);

  return testResults;
}

// 运行测试
if (require.main === module) {
  runAllTests().then(results => {
    process.exit(results.summary.failed > 0 ? 1 : 0);
  }).catch(err => {
    console.error('测试执行错误:', err);
    process.exit(1);
  });
}

module.exports = { runAllTests };
