import express from 'express'
import path from 'path'
import dotenv from 'dotenv'
import session from 'express-session'
import { fileURLToPath } from 'url'
import apiRoutes from './src/routes/apiRoutes.js'

// Setup environment
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '.env') })

const app = express()
const port = process.env.PORT || 4000

// Middleware
app.use(express.json())
app.use(session({
  secret: process.env.SESSION_SECRET || 'trading_bot_secure_secret_99',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}))

// Serve static frontend assets (but do not automatically serve index.html on root)
app.use(express.static(path.join(__dirname, 'frontend'), { index: false }))

// API Routes
app.use('/api', apiRoutes)

// Root Route - Serve Login or Dashboard
app.get('/', (req, res) => {
  if (req.session.authenticated) {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'))
  } else {
    res.sendFile(path.join(__dirname, 'frontend', 'login.html'))
  }
})

// Start Server
app.listen(port, () => console.log(`Trading Bot Server listening on port ${port}`))
