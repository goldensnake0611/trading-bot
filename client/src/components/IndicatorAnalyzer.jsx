import { useState, useEffect, useMemo } from 'react'
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Brush, ReferenceLine } from 'recharts'
import SymbolSearch from './SymbolSearch'

// Helper to calculate RSI Array
function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return closes.map(() => null)
  
  const rsiArray = []
  let gains = 0
  let losses = 0
  
  // Calculate initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff >= 0) gains += diff
    else losses += Math.abs(diff)
  }
  
  let avgGain = gains / period
  let avgLoss = losses / period
  
  // First RSI
  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss
  let firstRsi = 100 - (100 / (1 + rs))
  
  // Fill nulls for initial period
  for(let i=0; i<period; i++) rsiArray.push(null)
  rsiArray.push(firstRsi)
  
  // Subsequent
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period
      avgLoss = (avgLoss * (period - 1)) / period
    } else {
      avgGain = (avgGain * (period - 1)) / period
      avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period
    }
    
    if (avgLoss === 0) {
      rsiArray.push(100)
    } else {
      const rs = avgGain / avgLoss
      rsiArray.push(100 - (100 / (1 + rs)))
    }
  }
  
  return rsiArray
}

export default function IndicatorAnalyzer() {
  const [symbol, setSymbol] = useState(localStorage.getItem('analyzer_symbol') || 'BTCUSDT')
  const [timeframe, setTimeframe] = useState(localStorage.getItem('analyzer_timeframe') || '1d')
  const [period, setPeriod] = useState(Number(localStorage.getItem('analyzer_period')) || 14)
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)

  // Persist settings
  useEffect(() => {
    localStorage.setItem('analyzer_symbol', symbol)
    localStorage.setItem('analyzer_timeframe', timeframe)
    localStorage.setItem('analyzer_period', period)
  }, [symbol, timeframe, period])

  const timeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M']
  
  const formatXAxis = (val) => {
    const d = new Date(val)
    if (!timeframe) return d.toLocaleTimeString()
    // For daily/weekly/monthly, show Date. For intraday, show Time.
    return timeframe.includes('d') || timeframe.includes('w') || timeframe.includes('M') 
      ? d.toLocaleDateString() 
      : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  useEffect(() => {
    if (!symbol) return
    
    const fetchData = (isRefresh = false) => {
      if (!isRefresh) setLoading(true)
      
      // Always fetch data from 1 year ago
      const oneYearAgo = Date.now() - 31536000000
      let url = `/api/klines?symbol=${symbol}&interval=${timeframe}&startTime=${oneYearAgo}&limit=10000`
      
      fetch(url)
        .then(res => res.json())
        .then(klines => {
          if (Array.isArray(klines)) {
            // MEXC Kline: [time, open, high, low, close, vol, ...]
            const closes = klines.map(k => Number(k[4]))
            const rsiValues = calculateRSI(closes, Number(period))
            
            const chartData = klines.map((k, i) => ({
              time: k[0], // Store raw timestamp (number)
              open: Number(k[1]),
              high: Number(k[2]),
              low: Number(k[3]),
              close: Number(k[4]),
              price: Number(k[4]), // Keep for legacy/tooltip if needed
              rsi: rsiValues[i] !== null ? Number(rsiValues[i].toFixed(2)) : null
            }))
            
            setData(chartData)
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false))
    }

    fetchData()
    const intervalId = window.setInterval(() => fetchData(true), 60000) // Refresh every 1m

    return () => clearInterval(intervalId)
  }, [symbol, timeframe, period])

  return (
    <div style={{ padding: '20px', color: '#fff' }}>
      <div style={{ 
        display: 'flex', 
        gap: '20px', 
        marginBottom: '20px', 
        background: '#1e2030', 
        padding: '20px', 
        borderRadius: '8px',
        alignItems: 'end',
        flexWrap: 'wrap'
      }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: '#888' }}>Symbol</label>
          <SymbolSearch value={symbol} onChange={setSymbol} />
        </div>
        
        <div>
          <label style={{ display: 'block', marginBottom: '8px', color: '#888' }}>Interval</label>
          <select 
            value={timeframe}
            onChange={e => setTimeframe(e.target.value)}
            style={{ 
              padding: '10px', 
              borderRadius: '4px', 
              background: '#2a2d3d', 
              color: 'white', 
              border: '1px solid #444',
              minWidth: '100px'
            }}
          >
            {timeframes.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', color: '#888' }}>RSI Period</label>
          <input 
            type="number" 
            value={period} 
            onChange={e => setPeriod(e.target.value)}
            min="2"
            style={{ 
              padding: '10px', 
              borderRadius: '4px', 
              background: '#2a2d3d', 
              color: 'white', 
              border: '1px solid #444',
              width: '80px'
            }}
          />
        </div>
      </div>

      <div style={{ height: '600px', background: '#1e2030', padding: '20px', borderRadius: '8px' }}>
        {loading ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            Loading Data...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis 
                dataKey="time" 
                tick={{ fill: '#888', fontSize: 12 }} 
                tickFormatter={formatXAxis}
                minTickGap={50}
              />
              <YAxis yAxisId="rsi" domain={[0, 100]} tick={{ fill: '#888' }} label={{ value: 'RSI', angle: -90, position: 'insideLeft', fill: '#888' }} />
              <YAxis yAxisId="price" orientation="right" domain={['auto', 'auto']} tick={{ fill: '#888' }} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e2030', border: '1px solid #444' }}
                itemStyle={{ color: '#fff' }}
                labelStyle={{ color: '#888' }}
                labelFormatter={(label) => new Date(label).toLocaleString()}
              />
              <Legend />
              <ReferenceLine y={70} yAxisId="rsi" stroke="#ff4d4d" strokeDasharray="3 3" label="Overbought (70)" />
              <ReferenceLine y={30} yAxisId="rsi" stroke="#4caf50" strokeDasharray="3 3" label="Oversold (30)" />
              
              <Line 
                yAxisId="rsi"
                type="monotone" 
                dataKey="rsi" 
                stroke="#8884d8" 
                strokeWidth={2}
                dot={false} 
                name={`RSI (${period})`}
                connectNulls
              />
              
              <Line 
                yAxisId="price"
                type="monotone" 
                dataKey="price" 
                stroke="#82ca9d" 
                strokeWidth={2}
                dot={false} 
                name="Price"
                connectNulls
              />
              
              <Brush 
                dataKey="time" 
                height={30} 
                stroke="#8884d8" 
                fill="#1e2030" 
                tickFormatter={(val) => new Date(val).toLocaleDateString()} 
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
