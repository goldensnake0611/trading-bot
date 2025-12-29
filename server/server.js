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

// Serve static frontend assets
app.use(express.static(path.join(__dirname, '../client/dist')))

// API Routes
app.use('/api', apiRoutes)

// React SPA - Fallback to index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist', 'index.html'))
})

// Start Server
app.listen(port, () => console.log(`Trading Bot Server listening on port ${port}`))
