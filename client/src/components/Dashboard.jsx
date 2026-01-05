import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Info, X } from 'lucide-react'
import SymbolSearch from './SymbolSearch'
import Pagination from './Pagination'

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
  const [balance, setBalance] = useState('Loading...')
  const [dailyPnl, setDailyPnl] = useState(0)
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
  const [historyStrategyFilter, setHistoryStrategyFilter] = useState('All')
  const [vol, setVol] = useState(10)
  const [tpPct, setTpPct] = useState(1)
  const [slPct, setSlPct] = useState(0.5)
  const [autoSell, setAutoSell] = useState(true)
  const [isPaperTrading, setIsPaperTrading] = useState(false)
  const [editingPosition, setEditingPosition] = useState(null)
  const longPressTimer = useRef(null)

  // Notification State
  const [showNotification, setShowNotification] = useState(false)
  const [lastLogTime, setLastLogTime] = useState(null)
  const notificationTimer = useRef(null)

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
  }, [systemLogs])

  useEffect(() => {
    checkBalance()
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

  async function refreshSystemLogs() {
    try {
      const res = await fetch('/api/logs')
      if (res.ok) {
        setSystemLogs(await res.json())
      }
    } catch(e) {}
  }

  async function fetchStrategies() {
    try {
      const res = await fetch('/api/strategies')
      if (res.ok) {
        setStrategiesList(await res.json())
      }
    } catch (e) { console.error(e) }
  }

  async function checkBalance() {
    setBalance('Checking...')
    try {
      const res = await fetch('/api/balance')
      if (!res.ok) {
        const err = await res.json()
        setBalance('Error: ' + (err.msg || err.error || res.statusText))
        return
      }
      const data = await res.json()
      if (data.length === 0) setBalance('No funds found.')
      else setBalance(data.map(b => `${b.asset}: ${b.free}`).join(', '))
    } catch {
      setBalance('Network Error')
    }
  }

  async function refreshTrading() {
    try {
      const sRes = await fetch('/api/status')
      setStatus(await sRes.json())
      const pRes = await fetch('/api/positions')
      setPositions(await pRes.json())
      const stRes = await fetch('/api/stats')
      if (stRes.ok) {
        const stats = await stRes.json()
        setDailyPnl(stats.dailyPnl)
      }
    } catch(e) {}
  }

  async function refreshHistory() {
    try {
      const hRes = await fetch('/api/history')
      const hData = await hRes.json()
      setHistory(hData.sort((a,b) => b.time - a.time))
      
      const phRes = await fetch('/api/positions_history')
      setPosHistory(await phRes.json())
    } catch(e) {}
  }

  async function startBot() {
    if (!symbol) return alert('Please select a symbol')
    await fetch('/api/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, vol, tpPct, slPct, strategy, autoSell, isPaperTrading })
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
    } catch (e) {
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

  function handleRowDoubleClick(symbol) {
    const formatted = symbol.endsWith('USDT') ? symbol.replace(/USDT$/, '_USDT') : symbol
    window.open(`https://www.mexc.com/exchange/${formatted}`, '_blank')
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

  return (
    <div className="container">
      <div className="card">
        <div className="header">
          <h1>MEXC Spot Trading Bot v2.0</h1>
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

        <div className="balance-box">
          <div><strong>Balance:</strong> {balance}</div>
          <div style={{ marginLeft: '20px', color: dailyPnl >= 0 ? '#4caf50' : '#ff4d4d' }}>
            <strong>Today's PnL:</strong> {dailyPnl ? dailyPnl.toFixed(4) : '0.0000'} USDT
          </div>
          <button 
            onClick={checkBalance} 
            style={{background: 'rgba(255,255,255,0.05)', color: '#d46a84', padding: '6px 14px', fontSize: '12px', borderRadius: '100px', margin: 0, boxShadow: 'none', border: '1px solid rgba(212, 106, 132, 0.2)', cursor: 'pointer'}}
          >
            Refresh
          </button>
        </div>

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
        </div>

        {activeTab === 'trading' ? (
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
                    <option value="rsi-ema-pullback">RSI + EMA Pullback</option>
                    <option value="vwap-scalping">VWAP Scalping</option>
                    <option value="dca">DCA (Dollar Cost Averaging)</option>
                    <option value="ema-crossover">EMA Crossover (Simple)</option>
                  </>
                )}
              </select>
            </label>

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
                onChange={e => setIsPaperTrading(e.target.checked)} 
                style={{ width: 'auto', margin: 0 }}
              />
              <label htmlFor="paper-trading" style={{ margin: 0, fontWeight: 'normal', cursor: 'pointer' }}>
                Test Mode (Paper Trading) - No real orders
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
                    <th>ID</th><th>Symbol</th><th>Strategy</th><th>Entry</th><th>Current</th><th>Vol</th><th>TP</th><th>SL</th><th>PNL</th><th>ROI %</th><th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map(p => (
                    <tr 
                      key={p.id} 
                      onClick={(e) => handleRowClick(e, p.id)}
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
                      <td>{p.symbol}</td>
                      <td>{p.strategy}</td>
                      <td>{p.entry}</td>
                      <td>{p.current}</td>
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
        ) : (
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
