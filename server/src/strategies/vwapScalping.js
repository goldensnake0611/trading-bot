import { vwap } from '../utils/math.js'

export const name = 'VWAP Scalping'
export const description = 'Buy when Price bounces off VWAP with volume. Sell when Price is 2% above or 1% below VWAP.'

export function analyze(klines) {
  if (klines.length < 50) return { action: 'HOLD' }

  const currentKline = klines.at(-1)
  const price = Number(currentKline[4])
  const volume = Number(currentKline[5])
  
  // Calculate VWAP over the loaded window (e.g. last 50-100 candles as a proxy for session)
  // In a real session-based VWAP, we'd reset at 00:00 UTC. 
  // Here we use a rolling window VWAP for simplicity.
  const currentVwap = vwap(klines.slice(-100))
  
  // Logic: Price is close to VWAP (e.g. within 0.5%) AND above it
  const dist = (price - currentVwap) / currentVwap
  const nearVwap = dist > 0 && dist < 0.005 
  
  // Volume spike check (simple: volume > 1.5x average of last 20)
  const volumes = klines.slice(-21, -1).map(k => Number(k[5]))
  const avgVol = volumes.reduce((a,b) => a+b, 0) / volumes.length
  const highVolume = volume > (avgVol * 1.5)

  const shouldBuy = nearVwap && highVolume
  // Sell if price is 2% above VWAP (Profit) or Drops 1% below VWAP (Stop)
  const shouldSell = dist > 0.02 || dist < -0.01

  let action = 'HOLD'
  if (shouldBuy) action = 'BUY'
  if (shouldSell) action = 'SELL'
  
  return {
    action,
    indicators: {
      price,
      vwap: currentVwap,
      volume,
      avgVol
    }
  }
}
