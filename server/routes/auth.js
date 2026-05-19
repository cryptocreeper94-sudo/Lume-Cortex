const express = require('express')
const router = express.Router()
const { pool } = require('../db')

// Mock Trust Layer SSO Login (since we don't have the actual Trust Layer private keys here)
router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })

  try {
    const client = await pool.connect()
    
    // Check if user exists
    let { rows } = await client.query('SELECT * FROM users WHERE email = $1', [email])
    
    if (rows.length === 0) {
      // Auto-provision if they don't exist (simulating SSO sync)
      const userId = 'usr_' + Date.now()
      const insertRes = await client.query(
        'INSERT INTO users (id, email, name) VALUES ($1, $2, $3) RETURNING *',
        [userId, email, email.split('@')[0]]
      )
      rows = insertRes.rows
    }
    
    client.release()

    const user = rows[0]
    
    // Return mock token
    res.json({
      token: 'ctx_' + Buffer.from(user.id).toString('base64'),
      tenant: {
        id: user.id,
        email: user.email,
        name: user.name,
        tier: user.tier
      }
    })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Firebase Auth Verification
router.post('/firebase', async (req, res) => {
  const { idToken } = req.body
  if (!idToken) return res.status(400).json({ error: 'Missing token' })

  // For this local build, we will simulate decoding since firebase-admin needs a service account JSON
  // In production, this would use admin.auth().verifyIdToken(idToken)
  try {
    // Simulated token payload
    const mockEmail = 'user_' + Date.now().toString().slice(-4) + '@gmail.com'
    const mockName = 'Firebase User'
    
    const client = await pool.connect()
    
    // Auto-provision
    const userId = 'fb_' + Date.now()
    let { rows } = await client.query('SELECT * FROM users WHERE email = $1', [mockEmail])
    if (rows.length === 0) {
      const insertRes = await client.query(
        'INSERT INTO users (id, email, name) VALUES ($1, $2, $3) RETURNING *',
        [userId, mockEmail, mockName]
      )
      rows = insertRes.rows
    }
    
    client.release()
    const user = rows[0]

    res.json({
      token: 'ctx_' + Buffer.from(user.id).toString('base64'),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        tier: user.tier
      }
    })
  } catch (err) {
    console.error('Firebase Auth Error:', err)
    res.status(500).json({ error: 'Firebase authentication failed' })
  }
})

module.exports = router
