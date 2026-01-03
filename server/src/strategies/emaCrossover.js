import { ema } from '../utils/math.js'

export const name = 'EMA Crossover'
export const description = 'Buy when EMA10 > EMA20 and Price > EMA10. Sell when EMA10 < EMA20 or Price < EMA20.'

export function analyze(closes) {
  if (closes.length < 30) return { action: 'HOLD' }

  const price = closes.at(-1)
  const ema10 = ema(closes.slice(-60), 10)
  const ema20 = ema(closes.slice(-60), 20)

  const shouldBuy = ema10 > ema20 && price > ema10
  const shouldSell = ema10 < ema20 || price < ema20

  let action = 'HOLD'
  if (shouldBuy) action = 'BUY'
  if (shouldSell) action = 'SELL'
  
  return {
    action,
    indicators: {
      ema10,
      ema20,
      price
    }
  }
}
