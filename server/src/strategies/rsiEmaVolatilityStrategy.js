import { ema, rsi } from '../utils/math.js'

export const name = 'RSI + EMA + Volatility Swing'
export const description = 'Combines RSI+EMA (user interval) trend reversal signals with Volatility Swing (user interval) percentage drops/rises.'
// export const interval = '5m' // Removed so it uses user selected interval for the main loop

export function analyze(klines, botParams) {
  // `klines`: Main timeframe (User selected, e.g. 1h) -> Used for Volatility
  // `botParams.klinesRsi`: RSI timeframe (User selected, e.g. 5m) -> Used for RSI + EMA

  // Ensure we have enough data for volatility
  if (klines.length < 50) return { action: 'HOLD' }

  // 1. RSI + EMA Analysis (Uses User Selected RSI data)
  // ------------------------------------
  const klinesRsi = (botParams && botParams.klinesRsi) ? botParams.klinesRsi : klines // Fallback if missing
  
  if (klinesRsi.length < 60) return { action: 'HOLD' } // Need enough for EMA50

  const closesRsi = klinesRsi.map(k => Number(k[4]))
  const lastRsi = closesRsi.length - 1
  // const priceRsi = closesRsi[lastRsi] // Price should be roughly same, but let's use current price from main klines for trade execution

  const ema9_current = ema(closesRsi, 9)
  const ema9_prev = ema(closesRsi.slice(0, -1), 9)
  const ema50_current = ema(closesRsi, 50)
  const ema50_prev = ema(closesRsi.slice(0, -1), 50)
  const rsi_current = rsi(closesRsi, 14)
  const rsi_prev = rsi(closesRsi.slice(0, -1), 14)

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
    rsi_current < 35
  )

  // RSI+EMA Sell Conditions (Price > EMA9 > EMA50 on 5m chart)
  const rsiEmaSell = (
    gap_EMA9_sell &&
    gap_EMA50_sell &&
    rsi_current > rsi_prev &&
    rsi_current > 70
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

  const volGap = dropPct > threshold || risePct > threshold

  // 3. Combine
  // ----------
  
  if (rsiEmaBuy && volGap) {
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

  if (rsiEmaSell && volGap) {
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
