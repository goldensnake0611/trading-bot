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
const systemLogs = []

export function getBots() {
  return [...bots.values()]
}

export function getSystemLogs() {
  return systemLogs.slice(-50).reverse() // Last 50 logs, newest first
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

function checkDailyLossLimit(bot) {
  const limit = Number(process.env.DAILY_LOSS_LIMIT || 10)
  const today = new Date().setHours(0,0,0,0)
  
  // Calculate PnL for trades closed today by this bot
  const dailyPnl = (bot.history || [])
    .filter(h => h.side === 'SELL' && h.time >= today)
    .reduce((sum, h) => sum + (Number(h.pnl) || 0), 0)
    
  if (dailyPnl <= -limit) {
    const msg = `Daily Loss Limit Reached: ${dailyPnl.toFixed(2)} <= -${limit}`
    console.warn(`[${bot.id}] ${msg}. Stopping bot.`)
    stopBot(bot.id, msg)
    return true // Limit reached
  }
  return false
}

export function stopBot(id, reason = null) {
  const bot = bots.get(id)
  if (bot) {
    clearInterval(bot.timer)
    bots.delete(id)
    
    if (reason) {
      systemLogs.push({
        time: Date.now(),
        type: 'warning',
        message: `Bot ${bot.symbol} stopped: ${reason}`,
        botId: id
      })
    }
    
    return true
  }
  return false
}

export async function sellPosition(botId) {
  const bot = bots.get(botId)
  if (!bot) throw new Error('Bot not found')
  if (!bot.positionSide) throw new Error('No open position to sell')

  return await executeSell(bot, 'Manual')
}

async function executeSell(bot, reason) {
  const { apiKey, secretKey, symbol, vol, entry } = bot
  // Get current price for PnL calculation if possible, or use last known
  // Better to fetch fresh price
  let price = bot.lastPrice
  try {
     const kl = await fetchKlines(symbol, '1m')
     if (kl && kl.length > 0) price = Number(kl.at(-1)[4])
  } catch(e) {}

  const side = 'SELL'
  const externalOid = `${bot.id}:close:${Date.now()}`
  const res = await placeOrder({ apiKey, secretKey, symbol, side, type: 'MARKET', quantity: vol })
  
  const { pnl, roi } = computePnl(entry, vol, price)
  
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
    reason
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
  
  return { success: true, pnl, roi, price }
}

async function strategyTick(bot) {
  // Check Daily Loss Limit first
  if (checkDailyLossLimit(bot)) return

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

  // If holding, check TP/SL or Strategy SELL
  if (bot.positionSide === 'long') {
    const hitTp = price >= bot.tp
    const hitSl = price <= bot.sl
    const strategySell = action === 'SELL'
    
    if (hitTp || hitSl || strategySell) {
      let reason = 'Strategy'
      if (hitTp) reason = 'TP'
      else if (hitSl) reason = 'SL'
      
      await executeSell(bot, reason)
    }
  }
}
