# License Backend (Node.js + MongoDB + node-cron)

## 1) Install backend dependencies

```bash
cd backend-node
npm install
```

## 2) Configure env

Copy `.env.example` to `.env` and update values if needed:

- `MONGODB_URI` should point to your local MongoDB (Compass local instance)
- `CORS_ORIGIN` should match your React app URL

## 3) Run backend

```bash
npm run dev
```

Backend runs on `http://localhost:5000` by default.

## 4) Run frontend

From project root:

```bash
npm start
```

## API

- `GET /api/licenses/:scopeId/status` -> returns current status
- `POST /api/licenses/:scopeId/activate` body `{ "days": 2 }`
- `POST /api/licenses/:scopeId/expire`

Cron job runs every minute and automatically marks expired licenses.
