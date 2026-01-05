import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// .env is in server root, which is ../.env relative to this file (server/src/env.js)
dotenv.config({ path: path.join(__dirname, '../.env') })
