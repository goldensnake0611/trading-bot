# MEXC Futures Trading Bot

A simple auto-trading bot with a web UI built using Node and vanilla HTML. It trades MEXC futures contracts using an EMA crossover + ATR-based risk guard, with configurable position size, leverage, TP, and SL.

## Requirements
- Node.js 18+
- MEXC Futures API key and secret

## Setup
1. Install dependencies:
   ```bash
   cd trading-bot
   npm install
   ```
2. Configure environment:
   - Edit `trading-bot/.env`:
     ```
     MEXC_API_KEY=your_access_key
     MEXC_API_SECRET=your_secret_key
     PORT=4000
     ```
3. Start server:
   ```bash
   node server.js
   ```
4. Open the UI: `http://localhost:4000/`
   - You can leave API Key/Secret fields empty to use values from `.env`.

## Strategy
- Signals: EMA(20) vs EMA(50)
  - Long when EMA(20) > EMA(50) and price above EMA(20)
  - Short when EMA(20) < EMA(50) and price below EMA(20)
- Volatility: ATR(14) calculated; TP/SL applied as user-set percentages from entry
- Position: user-defined `vol` (contract size), `leverage` applied
- Direction override: `auto`, `long`, `short`
- Tick interval: every 10 seconds

## UI Controls
- Symbol (e.g., `BTC_USDT`)
- Direction (`auto|long|short`)
- Position size (`vol`)
- Leverage
- Take Profit (`tpPct`, e.g., `0.01` = 1%)
- Stop Loss (`slPct`, e.g., `0.005` = 0.5%)
- Start / Stop buttons

## API
- `POST /api/start`
  - Body:
    ```json
    {
      "apiKey": "optional-if-.env",
      "apiSecret": "optional-if-.env",
      "symbol": "BTC_USDT",
      "vol": 1,
      "leverage": 5,
      "tpPct": 0.01,
      "slPct": 0.005,
      "direction": "auto"
    }
    ```
  - Response: `{ "id": "bot-id" }`
- `POST /api/stop`
  - Body: `{ "id": "bot-id" }`
  - Response: `{ "stopped": true }`
- `GET /api/status`
  - Returns list of running bots and latest order info

## Notes
- Use small sizes initially; futures are high-risk.
- Keys are read from `.env` or provided per request; they are not persisted to disk by the server.
- This bot is for educational purposes; not financial advice.

## Folder Structure
- `server.js` — Express server, strategy engine, MEXC client
- `frontend/index.html` — Web UI
- `.env` — API keys and `PORT`
- `.gitignore` — ignores `node_modules`, `.env`, and artifacts
