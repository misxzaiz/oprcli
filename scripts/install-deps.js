/**
 * OPRCLI 依赖安装脚本
 * 使用 Node.js 直接安装依赖，避免 Bash 问题
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('========================================');
console.log('OPRCLI 依赖安装');
console.log('========================================\n');

const projectDir = 'D:/space/oprcli';
process.chdir(projectDir);

try {
  // 步骤 1：安装 form-data
  console.log('[1/2] 正在安装 form-data 依赖...');
  console.log('执行命令: npm install form-data --save\n');

  execSync('npm install form-data --save', {
    stdio: 'inherit',
    cwd: projectDir
  });

  console.log('\n✅ 依赖安装成功！\n');

  // 步骤 2：验证安装
  console.log('[2/2] 验证安装...');
  try {
    const output = execSync('npm list form-data', {
      encoding: 'utf8',
      cwd: projectDir
    });
    console.log(output);
  } catch (error) {
    // npm list 可能返回非零退出码，但仍然显示信息
    console.log(error.stdout || error.stderr);
  }

  console.log('\n========================================');
  console.log('安装完成！');
  console.log('========================================\n');
  console.log('下一步：');
  console.log('1. 运行 npm start 启动服务');
  console.log('2. 通过 QQ 发送测试消息');
  console.log('\n');

  process.exit(0);

} catch (error) {
  console.error('\n❌ 依赖安装失败！');
  console.error('\n错误信息:', error.message);

  console.log('\n可能的原因：');
  console.log('1. 网络连接问题');
  console.log('2. npm 源配置错误');

  console.log('\n解决方案：');
  console.log('npm config set registry https://registry.npmjs.org/');
  console.log('npm install form-data --save');
  console.log('\n或者手动运行：');
  console.log('cd D:/space/oprcli');
  console.log('npm install form-data --save');
  console.log('\n');

  process.exit(1);
}
