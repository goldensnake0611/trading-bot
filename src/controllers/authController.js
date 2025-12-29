export function login(req, res) {
  const { username, password } = req.body
  const adminUser = process.env.ADMIN_USER || 'admin'
  const adminPass = process.env.ADMIN_PASS || 'admin123'
  
  if (username === adminUser && password === adminPass) {
    req.session.authenticated = true
    return res.json({ success: true })
  }
  return res.status(401).json({ error: 'Invalid credentials' })
}

export function logout(req, res) {
  req.session.destroy()
  res.json({ success: true })
}
