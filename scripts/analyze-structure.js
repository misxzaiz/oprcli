const fs = require('fs');
const path = require('path');

const projectDir = 'D:/space/oprcli';
const excludeDirs = ['node_modules', '.git', 'data', 'tasks'];

function analyzeStructure(dir, prefix = '') {
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    if (item.name.startsWith('.')) continue;

    const fullPath = path.join(dir, item.name);
    const relativePath = path.relative(projectDir, fullPath);

    if (item.isDirectory()) {
      if (excludeDirs.includes(item.name)) continue;

      console.log(`${prefix}📁 ${item.name}/`);
      analyzeStructure(fullPath, prefix + '  ');
    } else if (item.isFile() && (item.name.endsWith('.js') || item.name.endsWith('.json'))) {
      const stats = fs.statSync(fullPath);
      const size = (stats.size / 1024).toFixed(2);
      console.log(`${prefix}📄 ${item.name} (${size}KB)`);
    }
  }
}

console.log('📊 OPRCLI 项目结构分析\n');
console.log(`📍 目录: ${projectDir}`);
console.log(`📅 时间: ${new Date().toLocaleString('zh-CN')}\n`);

analyzeStructure(projectDir);
