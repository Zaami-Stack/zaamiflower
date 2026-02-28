# Full-Stack Flower Shop (Free Stack)

A complete full-stack flower shop project built with only free tools.
It is prepared for single-service free deployment on Render.

- Frontend: React + Vite
- Backend: Node.js + Express
- Data: Local JSON file (no paid database)

## Features

- Browse flower catalog
- Search and filter by occasion/price
- Add items to cart
- Place orders (stock updates automatically)
- Add new flowers from an admin form
- View recent orders

## Project Structure

```text
.
|- client/   # React frontend
|- server/   # Express backend
`- package.json
```

## Prerequisites

- Node.js 18+
- npm 9+

## Quick Start

1. Install root tooling:

```bash
npm install
```

2. Install app dependencies:

```bash
npm run install:all
```

3. Run both frontend and backend in development:

```bash
npm run dev
```

4. Open:

- Frontend: http://localhost:5173
- Backend API: http://localhost:4000/api/health

## Free Online Deployment (Render)

`render.yaml` is included, so the project is ready for deployment.

1. Push this folder to a GitHub repository.
2. In Render, choose `New +` -> `Blueprint`.
3. Select your GitHub repo and deploy.
4. After deploy completes, open your Render URL.

Render will run:

- Build: `npm install && npm run install:all && npm run build`
- Start: `npm start`

Health check endpoint:

- `/api/health`

## Environment Variables

### Server (`server/.env`)

```bash
PORT=4000
```

### Client (`client/.env`)

```bash
VITE_API_URL=/api
```

If `VITE_API_URL` is omitted, the client defaults to `/api` and uses Vite proxy.

## API Endpoints

- `GET /api/health`
- `GET /api/flowers?search=&occasion=&maxPrice=`
- `POST /api/flowers`
- `GET /api/orders`
- `POST /api/orders`

## Notes

- Data is stored in `server/src/data/store.json`.
- On free hosting, file-based data may reset when the service restarts or redeploys.
- For persistent production data, connect a free hosted database.
