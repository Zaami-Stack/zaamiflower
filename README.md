# Full-Stack Flower Shop (Free Deploy)

Deploy-ready flower shop project with:

- Frontend: React + Vite
- API: Node serverless functions (`/api/*`)
- Local dev backend: Express (`server/`)

## Quick Start (Local)

```bash
npm install
npm run install:all
npm run dev
```

Open:

- Frontend: `http://localhost:5173`
- Local API health: `http://localhost:4000/api/health`

## Deploy Online Free (No Render Card Flow)

This repo is configured for **Vercel** with `vercel.json`.

1. Push to GitHub (already done in your repo `zaamiflower`).
2. Go to Vercel and import the GitHub repo.
3. Click Deploy (no extra config needed).

Vercel uses:

- Install: `npm install && npm install --prefix client`
- Build: `npm run build --prefix client`
- Output: `client/dist`
- API functions: `api/*.js`

## API Endpoints

- `GET /api/health`
- `GET /api/flowers?search=&occasion=&maxPrice=`
- `POST /api/flowers`
- `GET /api/orders`
- `POST /api/orders`

## Important Free-Tier Note

The Vercel API store is in-memory (`api/_store.js`), so data can reset on cold starts/redeploys.
For persistent data, connect a free hosted database.
