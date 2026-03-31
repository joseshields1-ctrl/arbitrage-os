# Arbitrage OS Backend

Node + Express backend with SQLite persistence for Arbitrage OS.

## Production variables

Set these environment variables in your backend host:

- `PORT` (default `3000`)
- `OPENAI_API_KEY` (optional; assistant falls back to safe mock when missing)
- `CORS_ALLOWED_ORIGINS` (required in production, comma-separated origins)
- `SQLITE_DB_PATH` (required in production when using a persistent disk)

Example:

```bash
PORT=3000
OPENAI_API_KEY=...
CORS_ALLOWED_ORIGINS=https://specialty-sniper.vercel.app
SQLITE_DB_PATH=/var/data/arbitrage-os.db
```

## Local run

```bash
npm install
npm run dev
```

Server starts on `http://localhost:3000`.

