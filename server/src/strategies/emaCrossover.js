import { ema } from '../utils/math.js'

export const name = 'EMA Crossover'
export const description = 'Buy when EMA20 > EMA50 and Price > EMA20'

export function analyze(closes) {
  if (closes.length < 60) return { action: 'HOLD' }

  const price = closes.at(-1)
  const ema20 = ema(closes.slice(-60), 20)
  const ema50 = ema(closes.slice(-60), 50)

  const shouldBuy = ema20 > ema50 && price > ema20
  
  return {
    action: shouldBuy ? 'BUY' : 'HOLD',
    indicators: {
      ema20,
      ema50,
      price
    }
  }
}
