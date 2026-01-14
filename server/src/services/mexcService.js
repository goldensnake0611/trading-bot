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

export async function fetchKlines(symbol, interval = '1m', limit = 300, startTime = null, endTime = null) {
  // Map 1h to 60m for Spot API if needed
  if (interval === '1h') interval = '60m'
  
  let url = `https://api.mexc.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  if (startTime) url += `&startTime=${startTime}`
  if (endTime) url += `&endTime=${endTime}`
  
  const res = await fetch(url)
  const data = await res.json().catch(() => ([]))
  return data
}

export async function fetchFuturesKlines(symbol, interval = '5m', limit = 300, startTime = null, endTime = null) {
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
  
  // Note: Futures API uses 'start' and 'end' (seconds or ms? usually seconds for unix, but let's check).
  // The debug output showed timestamps like 1736077200 which is Seconds (10 digits).
  // JS Date.now() is MS (13 digits).
  
  if (startTime) url += `&start=${Math.floor(startTime / 1000)}`
  if (endTime) url += `&end=${Math.floor(endTime / 1000)}`
  
  // Futures API doesn't seem to support 'limit' directly in the same way, but it relies on time range.
  // However, we can slice the result if needed.
  
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
    
    // Fallback: If specific range returns nothing, try fetching latest data (no start/end)
    // Only if we asked for a specific range
    if (startTime || endTime) {
        console.log('Fetch Futures Klines: No data for range, fetching latest...')
        const fallbackUrl = `https://contract.mexc.com/api/v1/contract/kline/${futuresSymbol}?interval=${mappedInterval}`
        const res2 = await fetch(fallbackUrl)
        const json2 = await res2.json()
        if (json2.success && json2.data) {
            const { time, open, high, low, close, vol } = json2.data
            if (!time || !Array.isArray(time)) return []
            return time.map((t, i) => [
                t * 1000, open[i], high[i], low[i], close[i], vol[i]
            ])
        }
    }
    
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
