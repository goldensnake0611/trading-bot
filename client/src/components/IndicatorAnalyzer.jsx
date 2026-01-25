import { useState, useEffect, useMemo } from 'react'
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Brush, ReferenceLine } from 'recharts'
import SymbolSearch from './SymbolSearch'

// Helper to calculate VWAP Array (Rolling)
function calculateVWAP(klines, period = 20) {
  const vwapArray = []
  let sumTPV = 0
  let sumVol = 0
  
  for (let i = 0; i < klines.length; i++) {
    const k = klines[i]
    const high = Number(k[2])
    const low = Number(k[3])
    const close = Number(k[4])
    const vol = Number(k[5])
    const tp = (high + low + close) / 3
    
    sumTPV += tp * vol
    sumVol += vol
    
    if (i >= period) {
       const kOld = klines[i - period]
       const hOld = Number(kOld[2])
       const lOld = Number(kOld[3])
       const cOld = Number(kOld[4])
       const vOld = Number(kOld[5])
       const tpOld = (hOld + lOld + cOld) / 3
       
       sumTPV -= tpOld * vOld
       sumVol -= vOld
    }
    
    if (i >= period - 1) {
      vwapArray.push(sumVol ? sumTPV / sumVol : null)
    } else {
      vwapArray.push(null)
    }
  }
  return vwapArray
}

export default function IndicatorAnalyzer() {
  const [symbol, setSymbol] = useState(localStorage.getItem('analyzer_symbol') || 'BTCUSDT')
  const [timeframe, setTimeframe] = useState(localStorage.getItem('analyzer_timeframe') || '1d')
  const [period, setPeriod] = useState(Number(localStorage.getItem('analyzer_period')) || 20)
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

            const vwapValues = calculateVWAP(klines, Number(period))
            
            const chartData = klines.map((k, i) => ({
              time: Number(k[0]), // Store raw timestamp (number)
              open: Number(k[1]),
              high: Number(k[2]),
              low: Number(k[3]),
              close: Number(k[4]),
              price: Number(k[4]), // Ensure 'price' exists for the chart
              vol: Number(k[5]),
              vwap: vwapValues[i]
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
          <div className="flex items-center gap-6">
            <p className="text-emerald-400 font-bold">
              <span>Price: </span>
              <span>{d.close}</span>
            </p>
            <p className="text-orange-400">
              <span>VWAP: </span>
              <span>{d.vwap ? d.vwap.toFixed(2) : 'N/A'}</span>
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
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-[#d46a84] mb-2">Indicator Analyzer</h2>
        <p className="text-gray-400 text-sm mb-4">Analyze technical indicators and historical data</p>
        
        <div className="analyzer-controls flex flex-nowrap items-center gap-6 bg-gray-900/50 p-3 rounded-lg border border-gray-800 overflow-x-auto whitespace-nowrap">
           {/* Price */}
           {currentPrice && (
            <div className="flex items-center gap-3 pl-2 shrink-0">
               <span className="text-gray-500 font-bold text-sm uppercase tracking-wider">Price</span>
               <span className="text-emerald-400 font-mono font-bold text-lg">{currentPrice}</span>
            </div>
           )}

           {/* Vertical Divider */}
           {currentPrice && <div className="h-8 w-px bg-gray-700/50 mx-2 shrink-0"></div>}

            {/* Symbol */}
            <div className="w-[160px] shrink-0 relative">
              <SymbolSearch value={symbol} onChange={setSymbol} />
            </div>
            
            {/* Interval */}
            <select 
              value={timeframe} 
              onChange={(e) => setTimeframe(e.target.value)}
              className="!w-20 bg-[#0f111a] border border-gray-700 text-gray-200 text-sm rounded px-3 py-2 focus:ring-1 focus:ring-purple-500 focus:border-purple-500 outline-none hover:border-gray-600 transition-colors shrink-0 cursor-pointer"
            >
              {timeframes.map(tf => (
                <option key={tf} value={tf}>{tf}</option>
              ))}
            </select>

            {/* VWAP Length */}
            <div className="flex items-center gap-3 bg-[#0f111a] border border-gray-700 rounded px-3 py-2 hover:border-gray-600 transition-colors shrink-0">
              <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">VWAP Len</span>
              <input 
                type="number" 
                value={period} 
                onChange={(e) => setPeriod(Number(e.target.value))}
                className="!w-12 bg-transparent text-gray-200 text-sm focus:outline-none text-center font-mono p-0 border-none"
                min="1"
              />
            </div>

            {/* Futures Checkbox */}
            <div className="flex items-center gap-2 px-2 cursor-pointer group shrink-0 ml-auto">
              <input 
                type="checkbox" 
                id="useFutures"
                checked={useFutures} 
                onChange={(e) => setUseFutures(e.target.checked)}
                className="!w-4 !h-4 text-purple-600 bg-[#0f111a] border-gray-600 rounded focus:ring-purple-600 focus:ring-1 cursor-pointer"
              />
              <label htmlFor="useFutures" className="!m-0 !inline-block text-gray-400 text-xs font-bold uppercase tracking-wide cursor-pointer group-hover:text-gray-300 select-none">
                Futures
              </label>
            </div>
        </div>
        <style>{`
          .analyzer-controls input, .analyzer-controls select {
            width: auto !important;
            margin: 0 !important;
          }
          /* Fix for SymbolSearch input specifically */
          .analyzer-controls .dropdown-wrapper input {
            width: 100% !important; /* Keep 100% relative to wrapper */
            background: #0f111a;
            border: 1px solid #374151;
            padding: 8px 12px;
          }
        `}</style>
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
              <YAxis yAxisId="price" orientation="right" domain={['auto', 'auto']} tick={{ fill: '#888' }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
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
                yAxisId="price"
                type="monotone" 
                dataKey="vwap" 
                stroke="#ff9f43" 
                strokeWidth={2}
                dot={false} 
                name={`VWAP (${period})`}
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
