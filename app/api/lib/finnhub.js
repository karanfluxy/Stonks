import { loadServerEnvOnce } from './loadEnv';

loadServerEnvOnce();

const API_BASE = 'https://finnhub.io/api/v1';
const FALLBACK_FINNHUB_KEY = '';
const STATE_KEY = '__stonks_finnhub_state__';

function getState() {
  const globalObj = globalThis;
  if (!globalObj[STATE_KEY]) {
    globalObj[STATE_KEY] = { cache: new Map() };
  }
  return globalObj[STATE_KEY];
}

function getToken() {
  const key = process.env.FINNHUB_API_KEY || process.env.FINHUB_API_KEY || FALLBACK_FINNHUB_KEY;
  if (!key) {
    throw new Error('Missing FINNHUB_API_KEY');
  }
  return key;
}

function normalizeSymbol(symbol) {
  if (symbol.endsWith('.NSE')) {
    return `NSE:${symbol.replace(/\.NSE$/, '')}`;
  }
  return symbol;
}

function getCacheKey(path, params) {
  const ordered = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return `${path}?${ordered}`;
}

async function requestFinnhub(path, params, ttlMs = 1000) {
  const token = getToken();
  const fullParams = { ...params, token };
  const cacheKey = getCacheKey(path, fullParams);
  const state = getState();
  const cached = state.cache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const query = new URLSearchParams(fullParams);
  const res = await fetch(`${API_BASE}${path}?${query.toString()}`, { cache: 'no-store' });

  if (!res.ok) {
    throw new Error(`Finnhub HTTP ${res.status}`);
  }

  const data = await res.json();
  state.cache.set(cacheKey, { data, expiresAt: Date.now() + ttlMs });
  return data;
}

export async function getQuote(symbol, options = {}) {
  const ttlMs = options.ttlMs ?? 1000;
  const resolvedSymbol = normalizeSymbol(symbol);
  const quote = await requestFinnhub('/quote', { symbol: resolvedSymbol }, ttlMs);

  const current = Number(quote?.c);
  if (!Number.isFinite(current) || current <= 0) {
    return null;
  }

  return {
    symbol,
    providerSymbol: resolvedSymbol,
    price: current,
    change: Number(quote?.d) || 0,
    percentChange: Number(quote?.dp) || 0,
    high: Number(quote?.h) || current,
    low: Number(quote?.l) || current,
    open: Number(quote?.o) || current,
    prevClose: Number(quote?.pc) || current,
    timestamp: Number(quote?.t) || 0,
  };
}

export async function getBatchQuotes(symbols, options = {}) {
  const ttlMs = options.ttlMs ?? 1000;
  const settled = await Promise.allSettled(symbols.map((sym) => getQuote(sym, { ttlMs })));
  const quotes = {};

  settled.forEach((item, idx) => {
    if (item.status === 'fulfilled' && item.value) {
      quotes[symbols[idx]] = item.value;
    }
  });

  return quotes;
}

export async function getSpark(symbol, options = {}) {
  const ttlMs = options.ttlMs ?? 1000;
  const points = Math.max(5, Math.min(60, Number(options.points ?? 20)));
  const resolution = String(options.resolution ?? '5');
  const resolvedSymbol = normalizeSymbol(symbol);

  const nowSec = Math.floor(Date.now() / 1000);
  const stepSec = Number.isFinite(Number(resolution)) ? Number(resolution) * 60 : 300;
  const from = nowSec - stepSec * (points + 6);

  const payload = await requestFinnhub(
    '/stock/candle',
    {
      symbol: resolvedSymbol,
      resolution,
      from: String(from),
      to: String(nowSec),
    },
    ttlMs
  );

  if (payload?.s !== 'ok' || !Array.isArray(payload?.c)) {
    return [];
  }

  return payload.c
    .slice(-points)
    .map((v) => ({ v: Number(v) }))
    .filter((p) => Number.isFinite(p.v) && p.v > 0);
}
