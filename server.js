import express from 'express'
import crypto from 'crypto'
import fetch from 'node-fetch'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: path.join(process.cwd(), 'trading-bot', '.env') })
const app = express()
app.use(express.json())
app.use(express.static(path.join(process.cwd(), 'trading-bot', 'frontend')))

// In-memory bot state
const bots = new Map()

// MEXC sign helper (futures contract REST v1): HMAC-SHA256 of accessKey+timestamp
function sign(accessKey, secretKey, timestamp) {
  const payload = `${accessKey}${timestamp}`
  return crypto.createHmac('sha256', secretKey).update(payload).digest('hex')
}

async function placeOrder({ accessKey, secretKey, symbol, side, price, vol, leverage }) {
  const ts = Date.now()
  const signature = sign(accessKey, secretKey, ts)
  const url = 'https://contract.mexc.com/api/v1/order/submit'
  const body = {
    symbol,
    price,
    vol,
    leverage,
    side, // 1=open long, 2=open short, 3=close long, 4=close short (typical mapping)
    type: 1 // 1: limit, 2: market (adjust per need)
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'AccessKey': accessKey,
      'Request-Time': String(ts),
      'Signature': signature
    },
    body: JSON.stringify(body)
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

async function fetchKlines(symbol, interval = 'Min1', start, end) {
  const url = new URL(`https://contract.mexc.com/api/v1/contract/kline/${symbol}`)
  url.searchParams.set('interval', interval)
  if (start) url.searchParams.set('start', String(start))
  if (end) url.searchParams.set('end', String(end))
  const res = await fetch(url)
  const data = await res.json().catch(() => ({}))
  return data
}

function ema(values, period) {
  if (!values.length || period <= 1) return values.at(-1) || 0
  const k = 2 / (period + 1)
  let emaPrev = values[0]
  for (let i = 1; i < values.length; i++) {
    emaPrev = values[i] * k + emaPrev * (1 - k)
  }
  return emaPrev
}

function atr(highs, lows, closes, period = 14) {
  const trs = []
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    )
    trs.push(tr)
  }
  const avg = trs.slice(-period).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(period, trs.length))
  return avg
}

// Strategy: EMA cross + ATR-based stop width
// - Entry long when EMA(20) > EMA(50) and price above EMA(20); short when EMA(20) < EMA(50) and price below EMA(20)
// - Position size fixed by user (vol); leverage set by user
// - TP/SL percentage from user applied on entry price
async function strategyTick(bot) {
  const { symbol, accessKey, secretKey, vol, leverage, tpPct, slPct, direction } = bot
  const kl = await fetchKlines(symbol, 'Min1')
  const rows = (Array.isArray(kl?.data) ? kl.data : []).map(r => ({
    t: r.t || r.time || 0,
    o: Number(r.o ?? r.open ?? 0),
    h: Number(r.h ?? r.high ?? 0),
    l: Number(r.l ?? r.low ?? 0),
    c: Number(r.c ?? r.close ?? 0)
  }))
  if (rows.length < 60) return
  const closes = rows.map(r => r.c)
  const highs = rows.map(r => r.h)
  const lows = rows.map(r => r.l)
  const price = closes.at(-1)
  const ema20 = ema(closes.slice(-60), 20)
  const ema50 = ema(closes.slice(-60), 50)
  const atr14 = atr(highs.slice(-60), lows.slice(-60), closes.slice(-60), 14)

  let shouldLong = ema20 > ema50 && price > ema20
  let shouldShort = ema20 < ema50 && price < ema20
  if (direction === 'long') shouldShort = false
  if (direction === 'short') shouldLong = false

  if (shouldLong || shouldShort) {
    const side = shouldLong ? 1 : 2
    const res = await placeOrder({ accessKey, secretKey, symbol, side, price, vol, leverage })
    bot.lastOrder = res
    bot.entry = price
    bot.tp = shouldLong ? price * (1 + tpPct) : price * (1 - tpPct)
    bot.sl = shouldLong ? price * (1 - slPct) : price * (1 + slPct)
  }
}

// REST endpoints
app.post('/api/start', async (req, res) => {
  const { apiKey, apiSecret, symbol, vol, leverage, tpPct, slPct, direction } = req.body
  const resolvedKey = apiKey || process.env.MEXC_API_KEY
  const resolvedSecret = apiSecret || process.env.MEXC_API_SECRET
  if (!resolvedKey || !resolvedSecret || !symbol) return res.status(400).json({ error: 'Missing credentials or symbol' })
  const id = `${symbol}:${Date.now()}`
  const bot = {
    id,
    accessKey: resolvedKey,
    secretKey: resolvedSecret,
    symbol,
    vol: Number(vol || 1),
    leverage: Number(leverage || 5),
    tpPct: Number(tpPct || 0.01),
    slPct: Number(slPct || 0.005),
    direction: direction || 'auto',
    timer: null,
    lastOrder: null,
    entry: null,
    tp: null,
    sl: null
  }
  bots.set(id, bot)
  bot.timer = setInterval(() => strategyTick(bot).catch(() => {}), 10_000)
  return res.json({ id })
})

app.post('/api/stop', (req, res) => {
  const { id } = req.body
  const bot = bots.get(id)
  if (bot) {
    clearInterval(bot.timer)
    bots.delete(id)
  }
  return res.json({ stopped: !!bot })
})

app.get('/api/status', (req, res) => {
  const out = [...bots.values()].map(b => ({ id: b.id, symbol: b.symbol, lastOrder: b.lastOrder, entry: b.entry, tp: b.tp, sl: b.sl }))
  res.json(out)
})

const port = process.env.PORT || 4000
app.listen(port, () => console.log(`bot server listening on ${port}`))
