import { fetchKlines, placeOrder } from './mexcService.js'
import { computePnl } from '../utils/math.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'

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
let positionsHistory = []
const systemLogs = []

// Persistence
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DATA_FILE = path.join(__dirname, '../../data/positions.json')

// Load history
try {
  if (fs.existsSync(DATA_FILE)) {
    positionsHistory = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    // Backfill IDs
    let modified = false
    positionsHistory.forEach(p => {
      if (!p.id) {
        p.id = crypto.randomUUID()
        modified = true
      }
    })
    if (modified) saveHistory()
    console.log(`Loaded ${positionsHistory.length} positions from history.`)
  }
} catch(e) { console.error('Failed to load history:', e) }

function saveHistory() {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true })
    fs.writeFileSync(DATA_FILE, JSON.stringify(positionsHistory, null, 2))
  } catch(e) { console.error('Failed to save history:', e) }
}

export function getBots() {
  return [...bots.values()].map(bot => ({
    ...bot,
    timer: undefined // Remove circular ref/internal obj
  }))
}

export function toggleAutoSell(id, enabled) {
  const bot = bots.get(id)
  if (bot) {
    bot.autoSell = !!enabled
    return true
  }
  return false
}

export function updateBotTpSl(id, tp, sl) {
  const bot = bots.get(id)
  if (!bot) return false
  const parseVal = (v) => {
    if (v === '' || v === null || v === undefined) return null
    const n = Number(v)
    return isFinite(n) ? n : null
  }
  const newTp = parseVal(tp)
  const newSl = parseVal(sl)
  bot.tp = newTp
  bot.sl = newSl
  systemLogs.push({
    time: Date.now(),
    type: 'info',
    message: `Updated TP/SL for ${bot.symbol}: TP=${newTp ?? 'Off'}, SL=${newSl ?? 'Off'}`,
    botId: id
  })
  return true
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

export function getDailyPnl() {
  const now = new Date()
  // Use UTC for daily boundaries to be consistent
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  
  return positionsHistory
    .filter(p => p.closeTime && p.closeTime >= today)
    .reduce((sum, p) => sum + (Number(p.realizedPnl) || 0), 0)
}

export function deletePositionHistory(id) {
  // Check if any active bot is using this position
  for (const bot of bots.values()) {
    if (bot.currentPositionId === id) {
      return { success: false, error: 'Cannot delete history of an active position.' }
    }
  }

  const initialLen = positionsHistory.length
  positionsHistory = positionsHistory.filter(p => p.id !== id)
  
  if (positionsHistory.length !== initialLen) {
    saveHistory()
    return { success: true }
  }
  return { success: false, error: 'Position not found' }
}

export async function startBot({ apiKey, secretKey, symbol, vol, tpPct, slPct, strategy, autoSell, isPaperTrading, immediate }) {
  const id = `${symbol}:${Date.now()}`
  console.log('Starting bot with ID:', id, 'Strategy:', strategy, 'Mode:', isPaperTrading ? 'Paper Trading' : 'Live')
  
  const bot = {
    id,
    apiKey,
    secretKey,
    symbol,
    vol: Number(vol || 1),
    tpPct: Number(tpPct || 1),
    slPct: Number(slPct || 0.5),
    strategy: strategy || 'trend-following', // Default
    autoSell: autoSell !== undefined ? !!autoSell : true,
    isPaperTrading: !!isPaperTrading,
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

  if (immediate) {
      try {
        const kl = await fetchKlines(symbol, '1m')
        if (kl && kl.length > 0) {
            const price = Number(kl.at(-1)[4])
            await executeBuy(bot, price, { trigger: 'Manual Immediate Buy' })
        } else {
            console.error('Failed to fetch price for immediate buy')
        }
      } catch (e) {
        console.error('Immediate buy failed', e)
      }
  }
  
  // Run immediately then interval
  strategyTick(bot).catch(console.error)
  bot.timer = setInterval(() => strategyTick(bot).catch(console.error), 5000)
  
  return id
}

async function executeBuy(bot, price, indicators) {
    const { apiKey, secretKey, symbol, vol, tpPct, slPct, strategy, isPaperTrading } = bot
    const side = 'BUY'
    const externalOid = `${bot.id}:open:${Date.now()}`
    
    let res
    if (isPaperTrading) {
      console.log(`[${bot.id}] Simulating BUY of ${vol} USDT of ${symbol} at ~${price}`)
      const simulatedQty = vol / price
      res = {
        status: 200,
        data: {
          symbol,
          orderId: 'sim_buy_' + Date.now(),
          transactTime: Date.now(),
          price: price,
          origQuoteOrderQty: vol,
          executedQty: simulatedQty,
          cummulativeQuoteQty: vol,
          status: 'FILLED',
          type: 'MARKET',
          side: 'BUY'
        }
      }
    } else {
      res = await placeOrder({ apiKey, secretKey, symbol, side, type: 'MARKET', quoteOrderQty: vol })
    }

    console.log("order status>>>>", res.status)
    bot.lastOrder = res
    if (res.status !== 200 || (res.data && res.data.code)) {
        console.error('Buy Failed:', res.data)
        return 
    }
    
    let executedQty = 0
    if (res.data && res.data.executedQty) {
      executedQty = Number(res.data.executedQty)
    } else {
      executedQty = vol / price
    }
    
    bot.heldVol = executedQty
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
      vol: executedQty, 
      usdtVal: vol,
      status: res.status,
      data: res.data,
      event: 'open',
      externalOid,
      indicators
    })
    
    const posId = crypto.randomUUID()
    const pos = {
      id: posId,
      botId: bot.id,
      symbol,
      strategy,
      openTime: Date.now(),
      entryPrice: price,
      direction: 'Long',
      vol: executedQty,
      status: 'Opened'
    }
    positionsHistory.push(pos)
    saveHistory()
  bot.currentPositionId = posId
}

