/**
 * 百度语音识别模块
 * 将音频文件转换为文字
 * 
 * API 文档: https://ai.baidu.com/ai-doc/SPEECH/Jlbxdezuf
 */

const fs = require('fs')
const path = require('path')
const axios = require('axios')

// 动态导入 silk-wasm (ES Module)
let silkWasm = null
async function getSilkWasm() {
  if (!silkWasm) {
    silkWasm = await import('silk-wasm')
  }
  return silkWasm
}

// 缓存 access_token
let cachedToken = null
let tokenExpireTime = 0

/**
 * 线性插值重采样 PCM 数据
 * @param {Buffer} inputBuffer - 输入 PCM 数据（16-bit）
 * @param {number} inputRate - 输入采样率
 * @param {number} outputRate - 输出采样率
 * @returns {Buffer} 重采样后的 PCM 数据
 */
function resamplePcm(inputBuffer, inputRate, outputRate) {
  if (inputRate === outputRate) {
    return inputBuffer
  }
  
  // 读取 16-bit PCM 样本
  const inputSamples = []
  for (let i = 0; i < inputBuffer.length; i += 2) {
    inputSamples.push(inputBuffer.readInt16LE(i))
  }
  
  // 计算输出样本数
  const ratio = inputRate / outputRate
  const outputLength = Math.floor(inputSamples.length / ratio)
  const outputBuffer = Buffer.alloc(outputLength * 2)
  
  // 线性插值
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio
    const srcIndexInt = Math.floor(srcIndex)
    const fraction = srcIndex - srcIndexInt
    
    if (srcIndexInt + 1 < inputSamples.length) {
      const sample1 = inputSamples[srcIndexInt]
      const sample2 = inputSamples[srcIndexInt + 1]
      const interpolated = Math.round(sample1 + (sample2 - sample1) * fraction)
      outputBuffer.writeInt16LE(interpolated, i * 2)
    } else {
      outputBuffer.writeInt16LE(inputSamples[srcIndexInt] || 0, i * 2)
    }
  }
  
  return outputBuffer
}

/**
 * 重采样 WAV 文件到目标采样率
 * @param {string} inputPath - 输入 WAV 文件路径
 * @param {string} outputPath - 输出 WAV 文件路径
 * @param {number} targetRate - 目标采样率（8000 或 16000）
 * @returns {{success: boolean, sampleRate: number, error?: string}}
 */
function resampleWav(inputPath, outputPath, targetRate = 16000) {
  try {
    // 读取整个 WAV 文件
    const wavBuffer = fs.readFileSync(inputPath)
    
    // 查找 data chunk 位置
    let dataOffset = -1
    let dataSize = 0
    for (let i = 12; i < wavBuffer.length - 8; i++) {
      if (wavBuffer.slice(i, i + 4).toString() === 'data') {
        dataOffset = i + 8  // 跳过 'data' 和 size 字段
        dataSize = wavBuffer.readUInt32LE(i + 4)
        break
      }
    }
    
    if (dataOffset < 0) {
      return { success: false, error: '找不到 data chunk' }
    }
    
    // 获取原始采样率（字节 24-27）
    const inputRate = wavBuffer.readUInt32LE(24)
    
    // 如果采样率已经是目标值，直接复制
    if (inputRate === targetRate) {
      fs.copyFileSync(inputPath, outputPath)
      return { success: true, sampleRate: targetRate }
    }
    
    // 提取 PCM 数据
    const pcmData = wavBuffer.slice(dataOffset, dataOffset + dataSize)
    
    // 重采样
    const resampledPcm = resamplePcm(pcmData, inputRate, targetRate)
    
    // 创建新 WAV 文件
    const newHeader = createWavHeader(resampledPcm.length, targetRate)
    const outputBuffer = Buffer.concat([newHeader, resampledPcm])
    
    fs.writeFileSync(outputPath, outputBuffer)
    
    return { success: true, sampleRate: targetRate }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * 创建 WAV 文件头
 * @param {number} dataLength - PCM 数据长度
 * @param {number} sampleRate - 采样率
 * @param {number} channels - 声道数
 * @returns {Buffer} WAV 文件头
 */
function createWavHeader(dataLength, sampleRate = 24000, channels = 1) {
  const header = Buffer.alloc(44)
  const byteRate = sampleRate * channels * 2  // 16-bit
  
  // RIFF chunk
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataLength, 4)
  header.write('WAVE', 8)
  
  // fmt chunk
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)  // chunk size
  header.writeUInt16LE(1, 20)   // audio format (PCM)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(channels * 2, 32)  // block align
  header.writeUInt16LE(16, 34)  // bits per sample
  
  // data chunk
  header.write('data', 36)
  header.writeUInt32LE(dataLength, 40)
  
  return header
}

