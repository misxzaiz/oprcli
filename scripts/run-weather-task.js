#!/usr/bin/env node
/**
 * 每日天气任务 - 获取深圳宝安和南山天气并发送钉钉通知
 * 
 * 使用多个备用数据源确保可靠性
 */

const path = require('path')
const https = require('https')
const http = require('http')
const crypto = require('crypto')

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '../.env') })

// 配置
const CONFIG = {
  webhook: process.env.NOTIFICATION_DINGTALK_WEBHOOK,
  secret: process.env.NOTIFICATION_DINGTALK_SECRET,
  locations: [
    { name: '宝安区', adcode: '440306' },
    { name: '南山区', adcode: '440305' }
  ]
}

/**
 * 使用 tianqiapi.com 免费 API（国内可访问）
 */
async function fetchTianqiAPI(location) {
  // 深圳 cityid
  const cityid = '101281601'
  const url = `https://www.tianqiapi.com/free/day?appid=23035322&appsecret=8Y6Pb8nL&cityid=${cityid}`
  
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.errcode) {
            reject(new Error(json.errmsg || 'API error'))
            return
          }
          resolve({
            location: location.name,
            temperature: json.tem || json.tem_day + '-' + json.tem_night + '°C',
            condition: json.wea,
            humidity: json.humidity,
            wind: json.win + json.win_speed,
            source: 'tianqiapi'
          })
        } catch (e) {
          reject(e)
        }
      })
    }).on('error', reject)
  })
}

/**
 * 使用 yiketianqi.com API
 */
async function fetchYikeAPI(location) {
  const url = `https://yiketianqi.com/free/day?appid=23035322&appsecret=8Y6Pb8nL&city=深圳&unescape=1`
  
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.errcode) {
            reject(new Error(json.errmsg || 'API error'))
            return
          }
          resolve({
            location: location.name,
            temperature: json.tem || `${json.tem_day}-${json.tem_night}°C`,
            condition: json.wea,
            humidity: json.humidity,
            wind: json.win + ' ' + json.win_speed,
            air: json.air,
            airLevel: json.air_level,
            source: 'yiketianqi'
          })
        } catch (e) {
          reject(e)
        }
      })
    }).on('error', reject)
  })
}

/**
 * 使用国家气象局数据（深圳天气代码 101281601）
 */
async function fetchWeatherCN(location) {
  // 深圳宝安区: 101281606, 南山区: 101281605
  const codes = {
    '宝安区': '101281606',
    '南山区': '101281605'
  }
  const code = codes[location.name] || '101281601'
  const url = `http://d1.weather.com.cn/weather_index/${code}.html`
  
  return new Promise((resolve, reject) => {
    http.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'http://www.weather.com.cn/'
      },
      timeout: 10000
    }, (res) => {
      let data = ''
      res.setEncoding('utf-8')
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          // 数据格式: var dataSK = {...}; var dataZS = {...};
          const skMatch = data.match(/var\s+dataSK\s*=\s*(\{[^}]+\})/)
          if (skMatch) {
            const sk = JSON.parse(skMatch[1])
            resolve({
              location: location.name,
              temperature: sk.temp + '°C',
              condition: sk.weather,
              humidity: sk.SD,
              wind: sk.WD + ' ' + sk.WS,
              updateTime: sk.time,
              source: 'weather.com.cn'
            })
          } else {
            reject(new Error('数据解析失败'))
          }
        } catch (e) {
          reject(e)
        }
      })
    }).on('error', reject)
  })
}

/**
 * 获取天气（多数据源尝试）
 */
async function fetchWeather(location) {
  const sources = [
    { name: 'yiketianqi', fetch: fetchYikeAPI },
    { name: 'tianqiapi', fetch: fetchTianqiAPI },
    { name: 'weather.cn', fetch: fetchWeatherCN }
  ]
  
  for (const source of sources) {
    try {
      const result = await source.fetch(location)
      console.log(`   ✅ [${source.name}] ${result.condition} ${result.temperature}`)
      return result
    } catch (e) {
      console.log(`   ⚠️ [${source.name}] 失败: ${e.message}`)
    }
  }
  
  return {
    location: location.name,
    error: '所有数据源均不可用'
  }
}

/**
 * 发送钉钉通知
 */
async function sendDingTalkNotification(content) {
  if (!CONFIG.webhook || !CONFIG.secret) {
    console.log('⚠️ 钉钉通知未配置')
    return false
  }
  
  const timestamp = Date.now()
  const stringToSign = `${timestamp}\n${CONFIG.secret}`
  const hmac = crypto.createHmac('sha256', CONFIG.secret)
  hmac.update(stringToSign)
  const sign = encodeURIComponent(hmac.digest('base64'))
  
  const url = `${CONFIG.webhook}&timestamp=${timestamp}&sign=${sign}`
  
  const message = {
    msgtype: 'markdown',
    markdown: {
      title: '每日天气提醒',
      text: content
    }
  }
  
  return new Promise((resolve) => {
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const result = JSON.parse(data)
          if (result.errcode === 0) {
            console.log('📤 钉钉通知已发送')
            resolve(true)
          } else {
            console.log(`❌ 钉钉发送失败: ${result.errmsg}`)
            resolve(false)
          }
        } catch {
          resolve(false)
        }
      })
    })
    
    req.on('error', (e) => {
      console.log(`❌ 发送失败: ${e.message}`)
      resolve(false)
    })
    
    req.write(JSON.stringify(message))
    req.end()
  })
}

/**
 * 主函数
 */
async function main() {
  console.log('')
  console.log('🌤️ ===== 每日天气提醒 =====')
  console.log(`⏰ 执行时间: ${new Date().toLocaleString('zh-CN')}`)
  console.log('')
  
  const date = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long'
  })
  
  const results = []
  
  // 获取每个地点的天气
  for (const location of CONFIG.locations) {
    console.log(`🔍 查询: 深圳${location.name}`)
    const info = await fetchWeather(location)
    results.push(info)
    await new Promise(r => setTimeout(r, 500))
  }
  
  // 构建通知内容
  const lines = [
    `### 🌤️ 每日天气提醒`,
    `**📅 ${date}**`,
    ''
  ]
  
  for (const r of results) {
    if (r.error) {
      lines.push(`- 🏙️ **深圳${r.location}**: ${r.error}`)
    } else {
      let text = `- 🏙️ **深圳${r.location}**: ${r.condition} ${r.temperature}`
      if (r.air) text += ` | 空气: ${r.airLevel || r.air}`
      if (r.humidity) text += ` | 湿度: ${r.humidity}`
      lines.push(text)
    }
  }
  
  lines.push('')
  lines.push('---')
  lines.push('祝您今天愉快！ 🌈')
  
  const content = lines.join('\n')
  
  console.log('')
  console.log('📝 通知内容:')
  console.log(content)
  console.log('')
  
  // 发送通知
  await sendDingTalkNotification(content)
  
  console.log('')
  console.log('✅ 任务完成')
}

main().catch(error => {
  console.error('❌ 任务失败:', error)
  process.exit(1)
})