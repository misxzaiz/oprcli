const fs = require('fs').promises
const path = require('path')
const { execSync } = require('child_process')

function setupHttpRoutes(server) {
  // 静态文件服务
  server.app.use('/config', require('express').static(path.join(__dirname, '../public')))

  // 获取配置
  server.app.get('/api/config', async (req, res) => {
    try {
      const envPath = path.join(__dirname, '../.env')
      const config = {}
      
      try {
        const content = await fs.readFile(envPath, 'utf-8')
        content.split('\n').forEach(line => {
          const trimmed = line.trim()
          if (trimmed && !trimmed.startsWith('#')) {
            const eqIndex = trimmed.indexOf('=')
            if (eqIndex > 0) {
              const key = trimmed.substring(0, eqIndex).trim()
              let value = trimmed.substring(eqIndex + 1).trim()
              // 移除引号
              if ((value.startsWith('"') && value.endsWith('"')) ||
                  (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1)
              }
              config[key] = value
            }
          }
        })
      } catch (e) {
        // .env 文件不存在，返回空配置
      }

      res.json({ success: true, config })
    } catch (error) {
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // 保存配置（自动创建 .env 文件）
  server.app.post('/api/config', async (req, res) => {
    try {
      const newConfig = req.body
      const envPath = path.join(__dirname, '../.env')
      
      // 读取现有内容
      let content = ''
      try {
        content = await fs.readFile(envPath, 'utf-8')
      } catch (e) {
        // 文件不存在，创建默认内容
        content = `# OPRCLI 配置文件
# 生成时间: ${new Date().toISOString()}

`
      }

      const lines = content.split('\n')
      const updatedKeys = new Set()

      // 更新现有行
      const updatedLines = lines.map(line => {
        const trimmed = line.trim()
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIndex = trimmed.indexOf('=')
          if (eqIndex > 0) {
            const key = trimmed.substring(0, eqIndex).trim()
            if (newConfig.hasOwnProperty(key)) {
              updatedKeys.add(key)
              const value = newConfig[key]
              return `${key}=${value}`
            }
          }
        }
        return line
      })

      // 添加新配置项
      Object.keys(newConfig).forEach(key => {
        if (!updatedKeys.has(key) && newConfig[key] !== undefined && newConfig[key] !== '') {
          updatedLines.push(`${key}=${newConfig[key]}`)
        }
      })

      await fs.writeFile(envPath, updatedLines.join('\n'), 'utf-8')
      res.json({ success: true })
    } catch (error) {
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // 自动检测命令路径
  server.app.get('/api/detect', async (req, res) => {
    const results = {}
    
    const commands = [
      { key: 'CLAUDE_CMD_PATH', cmd: 'claude' },
      { key: 'IFLOW_PATH', cmd: 'iflow' },
      { key: 'CODEX_PATH', cmd: 'codex' },
      { key: 'CLAUDE_GIT_BIN_PATH', cmd: 'git' },
      { key: 'BASH_PATH', cmd: 'bash' }
    ]

    for (const { key, cmd } of commands) {
      try {
        const output = execSync(`where ${cmd}`, { encoding: 'utf-8', timeout: 5000 })
        const paths = output.trim().split('\n').map(p => p.trim()).filter(Boolean)
        results[key] = paths.length > 0 ? paths[0] : null
        if (paths.length > 1) {
          results[key + '_ALL'] = paths
        }
      } catch (e) {
        results[key] = null
      }
    }

    res.json({ success: true, detected: results })
  })

  // 重启服务
  server.app.post('/api/restart', async (req, res) => {
    res.json({ success: true, message: '正在重启...' })
    
    // 延迟重启，让响应先发送
    setTimeout(() => {
      process.exit(0) // PM2 或其他进程管理器会自动重启
    }, 500)
  })

  server.app.get('/api/status', (req, res) => {
    const provider = server.config.provider
    const connector = server.connectors.get(provider)

    res.json({
      success: true,
      provider,
      connected: !!connector,
      connectors: Array.from(server.connectors.keys()).map(p => ({
        provider: p,
        connected: server.connectors.has(p)
      })),
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    })
  })

  server.app.post('/api/message', async (req, res) => {
    try {
      const { message, sessionId } = req.body
      if (!message) {
        return res.status(400).json({ success: false, error: '消息不能为空' })
      }

      const provider = server.config.provider
      const connector = server.connectors.get(provider)
      if (!connector) {
        return res.status(503).json({ success: false, error: `提供商 ${provider} 不可用` })
      }

      const events = []
      const onEvent = event => events.push(event)
      const result = sessionId
        ? await connector.continueSession(sessionId, message, { onEvent })
        : await connector.startSession(message, { onEvent })

      return res.json({
        success: true,
        sessionId: result.sessionId,
        provider,
        events,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      })
    }
  })

  server.app.post('/api/interrupt', (req, res) => {
    try {
      const { sessionId } = req.body
      if (!sessionId) {
        return res.status(400).json({ success: false, error: 'sessionId 不能为空' })
      }

      const provider = server.config.provider
      const connector = server.connectors.get(provider)
      if (!connector) {
        return res.status(503).json({ success: false, error: `提供商 ${provider} 不可用` })
      }

      const success = connector.interruptSession(sessionId)
      return res.json({ success, timestamp: new Date().toISOString() })
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message })
    }
  })

  server.app.post('/api/reset', async (req, res) => {
    try {
      const { sessionId } = req.body
      const provider = server.config.provider
      const connector = server.connectors.get(provider)

      if (!connector) {
        return res.status(503).json({ success: false, error: `提供商 ${provider} 不可用` })
      }

      if (sessionId && connector.interruptSession) {
        connector.interruptSession(sessionId)
      }

      return res.json({ success: true, timestamp: new Date().toISOString() })
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message })
    }
  })
}

module.exports = {
  setupHttpRoutes
}
