#!/usr/bin/env node

/**
 * Screenshot Skill - Simple Version
 * 直接可用的截图 skill
 */

const { spawn } = require('child_process');
const path = require('path');

async function screenshotSkill(args = []) {
  console.log('📸 Taking screenshot...\n');

  // 解析参数
  let cliArgs = [];
  const safeMode = args.includes('--safe');

  if (safeMode) {
    // 使用安全版本
    const scriptPath = path.join('D:/temp', 'screenshot-safe.js');
    return new Promise((resolve, reject) => {
      const proc = spawn('node', [scriptPath], {
        cwd: 'D:/temp',
        stdio: 'inherit'
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          reject(new Error(`Screenshot failed with code ${code}`));
        }
      });
    });
  } else {
    // 使用普通版本
    const scriptPath = path.join('D:/temp', 'screenshot-cli.js');
    return new Promise((resolve, reject) => {
      const proc = spawn('node', [scriptPath], {
        cwd: 'D:/temp',
        stdio: 'inherit'
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          reject(new Error(`Screenshot failed with code ${code}`));
        }
      });
    });
  }
}

// 导出
module.exports = screenshotSkill;
// 也支持 ES module
export default screenshotSkill;
