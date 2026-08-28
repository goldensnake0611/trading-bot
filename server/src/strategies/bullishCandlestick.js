// Strategy depends on two math helpers
//   ema(arr, period) → number  (Exponential Moving Average)
//   rsi(arr, period) → number  (Relative Strength Index, 0–100)
import { ema, rsi } from '../utils/math.js'

// Display name shown in the UI / strategy picker
export const name = 'Bullish Candlestick'
// Human-readable description of the 3-candle reversal pattern this strategy looks for
export const description =
  'BUY (downtrend near support): bearish candle → bullish engulfing (body ≥ 1.2x) → next candle closes above engulfing high; requires RSI < 40 OR volume spike OR strong bullish body.'

// --- Small helpers used only inside this module ---

// Arithmetic mean of a numeric array, returns 0 on empty input
function avg(values) {
  if (!values.length) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

// Minimum of a numeric array, returns Infinity on empty input so comparison logic still works
function min(values) {
  if (!values.length) return Infinity
  return values.reduce((m, v) => (v < m ? v : m), Infinity)
}

/**
 * Main entry point — analyzes an array of klines and returns a trade signal.
 *
 * @param {Array} klines  MEXC-style kline array. Each row is:
 *                        [ openTime, open, high, low, close, volume, ...rest ]
 * @param {Object} params Optional user overrides for strategy parameters.
 * @returns {{ action: 'BUY' | 'HOLD', indicators: object }}
 */
export function analyze(klines, params = {}) {
  // Guard clause — without enough history we can't compute indicators / patterns reliably
  if (!Array.isArray(klines) || klines.length < 80) return { action: 'HOLD' }

  // ---------- Tunable parameters (with defaults) ----------

  // How many candles before the 3-candle pattern to look back when computing the support zone
  const supportLookback = Number(params.supportLookback ?? 20)
  // Price is considered "near support" if it is within this percent above the support low (1.2%)
  const supportProximityPct = Number(params.supportProximityPct ?? 0.012)
  // Minimum ratio of engulfing-candle body vs previous candle body to qualify as "engulfing"
  const bodyMultiplierMin = Number(params.bodyMultiplierMin ?? 1.2)
  // RSI ceiling — RSI below this value counts as "oversold filter passed"
  const rsiMax = Number(params.rsiMax ?? 40)
  // Volume must be this many times the average volume to count as a "spike"
  const volumeSpikeMultiplier = Number(params.volumeSpikeMultiplier ?? 1.5)
  // Candle body must be this many times the average body (or 60% of full range) to be "strong"
  const strongBodyMultiplier = Number(params.strongBodyMultiplier ?? 1.8)

  // ---------- Flatten kline columns into parallel arrays ----------
  // Index N in each array corresponds to the same kline row N in `klines`.
  const opens = klines.map(k => Number(k[1]))   // Open price per candle
  const highs = klines.map(k => Number(k[2]))   // High price per candle
  const lows = klines.map(k => Number(k[3]))    // Low price per candle
  const closes = klines.map(k => Number(k[4]))  // Close price per candle
  const volumes = klines.map(k => Number(k[5])) // Trading volume per candle (base asset units)

  // ---------- 3-candle pattern window ----------
  // We look at the last 3 completed candles: A → B → C
  //   A = bearish precursor
  //   B = potential bullish engulfing candle
  //   C = confirmation candle
  const aIdx = klines.length - 3  // index of candle A (two candles ago, last closed fully)
  const bIdx = klines.length - 2  // index of candle B (one candle ago, potential engulfing)
  const cIdx = klines.length - 1  // index of candle C (most recent, confirms break above engulf high)

  // Extract individual OHLC values for the 3 pattern candles
  const openA = opens[aIdx]     // Open of candle A
  const closeA = closes[aIdx]   // Close of candle A
  const openB = opens[bIdx]     // Open of candle B (engulfing candidate)
  const closeB = closes[bIdx]   // Close of candle B (engulfing candidate)
  const highB = highs[bIdx]     // High of candle B (breakout level for confirmation)
  const lowB = lows[bIdx]       // Low of candle B (used for support proximity check)
  const closeC = closes[cIdx]   // Close of candle C (confirmation close)

  // ---------- Body & range metrics ----------
  const bodyA = Math.abs(closeA - openA)                      // Absolute body size of candle A
  const bodyB = Math.abs(closeB - openB)                      // Absolute body size of candle B
  const rangeB = Math.max(1e-12, highs[bIdx] - lows[bIdx])    // Total high-to-low range of candle B (min 1e-12 to avoid div/0)
  const bodyToRangeB = bodyB / rangeB                         // How much of candle B's range is the body (0–1, higher = less wick)

  // ---------- Trend & momentum indicators ----------
  const ema50 = ema(closes, 50)                               // 50-period EMA on close prices (current)
  const ema50Prev = ema(closes.slice(0, -1), 50)              // 50-period EMA on closes without the last candle (previous bar's EMA)
  const rsi14 = rsi(closes, 14)                               // 14-period RSI on close prices

  // ---------- Downtrend detection ----------
  // Compare recent lows vs older lows to detect "lower lows"
  const recentWindow = lows.slice(-20)                        // Last 20 candle lows
  const recentMinLow = min(recentWindow)                      // Lowest low in the recent 20 candles
  const priorWindow = lows.slice(-40, -20)                    // The 20 candles *before* the recent window
  const priorMinLow = min(priorWindow)                        // Lowest low in that prior window
  const lowerLows = isFinite(priorMinLow) ? recentMinLow < priorMinLow : false  // True if recent lows are dropping

  // Downtrend = price is below 50-EMA  OR  (lower lows forming AND EMA is flat/rolling over)
  const downtrend = closes.at(-1) < ema50 || (lowerLows && ema50 <= ema50Prev)

  // ---------- Support zone & proximity ----------
  // Support window: the `supportLookback` candles immediately BEFORE the 3-candle pattern
  const supportWindow = lows.slice(-(supportLookback + 3), -3)
  const supportLow = min(supportWindow)                       // Lowest low in the support window = "support level"
  // Near support if candle B's low OR close is within `supportProximityPct` above the support low
  const nearSupport = isFinite(supportLow)
    ? lowB <= supportLow * (1 + supportProximityPct) || closeB <= supportLow * (1 + supportProximityPct)
    : false

  // ---------- Bullish engulfing pattern checks (candles A & B) ----------
  const prevBearish = closeA < openA                                               // Candle A closed red (bearish)
  const engulfBullish = closeB > openB                                             // Candle B closed green (bullish)
  const engulfsPrevBody = openB <= closeA && closeB >= openA                       // Candle B's body fully engulfs candle A's body (open/close bracket)
  const bodyMultiplier = bodyA > 0 ? bodyB / bodyA : 0                             // Ratio: B body size / A body size
  const bigEnoughBody = bodyMultiplier >= bodyMultiplierMin                        // Engulfing body is at least 1.2× the prior candle's body

  // ---------- Confirmation (candle C) ----------
  // Candle C closes ABOVE the high of the engulfing candle B — validates bullish follow-through
  const confirmation = closeC > highB

  // ---------- Strong-body filter baseline ----------
  // Build a lookback of body sizes for ~30+ candles (before the 3-candle pattern)
  // so we can compare candle B's body against "normal" body size.
  const bodyLookback = closes
    .slice(-(Math.max(30, supportLookback) + 3), -3)   // take last N closes, excluding the 3 pattern candles
    .map((c, i, arr) => {
      const idx = klines.length - 3 - (arr.length - 1 - i)  // re-index to the actual klines position
      return Math.abs(closes[idx] - opens[idx])             // compute absolute body size for that candle
    })
    .filter(v => isFinite(v) && v > 0)                      // drop invalid / zero-body candles

  const avgBody = avg(bodyLookback)   // Average body size in the lookback window
  // Candle B has a "strong bullish body" if:
  //   body >= 1.8× average body, OR body covers ≥60% of the candle's full range (little/no wicks)
  const strongBullBody = (avgBody > 0 && bodyB >= strongBodyMultiplier * avgBody) || bodyToRangeB >= 0.6

  // ---------- Volume spike filter ----------
  // Volume history same length as body lookback, excluding the 3 pattern candles
  const volumeLookback = volumes.slice(-(Math.max(30, supportLookback) + 3), -3).filter(v => isFinite(v) && v > 0)
  const avgVol = avg(volumeLookback)    // Average volume in lookback
  const volB = volumes[bIdx]            // Volume of the engulfing candle B
  // Volume spike = candle B's volume is ≥ 1.5× the average historical volume
  const volumeSpike = avgVol > 0 ? volB >= volumeSpikeMultiplier * avgVol : false

  // ---------- Combined filter gate ----------
  // At least ONE of these must be true to confirm the pattern has conviction:
  //   - RSI is oversold (< 40), OR
  //   - Engulfing candle has a volume spike, OR
  //   - Engulfing candle has an unusually strong bullish body
  const filtersPass = rsi14 < rsiMax || volumeSpike || strongBullBody

  // ---------- Pattern gate ----------
  // All four engulfing sub-conditions must be true:
  //   A is bearish  +  B is bullish  +  B engulfs A  +  B is big enough
  const patternPass = prevBearish && engulfBullish && engulfsPrevBody && bigEnoughBody

  // ---------- Final signal ----------
  // BUY only if EVERYTHING lines up:
  //   downtrend  +  near support  +  engulfing pattern  +  confirmation close  +  filter(s) passed
  if (downtrend && nearSupport && patternPass && confirmation && filtersPass) {
    return {
      action: 'BUY',
      // Returned indicators are surfaced in the UI / logs so the user can see "why" the signal fired
      indicators: {
        ema50,                  // 50-EMA at time of signal (trend reference)
        rsi: rsi14,             // 14-RSI (confirm oversold condition)
        supportLow,             // Calculated support level the pattern bounced off
        engulfHigh: highB,      // High of engulfing candle (breakout level the confirmation candle closed above)
        bodyMultiplier,         // Actual engulfing-body multiplier (vs 1.2 threshold)
        volumeSpike: volumeSpike ? 1 : 0,   // 1 if volume-spike filter contributed
        strongBody: strongBullBody ? 1 : 0  // 1 if strong-body filter contributed
      }
    }
  }

  // Default signal: no conditions fully met → hold cash / current position
  return {
    action: 'HOLD',
    indicators: {
      ema50,        // Still return these two so the dashboard can plot a "no signal" state
      rsi: rsi14
    }
  }
}
