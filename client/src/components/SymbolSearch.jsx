import { useState, useEffect, useRef } from 'react'

export default function SymbolSearch({ value, onChange }) {
  const [query, setQuery] = useState(value || '')
  const [contracts, setContracts] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef(null)

  useEffect(() => {
    fetch('/api/contracts')
      .then(res => res.json())
      .then(data => setContracts(data))
      .catch(() => {})
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const filtered = contracts.filter(c => c.symbol.includes(query.toUpperCase())).slice(0, 100)

  const handleSelect = (symbol, e) => {
    e.preventDefault()
    e.stopPropagation()
    setQuery(symbol)
    onChange(symbol)
    setIsOpen(false)
  }

  const handleInput = (e) => {
    const val = e.target.value.toUpperCase()
    setQuery(val)
    onChange(val)
    setIsOpen(true)
  }

  return (
    <div className="dropdown-wrapper" ref={wrapperRef}>
      <input 
        type="text" 
        value={query}
        onChange={handleInput}
        onFocus={() => setIsOpen(true)}
        placeholder="e.g. BTCUSDT" 
        autoComplete="off" 
      />
      {isOpen && filtered.length > 0 && (
        <div className="dropdown-list" style={{ display: 'block' }}>
          {filtered.map(c => (
            <div 
              key={c.symbol} 
              className="dropdown-item" 
              onClick={(e) => handleSelect(c.symbol, e)}
            >
              {c.baseCoin || c.symbol}/{c.quoteCoin || ''}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
