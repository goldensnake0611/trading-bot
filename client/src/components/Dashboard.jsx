import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Info, X } from 'lucide-react'
import SymbolSearch from './SymbolSearch'
import Pagination from './Pagination'
import IndicatorAnalyzer from './IndicatorAnalyzer'

const SELECTED_SCAN_TOKENS_STORAGE_KEY = 'selected_scan_tokens_v1'

function EditPositionModal({ position, onClose, onSave }) {
  const [tp, setTp] = useState(position.tp || '')
  const [sl, setSl] = useState(position.sl || '')

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(position.id, tp, sl)
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{
        background: '#1e2030', padding: '20px', borderRadius: '8px', width: '300px', border: '1px solid #444',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3>Edit Position: {position.symbol}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#888' }}>Take Profit (TP)</label>
            <input 
              type="number" 
              step="any"
              value={tp} 
              onChange={e => setTp(e.target.value)}
              placeholder="No TP Set"
              style={{ width: '100%', padding: '8px', background: '#2a2d3d', border: '1px solid #444', color: 'white', borderRadius: '4px' }}
            />
          </div>
          
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#888' }}>Stop Loss (SL)</label>
            <input 
              type="number" 
              step="any"
              value={sl} 
              onChange={e => setSl(e.target.value)}
              placeholder="No SL Set"
              style={{ width: '100%', padding: '8px', background: '#2a2d3d', border: '1px solid #444', color: 'white', borderRadius: '4px' }}
            />
          </div>
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="submit" className="btn-primary" style={{ flex: 1 }}>Update</button>
            <button 
              type="button" 
              onClick={() => { setTp(''); setSl(''); }}
              style={{ flex: 1, background: '#444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Clear Both
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { logout } = useAuth()
  const [activeTab, setActiveTab] = useState('trading')
  const [marketType, setMarketType] = useState(() => localStorage.getItem('market_type') || 'spot')
  const [status, setStatus] = useState([])
  const [positions, setPositions] = useState([])
  const [selectedPositionIds, setSelectedPositionIds] = useState(new Set())
  const [selectedHistoryIndices, setSelectedHistoryIndices] = useState(new Set())
  const [selectedOrderIndices, setSelectedOrderIndices] = useState(new Set())
  const [history, setHistory] = useState([])
  const [posHistory, setPosHistory] = useState([])
  const [strategiesList, setStrategiesList] = useState([])
  const [systemLogs, setSystemLogs] = useState([])

  // Pagination State
  const [posHistoryPage, setPosHistoryPage] = useState(1)
  const [posHistoryLimit, setPosHistoryLimit] = useState(10)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyLimit, setHistoryLimit] = useState(10)
  
  // Form State
  const [symbol, setSymbol] = useState('')
  const [strategy, setStrategy] = useState('trend-following')
  const [candleInterval, setCandleInterval] = useState('1m')
  const [rsiInterval, setRsiInterval] = useState('5m')
  const [historyStrategyFilter, setHistoryStrategyFilter] = useState('All')
  const [vol, setVol] = useState(10)
  const [tpPct, setTpPct] = useState(1)
  const [slPct, setSlPct] = useState(0.5)
  const [autoSell, setAutoSell] = useState(true)
  const [isPaperTrading, setIsPaperTrading] = useState(false)
  const [editingPosition, setEditingPosition] = useState(null)
  const longPressTimer = useRef(null)

  const [showNotification, setShowNotification] = useState(false)
  const [lastLogTime, setLastLogTime] = useState(null)
  const notificationTimer = useRef(null)
  const [showScanRefreshNotification, setShowScanRefreshNotification] = useState(false)
  const [scanRefreshMessage, setScanRefreshMessage] = useState('')
  const scanRefreshNotificationTimer = useRef(null)

  const [isScanning, setIsScanning] = useState(false)
  const [scanResults, setScanResults] = useState([])
  const [scanStrategy, setScanStrategy] = useState('trend-following')
  const [scanInterval, setScanInterval] = useState('1m')
  const [scanRsiInterval, setScanRsiInterval] = useState('5m')
  const [scanPage, setScanPage] = useState(1)
  const [scanLimit, setScanLimit] = useState(10)
  const [selectedScanIndex, setSelectedScanIndex] = useState(null)
  const [volatilityThreshold, setVolatilityThreshold] = useState(40)
  const [scanKlineLimit, setScanKlineLimit] = useState(200)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [scanActionFilter, setScanActionFilter] = useState('All')
  const [showScanActionFilter, setShowScanActionFilter] = useState(false)
  const [selectedScanTokens, setSelectedScanTokens] = useState(() => {
    try {
      const raw = localStorage.getItem(SELECTED_SCAN_TOKENS_STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(t => t && typeof t.symbol === 'string')
    } catch {
      return []
    }
  })



  useEffect(() => {
    localStorage.setItem('market_type', marketType)
    if (marketType === 'futures') {
      setIsPaperTrading(true)
    }
  }, [marketType])

  useEffect(() => {
    try {
      if (!selectedScanTokens.length) {
        localStorage.removeItem(SELECTED_SCAN_TOKENS_STORAGE_KEY)
        return
      }
      localStorage.setItem(SELECTED_SCAN_TOKENS_STORAGE_KEY, JSON.stringify(selectedScanTokens))
    } catch (err) {
      console.error(err)
    }
  }, [selectedScanTokens])

  useEffect(() => {
    if (systemLogs.length > 0) {
      const latest = systemLogs[0]
      if (latest.time !== lastLogTime) {
        setLastLogTime(latest.time)
        setShowNotification(true)
        
        // Clear existing timer
        if (notificationTimer.current) clearTimeout(notificationTimer.current)
        
        // Auto close after 10 seconds
        notificationTimer.current = setTimeout(() => {
          setShowNotification(false)
        }, 10000)
      }
    }
  }, [systemLogs, lastLogTime])

  useEffect(() => {
    fetchStrategies()
    const interval = setInterval(() => {
      refreshSystemLogs()
      if (activeTab === 'trading') refreshTrading()
      else refreshHistory()
    }, 5000)
    
    // Initial load
    refreshTrading()
    refreshSystemLogs()
    
    return () => clearInterval(interval)
  }, [activeTab])

  const handleScan = useCallback(async () => {
    setIsScanning(true)
    setScanPage(1)
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          strategy: scanStrategy, 
          marketType, 
          interval: scanInterval,
          rsiInterval: scanStrategy === 'rsi-ema-volatility' ? scanRsiInterval : undefined,
          volatilityThreshold: volatilityThreshold / 100,
          klineLimit: scanStrategy === 'volatility-swing' ? scanKlineLimit : undefined
        })
      })
      if (res.ok) {
        const data = await res.json()
        setScanResults(data)
        setScanRefreshMessage(`Results refreshed (${Array.isArray(data) ? data.length : 0})`)
        setShowScanRefreshNotification(true)
        if (scanRefreshNotificationTimer.current) clearTimeout(scanRefreshNotificationTimer.current)
        scanRefreshNotificationTimer.current = setTimeout(() => {
          setShowScanRefreshNotification(false)
        }, 6000)
      } else {
        const err = await res.json()
        alert('Scan failed: ' + err.error)
      } 
    } catch(e) {
      console.error(e)
      alert('Network error')
    } finally {
      setIsScanning(false)
    }
  }, [scanStrategy, marketType, scanInterval, scanRsiInterval, volatilityThreshold, scanKlineLimit])

  // Auto Refresh Effect
  useEffect(() => {
    let interval
    if (activeTab === 'scanner' && autoRefresh) {
      interval = setInterval(() => {
        handleScan()
      }, 300000) // 5 minutes
    }
    return () => clearInterval(interval)
  }, [activeTab, autoRefresh, handleScan])

  useEffect(() => {
    return () => {
      if (scanRefreshNotificationTimer.current) clearTimeout(scanRefreshNotificationTimer.current)
      if (notificationTimer.current) clearTimeout(notificationTimer.current)
    }
  }, [])

  useEffect(() => {
    setSelectedScanTokens(prev => prev.map(t => {
      const latest = scanResults.find(r => r.symbol === t.symbol)
      if (!latest) return t
      return { ...t, price: latest.price, action: latest.action }
    }))
  }, [scanResults])

  async function refreshSystemLogs() {
    try {
      const res = await fetch('/api/logs')
      if (res.ok) {
        setSystemLogs(await res.json())
      }
    } catch (err) {
      console.error(err)
    }
  }

  async function fetchStrategies() {
    try {
      const res = await fetch('/api/strategies')
      if (res.ok) {
        setStrategiesList(await res.json())
      }
    } catch (e) { console.error(e) }
  }

  async function refreshTrading() {
    try {
      const sRes = await fetch('/api/status')
      setStatus(await sRes.json())
      const pRes = await fetch('/api/positions')
      setPositions(await pRes.json())
    } catch (err) {
      console.error(err)
    }
  }

  async function refreshHistory() {
    try {
      const hRes = await fetch('/api/history')
      const hData = await hRes.json()
      setHistory(hData.sort((a,b) => b.time - a.time))
      
      const phRes = await fetch('/api/positions_history')
      setPosHistory(await phRes.json())
    } catch (err) {
      console.error(err)
    }
  }

  async function startBot() {
    if (!symbol) return alert('Please select a symbol')
    await fetch('/api/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        symbol, 
        vol, 
        tpPct, 
        slPct, 
        strategy, 
        autoSell, 
        isPaperTrading, 
        marketType, 
        interval: candleInterval,
        rsiInterval,
        volatilityThreshold: volatilityThreshold / 100
      })
    })
    refreshTrading()
  }

  async function manualBuy(id) {
    if (!id) return
    if (!confirm('Are you sure you want to BUY now for this bot?')) return
    try {
      const res = await fetch('/api/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      if (res.ok) {
        alert('Buy order executed successfully')
        refreshTrading()
      } else {
        const err = await res.json()
        alert('Buy failed: ' + (err.error || 'Unknown error'))
      }
    } catch (e) {
      console.error(e)
      alert('Network error')
    }
  }

  async function stopBot(id) {
    if (!id) return
    await fetch('/api/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    })
    refreshTrading()
  }

  async function manualSell(id) {
    if (!confirm('Are you sure you want to sell this position immediately?')) return
    try {
      const res = await fetch('/api/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      if (res.ok) {
        alert('Sell order executed successfully')
        refreshTrading()
      } else {
        const err = await res.json()
        alert('Sell failed: ' + (err.error || 'Unknown error'))
      }
    } catch {
      alert('Network error')
    }
  }

  async function toggleAutoSell(id, enabled) {
    try {
      const res = await fetch('/api/toggle_autosell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled })
      })
      if (res.ok) {
        refreshTrading()
      }
    } catch(e) {
      console.error(e)
    }
  }

  async function handleTpSlUpdate(id, tp, sl) {
    try {
      await fetch('/api/update_tp_sl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, tp, sl })
      })
      refreshTrading()
      setEditingPosition(null)
    } catch (e) {
      console.error(e)
      alert('Failed to update TP/SL')
    }
  }

  async function handleBulkDelete() {
    if (confirm('Are you sure you want to delete ALL history? This cannot be undone.')) {
      try {
        const res = await fetch('/api/history', { method: 'DELETE' })
        if (res.ok) {
          const data = await res.json()
          alert(`Deleted ${data.count} history entries.`)
          refreshHistory()
          setPosHistoryPage(1)
          setHistoryPage(1)
        } else {
          const err = await res.json()
          alert('Failed to delete history: ' + (err.error || 'Unknown error'))
        }
      } catch (e) {
        console.error(e)
        alert('Network error')
      }
    }
  }

  async function handleHistoryContextMenu(e, position) {
    e.preventDefault()
    if (confirm(`Are you sure you want to delete this history record for ${position.symbol}?`)) {
      try {
        const res = await fetch(`/api/history/${position.id}`, {
          method: 'DELETE'
        })
        if (res.ok) {
          refreshHistory()
        } else {
          const err = await res.json()
          alert('Failed to delete: ' + (err.error || 'Unknown error'))
        }
      } catch (e) {
        console.error(e)
        alert('Network error')
      }
    }
  }

  async function handlePositionContextMenu(e, position) {
    e.preventDefault()
    if (confirm(`Are you sure you want to STOP the bot for ${position.symbol}? If there is an open position, it will be SOLD immediately.`)) {
      await stopBot(position.id)
    }
  }

  // Long press logic
  const handleRowMouseDown = (position) => {
    longPressTimer.current = setTimeout(() => {
      setEditingPosition(position)
    }, 2000) // 2s long press
  }

  const handleRowMouseUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  // Helper to find active bot ID for current symbol (simplified)
  // In reality user might run multiple bots.
  // For the UI buttons "Stop Bot", we need to know which one.
  // The original UI just had a global "stop" that stopped "botId".
  // Let's improve: The "Stop Bot" button will stop the bot for the *selected symbol* if it exists.
  const activeBot = status.find(b => b.symbol === symbol)

  function buildMexcUrl(symbol) {
    const formatted = symbol.includes('_')
      ? symbol
      : (symbol.endsWith('USDT') ? symbol.replace(/USDT$/, '_USDT') : symbol)
    if (marketType === 'futures') {
      return `https://www.mexc.com/en-GB/futures/${formatted}?type=linear_swap`
    }
    return `https://www.mexc.com/en-GB/exchange/${formatted}`
  }

  function handleRowDoubleClick(symbol) {
    const url = buildMexcUrl(symbol)
    window.open(url, '_blank')
  }

  function handleRowClick(e, id) {
    if (e.ctrlKey || e.metaKey) {
      // Toggle all
      if (selectedPositionIds.size === positions.length) {
        setSelectedPositionIds(new Set())
      } else {
        setSelectedPositionIds(new Set(positions.map(p => p.id)))
      }
    } else {
      // Toggle single
      const newSet = new Set(selectedPositionIds)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.clear() // Clear others if simple click? 
        // Requirement says "click the row, that row will be high-light"
        // Usually single click selects ONLY that row.
        newSet.add(id)
      }
      setSelectedPositionIds(newSet)
    }
  }

  function handleHistoryRowClick(e, index) {
    if (e.ctrlKey || e.metaKey) {
      if (selectedHistoryIndices.size === posHistory.length) {
        setSelectedHistoryIndices(new Set())
      } else {
        setSelectedHistoryIndices(new Set(posHistory.map((_, i) => i)))
      }
    } else {
      const newSet = new Set(selectedHistoryIndices)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.clear()
        newSet.add(index)
      }
      setSelectedHistoryIndices(newSet)
    }
  }

  function handleOrderRowClick(e, index) {
    if (e.ctrlKey || e.metaKey) {
      if (selectedOrderIndices.size === history.length) {
        setSelectedOrderIndices(new Set())
      } else {
        setSelectedOrderIndices(new Set(history.map((_, i) => i)))
      }
    } else {
      const newSet = new Set(selectedOrderIndices)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.clear()
        newSet.add(index)
      }
      setSelectedOrderIndices(newSet)
    }
  }

  const filteredPosHistory = historyStrategyFilter === 'All' 
    ? posHistory 
    : posHistory.filter(p => p.strategy === historyStrategyFilter)

  const historyStats = filteredPosHistory.reduce((acc, p) => {
    const pnl = Number(p.realizedPnl) || 0
    acc.totalPnl += pnl
    if (pnl > 0) acc.wins++
    else acc.losses++
    return acc
  }, { totalPnl: 0, wins: 0, losses: 0 })

  const winRate = historyStats.wins + historyStats.losses > 0 
    ? ((historyStats.wins / (historyStats.wins + historyStats.losses)) * 100).toFixed(1) 
    : 0

  function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        console.log('Copied to clipboard:', text)
      }).catch(err => {
        console.error('Async copy failed, trying fallback:', err)
        fallbackCopy(text)
      })
    } else {
      fallbackCopy(text)
    }
  }

  function fallbackCopy(text) {
    try {
      const textArea = document.createElement("textarea")
      textArea.value = text
      textArea.style.position = "fixed"
      textArea.style.left = "-9999px"
      textArea.style.top = "0"
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      console.log('Fallback copy successful')
    } catch (err) {
      console.error('Fallback copy failed:', err)
      alert('Failed to copy to clipboard')
    }
  }

  const filteredScanResults = scanResults.filter(r => 
    scanActionFilter === 'All' || r.action === scanActionFilter
  )
  const selectedScanSymbols = useMemo(() => new Set(selectedScanTokens.map(t => t.symbol)), [selectedScanTokens])

  function addSelectedScanToken(token) {
    setSelectedScanTokens(prev => {
      const idx = prev.findIndex(t => t.symbol === token.symbol)
      if (idx === -1) return [...prev, token]
      const next = prev.slice()
      next[idx] = { ...next[idx], ...token }
      return next
    })
  }

  function removeSelectedScanToken(symbol) {
    setSelectedScanTokens(prev => prev.filter(t => t.symbol !== symbol))
  }

  return (
    <div className="container">
      <div className="card">
        <div className="header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1>MEXC Trading Bot v3</h1>
            <div style={{ display: 'inline-flex', borderRadius: '999px', padding: '3px', background: 'rgba(0,0,0,0.25)' }}>
              <button
                onClick={() => setMarketType('spot')}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  borderRadius: '999px',
                  border: 'none',
                  cursor: 'pointer',
                  minWidth: '60px',
                  background: marketType === 'spot' ? '#d46a84' : 'transparent',
                  color: marketType === 'spot' ? '#fff' : '#d0c4d8',
                  boxShadow: marketType === 'spot' ? '0 0 10px rgba(212,106,132,0.5)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                Spot
              </button>
              <button
                onClick={() => setMarketType('futures')}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  borderRadius: '999px',
                  border: 'none',
                  cursor: 'pointer',
                  minWidth: '60px',
                  background: marketType === 'futures' ? '#4c3fcf' : 'transparent',
                  color: marketType === 'futures' ? '#fff' : '#d0c4d8',
                  boxShadow: marketType === 'futures' ? '0 0 10px rgba(90,80,220,0.5)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                Futures
              </button>
            </div>
          </div>
          <button onClick={logout} className="logout-btn">Logout</button>
        </div>
        
        {showNotification && systemLogs.length > 0 && (
          <div style={{ 
            marginBottom: '20px', 
            padding: '10px', 
            background: 'rgba(212, 106, 132, 0.1)', 
            border: '1px solid rgba(212, 106, 132, 0.3)', 
            borderRadius: '8px', 
            color: '#ffb3c1',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <strong>System Notification:</strong> {systemLogs[0].message} <small>({new Date(systemLogs[0].time).toLocaleTimeString()})</small>
            </div>
            <button 
              onClick={() => setShowNotification(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#ffb3c1',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <X size={18} />
            </button>
          </div>
        )}

        {activeTab === 'scanner' && showScanRefreshNotification && (
          <div style={{ 
            marginBottom: '20px', 
            padding: '10px', 
            background: 'rgba(76, 63, 207, 0.12)', 
            border: '1px solid rgba(76, 63, 207, 0.35)', 
            borderRadius: '8px', 
            color: '#c9c3ff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <strong>Scan Notification:</strong> {scanRefreshMessage} <small>({new Date().toLocaleTimeString()})</small>
            </div>
            <button 
              onClick={() => setShowScanRefreshNotification(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#c9c3ff',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <X size={18} />
            </button>
          </div>
        )}

        <div className="tabs">
          <button 
            className={`tab-btn ${activeTab === 'trading' ? 'active' : ''}`}
            onClick={() => setActiveTab('trading')}
          >
            Trading
          </button>
          <button 
            className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            History
          </button>
          <button 
            className={`tab-btn ${activeTab === 'indicator' ? 'active' : ''}`}
            onClick={() => setActiveTab('indicator')}
          >
            Indicator Analyzer
          </button>
          <button 
            className={`tab-btn ${activeTab === 'scanner' ? 'active' : ''}`}
            onClick={() => setActiveTab('scanner')}
          >
            Token Detection
          </button>
        </div>

        {activeTab === 'scanner' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', alignItems: 'end', marginBottom: '20px' }}>
              <label>
                Strategy
                <select value={scanStrategy} onChange={e => setScanStrategy(e.target.value)} style={{ width: '100%' }}>
                  {strategiesList.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>

              {(scanStrategy === 'volatility-swing' || scanStrategy === 'rsi-ema-volatility') && (
                <>
                  <label>
                    Threshold (%)
                    <input 
                      type="number" 
                      value={volatilityThreshold} 
                      onChange={e => setVolatilityThreshold(e.target.value)} 
                      step="1" 
                      style={{ width: '100%' }}
                    />
                  </label>
                  {scanStrategy === 'rsi-ema-volatility' && (
                    <label>
                      RSI Candle
                      <select value={scanRsiInterval} onChange={e => setScanRsiInterval(e.target.value)} style={{ width: '100%' }}>
                        <option value="1m">1 Minute</option>
                        <option value="5m">5 Minutes</option>
                        <option value="15m">15 Minutes</option>
                        <option value="30m">30 Minutes</option>
                        <option value="1h">1 Hour</option>
                        <option value="4h">4 Hours</option>
                      </select>
                    </label>
                  )}
                  <label>
                    Klines
                    <input 
                      type="number" 
                      value={scanKlineLimit} 
                      onChange={e => setScanKlineLimit(Number(e.target.value) || 0)} 
                      step="50" 
                      style={{ width: '100%' }}
                    />
                  </label>
                </>
              )}
              
              <label>
                Candle Timeframe
                <select value={scanInterval} onChange={e => setScanInterval(e.target.value)} style={{ width: '100%' }}>
                  <option value="1m">1 Minute</option>
                  <option value="5m">5 Minutes</option>
                  <option value="15m">15 Minutes</option>
                  <option value="30m">30 Minutes</option>
                  <option value="1h">1 Hour</option>
                  <option value="4h">4 Hours</option>
                  <option value="1d">1 Day</option>
                </select>
              </label>
            </div>

            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: '20px',
              background: 'rgba(255,255,255,0.03)',
              padding: '15px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.05)'
            }}>
              <button 
                onClick={handleScan} 
                className="btn-primary" 
                disabled={isScanning}
                style={{ 
                  height: '42px', 
                  minWidth: '160px',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  fontSize: '14px',
                  fontWeight: '600',
                  letterSpacing: '0.5px',
                  boxShadow: isScanning ? 'none' : '0 4px 12px rgba(212, 106, 132, 0.3)'
                }}
              >
                {isScanning ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="spinner" style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 1s linear infinite' }}></span>
                    Scanning...
                  </span>
                ) : 'Scan Market'}
              </button>

              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '12px' }}>
                <div style={{ 
                  position: 'relative', 
                  width: '44px', 
                  height: '24px', 
                  background: autoRefresh ? '#d46a84' : '#333', 
                  borderRadius: '99px', 
                  transition: 'background 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)'
                }}>
                  <div style={{ 
                    position: 'absolute', 
                    top: '2px', 
                    left: autoRefresh ? '22px' : '2px', 
                    width: '20px', 
                    height: '20px', 
                    background: '#fff', 
                    borderRadius: '50%', 
                    transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>Auto Refresh</span>
                  <span style={{ color: '#888', fontSize: '11px' }}>Every 5 minutes</span>
                </div>
                <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} style={{ display: 'none' }} />
              </label>
            </div>
            
            <p style={{ color: '#888', fontSize: '13px', marginBottom: '15px' }}>
              Scanning top liquid pairs for <strong>{marketType === 'futures' ? 'Futures' : 'Spot'}</strong> BUY signals. Double-click row to open on MEXC.
            </p>

            <div className="scan-layout">
              <div>
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '44px', textAlign: 'center' }}>Pick</th>
                        <th>Symbol</th>
                        <th>Price</th>
                        <th style={{ position: 'relative', cursor: 'pointer', minWidth: '80px' }}>
                      <div 
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowScanActionFilter(!showScanActionFilter)
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                      >
                        Action
                        <span style={{ fontSize: '10px', transform: showScanActionFilter ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                        {scanActionFilter !== 'All' && <span style={{ fontSize: '10px', color: '#d46a84' }}>({scanActionFilter === 'BUY' ? 'Buy' : 'Sell'})</span>}
                      </div>

                      {showScanActionFilter && (
                        <div style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          marginTop: '5px',
                          background: '#1e2030',
                          border: '1px solid #444',
                          borderRadius: '6px',
                          zIndex: 100,
                          minWidth: '100px',
                          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                          overflow: 'hidden'
                        }}>
                          {['All', 'BUY', 'SELL'].map(opt => (
                            <div 
                              key={opt}
                              onClick={(e) => {
                                e.stopPropagation()
                                setScanActionFilter(opt)
                                setScanPage(1)
                                setShowScanActionFilter(false)
                              }}
                              style={{
                                padding: '10px 15px',
                                color: scanActionFilter === opt ? '#d46a84' : '#eee',
                                cursor: 'pointer',
                                fontSize: '13px',
                                borderBottom: opt !== 'SELL' ? '1px solid #2a2d3d' : 'none',
                                fontWeight: scanActionFilter === opt ? 'bold' : 'normal'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2a2d3d'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                              {opt === 'All' ? 'All' : (opt === 'BUY' ? 'Buy' : 'Sell')}
                            </div>
                          ))}
                        </div>
                      )}
                        </th>
                        <th>Indicators</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scanResults.length === 0 && !isScanning && (
                        <tr>
                          <td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                            No opportunities found or scan not started.
                          </td>
                        </tr>
                      )}
                      {isScanning && (
                        <tr>
                          <td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: '#d46a84' }}>
                            Scanning market... This may take a moment...
                          </td>
                        </tr>
                      )}
                      {filteredScanResults
                        .slice((scanPage - 1) * scanLimit, scanPage * scanLimit)
                        .map((r, i) => {
                          const absIndex = (scanPage - 1) * scanLimit + i
                          const isSelected = selectedScanSymbols.has(r.symbol)
                          return (
                        <tr 
                          key={absIndex} 
                          onClick={(e) => {
                            if (e.ctrlKey || e.metaKey) {
                              const url = buildMexcUrl(r.symbol)
                              window.open(url, '_blank')
                              return
                            }
                            setSelectedScanIndex(absIndex)
                            const symbolToCopy = r.symbol.replace('USDT', '')
                            copyToClipboard(symbolToCopy)
                          }}
                          onAuxClick={(e) => {
                            if (e.button === 1) {
                              const url = buildMexcUrl(r.symbol)
                              window.open(url, '_blank')
                            }
                          }}
                          onDoubleClick={() => handleRowDoubleClick(r.symbol)} 
                          style={{ 
                            cursor: 'pointer',
                            backgroundColor: selectedScanIndex === absIndex ? 'rgba(255, 255, 255, 0.06)' : 'transparent'
                          }}
                          className="hover-row"
                        >
                          <td
                            style={{ width: '44px' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) addSelectedScanToken({ symbol: r.symbol, price: r.price, action: r.action })
                                else removeSelectedScanToken(r.symbol)
                              }}
                              className="scan-checkbox"
                              style={{
                                width: '16px',
                                height: '16px',
                                padding: 0,
                                margin: 0,
                                accentColor: '#d46a84',
                                cursor: 'pointer'
                              }}
                            />
                          </td>
                          <td style={{ fontWeight: 'bold', color: '#fff' }}>
                            <a 
                              href={buildMexcUrl(r.symbol)} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              style={{ color: '#fff', textDecoration: 'underline' }}
                              onClick={e => e.stopPropagation()}
                            >
                              {r.symbol}
                            </a>
                          </td>
                          <td>{r.price}</td>
                          <td style={{ color: r.action === 'SELL' ? '#ff4d4d' : '#4caf50', fontWeight: 'bold' }}>{r.action}</td>
                          <td style={{ fontSize: '12px', color: '#aaa' }}>
                            {Object.entries(r.indicators || {}).map(([k, v]) => (
                              <span key={k} style={{ marginRight: '8px' }}>
                                {k}: {typeof v === 'number' ? v.toFixed(4) : v}
                              </span>
                            ))}
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                  <p style={{ color: '#777', fontSize: '12px', margin: 0 }}>
                    Tip: Click row to copy symbol. Ctrl+Click or middle-click to open on MEXC.
                  </p>
                  <Pagination 
                    currentPage={scanPage}
                    totalItems={filteredScanResults.length}
                    pageSize={scanLimit}
                    onPageChange={setScanPage}
                    onPageSizeChange={setScanLimit}
                  />
                </div>
              </div>

              <div className="scan-selected-panel">
                <div className="scan-selected-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ color: '#eebbcc', fontWeight: 700, fontSize: '13px', letterSpacing: '0.5px' }}>Selected Tokens</div>
                    <div className="scan-selected-count">{selectedScanTokens.length}</div>
                  </div>
                  {selectedScanTokens.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedScanTokens([])}
                      style={{
                        background: 'transparent',
                        border: '1px solid rgba(212, 106, 132, 0.25)',
                        color: '#d46a84',
                        padding: '6px 10px',
                        borderRadius: '999px',
                        fontSize: '11px',
                        cursor: 'pointer'
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>

                {selectedScanTokens.length === 0 ? (
                  <div className="scan-selected-empty">No tokens selected.</div>
                ) : (
                  <div className="scan-selected-list">
                    {selectedScanTokens.map((t) => (
                      <div key={t.symbol} className="scan-selected-item">
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ fontWeight: 700, color: '#fff', fontSize: '13px' }}>{t.symbol}</div>
                            <div style={{ fontSize: '11px', color: t.action === 'SELL' ? '#ff4d4d' : '#4caf50', fontWeight: 700 }}>
                              {t.action || '-'}
                            </div>
                          </div>
                          <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>Price: {t.price ?? '-'}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              const url = buildMexcUrl(t.symbol)
                              window.open(url, '_blank')
                            }}
                            style={{
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.08)',
                              color: '#d0c4d8',
                              padding: '6px 10px',
                              borderRadius: '10px',
                              fontSize: '11px',
                              cursor: 'pointer'
                            }}
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSelectedScanToken(t.symbol)}
                            style={{
                              background: 'transparent',
                              border: '1px solid rgba(255,255,255,0.08)',
                              color: '#aaa',
                              padding: '6px',
                              borderRadius: '10px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            aria-label={`Remove ${t.symbol}`}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'indicator' && <IndicatorAnalyzer />}

        {activeTab === 'trading' && (
          <div>
            <label>
              Symbol
              <SymbolSearch value={symbol} onChange={setSymbol} />
            </label>

            <label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                Strategy
                <div className="tooltip-container">
                  <Info size={14} className="info-icon" />
                  <div className="tooltip-text">
                    {strategiesList.find(s => s.id === strategy)?.description || 'Select a strategy to see description'}
                  </div>
                </div>
              </div>
              <select value={strategy} onChange={e => setStrategy(e.target.value)}>
                {strategiesList.length > 0 ? strategiesList.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                )) : (
                  <>
                    <option value="trend-following">Trend Following (Safe)</option>
                    <option value="vwap-scalping">VWAP Scalping</option>
                    <option value="ema-crossover">EMA Crossover (Simple)</option>
                  </>
                )}
              </select>
            </label>

            {(strategy === 'volatility-swing' || strategy === 'rsi-ema-volatility') && (
              <label style={{ marginTop: '10px' }}>
                Volatility Threshold (%)
                <input 
                  type="number" 
                  value={volatilityThreshold} 
                  onChange={e => setVolatilityThreshold(e.target.value)} 
                  step="1" 
                />
              </label>
            )}

            {strategy === 'rsi-ema-volatility' && (
              <label style={{ marginTop: '10px' }}>
                RSI Candle
                <select value={rsiInterval} onChange={e => setRsiInterval(e.target.value)}>
                  <option value="1m">1 Minute</option>
                  <option value="5m">5 Minutes</option>
                  <option value="15m">15 Minutes</option>
                  <option value="30m">30 Minutes</option>
                  <option value="1h">1 Hour</option>
                  <option value="4h">4 Hours</option>
                </select>
              </label>
            )}

            <div style={{ margin: '15px 0' }}>
              <label style={{ margin: '0 0 8px 0' }}>
                Candle Timeframe
              </label>
              <select value={candleInterval} onChange={e => setCandleInterval(e.target.value)}>
                <option value="1m">1 Minute</option>
                <option value="5m">5 Minutes</option>
                <option value="15m">15 Minutes</option>
                <option value="30m">30 Minutes</option>
                <option value="1h">1 Hour</option>
                <option value="4h">4 Hours</option>
                <option value="8h">8 Hours</option>
                <option value="1d">1 Day</option>
                <option value="1w">1 Week</option>
                <option value="1M">1 Month</option>
              </select>
            </div>

            <label>
              Position Size (USDT)
              <input type="number" value={vol} onChange={e => setVol(e.target.value)} step="1" />
            </label>

            <label>
              Take Profit (%) 
              <input type="number" value={tpPct} onChange={e => setTpPct(e.target.value)} step="0.1" />
            </label>
            
            <label>
              Stop Loss (%)
              <input type="number" value={slPct} onChange={e => setSlPct(e.target.value)} step="0.001" />
            </label>

            <div style={{ margin: '15px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input 
                type="checkbox" 
                id="auto-sell" 
                checked={autoSell} 
                onChange={e => setAutoSell(e.target.checked)} 
                style={{ width: 'auto', margin: 0 }}
              />
              <label htmlFor="auto-sell" style={{ margin: 0, fontWeight: 'normal', cursor: 'pointer' }}>
                Auto Sell (Strategy Exit)
              </label>
            </div>

            <div style={{ margin: '15px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input 
                type="checkbox" 
                id="paper-trading" 
                checked={isPaperTrading} 
                onChange={e => {
                  if (marketType === 'futures') return
                  setIsPaperTrading(e.target.checked)
                }} 
                disabled={marketType === 'futures'}
                style={{ width: 'auto', margin: 0, opacity: marketType === 'futures' ? 0.5 : 1 }}
              />
              <label htmlFor="paper-trading" style={{ margin: 0, fontWeight: 'normal', cursor: marketType === 'futures' ? 'not-allowed' : 'pointer', color: marketType === 'futures' ? '#aaa' : 'inherit' }}>
                Test Mode (Paper Trading) - No real orders {marketType === 'futures' && '(Required for Futures)'}
              </label>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={startBot} className="btn-primary">Start Trading</button>
              <button onClick={() => stopBot(activeBot?.id)} className="btn-primary btn-stop" disabled={!activeBot}>
                Stop Bot {activeBot ? `(${activeBot.symbol})` : ''}
              </button>
            </div>

            <h2>Positions</h2>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>ID</th><th>Symbol</th><th>Strategy</th><th>Entry</th><th>Current</th><th>EMA 9</th><th>Vol</th><th>TP</th><th>SL</th><th>PNL</th><th>ROI %</th><th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map(p => (
                    <tr 
                      key={p.id} 
                      onClick={(e) => {
                        if (e.ctrlKey || e.metaKey) {
                          const url = buildMexcUrl(p.symbol)
                          window.open(url, '_blank')
                          return
                        }
                        handleRowClick(e, p.id)
                      }}
                      onAuxClick={(e) => {
                        if (e.button === 1) {
                          const url = buildMexcUrl(p.symbol)
                          window.open(url, '_blank')
                        }
                      }}
                      onContextMenu={(e) => handlePositionContextMenu(e, p)}
                      onDoubleClick={() => handleRowDoubleClick(p.symbol)}
                      onMouseDown={() => handleRowMouseDown(p)}
                      onMouseUp={handleRowMouseUp}
                      onMouseLeave={handleRowMouseUp}
                      onTouchStart={() => handleRowMouseDown(p)}
                      onTouchEnd={handleRowMouseUp}
                      style={{ 
                        cursor: 'pointer',
                        backgroundColor: selectedPositionIds.has(p.id) ? 'rgba(255, 255, 255, 0.1)' : 'transparent' 
                      }}
                    >
                      <td>{p.id}</td>
                      <td>
                        <a 
                          href={buildMexcUrl(p.symbol)} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{ color: '#fff', textDecoration: 'underline' }}
                          onClick={e => e.stopPropagation()}
                        >
                          {p.symbol}
                        </a>
                      </td>
                      <td>{p.strategy}</td>
                      <td>{p.entry}</td>
                      <td>{p.current}</td>
                      <td>{p.ema9 ? Number(p.ema9).toFixed(6) : '-'}</td>
                      <td>{p.vol}</td>
                      <td>{p.tp ? Number(p.tp).toFixed(6) : <span style={{color: '#666'}}>Off</span>}</td>
                      <td>{p.sl ? Number(p.sl).toFixed(6) : <span style={{color: '#666'}}>Off</span>}</td>
                      <td>{p.pnl?.toFixed ? p.pnl.toFixed(6) : p.pnl}</td>
                      <td>{p.roi?.toFixed ? p.roi.toFixed(4) : p.roi}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {!p.side && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); manualBuy(p.id) }}
                              style={{
                                padding: '4px 8px',
                                fontSize: '12px',
                                background: '#2196f3',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                            >
                              Buy
                            </button>
                          )}
                          {p.side && (
                            <>
                              <button 
                                onClick={() => manualSell(p.id)}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '12px',
                                  background: '#ff4d4d',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer'
                                }}
                              >
                                Sell
                              </button>
                              <input 
                                type="checkbox" 
                                checked={!!p.autoSell}
                                onChange={(e) => toggleAutoSell(p.id, e.target.checked)}
                                title="Toggle Auto Sell (Strategy Only - TP/SL always active)"
                                onClick={(e) => e.stopPropagation()}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                              />
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div>
            <h2>Position History</h2>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: '15px',
              padding: '15px',
              background: '#161822',
              borderRadius: '8px',
              border: '1px solid #2a2d3d'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: '#888', fontSize: '14px' }}>Filter by Strategy:</span>
                <select 
                  value={historyStrategyFilter} 
                  onChange={(e) => {
                    setHistoryStrategyFilter(e.target.value)
                    setPosHistoryPage(1)
                  }}
                  style={{ 
                    padding: '8px 12px', 
                    borderRadius: '4px', 
                    background: '#1e2030', 
                    color: 'white', 
                    border: '1px solid #333',
                    minWidth: '200px'
                  }}
                >
                  <option value="All">All Strategies</option>
                  {strategiesList.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button 
                  onClick={handleBulkDelete}
                  style={{ 
                    padding: '8px 12px', 
                    borderRadius: '4px', 
                    background: '#1e2030', 
                    color: '#d46a84', 
                    border: '1px solid #333',
                    cursor: 'pointer'
                  }}
                >
                  Remove All History
                </button>
              </div>
              
              <div style={{ 
                display: 'flex', 
                gap: '30px', 
                fontSize: '15px', 
                alignItems: 'center'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: '#888', fontSize: '12px', marginBottom: '2px' }}>Total PnL</span>
                  <span style={{ color: historyStats.totalPnl >= 0 ? '#4caf50' : '#ff4d4d', fontWeight: 'bold' }}>
                    {historyStats.totalPnl.toFixed(4)} USDT
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: '#888', fontSize: '12px', marginBottom: '2px' }}>Wins</span>
                  <span style={{ color: '#4caf50', fontWeight: 'bold' }}>{historyStats.wins}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: '#888', fontSize: '12px', marginBottom: '2px' }}>Losses</span>
                  <span style={{ color: '#ff4d4d', fontWeight: 'bold' }}>{historyStats.losses}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: '#888', fontSize: '12px', marginBottom: '2px' }}>Win Rate</span>
                  <span style={{ fontWeight: 'bold' }}>{winRate}%</span>
                </div>
              </div>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Spot</th><th>Strategy</th><th>Open Time</th><th>Close Time</th><th>Avg Entry Price</th><th>Avg Close Price</th><th>Direction</th><th>Closing Quantity</th><th>Realised PNL</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPosHistory
                    .slice((posHistoryPage - 1) * posHistoryLimit, posHistoryPage * posHistoryLimit)
                    .map((p, i) => {
                      const absIndex = (posHistoryPage - 1) * posHistoryLimit + i
                      return (
                        <tr 
                          key={absIndex}
                          onClick={(e) => handleHistoryRowClick(e, absIndex)}
                          onContextMenu={(e) => handleHistoryContextMenu(e, p)}
                          style={{ 
                            cursor: 'pointer',
                            backgroundColor: selectedHistoryIndices.has(absIndex) ? 'rgba(255, 255, 255, 0.1)' : 'transparent' 
                          }}
                        >
                          <td>{p.symbol} Spot</td>
                          <td>{p.strategy}</td>
                          <td>{p.openTime ? new Date(p.openTime).toLocaleString() : ''}</td>
                          <td>{p.closeTime ? new Date(p.closeTime).toLocaleString() : ''}</td>
                          <td>{p.entryPrice}</td>
                          <td>{p.closePrice}</td>
                          <td>{p.direction}</td>
                          <td>{p.closingQuantity} {p.baseCoin}</td>
                          <td>{p.realizedPnl} {p.realizedRoi ? `(${Number(p.realizedRoi).toFixed(2)}%)` : ''}</td>
                          <td>{p.status}</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
            <Pagination 
              currentPage={posHistoryPage}
              totalItems={filteredPosHistory.length}
              pageSize={posHistoryLimit}
              onPageChange={setPosHistoryPage}
              onPageSizeChange={setPosHistoryLimit}
            />

            <h2>Order History</h2>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Time</th><th>Bot</th><th>Symbol</th><th>Side</th><th>Price</th><th>Vol</th><th>Status</th><th>Event</th><th>PNL</th><th>ROI %</th>
                  </tr>
                </thead>
                <tbody>
                  {history
                    .slice((historyPage - 1) * historyLimit, historyPage * historyLimit)
                    .map((h, i) => {
                      const absIndex = (historyPage - 1) * historyLimit + i
                      return (
                        <tr 
                          key={absIndex}
                          onClick={(e) => handleOrderRowClick(e, absIndex)}
                          style={{ 
                            cursor: 'pointer',
                            backgroundColor: selectedOrderIndices.has(absIndex) ? 'rgba(255, 255, 255, 0.1)' : 'transparent' 
                          }}
                        >
                          <td>{new Date(h.time).toLocaleString()}</td>
                          <td>{h.botId}</td>
                          <td>{h.symbol}</td>
                          <td>{h.side}</td>
                          <td>{h.price}</td>
                          <td>{h.vol}</td>
                          <td>{h.status}</td>
                          <td>{h.event}</td>
                          <td>{h.pnl}</td>
                          <td>{h.roi}</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
            <Pagination 
              currentPage={historyPage}
              totalItems={history.length}
              pageSize={historyLimit}
              onPageChange={setHistoryPage}
              onPageSizeChange={setHistoryLimit}
            />
          </div>
        )}
      </div>
      {editingPosition && (
        <EditPositionModal 
          position={editingPosition} 
          onClose={() => setEditingPosition(null)} 
          onSave={handleTpSlUpdate} 
        />
      )}
    </div>
  )
}
