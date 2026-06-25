import { NextResponse } from 'next/server';

const AI_SERVICE_URL = process.env.PY_AI_SERVICE_URL || 'http://127.0.0.1:8001';
const AI_SERVICE_TIMEOUT_MS = Number(process.env.PY_AI_SERVICE_TIMEOUT_MS || 6000);

function clampConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

function confidenceFromDeltaPct(deltaPct) {
  const n = Math.abs(Number(deltaPct || 0));
  if (!Number.isFinite(n)) return 0.52;
  // Keep confidence conservative for heuristic fallback.
  return Math.max(0.52, Math.min(0.9, 0.52 + n / 25));
}

async function buildFallbackSignal(ticker, origin) {
  // Fallback 1: history + internal prediction API.
  try {
    const historyRes = await fetch(
      `${origin}/api/market/history?symbol=${encodeURIComponent(ticker)}&source=yahoo&range=3mo&interval=1day&outputsize=50`,
      { cache: 'no-store' }
    );
    const historyJson = await historyRes.json().catch(() => ({}));

    const ohlc = Array.isArray(historyJson?.ohlc) ? historyJson.ohlc : [];
    const closes50 = ohlc
      .map((p) => Number(p?.close))
      .filter((v) => Number.isFinite(v))
      .slice(-50);

    if (closes50.length >= 50) {
      const current = closes50[closes50.length - 1];
      const predictRes = await fetch(`${origin}/api/market/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closes: closes50 }),
        cache: 'no-store',
      });
      const predictJson = await predictRes.json().catch(() => ({}));
      const predicted = Number(predictJson?.predicted);

      if (Number.isFinite(predicted) && Number.isFinite(current) && current > 0) {
        const deltaPct = ((predicted - current) / current) * 100;
        const label = predicted >= current ? 'BUY' : 'SELL';
        return {
          ticker,
          prediction: label === 'BUY' ? 1 : 0,
          label,
          confidence: confidenceFromDeltaPct(deltaPct),
          timestamp: new Date().toISOString(),
          source: 'fallback-predict',
        };
      }
    }
  } catch {
    // Try next fallback.
  }

  // Fallback 2: live change sign from stocks feed.
  try {
    const stocksRes = await fetch(`${origin}/api/market/stocks`, { cache: 'no-store' });
    const stocksJson = await stocksRes.json().catch(() => ({}));
    const stock = Array.isArray(stocksJson?.stocks)
      ? stocksJson.stocks.find((s) => String(s?.sym || '').toUpperCase() === ticker)
      : null;

    if (stock) {
      const chg = Number(stock?.chg || 0);
      const label = chg >= 0 ? 'BUY' : 'SELL';
      return {
        ticker,
        prediction: label === 'BUY' ? 1 : 0,
        label,
        confidence: confidenceFromDeltaPct(chg),
        timestamp: new Date().toISOString(),
        source: 'fallback-change',
      };
    }
  } catch {
    // Final fallback below.
  }

  return {
    ticker,
    prediction: 0,
    label: 'SELL',
    confidence: 0.52,
    timestamp: new Date().toISOString(),
    source: 'fallback-default',
  };
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const origin = req.nextUrl.origin;
    const ticker = String(searchParams.get('ticker') || '').trim().toUpperCase();

    if (!ticker) {
      return NextResponse.json({ error: 'ticker is required' }, { status: 400 });
    }

    let payload = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), AI_SERVICE_TIMEOUT_MS);
      const res = await fetch(`${AI_SERVICE_URL}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
        cache: 'no-store',
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const prediction = Number(data?.prediction);
        const label = typeof data?.label === 'string'
          ? String(data.label).toUpperCase()
          : prediction === 1
            ? 'BUY'
            : 'SELL';
        payload = {
          ticker,
          prediction,
          label: label === 'BUY' ? 'BUY' : 'SELL',
          confidence: clampConfidence(data?.confidence),
          predicted_price_5d: Number(data?.predicted_price_5d) || null,
          timestamp: data?.timestamp || new Date().toISOString(),
          source: 'rf-service',
        };
      }
    } catch {
      payload = null;
    }

    if (!payload) {
      payload = await buildFallbackSignal(ticker, origin);
    }

    return NextResponse.json(
      payload,
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const { searchParams } = new URL(req.url);
    const ticker = String(searchParams.get('ticker') || '').trim().toUpperCase();
    const payload = {
      ticker,
      prediction: 0,
      label: 'SELL',
      confidence: 0.52,
      timestamp: new Date().toISOString(),
      source: 'fallback-catch',
      warning: error instanceof Error ? error.message : 'RF signal unavailable',
    };
    return NextResponse.json(payload, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }
}
