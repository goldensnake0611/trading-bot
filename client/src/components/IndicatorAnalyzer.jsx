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
  const [useFutures, setUseFutures] = useState(localStorage.getItem('analyzer_use_futures') === 'true')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Persist settings
  useEffect(() => {
    localStorage.setItem('analyzer_symbol', symbol)
    localStorage.setItem('analyzer_timeframe', timeframe)
    localStorage.setItem('analyzer_period', period)
    localStorage.setItem('analyzer_use_futures', useFutures)
  }, [symbol, timeframe, period, useFutures])

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
      setError(null)
      
      // Always fetch data from 1 year ago
      const oneYearAgo = Date.now() - 31536000000
      let url = `/api/klines?symbol=${symbol}&interval=${timeframe}&startTime=${oneYearAgo}&limit=10000`
      if (useFutures) url += '&type=futures'
      
      fetch(url)
        .then(res => {
          if (res.status === 401) {
            throw new Error('Unauthorized')
          }
          if (!res.ok) {
            throw new Error(`HTTP Error: ${res.status}`)
          }
          return res.json()
        })
        .then(klines => {
          if (Array.isArray(klines) && klines.length > 0) {
            // MEXC Kline: [time, open, high, low, close, vol, ...]
            // Validate first item
            if (klines[0].length < 6) {
                console.error('Invalid kline structure:', klines[0])
                setData([])
                return
            }

            const closes = klines.map(k => Number(k[4]))
            const rsiValues = calculateRSI(closes, Number(period))
            
            const chartData = klines.map((k, i) => ({
              time: Number(k[0]), // Store raw timestamp (number)
              open: Number(k[1]),
              high: Number(k[2]),
              low: Number(k[3]),
              close: Number(k[4]),
              price: Number(k[4]), // Ensure 'price' exists for the chart
              vol: Number(k[5]),
              rsi: rsiValues[i]
            }))
            
            setData(chartData)
          } else {
             console.error('Invalid or empty klines data:', klines)
             setData([])
          }
        })
        .catch(err => {
            console.error(err)
            setError(err.message)
            setData([])
        })
        .finally(() => setLoading(false))
    }

    fetchData()
    // Set up polling (30s)
    const timer = setInterval(() => fetchData(true), 30000)
    return () => clearInterval(timer)
  }, [symbol, timeframe, period, useFutures])

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload
      return (
        <div className="bg-[#0f111a] p-4 border border-gray-700 rounded-lg shadow-2xl text-sm font-mono backdrop-blur-sm bg-opacity-95">
          <p className="text-gray-400 mb-2 border-b border-gray-700 pb-2">{new Date(d.time).toLocaleString()}</p>
          <div className="space-y-1">
            <p className="text-emerald-400 font-bold flex justify-between gap-4">
              <span>Price:</span>
              <span>{d.close}</span>
            </p>
            <p className="text-purple-400 flex justify-between gap-4">
              <span>RSI:</span>
              <span>{d.rsi ? d.rsi.toFixed(2) : 'N/A'}</span>
            </p>
          </div>
        </div>
      )
    }
    return null
  }

  const currentPrice = data.length > 0 ? data[data.length - 1].price : null

  return (
    <div className="p-6 bg-[#1e2030] rounded-xl border border-gray-800 shadow-xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#d46a84] mb-2">Indicator Analyzer</h2>
          <p className="text-gray-400 text-sm">Analyze technical indicators and historical data</p>
          {currentPrice && (
            <div className="mt-2 text-xl font-mono text-emerald-400">
              Current Price: <span className="font-bold">{currentPrice}</span>
            </div>
          )}
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <SymbolSearch value={symbol} onChange={setSymbol} />
          
          <select 
            value={timeframe} 
            onChange={(e) => setTimeframe(e.target.value)}
            className="bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-lg focus:ring-purple-500 focus:border-purple-500 block p-2.5"
          >
            {timeframes.map(tf => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>

          <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg p-2">
            <span className="text-gray-400 text-sm">RSI:</span>
            <input 
              type="number" 
              value={period} 
              onChange={(e) => setPeriod(Number(e.target.value))}
              className="bg-transparent text-gray-200 text-sm w-12 focus:outline-none text-center"
              min="1"
            />
          </div>

           <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg p-2 px-3">
            <input 
              type="checkbox" 
              id="useFutures"
              checked={useFutures} 
              onChange={(e) => setUseFutures(e.target.checked)}
              className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-600 focus:ring-2"
            />
            <label htmlFor="useFutures" className="text-gray-400 text-sm cursor-pointer select-none">Futures Data</label>
          </div>
        </div>
      </div>

      <div style={{ minHeight: '500px', height: '600px', background: '#1e2030', padding: '20px', borderRadius: '8px' }}>
        {loading ? (
          <div className="h-full flex items-center justify-center text-gray-400">
            Loading Data...
          </div>
        ) : error === 'Unauthorized' ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
             <p className="mb-2 text-red-400">Session Expired</p>
             <p className="text-sm text-gray-500">Please refresh the page or log in again.</p>
          </div>
        ) : data.length === 0 ? (
           <div className="h-full flex flex-col items-center justify-center text-gray-400">
             <p className="mb-2">No data available for {symbol}</p>
             <p className="text-sm text-gray-500">
               {useFutures ? 'Ensure this symbol exists on MEXC Futures.' : 'Ensure this symbol exists on MEXC Spot.'}
             </p>
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
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <ReferenceLine y={70} yAxisId="rsi" stroke="#ff4d4d" strokeDasharray="3 3" label="Overbought (70)" />
              <ReferenceLine y={30} yAxisId="rsi" stroke="#4caf50" strokeDasharray="3 3" label="Oversold (30)" />
              {currentPrice && (
                <ReferenceLine 
                  y={currentPrice} 
                  yAxisId="price" 
                  stroke="#d46a84" 
                  strokeDasharray="3 3" 
                  label={{ position: 'insideRight', value: `Current: ${currentPrice}`, fill: '#d46a84' }} 
                />
              )}
              
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