/**
 * 线性插值重采样 PCM 数据
 * @param {Buffer} pcmData - 原始 PCM 数据 (16-bit signed integer)
 * @param {number} fromRate - 原始采样率
 * @param {number} toRate - 目标采样率
 * @returns {Buffer} 重采样后的 PCM 数据
 */
function resamplePcm(pcmData, fromRate, toRate) {
  if (fromRate === toRate) {
    return pcmData
  }
  
  // 将 PCM 数据转换为 Int16Array
  const samples = new Int16Array(pcmData.buffer, pcmData.byteOffset, pcmData.length / 2)
  const ratio = fromRate / toRate
  const newLength = Math.floor(samples.length / ratio)
  const result = new Int16Array(newLength)
  
  // 线性插值
  for (let i = 0; i < newLength; i++) {
    const pos = i * ratio
    const idx = Math.floor(pos)
    const frac = pos - idx
    
    if (idx + 1 < samples.length) {
      // 线性插值
      result[i] = Math.round(samples[idx] * (1 - frac) + samples[idx + 1] * frac)
    } else {
      result[i] = samples[idx] || 0
    }
  }
  
  return Buffer.from(result.buffer)
}

/**
 * 重采样 WAV 文件到目标采样率
 * @param {string} inputPath - 输入 WAV 文件路径
 * @param {string} outputPath - 输出 WAV 文件路径
 * @param {number} targetRate - 目标采样率 (8000 或 16000)
 * @returns {Promise<{success: boolean, path: string, sampleRate: number, error?: string}>}
 */
