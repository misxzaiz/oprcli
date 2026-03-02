/**
 * 测试 Claude Code CLI 发送的所有事件
 * 查看是否有其他方式获取 session_id
 */

const { spawn } = require('child_process');
const fs = require('fs');

// Claude Code 路径
const nodeExe = 'D:\\install\\nodejs\\node.exe';
const cliJs = 'C:\\Users\\28409\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js';

console.log('========================================');
console.log('Claude Code 事件测试');
console.log('========================================\n');

const args = [
  cliJs,
  '--print',
  '--verbose',
  '--output-format', 'stream-json',
  '--permission-mode', 'bypassPermissions',
  'hello'
];

console.log('执行命令:', nodeExe, args.slice(0, 5).join(' '), '...\n');

const child = spawn(nodeExe, args, {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
  env: {
    ...process.env,
    CLAUDE_CODE_GIT_BASH_PATH: 'C:/Program Files/Git/usr/bin/bash.exe'
  }
});

let eventCount = 0;
const allEvents = [];

child.stdout.on('data', (data) => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const event = JSON.parse(trimmed);
      eventCount++;
      allEvents.push(event);

      console.log(`\n[事件 #${eventCount}] type: ${event.type}`);
      console.log('完整内容:', JSON.stringify(event, null, 2));

      // 特别检查 system 事件
      if (event.type === 'system') {
        console.log('\n⭐ SYSTEM 事件详情：');
        console.log('  - message:', event.message);
        console.log('  - 有 extra?', !!event.extra);
        console.log('  - extra 内容:', event.extra);
        console.log('  - 有 session_id?', !!event.extra?.session_id);
      }

      // 检查是否有其他字段包含 session 信息
      const eventKeys = Object.keys(event);
      if (eventKeys.some(k => k.toLowerCase().includes('session'))) {
        console.log('\n🔍 发现包含 "session" 的字段：');
        eventKeys.forEach(k => {
          if (k.toLowerCase().includes('session')) {
            console.log(`  - ${k}:`, event[k]);
          }
        });
      }

    } catch (e) {
      console.log('[非 JSON]', trimmed.substring(0, 100));
    }
  }
});

child.stderr.on('data', (data) => {
  console.error('[stderr]', data.toString());
});

child.on('close', (code) => {
  console.log('\n========================================');
  console.log('测试完成');
  console.log('========================================');
  console.log(`总共收到 ${eventCount} 个事件`);
  console.log(`退出码: ${code}`);

  // 统计事件类型
  const typeCounts = {};
  allEvents.forEach(e => {
    typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
  });
  console.log('\n事件类型统计:');
  Object.entries(typeCounts).forEach(([type, count]) => {
    console.log(`  - ${type}: ${count}`);
  });

  // 查找所有可能包含 session_id 的字段
  console.log('\n所有可能包含 session_id 的字段:');
  allEvents.forEach(e => {
    Object.keys(e).forEach(k => {
      if (k.toLowerCase().includes('session') || k.toLowerCase().includes('id')) {
        console.log(`  - ${e.type}.${k}:`, e[k]);
      }
    });
  });
});

setTimeout(() => {
  console.log('\n[超时] 10秒后强制终止');
  child.kill();
}, 10000);
