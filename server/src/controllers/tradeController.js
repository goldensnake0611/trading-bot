import { fetchAccountInfo, fetchExchangeInfo, fetchKlines, fetchFuturesKlines } from '../services/mexcService.js'
import * as botEngine from '../services/botEngine.js'

export async function startBot(req, res) {
  console.log('Received start request:', req.body)
  const { apiKey, apiSecret, symbol, vol, tpPct, slPct, strategy, autoSell, isPaperTrading, immediate, marketType, interval } = req.body
  const resolvedKey = apiKey || process.env.MEXC_API_KEY
  const resolvedSecret = apiSecret || process.env.MEXC_API_SECRET
  
  if (!resolvedKey || !resolvedSecret || !symbol) {
    console.error('Missing credentials or symbol')
    return res.status(400).json({ error: 'Missing credentials or symbol' })
  }

  const id = await botEngine.startBot({
    apiKey: resolvedKey,
    secretKey: resolvedSecret,
    symbol,
    vol,
    tpPct,
    slPct, 
    strategy,
    autoSell,
    isPaperTrading,
    immediate,
    marketType,
    interval
  })
  
  return res.json({ id })
}

export async function stopBot(req, res) {
  const { id } = req.body
  const stopped = await botEngine.stopBot(id)
  return res.json({ stopped })
}

export async function sellPosition(req, res) {
  const { id } = req.body
  try {
    const result = await botEngine.sellPosition(id)
    return res.json(result)
  } catch(e) {
    console.error('Manual sell failed:', e)
    return res.status(400).json({ error: e.message })
  }
}

export async function manualBuy(req, res) {
  const { id } = req.body
  try {
    const result = await botEngine.manualBuy(id)
    if (result.success) return res.json({ success: true })
    return res.status(400).json({ error: result.error || 'Buy failed' })
  } catch (e) {
    console.error('Manual buy failed:', e)
    return res.status(400).json({ error: e.message })
  }
}

export async function toggleAutoSell(req, res) {
  const { id, enabled } = req.body
  const result = botEngine.toggleAutoSell(id, enabled)
  return res.json({ success: result })
}

export async function updateTpSl(req, res) {
  const { id, tp, sl } = req.body
  const result = botEngine.updateBotTpSl(id, tp, sl)
  return res.json({ success: result })
}

export function getStatus(req, res) {
  const bots = botEngine.getBots()
  const out = bots.map(b => ({ 
    id: b.id, 
    symbol: b.symbol, 
    lastOrder: b.lastOrder, 
    entry: b.entry, 
    tp: b.tp, 
    sl: b.sl 
  }))
  res.json(out)
}

export function getPositions(req, res) {
  const bots = botEngine.getBots()
  const out = bots.map(b => {
    const baseQty = b.heldVol || 0
    const pnl = b.entry && b.lastPrice && baseQty
      ? (b.lastPrice - b.entry) * baseQty
      : 0
    const margin = b.entry && baseQty ? (b.entry * baseQty) : null
    const roi = margin ? (pnl / margin) * 100 : null
    return {
      id: b.id,
      symbol: b.symbol,
      strategy: b.strategy,
      autoSell: b.autoSell,
      side: b.positionSide,
      entry: b.entry,
      current: b.lastPrice,
      vol: baseQty,
      tp: b.tp,
      sl: b.sl,
      pnl,
      roi
    }
  })
  res.json(out)
}

export function getHistory(req, res) {
  const bots = botEngine.getBots()
  const out = bots.flatMap(b => (b.history || []).map(h => ({ ...h, botId: b.id })))
  res.json(out)
}

export function getPositionsHistory(req, res) {
  const history = botEngine.getPositionsHistory()
  const out = history.slice().sort((a,b) => (b.openTime || 0) - (a.openTime || 0))
  res.json(out)
}

export function deletePositionHistory(req, res) {
  const { id } = req.params
  const result = botEngine.deletePositionHistory(id)
  if (result.success) {
    res.json({ success: true })
  } else {
    res.status(400).json({ error: result.error })
  }
}

export function deleteAllHistory(req, res) {
  const result = botEngine.deleteAllHistory()
  if (result.success) {
    res.json({ success: true, count: result.count })
  } else {
    res.status(500).json({ error: result.error || 'Failed to delete history' })
  }
}

export async function getBalance(req, res) {
  const apiKey = req.query.apiKey || process.env.MEXC_API_KEY
  const secretKey = req.query.apiSecret || process.env.MEXC_API_SECRET
  if (!apiKey || !secretKey) return res.status(400).json({ error: 'Missing API credentials' })
  
  const { status, data } = await fetchAccountInfo(apiKey, secretKey)
  if (status !== 200) {
    return res.status(status).json(data)
  }
  
  // Filter for non-zero balances
  const balances = (data.balances || []).filter(b => Number(b.free) > 0 || Number(b.locked) > 0)
  res.json(balances)
}

export async function getContracts(req, res) {
  const list = await fetchExchangeInfo()
  res.json(list)
}

export function getStrategies(req, res) {
  const strategies = botEngine.getAvailableStrategies()
  res.json(strategies)
}

export function getLogs(req, res) {
  const logs = botEngine.getSystemLogs()
  res.json(logs)
}

export async function getKlines(req, res) {
  const { symbol, interval, limit, startTime, endTime, type } = req.query
  if (!symbol) return res.status(400).json({ error: 'Missing symbol' })
  
  try {
    let klines
    if (type === 'futures') {
      klines = await fetchFuturesKlines(symbol, interval || '1m', limit || 500, startTime, endTime)
    } else {
      klines = await fetchKlines(symbol, interval || '1m', limit || 500, startTime, endTime)
    }
    res.json(klines)
  } catch(e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to fetch klines' })
  }
}

export function getStats(req, res) {
  const dailyPnl = botEngine.getDailyPnl()
  res.json({ dailyPnl })
}
