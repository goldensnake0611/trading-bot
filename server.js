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

// MEXC sign helper (futures contract REST v1): HMAC-SHA256 of accessKey+timestamp
function sign(accessKey, secretKey, timestamp) {
  const payload = `${accessKey}${timestamp}`
  return crypto.createHmac('sha256', secretKey).update(payload).digest('hex')
}

async function placeOrder({ accessKey, secretKey, symbol, side, price, vol, leverage, reduceOnly = false, externalOid, type = 1 }) {
  const ts = Date.now()
  const signature = sign(accessKey, secretKey, ts)
  const url = 'https://contract.mexc.com/api/v1/order/submit'
  const body = {
    symbol,
    price,
    vol,
    leverage,
    side, // 1=open long, 2=open short, 3=close long, 4=close short (typical mapping)
    type, // 1: limit, 2: market
    reduceOnly,
    externalOid
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

async function fetchContracts() {
  try {
    const url = 'https://contract.mexc.com/api/v1/contract/detail'
    const res = await fetch(url)
    const json = await res.json().catch(() => null)
    let arr = []
    if (json && Array.isArray(json.data)) arr = json.data
    else if (json && json.data && typeof json.data === 'object') arr = [json.data]
    return arr.map(d => ({
      symbol: d.symbol,
      displayNameEn: d.displayNameEn || d.displayName || d.symbol,
      baseCoin: d.baseCoin || (d.symbol ? d.symbol.split('_')[0] : ''),
      quoteCoin: d.quoteCoin || (d.symbol ? d.symbol.split('_')[1] : ''),
      maxLeverage: d.maxLeverage,
      minLeverage: d.minLeverage
    }))
  } catch {
    return [
      { symbol: 'BTC_USDT', displayNameEn: 'BTC_USDT PERPETUAL', baseCoin: 'BTC', quoteCoin: 'USDT' },
      { symbol: 'ETH_USDT', displayNameEn: 'ETH_USDT PERPETUAL', baseCoin: 'ETH', quoteCoin: 'USDT' },
      { symbol: 'BNB_USDT', displayNameEn: 'BNB_USDT PERPETUAL', baseCoin: 'BNB', quoteCoin: 'USDT' },
      { symbol: 'SOL_USDT', displayNameEn: 'SOL_USDT PERPETUAL', baseCoin: 'SOL', quoteCoin: 'USDT' },
      { symbol: 'XRP_USDT', displayNameEn: 'XRP_USDT PERPETUAL', baseCoin: 'XRP', quoteCoin: 'USDT' },
      { symbol: 'DOGE_USDT', displayNameEn: 'DOGE_USDT PERPETUAL', baseCoin: 'DOGE', quoteCoin: 'USDT' },
      { symbol: 'ADA_USDT', displayNameEn: 'ADA_USDT PERPETUAL', baseCoin: 'ADA', quoteCoin: 'USDT' },
      { symbol: 'TRX_USDT', displayNameEn: 'TRX_USDT PERPETUAL', baseCoin: 'TRX', quoteCoin: 'USDT' },
      { symbol: 'LINK_USDT', displayNameEn: 'LINK_USDT PERPETUAL', baseCoin: 'LINK', quoteCoin: 'USDT' },
      { symbol: 'LTC_USDT', displayNameEn: 'LTC_USDT PERPETUAL', baseCoin: 'LTC', quoteCoin: 'USDT' }
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
  bot.lastPrice = price
  const ema20 = ema(closes.slice(-60), 20)
  const ema50 = ema(closes.slice(-60), 50)
  const atr14 = atr(highs.slice(-60), lows.slice(-60), closes.slice(-60), 14)

  let shouldLong = ema20 > ema50 && price > ema20
  let shouldShort = ema20 < ema50 && price < ema20
  if (direction === 'long') shouldShort = false
  if (direction === 'short') shouldLong = false

  // If no position, consider opening
  if (!bot.positionSide && (shouldLong || shouldShort)) {
    const side = shouldLong ? 1 : 2
    const externalOid = `${bot.id}:open:${Date.now()}`
    const res = await placeOrder({ accessKey, secretKey, symbol, side, price, vol, leverage, externalOid, type: 2 })
    bot.lastOrder = res
    bot.entry = price
    bot.tp = shouldLong ? price * (1 + tpPct) : price * (1 - tpPct)
    bot.sl = shouldLong ? price * (1 - slPct) : price * (1 + slPct)
    bot.positionSide = shouldLong ? 'long' : 'short'
    bot.history = bot.history || []
    bot.history.push({
      time: Date.now(),
      symbol,
      side: bot.positionSide,
      price,
      vol,
      leverage,
      status: res.status,
      data: res.data,
      event: 'open',
      externalOid
    })
    const pos = {
      botId: bot.id,
      symbol,
      openTime: Date.now(),
      marginMode: 'Isolated',
      entryPrice: price,
      closeTime: null,
      closePrice: null,
      liquidationPrice: null,
      direction: bot.positionSide,
      closingQuantity: null,
      realizedPnl: null,
      realizedRoi: null,
      vol,
      leverage,
      status: 'Opened'
    }
    positionsHistory.push(pos)
    bot.currentPositionIndex = positionsHistory.length - 1
    return
  }

  // If in position, check TP/SL for close
  if (bot.positionSide) {
    const hitTp = bot.positionSide === 'long' ? price >= bot.tp : price <= bot.tp
    const hitSl = bot.positionSide === 'long' ? price <= bot.sl : price >= bot.sl
    if (hitTp || hitSl) {
      const closeSide = bot.positionSide === 'long' ? 3 : 4
      const externalOid = `${bot.id}:close:${Date.now()}`
      const res = await placeOrder({ accessKey, secretKey, symbol, side: closeSide, price, vol, leverage, reduceOnly: true, externalOid, type: 2 })
      const { pnl, roi } = computePnl(bot, price)
      bot.history.push({
        time: Date.now(),
        symbol,
        side: bot.positionSide,
        price,
        vol,
        leverage,
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
          pos.status = res.status === 200 ? 'All Closed' : `Closed (${res.status})`
        }
      }
      // reset position
      bot.positionSide = null
      bot.entry = null
      bot.tp = null
      bot.sl = null
      bot.currentPositionIndex = null
    }
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
    sl: null,
    positionSide: null,
    lastPrice: null,
    history: []
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

app.get('/api/positions', (req, res) => {
  const out = [...bots.values()].map(b => {
    const pnl = b.entry && b.lastPrice && b.vol
      ? (b.positionSide === 'long'
          ? (b.lastPrice - b.entry) * b.vol
          : (b.entry - b.lastPrice) * b.vol)
      : 0
    const margin = b.entry && b.vol && b.leverage ? (b.entry * b.vol) / b.leverage : null
    const roi = margin ? (pnl / margin) * 100 : null
    return {
      id: b.id,
      symbol: b.symbol,
      side: b.positionSide,
      entry: b.entry,
      current: b.lastPrice,
      vol: b.vol,
      leverage: b.leverage,
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
  const list = await fetchContracts()
  res.json(list)
})

const port = process.env.PORT || 4000
app.listen(port, () => console.log(`bot server listening on ${port}`))
function computePnl(bot, exitPrice) {
  if (!bot.entry || !bot.vol) return { pnl: 0, roi: null }
  const diff = bot.positionSide === 'long' ? (exitPrice - bot.entry) : (bot.entry - exitPrice)
  const pnl = diff * bot.vol
  const margin = bot.entry && bot.leverage ? (bot.entry * bot.vol) / bot.leverage : null
  const roi = margin ? (pnl / margin) * 100 : null
  return { pnl, roi }
}
