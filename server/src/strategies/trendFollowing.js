import { ema } from '../utils/math.js'

export const name = 'Trend Following (EMA 9/50)'
export const description = 'Buy when Fast EMA (9) crosses above Slow EMA (50). Sell when Fast EMA (9) crosses below Slow EMA (50). Timeframe: 5m.'
export const interval = '5m'

export function analyze(klines) {
  if (klines.length < 50) return { action: 'HOLD' }

  const closes = klines.map(k => Number(k[4]))
  const price = closes.at(-1)
  
  // Current EMAs
  const ema9 = ema(closes, 9)
  const ema50 = ema(closes, 50)
  
  // Previous EMAs
  const prevCloses = closes.slice(0, -1)
  const prevEma9 = ema(prevCloses, 9)
  const prevEma50 = ema(prevCloses, 50)

  // Buy: Fast crosses ABOVE Slow
  const shouldBuy = prevEma9 <= prevEma50 && ema9 > ema50
  
  // Sell: Fast crosses BELOW Slow
  const shouldSell = prevEma9 >= prevEma50 && ema9 < ema50

  let action = 'HOLD'
  if (shouldBuy) action = 'BUY'
  if (shouldSell) action = 'SELL'
  
  return {
    action,
    indicators: {
      price,
      ema9,
      ema50,
      prevEma9,
      prevEma50
    }
  }
}
