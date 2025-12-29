import { ema, rsi } from '../utils/math.js'

export const name = 'RSI + EMA Pullback'
export const description = 'Buy when Price > 20 EMA and RSI pulls back to 40-50'

export function analyze(klines) {
  if (klines.length < 50) return { action: 'HOLD' }

  const closes = klines.map(k => Number(k[4]))
  const price = closes.at(-1)
  
  const ema20 = ema(closes.slice(-50), 20)
  const currentRsi = rsi(closes.slice(-50), 14)

  // Logic: Uptrend (Price > EMA20) + Pullback (RSI between 40 and 50)
  const isUptrend = price > ema20
  const isPullback = currentRsi >= 40 && currentRsi <= 55 // Expanded slightly for easier triggering

  const shouldBuy = isUptrend && isPullback
  
  return {
    action: shouldBuy ? 'BUY' : 'HOLD',
    indicators: {
      price,
      ema20,
      rsi: currentRsi
    }
  }
}
