import { fetchKlines, placeOrder } from './mexcService.js'
import { ema, computePnl } from '../utils/math.js'

// In-memory state
const bots = new Map()
const positionsHistory = []

export function getBots() {
  return [...bots.values()]
}

export function getBot(id) {
  return bots.get(id)
}

export function getPositionsHistory() {
  return positionsHistory
}

export async function startBot({ apiKey, secretKey, symbol, vol, tpPct, slPct }) {
  const id = `${symbol}:${Date.now()}`
  console.log('Starting bot with ID:', id)
  
  const bot = {
    id,
    apiKey,
    secretKey,
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
  // Run immediately then interval
  strategyTick(bot).catch(console.error)
  bot.timer = setInterval(() => strategyTick(bot).catch(console.error), 10_000)
  
  return id
}

export function stopBot(id) {
  const bot = bots.get(id)
  if (bot) {
    clearInterval(bot.timer)
    bots.delete(id)
    return true
  }
  return false
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
    
    // Assume filled at current price for simulation/tracking
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
      
      const { pnl, roi } = computePnl(bot.entry, bot.vol, price)
      
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
