import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Info } from 'lucide-react'
import SymbolSearch from './SymbolSearch'

export default function Dashboard() {
  const { logout } = useAuth()
  const [activeTab, setActiveTab] = useState('trading')
  const [balance, setBalance] = useState('Loading...')
  const [status, setStatus] = useState([])
  const [positions, setPositions] = useState([])
  const [history, setHistory] = useState([])
  const [posHistory, setPosHistory] = useState([])
  const [strategiesList, setStrategiesList] = useState([])
  const [systemLogs, setSystemLogs] = useState([])
  
  // Form State
  const [symbol, setSymbol] = useState('')
  const [strategy, setStrategy] = useState('trend-following')
  const [vol, setVol] = useState(1)
  const [tpPct, setTpPct] = useState(1)
  const [slPct, setSlPct] = useState(0.5)

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
      body: JSON.stringify({ symbol, vol, tpPct, slPct, strategy })
    })
    refreshTrading()
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

  // Helper to find active bot ID for current symbol (simplified)
  // In reality user might run multiple bots.
  // For the UI buttons "Stop Bot", we need to know which one.
  // The original UI just had a global "stop" that stopped "botId".
  // Let's improve: The "Stop Bot" button will stop the bot for the *selected symbol* if it exists.
  const activeBot = status.find(b => b.symbol === symbol)

  return (
    <div className="container">
      <div className="card">
        <div className="header">
          <h1>MEXC Spot Trading Bot v2.0</h1>
          <button onClick={logout} className="logout-btn">Logout</button>
        </div>
        
        {systemLogs.length > 0 && (
          <div style={{ marginBottom: '20px', padding: '10px', background: 'rgba(212, 106, 132, 0.1)', border: '1px solid rgba(212, 106, 132, 0.3)', borderRadius: '8px', color: '#ffb3c1' }}>
            <strong>System Notification:</strong> {systemLogs[0].message} <small>({new Date(systemLogs[0].time).toLocaleTimeString()})</small>
          </div>
        )}

        <div className="balance-box">
          <div><strong>Balance:</strong> {balance}</div>
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
              Position Size (Base Asset Qty)
              <input type="number" value={vol} onChange={e => setVol(e.target.value)} step="0.0001" />
            </label>

            <label>
              Take Profit (%) 
              <input type="number" value={tpPct} onChange={e => setTpPct(e.target.value)} step="0.1" />
            </label>
            
            <label>
              Stop Loss (%)
              <input type="number" value={slPct} onChange={e => setSlPct(e.target.value)} step="0.001" />
            </label>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={startBot} className="btn-primary">Start Trading</button>
              <button onClick={() => stopBot(activeBot?.id)} className="btn-primary btn-stop" disabled={!activeBot}>
                Stop Bot {activeBot ? `(${activeBot.symbol})` : ''}
              </button>
            </div>

            <h2>Status</h2>
            <pre>{JSON.stringify(status, null, 2)}</pre>

            <h2>Positions</h2>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>ID</th><th>Symbol</th><th>Side</th><th>Entry</th><th>Current</th><th>Vol</th><th>TP</th><th>SL</th><th>PNL</th><th>ROI %</th><th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map(p => (
                    <tr key={p.id}>
                      <td>{p.id}</td>
                      <td>{p.symbol}</td>
                      <td>{p.side}</td>
                      <td>{p.entry}</td>
                      <td>{p.current}</td>
                      <td>{p.vol}</td>
                      <td>{p.tp}</td>
                      <td>{p.sl}</td>
                      <td>{p.pnl?.toFixed ? p.pnl.toFixed(6) : p.pnl}</td>
                      <td>{p.roi?.toFixed ? p.roi.toFixed(4) : p.roi}</td>
                      <td>
                        {p.side && (
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
                        )}
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
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Spot</th><th>Open Time</th><th>Close Time</th><th>Avg Entry Price</th><th>Avg Close Price</th><th>Direction</th><th>Closing Quantity</th><th>Realised PNL</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {posHistory.map((p, i) => (
                    <tr key={i}>
                      <td>{p.symbol} Spot</td>
                      <td>{p.openTime ? new Date(p.openTime).toLocaleString() : ''}</td>
                      <td>{p.closeTime ? new Date(p.closeTime).toLocaleString() : ''}</td>
                      <td>{p.entryPrice}</td>
                      <td>{p.closePrice}</td>
                      <td>{p.direction}</td>
                      <td>{p.closingQuantity} {p.baseCoin}</td>
                      <td>{p.realizedPnl} {p.realizedRoi ? `(${Number(p.realizedRoi).toFixed(2)}%)` : ''}</td>
                      <td>{p.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2>Order History</h2>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Time</th><th>Bot</th><th>Symbol</th><th>Side</th><th>Price</th><th>Vol</th><th>Status</th><th>Event</th><th>PNL</th><th>ROI %</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={i}>
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
