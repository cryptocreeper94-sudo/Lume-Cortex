const express = require('express')
const router = express.Router()
const Stripe = require('stripe')
const { pool } = require('../db')

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')

const PLAN_DETAILS = {
  pro: { name: 'Lume Cortex Pro', amount: 2900, description: 'Pro tier — advanced Hallmark minting, AI conversations, and API access' },
  enterprise: { name: 'Lume Cortex Enterprise', amount: 9900, description: 'Enterprise tier — unlimited Hallmarks, full API, custom LDIR rules, team management' }
}

// POST /v1/billing/checkout — Create Stripe Checkout Session
router.post('/checkout', async (req, res) => {
  const { tier, success_url, cancel_url } = req.body
  if (!tier || !PLAN_DETAILS[tier]) return res.status(400).json({ error: 'Invalid tier' })

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
    const { rows } = await client.query('SELECT * FROM users WHERE id = $1', [userId])
    client.release()
    if (!rows.length) return res.status(404).json({ error: 'User not found' })

    const user = rows[0]
    const plan = PLAN_DETAILS[tier]

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: user.email,
      line_items: [{
        price_data: {
          currency: 'usd',
          recurring: { interval: 'month' },
          product_data: { name: plan.name, description: plan.description },
          unit_amount: plan.amount
        },
        quantity: 1
      }],
      metadata: { userId: user.id, tier, app: 'lume-cortex' },
      success_url: success_url || 'https://lume-cortex.com/#settings',
      cancel_url: cancel_url || 'https://lume-cortex.com/#settings'
    })

    res.json({ url: session.url })
  } catch (err) {
    console.error('Checkout error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /v1/billing/portal — Customer Portal (manage subscription)
router.post('/portal', async (req, res) => {
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
    const { rows } = await client.query('SELECT * FROM users WHERE id = $1', [userId])
    client.release()
    if (!rows.length) return res.status(404).json({ error: 'User not found' })

    const user = rows[0]
    if (!user.stripe_customer_id) return res.status(400).json({ error: 'No billing account found' })

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: 'https://lume-cortex.com/#settings'
    })

    res.json({ url: session.url })
  } catch (err) {
    console.error('Portal error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /v1/billing/webhook — Stripe federated webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature']
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  let event
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret)
  } catch (err) {
    console.error('Webhook signature error:', err.message)
    return res.status(400).json({ error: 'Invalid signature' })
  }

  // Only handle events tagged for lume-cortex
  const meta = event.data?.object?.metadata || {}
  if (meta.app && meta.app !== 'lume-cortex') {
    return res.json({ received: true, skipped: true })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const userId = session.metadata?.userId
    const tier = session.metadata?.tier
    const customerId = session.customer

    if (userId && tier) {
      try {
        const client = await pool.connect()
        await client.query(
          'UPDATE users SET tier = $1, stripe_customer_id = $2 WHERE id = $3',
          [tier.toUpperCase(), customerId, userId]
        )
        client.release()
        console.log(`✅ Cortex: upgraded user ${userId} to ${tier}`)
      } catch (err) {
        console.error('Webhook DB error:', err.message)
      }
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object
    const customerId = sub.customer
    try {
      const client = await pool.connect()
      await client.query('UPDATE users SET tier = $1 WHERE stripe_customer_id = $2', ['FREE', customerId])
      client.release()
      console.log(`⬇️  Cortex: downgraded customer ${customerId} to FREE`)
    } catch (err) {
      console.error('Webhook downgrade error:', err.message)
    }
  }

  res.json({ received: true })
})

module.exports = router
