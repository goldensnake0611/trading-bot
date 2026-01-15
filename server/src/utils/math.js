export function ema(values, period) {
  if (!values.length || period <= 1) return values.at(-1) || 0

  const nums = values.map(Number)

  if (nums.length <= period) {
    const sum = nums.reduce((a, b) => a + b, 0)
    return sum / nums.length
  }

  const k = 2 / (period + 1)

  let sum = 0
  for (let i = 0; i < period; i++) {
    sum += nums[i]
  }
  let emaPrev = sum / period

  for (let i = period; i < nums.length; i++) {
    emaPrev = nums[i] * k + emaPrev * (1 - k)
  }

  return emaPrev
}

export function rsi(values, period = 14) {
  if (values.length < period + 1) return 0
  
  let gains = 0
  let losses = 0
  
  // Calculate initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1]
    if (diff >= 0) gains += diff
    else losses += Math.abs(diff)
  }
  
  let avgGain = gains / period
  let avgLoss = losses / period
  
  // Smooth subsequent values
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1]
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period
      avgLoss = (avgLoss * (period - 1)) / period
    } else {
      avgGain = (avgGain * (period - 1)) / period
      avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period
    }
  }
  
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - (100 / (1 + rs))
}

export function vwap(klines) {
  // kline format: [time, open, high, low, close, volume, ...]
  // We need typical price * volume / total volume
  // This is usually calculated over a session (e.g., daily). 
  // For a rolling VWAP, we sum up the provided klines.
  
  let cumulativeTPV = 0
  let cumulativeVol = 0
  
  for (const k of klines) {
    const high = Number(k[2])
    const low = Number(k[3])
    const close = Number(k[4])
    const vol = Number(k[5])
    
    const typicalPrice = (high + low + close) / 3
    cumulativeTPV += typicalPrice * vol
    cumulativeVol += vol
  }
  
  return cumulativeVol ? cumulativeTPV / cumulativeVol : 0
}

export function computePnl(entry, vol, exitPrice) {
  if (!entry || !vol) return { pnl: 0, roi: null }
  const diff = exitPrice - entry
  const pnl = diff * vol
  const margin = entry * vol
  const roi = margin ? (pnl / margin) * 100 : null
  return { pnl, roi }
}
