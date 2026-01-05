import { ema, rsi } from '../utils/math.js'

export const name = 'RSI + EMA Trend'
export const description = 'Buy when Price >= EMA50, EMA20 rising, RSI < 30 and turning up, Price near EMA20. Exit on high RSI or trend break.'

export function analyze(klines) {
  // We need enough data for EMA 50 and RSI 14
  if (klines.length < 60) return { action: 'HOLD' }

  // Parse Data
  // kline format: [time, open, high, low, close, volume, ...]
  const closes = klines.map(k => Number(k[4]))
  const opens = klines.map(k => Number(k[1]))
  const highs = klines.map(k => Number(k[2]))
  const lows = klines.map(k => Number(k[3]))
  const volumes = klines.map(k => Number(k[5]))

  // Indices
  const last = closes.length - 1
  const prev = last - 1

  // 1. Indicators
  // We calculate EMA 50 and EMA 20 arrays to check slope/trend
  // Note: Our math.js 'ema' function currently returns a single value (the last one) if we just pass the whole array?
  // Let's check math.js implementation.
  // The 'ema' function in math.js iterates through the array and returns the final EMA value.
  // To get previous EMA values, we need to slice the input differently.
  
  // Calculate EMA 50
  const ema50_current = ema(closes, 50)
  
  // Calculate EMA 20 (Current and Previous for slope)
  const ema20_current = ema(closes, 20)
  const ema20_prev = ema(closes.slice(0, -1), 20) // EMA 20 of previous candle
  
  // Calculate RSI (Current and Previous)
  const rsi_current = rsi(closes, 14)
  const rsi_prev = rsi(closes.slice(0, -1), 14)

  // Current Price and Candle Data
  const price = closes[last]
  const open = opens[last]
  const close = closes[last]
  const prevOpen = opens[prev]
  const prevClose = closes[prev]
  
  // --------------------------
  // BUY RULES
  // --------------------------
  
  // 1. Trend Filter
  // Price >= EMA 50
  const trendCondition1 = price >= ema50_current
  // EMA 20 slope >= 0 (Current >= Previous)
  const trendCondition2 = ema20_current >= ema20_prev
  
  const isTrendOk = trendCondition1 && trendCondition2
  
  // 2. RSI Oversold
  // RSI < 30 (Use previous to ensure we hit the zone, or current if it's still there)
  // Rule: RSI < 30 AND RSI turns upward (higher low)
  // Interpretation: We were oversold (rsi < 30) recently, and now RSI is rising (current > prev)
  // Let's be strict: RSI must be recovering from oversold.
  // Condition: (rsi_prev < 30 OR rsi_current < 30) AND (rsi_current > rsi_prev)
  const isRsiOversold = (rsi_prev < 30 || rsi_current < 30) && (rsi_current > rsi_prev)
  
  // 3. Price Location
  // Price is near or slightly below EMA 20, NOT far below.
  // "Near" = within X% distance. "Slightly below" is ok. "Far below" is bad.
  // Let's define "Near" as within 1.5% of EMA 20.
  // Let's define "Not far below" as Price >= EMA 20 * 0.985
  const dist = Math.abs(price - ema20_current) / ema20_current
  const isNearEma = dist <= 0.02 // 2% buffer? Prompt says "near or slightly below".
  // "Not far below" implies a floor.
  const isNotFarBelow = price >= (ema20_current * 0.98) // Max 2% below
  
  const isPriceLocationOk = isNearEma && isNotFarBelow
  
  // 4. Entry Trigger
  // Bullish candle close OR Bullish engulfing OR Strong volume spike
  const isBullishCandle = close > open
  const isBullishEngulfing = close > open && close > prevOpen && open < prevClose // Simple engulfing check
  
  // Volume Spike: Vol > Avg Vol * 1.5
  // Calculate SMA of Volume (last 20 candles)
  const avgVol = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20
  const isVolumeSpike = volumes[last] > avgVol * 1.5
  
  const isEntryTrigger = isBullishCandle || isBullishEngulfing || isVolumeSpike
  
  const shouldBuy = isTrendOk && isRsiOversold && isPriceLocationOk && isEntryTrigger
  
  // --------------------------
  // SELL RULES
  // --------------------------
  
  // 1. RSI > 60-65
  const sellRsi = rsi_current > 65
  
  // 2. Price stretches far above EMA 20
  const sellStretch = price > (ema20_current * 1.03) // 3% above
  
  // 3. Bearish Engulfing near EMA
  // "Near EMA" logic again
  // Bearish Engulfing: Open > Close, and engulfs previous
  const isBearishEngulfing = open > close && open > prevClose && close < prevOpen
  const sellBearishEngulfing = isBearishEngulfing && isNearEma // Reuse near EMA logic? Or strictly "near". 
  
  const shouldSell = sellRsi || sellStretch || sellBearishEngulfing
  
  // Decision
  let action = 'HOLD'
  if (shouldBuy) action = 'BUY'
  if (shouldSell) action = 'SELL'
  
  // Debug / Trace info (optional, but helpful for UI if we expanded it)
  return {
    action,
    indicators: {
      price,
      ema20: ema20_current,
      ema50: ema50_current,
      rsi: rsi_current,
      trend: isTrendOk,
      location: isPriceLocationOk
    }
  }
}
