#!/usr/bin/env node
/**
 * 天气查询脚本
 * 使用 MCP Browser 工具获取深圳宝安和南山的天气信息
 * 
 * 用法: node scripts/fetch-weather.js
 */

const { spawn } = require('child_process')
const path = require('path')

// MCP Browser 工具路径
const MCP_BROWSER_PATH = path.join(__dirname, '../../mcp/mcp-browser')

/**
 * 调用 MCP Browser 工具
 */
async function callMcpTool(tool, args = {}) {
  return new Promise((resolve, reject) => {
    const request = JSON.stringify({ tool, args })
    
    const proc = spawn('node', [path.join(MCP_BROWSER_PATH, 'index.js')], {
      cwd: MCP_BROWSER_PATH,
      env: { ...process.env, MCP_REQUEST: request }
    })
    
    let stdout = ''
    let stderr = ''
    
    proc.stdout.on('data', (data) => { stdout += data })
    proc.stderr.on('data', (data) => { stderr += data })
    
    proc.on('close', (code) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(stdout))
        } catch {
          resolve({ success: true, data: stdout })
        }
      } else {
        reject(new Error(stderr || `Exit code: ${code}`))
      }
    })
  })
}

/**
 * 搜索天气
 */
async function searchWeather(location) {
  const url = `https://www.baidu.com/s?wd=${encodeURIComponent(location + '天气')}`
  
  console.log(`🔍 正在查询: ${location}天气`)
  console.log(`📍 URL: ${url}`)
  
  // 模拟调用 MCP Browser（实际由 IFlow agent 执行）
  // 这里返回提示信息，让 agent 知道需要做什么
  return {
    needBrowser: true,
    location,
    url,
    instructions: `请使用 MCP Browser 工具:
1. launch_browser
2. open_page("${url}")
3. extract_content 提取天气信息
4. close_browser`
  }
}

/**
 * 主函数
 */
async function main() {
  const locations = ['深圳宝安区', '深圳南山区']
  const results = []
  
  for (const location of locations) {
    try {
      const info = await searchWeather(location)
      results.push({
        location,
        status: 'pending',
        info
      })
    } catch (error) {
      results.push({
        location,
        status: 'error',
        error: error.message
      })
    }
  }
  
  // 输出 JSON 供 agent 解析
  console.log(JSON.stringify({
    task: 'fetch-weather',
    locations: results,
    timestamp: new Date().toISOString()
  }, null, 2))
}

main().catch(console.error)
