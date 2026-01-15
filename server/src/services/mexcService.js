import crypto from 'crypto'
import fetch from 'node-fetch'

function sign(queryString, secretKey) {
  return crypto.createHmac('sha256', secretKey).update(queryString).digest('hex')
}

export async function placeOrder({ apiKey, secretKey, symbol, side, type = 'MARKET', quantity, quoteOrderQty, price }) {
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

export async function fetchKlines(symbol, interval = '1m', limit = 1000, startTime = null, endTime = null) {
  // Map 1h to 60m for Spot API if needed
  if (interval === '1h') interval = '60m'
  
  let url = `https://api.mexc.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  if (startTime) url += `&startTime=${startTime}`
  if (endTime) url += `&endTime=${endTime}`
  
  const res = await fetch(url)
  const data = await res.json().catch(() => ([]))
  return data
}

export async function fetchFuturesKlines(symbol, interval = '5m', limit = 200, startTime = null, endTime = null) {
  // Convert Symbol: BTCUSDT -> BTC_USDT
  const futuresSymbol = symbol.replace('USDT', '_USDT')

  // Map Interval
  const intervalMap = {
    '1m': 'Min1',
    '5m': 'Min5',
    '15m': 'Min15',
    '30m': 'Min30',
    '1h': 'Min60',
    '4h': 'Hour4',
    '8h': 'Hour8',
    '1d': 'Day1',
    '1w': 'Week1',
    '1M': 'Month1'
  }
  const mappedInterval = intervalMap[interval] || 'Min60'

  let url = `https://contract.mexc.com/api/v1/contract/kline/${futuresSymbol}?interval=${mappedInterval}`
  
  // Determine time range if not provided
  // If no startTime provided, we calculate it based on limit
  if (!startTime && !endTime) {
      // Calculate seconds per interval
      const intervalSeconds = {
        '1m': 60,
        '5m': 300,
        '15m': 900,
        '30m': 1800,
        '1h': 3600,
        '4h': 14400,
        '8h': 28800,
        '1d': 86400,
        '1w': 604800,
        '1M': 2592000
      }[interval] || 3600

      const now = Math.floor(Date.now() / 1000)
      const end = now
      const start = now - (limit * intervalSeconds)
      
      url += `&start=${start}&end=${end}`
  } else {
      if (startTime) url += `&start=${Math.floor(startTime / 1000)}`
      if (endTime) url += `&end=${Math.floor(endTime / 1000)}`
  }
  
  try {
    const res = await fetch(url)
    const json = await res.json()
    
    let result = []

    if (json.success && json.data) {
       const { time, open, high, low, close, vol } = json.data
       if (time && Array.isArray(time) && time.length > 0) {
           // Zip into [[time, open, high, low, close, vol], ...]
           // Convert time back to MS
           result = time.map((t, i) => [
               t * 1000,          // time (ms)
               open[i],           // open
               high[i],           // high
               low[i],            // low
               close[i],          // close
               vol[i]             // vol
           ])
       }
    }
    
    if (result.length > 0) return result
    
    return []
  } catch (e) {
    console.error('Fetch Futures Klines Error:', e)
    return []
  }
}

let exchangeInfoCache = null
let exchangeInfoTime = 0

export async function fetchExchangeInfo(force = false) {
  const now = Date.now()
  if (!force && exchangeInfoCache && (now - exchangeInfoTime < 3600000)) { // 1 hour cache
      return exchangeInfoCache
  }

  try {
    const url = 'https://api.mexc.com/api/v3/exchangeInfo'
    const res = await fetch(url)
    const json = await res.json().catch(() => null)
    if (!json || !json.symbols) return exchangeInfoCache || []
    
    exchangeInfoCache = json.symbols.map(s => ({
      symbol: s.symbol,
      baseCoin: s.baseAsset,
      quoteCoin: s.quoteAsset,
      baseSizePrecision: s.baseSizePrecision, // Quantity precision (decimal places)
      quoteAmountPrecision: s.quoteAmountPrecision // Quote quantity precision
    }))
    exchangeInfoTime = now
    return exchangeInfoCache
  } catch {
    return exchangeInfoCache || [
      { symbol: 'BTCUSDT', baseCoin: 'BTC', quoteCoin: 'USDT' },
      { symbol: 'ETHUSDT', baseCoin: 'ETH', quoteCoin: 'USDT' }
    ]
  }
}

export async function fetchTicker24hr() {
  const url = 'https://api.mexc.com/api/v3/ticker/24hr'
  try {
    const res = await fetch(url)
    const data = await res.json().catch(() => ([]))
    return Array.isArray(data) ? data : []
  } catch (e) {
    console.error('Fetch Ticker 24hr Error:', e)
    return []
  }
}

export async function fetchAccountInfo(apiKey, secretKey) {
  const timestamp = Date.now()
  const query = `timestamp=${timestamp}`
  const signature = sign(query, secretKey)
  const url = `https://api.mexc.com/api/v3/account?${query}&signature=${signature}`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-MEXC-APIKEY': apiKey
    }
  })
  const data = await res.json().catch(() => ({}))
  if (res.status !== 200) {
    console.error('MEXC API Error:', res.status, JSON.stringify(data))
  }
  return { status: res.status, data }
}
