const express = require('express')
const cors = require('cors')
require('dotenv').config()
const { initDB } = require('./db')

const authRoutes = require('./routes/auth')
const hallmarksRoutes = require('./routes/hallmarks')
const billingRoutes = require('./routes/billing')
const meRoutes = require('./routes/me')

const app = express()

// Middleware — raw body for Stripe webhook must come before express.json()
app.use('/v1/billing/webhook', express.raw({ type: 'application/json' }))
app.use(cors())
app.use(express.json())

// Connect to Database
initDB()

// Routes
app.use('/v1/auth', authRoutes)
app.use('/v1/hallmarks', hallmarksRoutes)
app.use('/v1/billing', billingRoutes)
app.use('/v1/me', meRoutes)

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'lume-cortex-backend', version: '1.0.0' })
})

// Fallback Conversations route
app.get('/v1/conversations', (req, res) => {
  res.json({ conversations: [] })
})
app.post('/v1/conversations', (req, res) => {
  res.json({ conversation: { id: 'c_' + Date.now(), title: req.body.title || 'New Conv' } })
})

const PORT = process.env.PORT || 4000
app.listen(PORT, () => {
  console.log(`🚀 Lume Cortex Backend running on port ${PORT}`)
})
