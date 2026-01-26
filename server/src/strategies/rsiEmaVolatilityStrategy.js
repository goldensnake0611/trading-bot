import { ema, rsi } from '../utils/math.js'

export const name = 'RSI + EMA + Volatility Swing'
export const description = 'Combines RSI+EMA (always 5m) trend reversal signals with Volatility Swing (user interval) percentage drops/rises.'
// export const interval = '5m' // Removed so it uses user selected interval for the main loop

export function analyze(klines, botParams) {
  // `klines`: Main timeframe (User selected, e.g. 1h) -> Used for Volatility
  // `botParams.klines5m`: 5m timeframe -> Used for RSI + EMA

  // Ensure we have enough data for volatility
  if (klines.length < 50) return { action: 'HOLD' }

  // 1. RSI + EMA Analysis (Uses 5m data)
  // ------------------------------------
  const klines5m = (botParams && botParams.klines5m) ? botParams.klines5m : klines // Fallback if missing
  
  if (klines5m.length < 60) return { action: 'HOLD' } // Need enough for EMA50

  const closes5m = klines5m.map(k => Number(k[4]))
  const last5m = closes5m.length - 1
  // const price5m = closes5m[last5m] // Price should be roughly same, but let's use current price from main klines for trade execution

  const ema9_current = ema(closes5m, 9)
  const ema9_prev = ema(closes5m.slice(0, -1), 9)
  const ema50_current = ema(closes5m, 50)
  const ema50_prev = ema(closes5m.slice(0, -1), 50)
  const rsi_current = rsi(closes5m, 14)
  const rsi_prev = rsi(closes5m.slice(0, -1), 14)

  const gap_EMA9_buy = ema9_current - ema9_prev < 0 // EMA9 is below previous EMA9
  const gap_EMA50_buy = ema50_current - ema50_prev < 0 // EMA50 is below previous EMA50
  
  const gap_EMA9_sell = ema9_current - ema9_prev > 0 // EMA9 is above previous EMA9
  const gap_EMA50_sell = ema50_current - ema50_prev > 0 // EMA50 is above previous EMA50

  // Use the LATEST price from the main feed for execution checks
  const currentPrice = Number(klines.at(-1)[4])

  // RSI+EMA Buy Conditions (Price < EMA9 < EMA50 on 5m chart)
  const rsiEmaBuy = (
    gap_EMA9_buy &&
    gap_EMA50_buy &&
    rsi_current < rsi_prev &&
    rsi_current < 40
  )

  // RSI+EMA Sell Conditions (Price > EMA9 > EMA50 on 5m chart)
  const rsiEmaSell = (
    gap_EMA9_sell &&
    gap_EMA50_sell &&
    rsi_current > rsi_prev &&
    rsi_current > 65
  )

  // 2. Volatility Swing Analysis (Uses User Selected Interval)
  // --------------------------------------------------------
  // Default threshold 5% (0.05) if not provided
  const threshold = (botParams && botParams.volatilityThreshold) ? Number(botParams.volatilityThreshold) : 0.05

  // Lookback 96 candles (e.g. 4 days if 1h)
  const lookback = 96
  const relevantKlines = klines.slice(-lookback)
  const prices = relevantKlines.map(k => Number(k[4]))
  
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  
  const risePct = currentPrice > 0 ? ((currentPrice - minPrice) / currentPrice) : 0
  const dropPct = currentPrice > 0 ? ((maxPrice - currentPrice) / currentPrice) : 0
  
  const volBuy = dropPct > threshold
  const volSell = risePct > threshold

  // 3. Combine
  // ----------
  
  if (rsiEmaBuy && volBuy) {
     return { 
      action: 'BUY', 
      price: currentPrice,
      indicators: {
        rsi: rsi_current,
        ema9: ema9_current,
        ema50: ema50_current,
        dropPct,
        threshold,
        volatilityInterval: botParams.interval || 'unknown'
      }
    }
  }

  if (rsiEmaSell && volSell) {
    return { 
      action: 'SELL', 
      price: currentPrice,
      indicators: {
        rsi: rsi_current,
        ema9: ema9_current,
        ema50: ema50_current,
        risePct,
        threshold,
        volatilityInterval: botParams.interval || 'unknown'
      }
    }
  }

  return { action: 'HOLD' }
}
