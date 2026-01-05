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
  let url = `https://api.mexc.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  if (startTime) url += `&startTime=${startTime}`
  if (endTime) url += `&endTime=${endTime}`
  
  const res = await fetch(url)
  const data = await res.json().catch(() => ([]))
  return data
}

export async function fetchExchangeInfo() {
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
