export function ema(values, period) {
  if (!values.length || period <= 1) return values.at(-1) || 0
  const k = 2 / (period + 1)
  let emaPrev = values[0]
  for (let i = 1; i < values.length; i++) {
    emaPrev = values[i] * k + emaPrev * (1 - k)
  }
  return emaPrev
}

export function computePnl(entry, vol, exitPrice) {
  if (!entry || !vol) return { pnl: 0, roi: null }
  const diff = exitPrice - entry
  const pnl = diff * vol
  const margin = entry * vol
  const roi = margin ? (pnl / margin) * 100 : null
  return { pnl, roi }
}
