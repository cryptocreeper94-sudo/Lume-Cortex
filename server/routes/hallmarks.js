const express = require('express')
const router = express.Router()
const { pool } = require('../db')
const crypto = require('crypto')

// Get all hallmarks
router.get('/', async (req, res) => {
  try {
    const client = await pool.connect()
    const { rows } = await client.query('SELECT * FROM hallmarks ORDER BY timestamp DESC LIMIT 50')
    client.release()
    res.json({ hallmarks: rows })
  } catch (err) {
    console.error('Fetch hallmarks error:', err)
    res.status(500).json({ error: 'Failed to fetch hallmarks' })
  }
})

// Mint a new hallmark (Trust Layer Certified)
router.post('/mint', async (req, res) => {
  const { name, issuer } = req.body
  if (!name || !issuer) return res.status(400).json({ error: 'Name and issuer required' })

  try {
    // Generate deterministic Trust Layer Hash
    const timestamp = new Date().toISOString()
    const dataString = `${name}|${issuer}|${timestamp}|CORTEX_ROOT`
    const hash = crypto.createHash('sha256').update(dataString).digest('hex')

    const client = await pool.connect()
    const { rows } = await client.query(
      'INSERT INTO hallmarks (hash, name, issuer, timestamp, verified) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [hash, name, issuer, timestamp, true]
    )
    client.release()

    res.json({ hallmark: rows[0] })
  } catch (err) {
    console.error('Mint hallmark error:', err)
    res.status(500).json({ error: 'Failed to mint hallmark' })
  }
})

module.exports = router
