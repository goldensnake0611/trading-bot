export const name = 'DCA'
export const description = 'Dollar Cost Averaging - Buy periodically regardless of price'

// DCA is time-based, not price-action based.
// The bot engine loop runs every 10s (or 1m).
// We can just trigger a BUY every time this runs if the interval matches.
// However, the bot engine is designed to check "conditions".
// For DCA, the condition is always TRUE if we want to buy immediately on start/interval.
// To prevent spamming, we rely on the fact that the bot places ONE position and holds it.
// BUT, DCA usually means buying *multiple* times.
// Current bot architecture supports ONE active position per bot ID.
// To support true DCA (accumulating), we would need to change the engine to NOT stop after one buy.
// FOR NOW: We will implement it as "Buy Immediately" effectively.

export function analyze(klines) {
  const price = Number(klines.at(-1)[4])
  
  return {
    action: 'BUY', // Always buy
    indicators: {
      price,
      note: 'DCA Mode'
    }
  }
}
