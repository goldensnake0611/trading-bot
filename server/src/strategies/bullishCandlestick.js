import { ema, rsi } from '../utils/math.js'

export const name = 'Bullish Candlestick'
export const description =
  'BUY (downtrend near support): bearish candle → bullish engulfing (body ≥ 1.2x) → next candle closes above engulfing high; requires RSI < 40 OR volume spike OR strong bullish body.'

function avg(values) {
  if (!values.length) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function min(values) {
  if (!values.length) return Infinity
  return values.reduce((m, v) => (v < m ? v : m), Infinity)
}

export function analyze(klines, params = {}) {
  if (!Array.isArray(klines) || klines.length < 80) return { action: 'HOLD' }

  const supportLookback = Number(params.supportLookback ?? 20)
  const supportProximityPct = Number(params.supportProximityPct ?? 0.012)
  const bodyMultiplierMin = Number(params.bodyMultiplierMin ?? 1.2)
  const rsiMax = Number(params.rsiMax ?? 40)
  const volumeSpikeMultiplier = Number(params.volumeSpikeMultiplier ?? 1.5)
  const strongBodyMultiplier = Number(params.strongBodyMultiplier ?? 1.8)

  const opens = klines.map(k => Number(k[1]))
  const highs = klines.map(k => Number(k[2]))
  const lows = klines.map(k => Number(k[3]))
  const closes = klines.map(k => Number(k[4]))
  const volumes = klines.map(k => Number(k[5]))

  const aIdx = klines.length - 3
  const bIdx = klines.length - 2
  const cIdx = klines.length - 1

  const openA = opens[aIdx]
  const closeA = closes[aIdx]
  const openB = opens[bIdx]
  const closeB = closes[bIdx]
  const highB = highs[bIdx]
  const lowB = lows[bIdx]
  const closeC = closes[cIdx]

  const bodyA = Math.abs(closeA - openA)
  const bodyB = Math.abs(closeB - openB)
  const rangeB = Math.max(1e-12, highs[bIdx] - lows[bIdx])
  const bodyToRangeB = bodyB / rangeB

  const ema50 = ema(closes, 50)
  const ema50Prev = ema(closes.slice(0, -1), 50)
  const rsi14 = rsi(closes, 14)

  const recentWindow = lows.slice(-20)
  const recentMinLow = min(recentWindow)
  const priorWindow = lows.slice(-40, -20)
  const priorMinLow = min(priorWindow)
  const lowerLows = isFinite(priorMinLow) ? recentMinLow < priorMinLow : false

  const downtrend = closes.at(-1) < ema50 || (lowerLows && ema50 <= ema50Prev)

  const supportWindow = lows.slice(-(supportLookback + 3), -3)
  const supportLow = min(supportWindow)
  const nearSupport = isFinite(supportLow)
    ? lowB <= supportLow * (1 + supportProximityPct) || closeB <= supportLow * (1 + supportProximityPct)
    : false

  const prevBearish = closeA < openA
  const engulfBullish = closeB > openB
  const engulfsPrevBody = openB <= closeA && closeB >= openA
  const bodyMultiplier = bodyA > 0 ? bodyB / bodyA : 0
  const bigEnoughBody = bodyMultiplier >= bodyMultiplierMin

  const confirmation = closeC > highB

  const bodyLookback = closes
    .slice(-(Math.max(30, supportLookback) + 3), -3)
    .map((c, i, arr) => {
      const idx = klines.length - 3 - (arr.length - 1 - i)
      return Math.abs(closes[idx] - opens[idx])
    })
    .filter(v => isFinite(v) && v > 0)

  const avgBody = avg(bodyLookback)
  const strongBullBody = (avgBody > 0 && bodyB >= strongBodyMultiplier * avgBody) || bodyToRangeB >= 0.6

  const volumeLookback = volumes.slice(-(Math.max(30, supportLookback) + 3), -3).filter(v => isFinite(v) && v > 0)
  const avgVol = avg(volumeLookback)
  const volB = volumes[bIdx]
  const volumeSpike = avgVol > 0 ? volB >= volumeSpikeMultiplier * avgVol : false

  const filtersPass = rsi14 < rsiMax || volumeSpike || strongBullBody

  const patternPass = prevBearish && engulfBullish && engulfsPrevBody && bigEnoughBody

  if (downtrend && nearSupport && patternPass && confirmation && filtersPass) {
    return {
      action: 'BUY',
      indicators: {
        ema50,
        rsi: rsi14,
        supportLow,
        engulfHigh: highB,
        bodyMultiplier,
        volumeSpike: volumeSpike ? 1 : 0,
        strongBody: strongBullBody ? 1 : 0
      }
    }
  }

  return {
    action: 'HOLD',
    indicators: {
      ema50,
      rsi: rsi14
    }
  }
}