export async function manualBuy(id) {
  const bot = bots.get(id)
  if (!bot) return { success: false, error: 'Bot not found' }
  if (bot.positionSide) return { success: false, error: 'Position already open' }
  try {
    const kl = await fetchKlines(bot.symbol, '1m')
    if (!kl || kl.length === 0) return { success: false, error: 'Price unavailable' }
    const price = Number(kl.at(-1)[4])
    await executeBuy(bot, price, { trigger: 'Manual Buy' })
    return { success: true }
  } catch (e) {
    console.error('Manual buy failed:', e)
    return { success: false, error: e.message }
  }
}

async function checkDailyLossLimit(bot) {
  const limit = Number(process.env.DAILY_LOSS_LIMIT || 10)
  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  
  // Calculate PnL for trades closed today by this bot
  const dailyPnl = (bot.history || [])
    .filter(h => h.side === 'SELL' && h.time >= today)
    .reduce((sum, h) => sum + (Number(h.pnl) || 0), 0)
    
  if (dailyPnl <= -limit) {
    const msg = `Daily Loss Limit Reached: ${dailyPnl.toFixed(2)} <= -${limit}`
    // Only log once per minute to avoid spamming
    const lastLog = bot.lastLossLimitLog || 0
    if (Date.now() - lastLog > 60000) {
      console.warn(`[${bot.id}] ${msg}. Pausing trading until tomorrow.`)
      bot.lastLossLimitLog = Date.now()
    }
    return true // Limit reached, pause trading
  }
  return false
}

export async function stopBot(id, reason = null) {
  const bot = bots.get(id)
  if (bot) {
    clearInterval(bot.timer)
    
    // Auto-close position if open
    if (bot.positionSide) {
      console.log(`[${id}] Stopping bot with open position. Closing now...`)
      try {
        await executeSell(bot, reason || 'Bot Stopped')
      } catch (e) {
        console.error(`[${id}] Failed to auto-close position:`, e)
      }
    }

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
  
  // Use heldVol (Base Asset Qty) if available, otherwise estimate from vol (USDT) / entry
  const quantityToSell = bot.heldVol || (vol / entry)
  
  let res
  if (bot.isPaperTrading) {
    console.log(`[${bot.id}] Simulating SELL of ${quantityToSell} ${symbol} at ${price}`)
    // Simulate successful sell
    res = {
      status: 200,
      data: {
        symbol,
        orderId: 'sim_sell_' + Date.now(),
        transactTime: Date.now(),
        price: price,
        origQty: quantityToSell,
        executedQty: quantityToSell,
        cummulativeQuoteQty: quantityToSell * price,
        status: 'FILLED',
        type: 'MARKET',
        side: 'SELL'
      }
    }
  } else {
    res = await placeOrder({ apiKey, secretKey, symbol, side, type: 'MARKET', quantity: quantityToSell })
  }
  
  const { pnl, roi } = computePnl(entry, quantityToSell, price)
  
  bot.history.push({
    time: Date.now(),
    symbol,
    side: 'SELL',
    price,
    vol: quantityToSell,
    status: res.status,
    data: res.data,
    event: 'close',
    pnl,
    roi,
    externalOid,
    reason
  })
  
  if (bot.currentPositionId) {
    const pos = positionsHistory.find(p => p.id === bot.currentPositionId)
    if (pos) {
      pos.closeTime = Date.now()
      pos.closePrice = price
      pos.closingQuantity = quantityToSell
      pos.realizedPnl = pnl
      pos.realizedRoi = roi
      pos.status = (res.status === 200 && !res.data.code) ? 'Closed' : `Error (${res.status})`
    }
    saveHistory()
    bot.currentPositionId = null
  }

  // Reset position
  bot.positionSide = null
  bot.entry = null
  bot.tp = null
  bot.sl = null
  bot.heldVol = null
  
  return { success: true, pnl, roi, price }
}

async function strategyTick(bot) {

  // Check Daily Loss Limit first
  if (await checkDailyLossLimit(bot)) return

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
    await executeBuy(bot, price, indicators)
    return
  }

  // If holding, check TP/SL or Strategy SELL
  if (bot.positionSide === 'long') {
    // Check if auto-sell is enabled for strategy signals
    // TP and SL are always active if set
    
    // Check TP/SL only if they are set (not null/0)
    const hitTp = (typeof bot.tp === 'number' && bot.tp > 0) && price >= bot.tp
    const hitSl = (typeof bot.sl === 'number' && bot.sl > 0) && price <= bot.sl
    const strategySell = action === 'SELL'
    
    // Determine if we should sell
    let shouldSell = false
    let reason = ''

    if (hitTp) {
      shouldSell = true
      reason = 'TP'
    } else if (hitSl) {
      shouldSell = true
      reason = 'SL'
    } else if (bot.autoSell && strategySell) {
      // Only use strategy sell if autoSell is enabled
      shouldSell = true
      reason = 'Strategy'
    }

    if (shouldSell) {
      await executeSell(bot, reason)
    }
  }
}
