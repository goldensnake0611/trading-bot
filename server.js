import express from 'express'
import crypto from 'crypto'
import fetch from 'node-fetch'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '.env') })
const app = express()
app.use(express.json())
app.use(express.static(path.join(__dirname, 'frontend')))
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'))
})

// In-memory bot state
const bots = new Map()
const positionsHistory = []

// MEXC Spot V3 Sign
function sign(queryString, secretKey) {
  return crypto.createHmac('sha256', secretKey).update(queryString).digest('hex')
}

async function placeOrder({ apiKey, secretKey, symbol, side, type = 'MARKET', quantity, quoteOrderQty, price }) {
  const timestamp = Date.now()
  let query = `symbol=${symbol}&side=${side}&type=${type}&timestamp=${timestamp}`
  if (quantity) query += `&quantity=${quantity}`
  if (quoteOrderQty) query += `&quoteOrderQty=${quoteOrderQty}`
  if (price) query += `&price=${price}`
  
  const signature = sign(query, secretKey)
  const url = `https://api.mexc.com/api/v3/order?${query}&signature=${signature}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-MEXC-APIKEY': apiKey
    }
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

async function fetchKlines(symbol, interval = '1m', limit = 100) {
  const url = `https://api.mexc.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  const res = await fetch(url)
  const data = await res.json().catch(() => ([]))
  return data
}