async function resampleWav(inputPath, outputPath, targetRate = 16000) {
  try {
    const inputBuffer = fs.readFileSync(inputPath)
    
    // 解析 WAV 文件头
    const channels = inputBuffer.readUInt16LE(22)
    const originalRate = inputBuffer.readUInt32LE(24)
    const dataOffset = 44  // 标准 WAV 头长度
    
    // 提取 PCM 数据
    const pcmData = inputBuffer.slice(dataOffset)
    
    // 重采样
    const resampledPcm = resamplePcm(pcmData, originalRate, targetRate)
    
    // 创建新的 WAV 文件
    const wavHeader = createWavHeader(resampledPcm.length, targetRate, channels)
    const outputBuffer = Buffer.concat([wavHeader, resampledPcm])
    
    fs.writeFileSync(outputPath, outputBuffer)
    
    return {
      success: true,
      path: outputPath,
      sampleRate: targetRate,
      originalRate: originalRate
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * 将 SILK 文件转换为 WAV
 * @param {string} silkPath - SILK 文件路径
 * @param {string} wavPath - 输出 WAV 文件路径
 * @param {number} sampleRate - 采样率（默认 24000，QQ语音常用）
 * @returns {Promise<{success: boolean, wavPath: string, duration: number, error?: string}>}
 */
async function convertSilkToWav(silkPath, wavPath, sampleRate = 24000) {
  try {
    const silk = await getSilkWasm()
    const silkData = fs.readFileSync(silkPath)
    
    // 检测是否为 SILK 格式
    if (!silk.isSilk(silkData)) {
      return {
        success: false,
        error: '不是有效的 SILK 格式文件'
      }
    }
    
    // 解码 SILK 到 PCM
    const decodeResult = await silk.decode(silkData, sampleRate)
    
    // 创建 WAV 文件
    const wavHeader = createWavHeader(decodeResult.data.length, sampleRate)
    const wavBuffer = Buffer.concat([wavHeader, Buffer.from(decodeResult.data)])
    
    fs.writeFileSync(wavPath, wavBuffer)
    
    return {
      success: true,
      wavPath: wavPath,
      duration: decodeResult.duration,
      sampleRate: sampleRate
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * 检测文件实际格式（通过文件头）
 * @param {string} audioPath - 音频文件路径
 * @returns {{format: string, isWav: boolean, isSilk: boolean}}
 */
function detectFileFormat(audioPath) {
  const fd = fs.openSync(audioPath, 'r')
  const header = Buffer.alloc(12)
  fs.readSync(fd, header, 0, 12, 0)
  fs.closeSync(fd)
  
  // 检测 WAV (RIFF....WAVE)
  const isWav = header.slice(0, 4).toString('ascii') === 'RIFF' && 
                header.slice(8, 12).toString('ascii') === 'WAVE'
  
  // 检测 SILK (#!SILK_V3 或 #!SILK)
  const isSilk = header.slice(0, 9).toString('ascii') === '#!SILK_V3' ||
                 header.slice(0, 5).toString('ascii') === '#!SILK'
  
  return {
    format: isWav ? 'wav' : (isSilk ? 'silk' : 'unknown'),
    isWav,
    isSilk
  }
}

/**
 * 读取 WAV 文件的采样率
 * @param {string} wavPath - WAV 文件路径
 * @returns {number} 采样率，读取失败返回 16000
 */
function getWavSampleRate(wavPath) {
  try {
    const fd = fs.openSync(wavPath, 'r')
    const header = Buffer.alloc(44)
    fs.readSync(fd, header, 0, 44, 0)
    fs.closeSync(fd)
    
    // WAV 格式：采样率在字节 24-27（小端序）
    const sampleRate = header.readUInt32LE(24)
    return sampleRate || 16000
  } catch {
    return 16000
  }
}

/**
 * 检测并转换 SILK 文件
 * @param {string} audioPath - 音频文件路径
 * @returns {Promise<{converted: boolean, path: string, duration?: number}>}
 */
async function detectAndConvertSilk(audioPath) {
  // 先检测文件实际格式（不看扩展名）
  const fileFormat = detectFileFormat(audioPath)
  
  // 如果已经是 WAV，检查采样率
  if (fileFormat.isWav) {
    const sampleRate = getWavSampleRate(audioPath)
    
    // 百度 API 只支持 8000 或 16000
    if (sampleRate !== 8000 && sampleRate !== 16000) {
      // 需要重采样
      const targetRate = sampleRate > 12000 ? 16000 : 8000
      const resampledPath = audioPath.replace(/\.(amr|wav|silk|slk)$/i, `_${targetRate}.wav`)
      const result = await resampleWav(audioPath, resampledPath, targetRate)
      
      if (result.success) {
        return {
          converted: true,
          path: resampledPath,
          sampleRate: targetRate,
          resampled: true
        }
      }
    }
    
    return { 
      converted: false, 
      path: audioPath,
      sampleRate: sampleRate
    }
  }
  
  // 如果不是 SILK 也不是 WAV，直接返回原路径尝试
  if (!fileFormat.isSilk) {
    // 扩展名检测作为备选
    const ext = path.extname(audioPath).toLowerCase()
    const silkExtensions = ['.silk', '.slk']
    if (!silkExtensions.includes(ext)) {
      return { converted: false, path: audioPath }
    }
  }
  
  // 尝试转换 SILK
  const wavPath = audioPath.replace(/\.(silk|slk|amr)$/i, '.wav')
  
  // QQ 语音 SILK 标准采样率是 8000Hz
  // 百度 API 只支持 8000 或 16000
  // 先尝试 8000（QQ 语音标准），失败则尝试 16000
  let result = await convertSilkToWav(audioPath, wavPath, 8000)
  
  if (!result.success) {
    result = await convertSilkToWav(audioPath, wavPath, 16000)
  }
  
  if (result.success) {
    return {
      converted: true,
      path: wavPath,
      duration: result.duration,
      sampleRate: result.sampleRate
    }
  }
  
  // 转换失败，返回原路径
  return {
    converted: false,
    path: audioPath,
    error: result.error
  }
}

/**
 * 获取百度 API access_token
 * @param {string} apiKey - API Key
 * @param {string} secretKey - Secret Key
 * @returns {Promise<string>} access_token
 */
async function getAccessToken(apiKey, secretKey) {
  // 检查缓存是否有效（提前 1 小时刷新）
  if (cachedToken && Date.now() < tokenExpireTime - 3600000) {
    return cachedToken
  }

  const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`
  
  const response = await axios.post(url)
  
  if (response.data.access_token) {
    cachedToken = response.data.access_token
    tokenExpireTime = Date.now() + (response.data.expires_in || 2592000) * 1000
    return cachedToken
  }
  
  throw new Error('获取百度 access_token 失败')
}

/**
 * 获取音频文件信息
 * @param {string} audioPath - 音频文件路径
 * @returns {Object} 音频信息
 */
function getAudioInfo(audioPath) {
  const stats = fs.statSync(audioPath)
  const ext = path.extname(audioPath).toLowerCase()
  
  // 读取文件头检测实际格式
  const fd = fs.openSync(audioPath, 'r')
  const header = Buffer.alloc(12)
  fs.readSync(fd, header, 0, 12, 0)
  fs.closeSync(fd)
  
  let actualFormat = 'wav'
  let actualRate = 16000
  
  // 检测文件头
  if (header.slice(0, 4).toString() === 'RIFF') {
    actualFormat = 'wav'
    // 尝试从 WAV 头读取采样率（字节 24-27）
    const rateBuffer = Buffer.alloc(4)
    const fd2 = fs.openSync(audioPath, 'r')
    fs.readSync(fd2, rateBuffer, 0, 4, 24)
    fs.closeSync(fd2)
    actualRate = rateBuffer.readUInt32LE(0)
  } else if (header.slice(0, 3).toString() === '#!S' || header.slice(0, 7).toString() === '#!SILK_') {
    actualFormat = 'silk'
  } else if (header.slice(0, 6).toString() === '#!AMR') {
    actualFormat = 'amr'
    actualRate = 8000
  }
  
  return {
    size: stats.size,
    format: actualFormat,
    ext,
    sampleRate: actualRate
  }
}

/**
 * 语音识别（短语音，60秒以内）
 * @param {string} audioPath - 音频文件路径
 * @param {Object} options - 配置选项
 * @returns {Promise<Object>} 识别结果
 */
async function speechToText(audioPath, options = {}) {
  const {
    apiKey = process.env.BAIDU_SPEECH_API_KEY,
    secretKey = process.env.BAIDU_SPEECH_SECRET_KEY,
    devPid = 1537,  // 1537: 普通话(支持简单的英文识别) + 标点
    rate = 16000,
    cuid = 'oprcli'
  } = options

  if (!apiKey || !secretKey) {
    throw new Error('请配置 BAIDU_SPEECH_API_KEY 和 BAIDU_SPEECH_SECRET_KEY')
  }

  // 检查文件
  if (!fs.existsSync(audioPath)) {
    throw new Error(`音频文件不存在: ${audioPath}`)
  }

  // 检测并转换 SILK 格式
  const convertResult = await detectAndConvertSilk(audioPath)
  const actualPath = convertResult.path
  
  const audioInfo = getAudioInfo(actualPath)
  
  // 使用检测到的实际采样率（优先级：检测值 > 转换值 > 默认值）
  let actualRate = audioInfo.sampleRate || convertResult.sampleRate || rate
  
  // 百度 API 只支持 8000 或 16000
  if (actualRate !== 8000 && actualRate !== 16000) {
    actualRate = actualRate > 12000 ? 16000 : 8000
  }
  
  // 文件大小限制 (60秒 * 16000采样率 * 2字节 = 约2MB)
  const maxSize = 10 * 1024 * 1024  // 10MB
  if (audioInfo.size > maxSize) {
    throw new Error(`音频文件过大: ${(audioInfo.size / 1024 / 1024).toFixed(2)}MB，最大支持 10MB`)
  }

  // 获取 access_token
  const token = await getAccessToken(apiKey, secretKey)

  // 读取音频文件
  const audioBuffer = fs.readFileSync(actualPath)

  // 调用百度语音识别 API (JSON 方式，更可靠)
  const url = 'http://vop.baidu.com/server_api'
  
  const response = await axios.post(url, {
    format: audioInfo.format,
    rate: actualRate,
    channel: 1,
    token: token,
    cuid: cuid,
    dev_pid: devPid,
    speech: audioBuffer.toString('base64'),
    len: audioBuffer.length
  }, {
    headers: {
      'Content-Type': 'application/json'
    },
    timeout: 30000
  })

  // 解析结果
  if (response.data.err_no === 0 && response.data.result) {
    return {
      success: true,
      text: response.data.result[0],
      raw: response.data
    }
  }
  
  // 错误处理
  const errorMessages = {
    3300: '输入参数不正确',
    3301: '音频质量过差',
    3302: '鉴权失败',
    3303: '语音服务器后端问题',
    3304: '用户的请求QPS超限制',
    3305: '用户的日pv（日请求量）超限制',
    3307: '语音过长或过短',
    3308: '音频格式不支持',
    3309: '请求音频文件过大',
    3310: '识别结果为空',
    3311: '采样率参数错误',
    3312: '音频数据base64编码错误'
  }
  
  const errMsg = errorMessages[response.data.err_no] || response.data.err_msg || '未知错误'
  
  return {
    success: false,
    error: errMsg,
    errNo: response.data.err_no,
    raw: response.data
  }
}

/**
 * 批量语音识别
 * @param {string[]} audioPaths - 音频文件路径数组
 * @param {Object} options - 配置选项
 * @returns {Promise<Object[]>} 识别结果数组
 */
async function batchSpeechToText(audioPaths, options = {}) {
  const results = []
  
  for (const audioPath of audioPaths) {
    try {
      const result = await speechToText(audioPath, options)
      results.push({
        file: audioPath,
        ...result
      })
    } catch (error) {
      results.push({
        file: audioPath,
        success: false,
        error: error.message
      })
    }
  }
  
  return results
}

/**
 * 清除缓存的 access_token
 */
function clearTokenCache() {
  cachedToken = null
  tokenExpireTime = 0
}

module.exports = {
  speechToText,
  batchSpeechToText,
  getAccessToken,
  getAudioInfo,
  clearTokenCache,
  // SILK 转换
  convertSilkToWav,
  detectAndConvertSilk,
  // 重采样
  resampleWav,
  resamplePcm
}
