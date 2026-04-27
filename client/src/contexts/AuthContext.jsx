import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(null) // null = loading
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAuth()
  }, [])

  async function checkAuth() {
    try {
      const res = await fetch('/api/check-auth')
      if (res.ok) {
        setIsAuthenticated(true)
      } else {
        setIsAuthenticated(false)
      }
    } catch {
      setIsAuthenticated(false)
    } finally {
      setLoading(false)
    }
  }

  async function login(username, password) {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    if (res.ok) {
      setIsAuthenticated(true)
      return true
    }
    return false
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST' })
    setIsAuthenticated(false)
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