async function fetchExchangeInfo() {
  try {
    const url = 'https://api.mexc.com/api/v3/exchangeInfo'
    const res = await fetch(url)
    const json = await res.json().catch(() => null)
    if (!json || !json.symbols) return []
    return json.symbols.map(s => ({
      symbol: s.symbol,
      baseCoin: s.baseAsset,
      quoteCoin: s.quoteAsset
    }))
  } catch {
    return [
      { symbol: 'BTCUSDT', baseCoin: 'BTC', quoteCoin: 'USDT' },
      { symbol: 'ETHUSDT', baseCoin: 'ETH', quoteCoin: 'USDT' }
    ]
  }
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

async function strategyTick(bot) {
  const { symbol, apiKey, secretKey, vol, tpPct, slPct } = bot
   
  const kl = await fetchKlines(symbol, '1m')
  // Spot klines: [time, open, high, low, close, vol, ...]
  if (!Array.isArray(kl) || kl.length < 60) return

  const closes = kl.map(k => Number(k[4]))
  const price = closes.at(-1)
  bot.lastPrice = price
  
  const ema20 = ema(closes.slice(-60), 20)
  const ema50 = ema(closes.slice(-60), 50)

  // Long only strategy for Spot
  const shouldBuy = ema20 > ema50 && price > ema20

  // If no position, check for Buy
  if (!bot.positionSide && shouldBuy) {
    const side = 'BUY'
    const externalOid = `${bot.id}:open:${Date.now()}`
    // Market buy by quantity (base asset)
    const res = await placeOrder({ apiKey, secretKey, symbol, side, type: 'MARKET', quantity: vol })
    
    bot.lastOrder = res
    if (res.status !== 200 || (res.data && res.data.code)) {
        // Failed
        return 
    }
    
    // Assume filled at current price for simulation/tracking if real fill price not available easily without another call
    bot.entry = price 
    bot.tp = price * (1 + tpPct/100)
    bot.sl = price * (1 - slPct/100)
    bot.positionSide = 'long'
    
    bot.history = bot.history || []
    bot.history.push({
      time: Date.now(),
      symbol,
      side: 'BUY',
      price,
      vol,
      status: res.status,
      data: res.data,
      event: 'open',
      externalOid
    })
    
    const pos = {
      botId: bot.id,
      symbol,
      openTime: Date.now(),
      entryPrice: price,
      direction: 'Long',
      vol,
      status: 'Opened'
    }
    positionsHistory.push(pos)
    bot.currentPositionIndex = positionsHistory.length - 1
    return
  }

  // If holding, check TP/SL
  if (bot.positionSide === 'long') {
    const hitTp = price >= bot.tp
    const hitSl = price <= bot.sl
    
    if (hitTp || hitSl) {
      const side = 'SELL'
      const externalOid = `${bot.id}:close:${Date.now()}`
      const res = await placeOrder({ apiKey, secretKey, symbol, side, type: 'MARKET', quantity: vol })
      
      const { pnl, roi } = computePnl(bot, price)
      
      bot.history.push({
        time: Date.now(),
        symbol,
        side: 'SELL',
        price,
        vol,
        status: res.status,
        data: res.data,
        event: 'close',
        pnl,
        roi,
        externalOid
      })
      
      if (typeof bot.currentPositionIndex === 'number') {
        const pos = positionsHistory[bot.currentPositionIndex]
        if (pos) {
          pos.closeTime = Date.now()
          pos.closePrice = price
          pos.closingQuantity = vol
          pos.realizedPnl = pnl
          pos.realizedRoi = roi
          pos.status = (res.status === 200 && !res.data.code) ? 'Closed' : `Error (${res.status})`
        }
      }
      
      // Reset
      bot.positionSide = null
      bot.entry = null
      bot.tp = null
      bot.sl = null
      bot.currentPositionIndex = null
    }
  }
}

app.post('/api/start', async (req, res) => {
  const { apiKey, apiSecret, symbol, vol, tpPct, slPct } = req.body
  const resolvedKey = apiKey || process.env.MEXC_API_KEY
  const resolvedSecret = apiSecret || process.env.MEXC_API_SECRET
  if (!resolvedKey || !resolvedSecret || !symbol) return res.status(400).json({ error: 'Missing credentials or symbol' })
  
  const id = `${symbol}:${Date.now()}`
  const bot = {
    id,
    apiKey: resolvedKey,
    secretKey: resolvedSecret,
    symbol,
    vol: Number(vol || 1),
    tpPct: Number(tpPct || 1),
    slPct: Number(slPct || 0.5),
    timer: null,
    lastOrder: null,
    entry: null,
    tp: null,
    sl: null,
    positionSide: null,
    lastPrice: null,
    history: []
  }
  bots.set(id, bot)
  bot.timer = setInterval(() => strategyTick(bot).catch(console.error), 10_000)
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

app.get('/api/positions', (req, res) => {
  const out = [...bots.values()].map(b => {
    const pnl = b.entry && b.lastPrice && b.vol
      ? (b.lastPrice - b.entry) * b.vol
      : 0
    const margin = b.entry && b.vol ? (b.entry * b.vol) : null
    const roi = margin ? (pnl / margin) * 100 : null
    return {
      id: b.id,
      symbol: b.symbol,
      side: b.positionSide,
      entry: b.entry,
      current: b.lastPrice,
      vol: b.vol,
      tp: b.tp,
      sl: b.sl,
      pnl,
      roi
    }
  })
  res.json(out)
})

app.get('/api/history', (req, res) => {
  const out = [...bots.values()].flatMap(b => (b.history || []).map(h => ({ ...h, botId: b.id })))
  res.json(out)
})

app.get('/api/positions_history', (req, res) => {
  const out = positionsHistory.slice().sort((a,b) => (b.openTime || 0) - (a.openTime || 0))
  res.json(out)
})

app.get('/api/contracts', async (_req, res) => {
  const list = await fetchExchangeInfo()
  res.json(list)
})

const port = process.env.PORT || 4000
app.listen(port, () => console.log(`bot server listening on ${port}`))

function computePnl(bot, exitPrice) {
  if (!bot.entry || !bot.vol) return { pnl: 0, roi: null }
  const diff = exitPrice - bot.entry
  const pnl = diff * bot.vol
  const margin = bot.entry * bot.vol
  const roi = margin ? (pnl / margin) * 100 : null
  return { pnl, roi }
}
