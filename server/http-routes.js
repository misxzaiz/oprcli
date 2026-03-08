function setupHttpRoutes(server) {
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
