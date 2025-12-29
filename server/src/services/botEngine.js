import { fetchKlines, placeOrder } from './mexcService.js'
import { computePnl } from '../utils/math.js'

// Import Strategies
import * as emaCrossover from '../strategies/emaCrossover.js'
import * as trendFollowing from '../strategies/trendFollowing.js'
import * as rsiEmaPullback from '../strategies/rsiEmaPullback.js'
import * as vwapScalping from '../strategies/vwapScalping.js'
import * as dca from '../strategies/dca.js'

const strategies = {
  'ema-crossover': emaCrossover,
  'trend-following': trendFollowing,
  'rsi-ema-pullback': rsiEmaPullback,
  'vwap-scalping': vwapScalping,
  'dca': dca
}

export function getAvailableStrategies() {
  return Object.entries(strategies).map(([id, module]) => ({
    id,
    name: module.name || id,
    description: module.description || 'No description available'
  }))
}

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

export async function startBot({ apiKey, secretKey, symbol, vol, tpPct, slPct, strategy }) {
  const id = `${symbol}:${Date.now()}`
  console.log('Starting bot with ID:', id, 'Strategy:', strategy)
  
  const bot = {
    id,
    apiKey,
    secretKey,
    symbol,
    vol: Number(vol || 1),
    tpPct: Number(tpPct || 1),
    slPct: Number(slPct || 0.5),
    strategy: strategy || 'trend-following', // Default
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
  const { symbol, apiKey, secretKey, vol, tpPct, slPct, strategy } = bot
  
  // Select strategy module
  const strategyModule = strategies[strategy] || strategies['trend-following']
   
  const kl = await fetchKlines(symbol, '1m')
  // Spot klines: [time, open, high, low, close, vol, ...]
  if (!Array.isArray(kl) || kl.length < 200) return // Need enough history for EMA200

  const closes = kl.map(k => Number(k[4]))
  const price = closes.at(-1)
  bot.lastPrice = price
  
  // Use Strategy - Pass full klines for advanced strategies (VWAP needs volume)
  // Some legacy strategies might expect just closes, but we updated them to take klines or extracted closes inside.
  // Actually, let's check our implementations:
  // emaCrossover: takes `closes`
  // trendFollowing: takes `klines`
  // rsiEmaPullback: takes `klines`
  // vwapScalping: takes `klines`
  // dca: takes `klines`
  
  // To unify, we should update emaCrossover to take klines OR handle it here.
  // Let's handle it here for backward compat with the one we wrote first (emaCrossover).
  
  let action, indicators
  if (strategy === 'ema-crossover') {
     // This one was written to take 'closes' array
     const res = strategyModule.analyze(closes)
     action = res.action
     indicators = res.indicators
  } else {
     // The new ones take 'klines'
     const res = strategyModule.analyze(kl)
     action = res.action
     indicators = res.indicators
  }

  // If no position, check for Buy
  if (!bot.positionSide && action === 'BUY') {
    const side = 'BUY'
    const externalOid = `${bot.id}:open:${Date.now()}`
    // Market buy by quantity (base asset)
    const res = await placeOrder({ apiKey, secretKey, symbol, side, type: 'MARKET', quantity: vol })
    
    bot.lastOrder = res
    if (res.status !== 200 || (res.data && res.data.code)) {
        // Failed
        console.error('Buy Failed:', res.data)
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
      externalOid,
      indicators
    })
    
    const pos = {
      botId: bot.id,
      symbol,
      strategy,
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
        externalOid,
        reason: hitTp ? 'TP' : 'SL'
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
      
      // Reset position
      bot.positionSide = null
      bot.entry = null
      bot.tp = null
      bot.sl = null
      
      // If DCA, we might want to NOT reset (accumulate), but for this simple version we trade in/out.
    }
  }
}
