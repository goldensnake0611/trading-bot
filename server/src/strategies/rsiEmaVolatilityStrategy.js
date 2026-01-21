import { ema, rsi } from '../utils/math.js'

export const name = 'RSI + EMA + Volatility Swing'
export const description = 'Combines RSI+EMA trend reversal signals with Volatility Swing percentage drops/rises.'

export function analyze(klines, botParams) {
  // We need enough data for EMA 50 and RSI 14, plus volatility lookback (96 candles)
  if (klines.length < 100) return { action: 'HOLD' }

  // 1. RSI + EMA Analysis
  // ---------------------
  const closes = klines.map(k => Number(k[4]))
  const last = closes.length - 1
  const price = closes[last]

  const ema9_current = ema(closes, 9)
  const ema9_prev = ema(closes.slice(0, -1), 9)
  const ema50_current = ema(closes, 50)
  const ema50_prev = ema(closes.slice(0, -1), 50)
  const rsi_current = rsi(closes, 14)
  const rsi_prev = rsi(closes.slice(0, -1), 14)

  const gap_current_buy = ema50_current - ema9_current
  const gap_prev_buy = ema50_prev - ema9_prev
  
  const gap_current_sell = ema9_current - ema50_current
  const gap_prev_sell = ema9_prev - ema50_prev

  // RSI+EMA Buy Conditions (from rsiEmaTrendStrategy)
  // Price < EMA9 < EMA50
  const rsiEmaBuy = (
    price < ema9_current &&
    ema9_current < ema50_current &&
    gap_current_buy > gap_prev_buy &&
    rsi_current < rsi_prev &&
    rsi_current < 40
  )

  // RSI+EMA Sell Conditions
  // Price > EMA9 > EMA50
  const rsiEmaSell = (
    price > ema9_current &&
    ema9_current > ema50_current &&
    gap_current_sell > gap_prev_sell &&
    rsi_current > rsi_prev &&
    rsi_current > 65
  )

  // 2. Volatility Swing Analysis
  // ----------------------------
  // Default threshold 5% (0.05) if not provided
  const threshold = (botParams && botParams.volatilityThreshold) ? Number(botParams.volatilityThreshold) : 0.05

  // Lookback 96 candles (4 days of 1h)
  const lookback = 96
  const relevantKlines = klines.slice(-lookback)
  const prices = relevantKlines.map(k => Number(k[4]))
  
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  
  const risePct = price > 0 ? ((price - minPrice) / price) : 0
  const dropPct = price > 0 ? ((maxPrice - price) / price) : 0
  
  const volBuy = dropPct > threshold
  const volSell = risePct > threshold

  // 3. Combine
  // ----------
  
  if (rsiEmaBuy && volBuy) {
     return { 
      action: 'BUY', 
      price,
      indicators: {
        rsi: rsi_current,
        ema9: ema9_current,
        ema50: ema50_current,
        dropPct,
        threshold
      }
    }
  }

  if (rsiEmaSell && volSell) {
    return { 
      action: 'SELL', 
      price,
      indicators: {
        rsi: rsi_current,
        ema9: ema9_current,
        ema50: ema50_current,
        risePct,
        threshold
      }
    }
  }

  return { action: 'HOLD' }
}
