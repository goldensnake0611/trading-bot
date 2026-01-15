
export const name = 'Volatility Swing Strategy'
export const description = 'Buy when price drops more than threshold from 4-day high. Sell when price rises more than threshold from 4-day low.'
export const interval = '1h'

export function analyze(klines, botParams) {
  // botParams can be the bot object or params object
  // Default threshold is 40% (0.4)
  const threshold = (botParams && botParams.volatilityThreshold) ? Number(botParams.volatilityThreshold) : 0.4
  
  // Need 4 days of 1h data = 96 candles
  // We use 100 to be safe
  if (klines.length < 96) return { action: 'HOLD' }
  
  // const relevantKlines = klines.slice(-96)
  const relevantKlines = klines
  
  const prices = relevantKlines.map(k => Number(k[4]))
  const currentPrice = prices.at(-1)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  
  // Signal Generation (percent values)
  const risePct = currentPrice > 0 ? ((currentPrice - minPrice) / currentPrice) : 0
  const dropPct = currentPrice > 0 ? ((maxPrice - currentPrice) / currentPrice) : 0
  const thresholdPct = threshold
  
  let action = 'HOLD'
  
  // Check SELL first or BUY first.
  if (risePct > thresholdPct) {
    action = 'SELL'
  } else if (dropPct > thresholdPct) {
    action = 'BUY'
  }
  
  return {
    action,
    indicators: {
      currentPrice,
      minPrice,
      maxPrice,
      thresholdPct
      ,
      risePct,
      dropPct
    }
  }
}
