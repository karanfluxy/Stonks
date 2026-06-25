# Stonks Deployment Guide (Vercel)

## 1) Prerequisites
- A Vercel account connected to your Git provider.
- A production MySQL database reachable from Vercel.
- API keys for Firebase, News API, Finnhub, Twelve Data, and Gemini.

## 2) Prepare Environment Variables
Use `.env.example` as the source of truth and add these in Vercel Project Settings > Environment Variables.

Required groups:
- Database: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`
- Auth: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- Firebase client: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- Firebase admin: `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`
- Providers: `GEMINI_API_KEY`, `NEWS_API_KEY`, `FINNHUB_API_KEY`, `TWELVE_DATA_API_KEY`

Recommended for Vercel:
- `NEWS_FINBERT_ENABLED=0`
- `NEWS_FINBERT_ON_VERCEL=0`

## 3) Push and Import to Vercel
1. Push your repository to GitHub/GitLab/Bitbucket.
2. In Vercel: Add New Project > Import repository.
3. Framework preset: Next.js (auto-detected).
4. Root directory: `stonks` (if your repo root contains a nested `stonks` folder).
5. Build command: `pnpm build` (or leave default).
6. Install command: `pnpm install`.

## 4) Deploy
- Click Deploy.
- After first deploy, verify these routes:
  - `/dashboard`
  - `/dashboard/stocks`
  - `/api/market/stocks`
  - `/api/news/realtime`

## 5) Notes About Python-Based Features
Vercel serverless functions do not reliably support this app's local Python child-process flow. The app is prepared to degrade gracefully:
- `/api/market/predict` falls back to an in-process heuristic predictor on Vercel.
- FinBERT enrichment in news is skipped by default on Vercel unless explicitly enabled.

If you need full Python model inference in production, run a separate Python service and set:
- `PY_AI_SERVICE_URL`
- `PY_AI_SERVICE_TIMEOUT_MS`

## 6) Optional Vercel CLI Flow
```bash
pnpm install
pnpm build
npx vercel
npx vercel --prod
```

## 7) Troubleshooting
- 500 on auth routes: verify JWT and Firebase admin variables.
- DB connection errors: verify host/port/user/password and DB network access.
- Empty market/news data: verify provider keys and daily limits.

## 8) Running the Local ML Service

This project includes a Python FastAPI microservice for end-of-day stock predictions (`/predict/eod`), keeping heavy ML dependencies separate from Node.js.

### Setup
1. Open a terminal and navigate to the `ml_service` folder.
2. (Optional) Create a virtual environment: `python -m venv venv` and activate it (e.g. `venv\Scripts\activate`).
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### Running
Start the Python service on port 8001:
```bash
cd ml_service
uvicorn app.main:app --port 8001 --reload
```
Next.js API routes (like `/api/predict/eod`) are configured to automatically forward requests to `http://127.0.0.1:8001`.

### Testing
Once both Next.js (`npm run dev`) and the ML service are running, you can test the prediction API:
```bash
curl -X POST http://localhost:3000/api/predict/eod \
  -H "Content-Type: application/json" \
  -d "{\"ticker\":\"AAPL\"}"
```
