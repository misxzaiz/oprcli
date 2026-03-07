/**
 * 实时日志监控脚本
 * 持续监控OPRCLI的日志输出
 */

const fs = require('fs');
const path = require('path');

const logFile = 'C:\\Users\\28409\\AppData\\Local\\Temp\\claude\\D--space\\tasks\\bvz8pa1z2.output';

let lastSize = 0;
let lastLines = [];

console.log('========================================');
console.log('  OPRCLI 实时日志监控');
console.log('========================================\n');
console.log('监控文件:', logFile);
console.log('按 Ctrl+C 退出\n');

// 检查文件是否存在
if (!fs.existsSync(logFile)) {
  console.error('❌ 日志文件不存在');
  process.exit(1);
}

// 获取文件当前大小
const getFileSize = () => {
  try {
    const stats = fs.statSync(logFile);
    return stats.size;
  } catch (error) {
    return 0;
  }
};

// 读取新增内容
const readNewContent = () => {
  const currentSize = getFileSize();

  if (currentSize <= lastSize) {
    return '';
  }

  const buffer = Buffer.alloc(currentSize - lastSize);
  const fd = fs.openSync(logFile, 'r');

  try {
    fs.readSync(fd, buffer, 0, buffer.length, lastSize);
    lastSize = currentSize;
    return buffer.toString('utf-8');
  } catch (error) {
    return '';
  } finally {
    fs.closeSync(fd);
  }
};

// 解析日志行
const parseLogLines = (content) => {
  const lines = content.split('\n').filter(line => line.trim());
  return lines;
};

// 显示日志
const showLogs = (lines) => {
  lines.forEach(line => {
    // 移除ANSI颜色代码以便更好地查看
    const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '');

    // 高亮重要信息
    if (cleanLine.includes('[QQBOT]')) {
      console.log('🤖 ' + cleanLine);
    } else if (cleanLine.includes('[SESSION]')) {
      console.log('📋 ' + cleanLine);
    } else if (cleanLine.includes('[EVENT]')) {
      console.log('📡 ' + cleanLine);
    } else if (cleanLine.includes('[ERROR]')) {
      console.log('❌ ' + cleanLine);
    } else if (cleanLine.includes('[SUCCESS]')) {
      console.log('✅ ' + cleanLine);
    } else if (cleanLine.trim()) {
      console.log('   ' + cleanLine);
    }
  });
};

// 监控循环
const monitor = () => {
  const newContent = readNewContent();

  if (newContent) {
    const lines = parseLogLines(newContent);

    // 只显示新的行
    if (lines.length > 0) {
      console.log('\n' + '-'.repeat(60));
      showLogs(lines);
    }
  }

  // 每1秒检查一次
  setTimeout(monitor, 1000);
};

// 启动监控
console.log('开始监控...\n');
monitor();
