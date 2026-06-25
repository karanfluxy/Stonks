import { loadServerEnvOnce } from './loadEnv';

loadServerEnvOnce();

const API_BASE = 'https://api.twelvedata.com';
const GLOBAL_STATE_KEY = '__stonks_twelve_data_state__';
const DEFAULT_DAILY_LIMIT = 780;

function getTodayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function getState() {
  const globalObj = globalThis;
  if (!globalObj[GLOBAL_STATE_KEY]) {
    globalObj[GLOBAL_STATE_KEY] = {
      day: getTodayUtc(),
      used: 0,
      cache: new Map(),
    };
  }

  const state = globalObj[GLOBAL_STATE_KEY];
  const today = getTodayUtc();
  if (state.day !== today) {
    state.day = today;
    state.used = 0;
    state.cache.clear();
  }

  return state;
}

function getApiKey() {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) {
    throw new Error('Missing required env var: TWELVE_DATA_API_KEY');
  }
  return key;
}

function getDailyLimit() {
  const raw = process.env.TWELVE_DATA_DAILY_LIMIT;
  const parsed = raw ? Number(raw) : DEFAULT_DAILY_LIMIT;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DAILY_LIMIT;
  return Math.floor(parsed);
}

function getCacheEntry(key) {
  const state = getState();
  return state.cache.get(key);
}

function setCacheEntry(key, data, ttlMs) {
  const state = getState();
  state.cache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
    updatedAt: Date.now(),
  });
}

function canSpend(cost) {
  const state = getState();
  const limit = getDailyLimit();
  return state.used + cost <= limit;
}

function spend(cost) {
  const state = getState();
  state.used += cost;
}

function getBudgetSnapshot() {
  const state = getState();
  const limit = getDailyLimit();
  return {
    day: state.day,
    used: state.used,
    limit,
    remaining: Math.max(0, limit - state.used),
  };
}

function isFresh(entry) {
  return entry && entry.expiresAt > Date.now();
}

async function requestTwelveData(path, params, options = {}) {
  const {
    cacheKey,
    ttlMs = 60_000,
    cost = 1,
    allowStaleOnBudgetExhausted = true,
  } = options;

  const cached = cacheKey ? getCacheEntry(cacheKey) : null;
  if (cacheKey && isFresh(cached)) {
    return { data: cached.data, fromCache: true, stale: false };
  }

  if (!canSpend(cost)) {
    if (allowStaleOnBudgetExhausted && cached) {
      return { data: cached.data, fromCache: true, stale: true };
    }
    const b = getBudgetSnapshot();
    throw new Error(`Twelve Data quota exhausted (${b.used}/${b.limit})`);
  }

  const query = new URLSearchParams({
    ...params,
    apikey: getApiKey(),
  });

  const response = await fetch(`${API_BASE}${path}?${query.toString()}`, {
    cache: 'no-store',
  });

  spend(cost);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Twelve Data HTTP ${response.status}: ${text || response.statusText}`);
  }

  const json = await response.json();
  if (json?.status === 'error') {
    throw new Error(`Twelve Data error: ${json?.message || 'unknown error'}`);
  }

  if (cacheKey) {
    setCacheEntry(cacheKey, json, ttlMs);
  }

  return { data: json, fromCache: false, stale: false };
}

export async function getBatchQuotes(symbols, options = {}) {
  const symbolCsv = symbols.join(',');
  const ttlMs = options.ttlMs ?? 120_000;
  const cacheKey = `quotes:${symbolCsv}`;

  const { data, fromCache, stale } = await requestTwelveData(
    '/quote',
    { symbol: symbolCsv },
    { cacheKey, ttlMs, cost: 1 }
  );

  const normalized = {};
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    if (symbols.length === 1 && data.symbol) {
      normalized[data.symbol] = data;
    } else {
      for (const symbol of symbols) {
        if (data[symbol]) normalized[symbol] = data[symbol];
      }
    }
  }

  return {
    quotes: normalized,
    meta: {
      fromCache,
      stale,
      budget: getBudgetSnapshot(),
    },
  };
}

export async function getTimeSeries(symbol, interval = '15min', outputsize = 24, options = {}) {
  const ttlByInterval = {
    '1min': 120_000,
    '5min': 180_000,
    '15min': 300_000,
    '1h': 900_000,
    '1day': 3_600_000,
  };

  const ttlMs = options.ttlMs ?? ttlByInterval[interval] ?? 600_000;
  const cacheKey = `series:${symbol}:${interval}:${outputsize}`;

  const { data, fromCache, stale } = await requestTwelveData(
    '/time_series',
    {
      symbol,
      interval,
      outputsize: String(outputsize),
      order: 'ASC',
    },
    {
      cacheKey,
      ttlMs,
      cost: 1,
      allowStaleOnBudgetExhausted: true,
    }
  );

  const values = Array.isArray(data?.values) ? data.values : [];

  return {
    symbol,
    values,
    meta: {
      fromCache,
      stale,
      budget: getBudgetSnapshot(),
    },
  };
}

export function parseNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}
