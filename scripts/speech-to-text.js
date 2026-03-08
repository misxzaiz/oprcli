#!/usr/bin/env node
/**
 * 百度语音识别脚本
 * 将音频文件转换为文字
 *
 * @version 1.0.0
 * @created 2026-03-08
 *
 * 使用方法:
 *   node scripts/speech-to-text.js <音频文件路径>
 *   node scripts/speech-to-text.js audio.wav
 *   node scripts/speech-to-text.js --pid=1537 audio.m4a
 *
 * 环境变量:
 *   BAIDU_SPEECH_API_KEY - 百度语音 API Key
 *   BAIDU_SPEECH_SECRET_KEY - 百度语音 Secret Key
 */

const path = require('path')

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const { speechToText, getAudioInfo } = require('../utils/baidu-speech')

/**
 * 打印使用帮助
 */
function printHelp() {
  console.log(`
百度语音识别工具

使用方法:
  node scripts/speech-to-text.js <音频文件>
  node scripts/speech-to-text.js audio.wav

选项:
  --pid=<dev_pid>    识别模型 ID (默认: 1537)
                     1537: 普通话 + 标点
                     1737: 英语
                     1637: 粤语
                     1837: 四川话
  --rate=<rate>      采样率 (默认: 16000)
  --help             显示帮助信息

支持格式:
  wav, pcm, amr, m4a (部分可能需要转换)

环境变量:
  BAIDU_SPEECH_API_KEY     - 百度语音 API Key
  BAIDU_SPEECH_SECRET_KEY  - 百度语音 Secret Key

示例:
  # 识别单个文件
  node scripts/speech-to-text.js audio.wav

  # 使用英语模型
  node scripts/speech-to-text.js --pid=1737 english.m4a
`)
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2)

  // 解析参数
  let audioPath = null
  let devPid = 1537
  let rate = 16000

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else if (arg.startsWith('--pid=')) {
      devPid = parseInt(arg.split('=')[1], 10)
    } else if (arg.startsWith('--rate=')) {
      rate = parseInt(arg.split('=')[1], 10)
    } else if (!arg.startsWith('--')) {
      audioPath = arg
    }
  }

  // 验证参数
  if (!audioPath) {
    console.error('错误: 请提供音频文件路径')
    console.error('使用 --help 查看帮助')
    process.exit(1)
  }

  // 解析路径
  const fullPath = path.resolve(audioPath)

  // 显示文件信息
  try {
    const info = getAudioInfo(fullPath)
    console.log(`📁 文件: ${fullPath}`)
    console.log(`   格式: ${info.format} | 大小: ${(info.size / 1024).toFixed(2)}KB`)
  } catch (error) {
    console.error(`❌ 文件读取失败: ${error.message}`)
    process.exit(1)
  }

  // 执行识别
  console.log('🔄 正在识别...')
  const startTime = Date.now()

  try {
    const result = await speechToText(fullPath, { devPid, rate })
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    if (result.success) {
      console.log(`\n✅ 识别成功 (${duration}s)`)
      console.log(`📝 文字: ${result.text}`)
      
      // 输出 JSON 格式供程序解析
      console.log('\n---JSON---')
      console.log(JSON.stringify(result))
    } else {
      console.error(`\n❌ 识别失败: ${result.error}`)
      console.error(`   错误码: ${result.errNo}`)
      process.exit(1)
    }
  } catch (error) {
    console.error(`\n❌ 发生错误: ${error.message}`)
    process.exit(1)
  }
}

// 运行
main().catch(error => {
  console.error('❌ 发生错误:', error.message)
  process.exit(1)
})
