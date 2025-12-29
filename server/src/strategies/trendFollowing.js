import { ema } from '../utils/math.js'

export const name = 'Trend Following'
export const description = 'Buy when Price > 200 EMA and 50 EMA > 200 EMA. Sell when Price < 200 EMA or 50 EMA < 200 EMA.'

export function analyze(klines) {
  if (klines.length < 200) return { action: 'HOLD' }

  const closes = klines.map(k => Number(k[4]))
  const price = closes.at(-1)
  
  const ema50 = ema(closes.slice(-200), 50)
  const ema200 = ema(closes.slice(-200), 200)

  // We need to check if 50 crossed above 200 recently or is just above it.
  // "Strict" crossover check usually requires looking at previous candle.
  // For simplicity in this loop-based bot, we check if conditions are met now.
  // Ideally: 50 > 200 AND Price > 200.
  
  const shouldBuy = price > ema200 && ema50 > ema200
  const shouldSell = price < ema200 || ema50 < ema200 // Trend Broken

  let action = 'HOLD'
  if (shouldBuy) action = 'BUY'
  if (shouldSell) action = 'SELL'
  
  return {
    action,
    indicators: {
      price,
      ema50,
      ema200
    }
  }
}
