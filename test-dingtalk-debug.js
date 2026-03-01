/**
 * 钉钉事件提取调试工具
 *
 * 用途：分析 Claude 返回的事件结构，帮助调试响应提取问题
 */

function extractResponse(events) {
  console.log(`\n========== 开始提取响应 ==========`);
  console.log(`总事件数: ${events.length}\n`);

  const result = [];
  let hasAssistantContent = false;

  // 统计事件类型
  const typeCount = {};
  events.forEach(e => {
    typeCount[e.type] = (typeCount[e.type] || 0) + 1;
  });
  console.log('事件类型统计:');
  Object.entries(typeCount).forEach(([type, count]) => {
    console.log(`  ${type}: ${count} 次`);
  });

  // 方法1：从 assistant 事件提取
  console.log('\n--- 方法1：提取 assistant 事件 ---');
  for (const event of events) {
    if (event.type === 'assistant') {
      console.log('找到 assistant 事件');
      console.log('事件结构:', JSON.stringify(event, null, 2));

      if (event.message?.content && Array.isArray(event.message.content)) {
        hasAssistantContent = true;
        console.log(`✓ message.content 是数组，长度: ${event.message.content.length}`);
        for (const block of event.message.content) {
          if (block.type === 'text' && block.text) {
            result.push(block.text);
            console.log(`  + 添加文本块: ${block.text.substring(0, 50)}...`);
          }
        }
      }

      if (result.length === 0 && event.content) {
        console.log('尝试 event.content...');
        if (typeof event.content === 'string') {
          hasAssistantContent = true;
          result.push(event.content);
          console.log(`✓ 提取到 ${event.content.length} 字符`);
        }
      }

      if (result.length === 0 && event.text) {
        console.log('尝试 event.text...');
        hasAssistantContent = true;
        result.push(event.text);
        console.log(`✓ 提取到 ${event.text.length} 字符`);
      }
    }
  }

  if (hasAssistantContent) {
    const final = result.join('').trim();
    console.log(`\n✅ 方法1成功，提取到 ${final.length} 字符`);
    console.log(`内容预览: ${final.substring(0, 200)}...`);
    return final;
  }

  // 方法2：从流式事件提取
  console.log('\n--- 方法2：提取流式事件 ---');
  let deltaCount = 0;
  for (const event of events) {
    if (event.type === 'content_block_delta' && event.delta?.text) {
      result.push(event.delta.text);
      deltaCount++;
      if (deltaCount <= 3) {
        console.log(`  + delta: ${event.delta.text.substring(0, 30)}...`);
      }
    }
    if (event.type === 'result' && typeof event.result === 'string') {
      result.push(event.result);
      console.log(`✓ 添加 result: ${event.result.substring(0, 50)}...`);
    }
    if (typeof event.content === 'string') {
      result.push(event.content);
      console.log(`✓ 添加 content: ${event.content.substring(0, 50)}...`);
    }
    if (typeof event.text === 'string') {
      result.push(event.text);
      console.log(`✓ 添加 text: ${event.text.substring(0, 50)}...`);
    }
  }

  const final = result.join('').trim();
  console.log(`\n${final.length > 0 ? '✅' : '❌'} 方法2${final.length > 0 ? '成功' : '失败'}，提取到 ${final.length} 字符`);

  if (final.length > 0) {
    console.log(`内容预览: ${final.substring(0, 200)}...`);
  } else {
    console.log('⚠️  警告：两种方法都未提取到内容');
    console.log('\n前5个事件的完整结构:');
    events.slice(0, 5).forEach((e, i) => {
      console.log(`\n事件 ${i + 1}:`);
      console.log(JSON.stringify(e, null, 2));
    });
  }

  console.log(`\n========== 提取完成 ==========\n`);
  return final || '（无响应）';
}

// 测试用例
function test() {
  console.log('📊 测试用例1：模拟正常响应\n');

  const mockEvents = [
    { type: 'system' },
    {
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: '你好！我是Claude助手。' }
        ]
      }
    },
    { type: 'result' }
  ];

  const result = extractResponse(mockEvents);
  console.log(`最终结果: "${result}"`);
  console.log(`\n${'='.repeat(50)}\n`);

  // 如果你有真实的事件日志，可以在这里测试
  // const realEvents = [...]; // 粘贴真实的事件
  // extractResponse(realEvents);
}

// 运行测试
if (require.main === module) {
  test();
}

module.exports = { extractResponse };
