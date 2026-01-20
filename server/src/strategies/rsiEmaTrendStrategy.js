import { ema, rsi } from '../utils/math.js'

export const name = 'RSI + EMA Trend'
export const description = 'Buy: Price < EMA9 < EMA50, Gap decreasing, RSI < 40. Sell: Price > EMA9 > EMA50, Gap decreasing, RSI > 65.'

export function analyze(klines) {
  // We need enough data for EMA 50 and RSI 14
  if (klines.length < 60) return { action: 'HOLD' }

  // Parse Data
  // kline format: [time, open, high, low, close, volume, ...]
  const closes = klines.map(k => Number(k[4]))
  
  // Indices
  const last = closes.length - 1
  
  // Current Price
  const price = closes[last]

  // 1. Indicators
  
  // EMA 9 (Current and Previous)
  const ema9_current = ema(closes, 9)
  const ema9_prev = ema(closes.slice(0, -1), 9)

  // EMA 50 (Current and Previous)
  const ema50_current = ema(closes, 50)
  const ema50_prev = ema(closes.slice(0, -1), 50)

  // RSI 14 (Current and Previous)
  const rsi_current = rsi(closes, 14)
  const rsi_prev = rsi(closes.slice(0, -1), 14)

  // --------------------------
  // BUY RULES
  // --------------------------
  // 1. Price is below EMA 9
  const buyCond1 = price < ema9_current
  
  // 2. EMA 9 is below EMA 50
  const buyCond2 = ema9_current < ema50_current
  
  // 3. The gap between EMA 9 and EMA 50 is decreasing
  // Gap = EMA 50 - EMA 9 (since EMA 9 < EMA 50)
  const gap_current_buy = ema50_current - ema9_current
  const gap_prev_buy = ema50_prev - ema9_prev
  const buyCond3 = gap_current_buy < gap_prev_buy
  
  // 4. RSI, EMA 9, and EMA 50 are all decreasing
  const buyCond4 = rsi_current < rsi_prev && ema9_current < ema9_prev && ema50_current < ema50_prev
  
  // 5. RSI < 40
  const buyCond5 = rsi_current < 40
  
  if (buyCond1 && buyCond2 && buyCond3 && buyCond4 && buyCond5) {
    return { 
      action: 'BUY', 
      price,
      indicators: {
        rsi: rsi_current,
        ema9: ema9_current,
        ema50: ema50_current
      }
    }
  }

  // --------------------------
  // SELL RULES
  // --------------------------
  // 1. Price is above EMA 9
  const sellCond1 = price > ema9_current
  
  // 2. EMA 9 is above EMA 50
  const sellCond2 = ema9_current > ema50_current
  
  // 3. The gap between EMA 9 and EMA 50 is decreasing
  // Gap = EMA 9 - EMA 50 (since EMA 9 > EMA 50)
  const gap_current_sell = ema9_current - ema50_current
  const gap_prev_sell = ema9_prev - ema50_prev
  const sellCond3 = gap_current_sell < gap_prev_sell
  
  // 4. RSI, EMA 9, and EMA 50 are all rising
  const sellCond4 = rsi_current > rsi_prev && ema9_current > ema9_prev && ema50_current > ema50_prev
  
  // 5. RSI > 65
  const sellCond5 = rsi_current > 65

  if (sellCond1 && sellCond2 && sellCond3 && sellCond4 && sellCond5) {
    return { 
      action: 'SELL', 
      price,
      indicators: {
        rsi: rsi_current,
        ema9: ema9_current,
        ema50: ema50_current
      }
    }
  }

  return { action: 'HOLD' }
}
