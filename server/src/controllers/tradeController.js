import { fetchAccountInfo, fetchExchangeInfo } from '../services/mexcService.js'
import * as botEngine from '../services/botEngine.js'

export async function startBot(req, res) {
  console.log('Received start request:', req.body)
  const { apiKey, apiSecret, symbol, vol, tpPct, slPct } = req.body
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
    slPct
  })
  
  return res.json({ id })
}

export function stopBot(req, res) {
  const { id } = req.body
  const stopped = botEngine.stopBot(id)
  return res.json({ stopped })
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
