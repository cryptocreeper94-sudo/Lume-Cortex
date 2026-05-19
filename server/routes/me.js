const express = require('express')
const router = express.Router()
const { pool } = require('../db')

// GET /v1/me — Return current user profile
router.get('/', async (req, res) => {
  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' })

  const token = authHeader.replace('Bearer ', '')
  let userId
  try {
    userId = Buffer.from(token.replace('ctx_', ''), 'base64').toString()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }

  try {
    const client = await pool.connect()
    const { rows } = await client.query('SELECT id, email, name, tier, created_at FROM users WHERE id = $1', [userId])
    client.release()
    if (!rows.length) return res.status(404).json({ error: 'User not found' })
    res.json({ user: rows[0] })
  } catch (err) {
    console.error('Profile error:', err.message)
    res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router
