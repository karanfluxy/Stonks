import { loadServerEnvOnce } from './loadEnv';
import path from 'path';
import { spawn } from 'child_process';

loadServerEnvOnce();

const API_BASE = 'https://newsapi.org/v2';
const GLOBAL_STATE_KEY = '__stonks_news_api_state__';
const FINBERT_WORKER_KEY = '__stonks_finbert_worker_state__';
const DEFAULT_DAILY_LIMIT = 100;
const FINBERT_TIMEOUT_MS = Number(process.env.FINBERT_TIMEOUT_MS || 25000);
const IS_VERCEL = process.env.VERCEL === '1';

function getFinBertWorkerState() {
  const globalObj = globalThis;
  if (!globalObj[FINBERT_WORKER_KEY]) {
    globalObj[FINBERT_WORKER_KEY] = {
      child: null,
      starting: null,
      pending: new Map(),
      seq: 0,
      buffer: '',
    };
  }
  return globalObj[FINBERT_WORKER_KEY];
}

function settleAllPending(error) {
  const state = getFinBertWorkerState();
  for (const [, req] of state.pending) {
    clearTimeout(req.timeout);
    req.reject(error);
  }
  state.pending.clear();
}

function handleWorkerStdout(chunk) {
  const state = getFinBertWorkerState();
  state.buffer += String(chunk || '');

  let idx = state.buffer.indexOf('\n');
  while (idx >= 0) {
    const line = state.buffer.slice(0, idx).trim();
    state.buffer = state.buffer.slice(idx + 1);

    if (line) {
      try {
        const msg = JSON.parse(line);
        const req = state.pending.get(msg?.id);
        if (req) {
          clearTimeout(req.timeout);
          state.pending.delete(msg.id);
          if (msg?.error) {
            req.reject(new Error(String(msg.error)));
          } else {
            req.resolve(Array.isArray(msg?.result) ? msg.result : []);
          }
        }
      } catch {
        // Ignore malformed worker lines and continue.
      }
    }

    idx = state.buffer.indexOf('\n');
  }
}

async function ensureFinBertWorker() {
  const state = getFinBertWorkerState();
  if (state.child && !state.child.killed) return state.child;
  if (state.starting) return state.starting;

  state.starting = new Promise((resolve, reject) => {
    const pythonBin = process.env.PYTHON_BIN || 'python';
    const scriptPath = path.join(process.cwd(), 'scripts', 'finbert_sentiment_worker.py');
    const child = spawn(pythonBin, [scriptPath], {
      cwd: process.cwd(),
      env: { ...process.env },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let resolved = false;

    child.stdout.on('data', (chunk) => {
      handleWorkerStdout(chunk);
      if (!resolved) {
        resolved = true;
        resolve(child);
      }
    });

    child.stderr.on('data', () => {
      // Suppress worker stderr noise in normal flow.
    });

    child.on('error', (err) => {
      state.child = null;
      if (!resolved) reject(err);
      settleAllPending(err instanceof Error ? err : new Error('FinBERT worker error'));
    });

    child.on('exit', (code) => {
      state.child = null;
      state.buffer = '';
      settleAllPending(new Error(`FinBERT worker exited with code ${code}`));
    });

    state.child = child;

    // Resolve quickly even before first output; the worker handles requests immediately.
    if (!resolved) {
      resolved = true;
      resolve(child);
    }
  })
    .finally(() => {
      state.starting = null;
    });

  return state.starting;
}
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
      lastGood: null,
    };
  }

  const state = globalObj[GLOBAL_STATE_KEY];
  const today = getTodayUtc();
  if (state.day !== today) {
    state.day = today;
    state.used = 0;
    state.cache.clear();
    state.lastGood = null;
  }

  return state;
}

function getApiKey() {
  const key = process.env.NEWS_API_KEY;
  if (!key) {
    throw new Error('Missing required env var: NEWS_API_KEY');
  }
  return key;
}

function getDailyLimit() {
  const raw = process.env.NEWS_API_DAILY_LIMIT;
  const parsed = raw ? Number(raw) : DEFAULT_DAILY_LIMIT;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DAILY_LIMIT;
  return Math.floor(parsed);
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

function canSpend(cost = 1) {
  const state = getState();
  const limit = getDailyLimit();
  return state.used + cost <= limit;
}

function spend(cost = 1) {
  const state = getState();
  state.used += cost;
}

function cacheGet(key) {
  const state = getState();
  const entry = state.cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) return null;
  return entry;
}

function cacheSet(key, data, ttlMs) {
  const state = getState();
  state.cache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

function setLastGood(data) {
  const state = getState();
  state.lastGood = {
    data,
    timestamp: Date.now(),
  };
}

function getLastGood() {
  const state = getState();
  return state.lastGood;
}

function toIsoTime(iso) {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return 'now';

  const diffMs = Date.now() - date.getTime();
  const min = Math.max(1, Math.floor(diffMs / 60_000));
  if (min < 60) return `${min}m ago`;

  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;

  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function scoreSentiment(text) {
  const value = String(text || '').toLowerCase();

  const bullishWords = ['surge', 'gain', 'rise', 'beats', 'record', 'up', 'bullish', 'rally', 'growth'];
  const bearishWords = ['drop', 'fall', 'miss', 'down', 'bearish', 'cut', 'warn', 'recall', 'lawsuit'];

  let score = 0;
  for (const word of bullishWords) {
    if (value.includes(word)) score += 1;
  }
  for (const word of bearishWords) {
    if (value.includes(word)) score -= 1;
  }

  if (score >= 1) return 'bullish';
  if (score <= -1) return 'bearish';
  return 'neutral';
}

function scoreImpact(title, sourceName) {
  const text = `${title || ''} ${sourceName || ''}`.toLowerCase();
  const highWords = ['federal reserve', 'fed', 'rbi', 'earnings', 'inflation', 'interest rate', 'sec'];
  const mediumWords = ['analyst', 'forecast', 'guidance', 'downgrade', 'upgrade'];

  if (highWords.some((word) => text.includes(word))) return 'high';
  if (mediumWords.some((word) => text.includes(word))) return 'medium';
  return 'low';
}

function normalizeArticles(articles = [], maxItems = 8) {
  return articles
    .filter((item) => item && item.title)
    .slice(0, maxItems)
    .map((item) => {
      const title = String(item.title).replace(/\s*[-|]\s*[^-|]+$/, '').trim();
      const sourceName = item?.source?.name || 'Market Wire';
      const sentiment = scoreSentiment(`${title} ${item.description || ''}`);
      const impact = scoreImpact(title, sourceName);

      return {
        headline: title,
        description: item.description ? String(item.description).trim() : null,
        sentiment,
        impact,
        sentimentReview: `Heuristic sentiment: ${sentiment}.`,
        time: toIsoTime(item.publishedAt),
        source: sourceName,
        url: item.url || null,
        imageUrl: item.urlToImage || null,
      };
    });
}

function mapFinBertLabelToSentiment(label) {
  const v = String(label || '').toLowerCase();
  if (v.includes('positive')) return 'bullish';
  if (v.includes('negative')) return 'bearish';
  return 'neutral';
}

function toPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n * 100));
}

async function runFinBertOneShot(textItems) {
  if (!Array.isArray(textItems) || textItems.length === 0) return [];

  const pythonBin = process.env.PYTHON_BIN || 'python';
  const scriptPath = path.join(process.cwd(), 'scripts', 'finbert_sentiment.py');
  const payload = JSON.stringify(textItems);

  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, [scriptPath, payload], {
      cwd: process.cwd(),
      env: { ...process.env },
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('FinBERT timed out'));
    }, FINBERT_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timeout);

      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `FinBERT failed with code ${code}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(Array.isArray(parsed) ? parsed : []);
      } catch {
        reject(new Error('Invalid JSON from FinBERT script'));
      }
    });
  });
}

async function runFinBertWorker(textItems) {
  if (!Array.isArray(textItems) || textItems.length === 0) return [];

  const state = getFinBertWorkerState();
  const child = await ensureFinBertWorker();
  const id = ++state.seq;
  const payload = `${JSON.stringify({ id, items: textItems })}\n`;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      state.pending.delete(id);
      reject(new Error('FinBERT worker timed out'));
    }, FINBERT_TIMEOUT_MS);

    state.pending.set(id, { resolve, reject, timeout });

    try {
      child.stdin.write(payload);
    } catch (error) {
      clearTimeout(timeout);
      state.pending.delete(id);
      reject(error instanceof Error ? error : new Error('Failed to write to FinBERT worker'));
    }
  });
}

async function runFinBert(textItems) {
  try {
    return await runFinBertWorker(textItems);
  } catch {
    // Fallback to one-shot mode if worker mode fails.
    return runFinBertOneShot(textItems);
  }
}

async function enrichNewsWithFinBert(items) {
  const enabled = String(process.env.NEWS_FINBERT_ENABLED || '1').toLowerCase();
  if (enabled === '0' || enabled === 'false' || enabled === 'no') {
    return items;
  }

  // Vercel serverless environments should not spawn local Python workers by default.
  if (IS_VERCEL && process.env.NEWS_FINBERT_ON_VERCEL !== '1') {
    return items;
  }

  const textItems = items.map((item) => ({
    headline: item.headline,
    description: item.description || '',
  }));

  try {
    const finbert = await runFinBert(textItems);
    if (!Array.isArray(finbert) || finbert.length === 0) return items;

    return items.map((item, idx) => {
      const row = finbert[idx];
      if (!row || typeof row !== 'object') return item;

      const mappedSentiment = mapFinBertLabelToSentiment(row.label);
      const confidencePct = toPct(row.confidence);
      const confidenceText = confidencePct == null ? '' : ` (${confidencePct.toFixed(1)}% confidence)`;
      const reviewLine = row.review
        ? String(row.review)
        : `FinBERT sentiment: ${mappedSentiment}${confidenceText}.`;

      return {
        ...item,
        sentiment: mappedSentiment || item.sentiment,
        sentimentReview: reviewLine,
      };
    });
  } catch {
    return items;
  }
}

export async function getMarketNews(options = {}) {
  const q = options.query || 'stock market OR nifty OR sensex OR nasdaq';
  const pageSize = options.pageSize ?? 10;
  const maxArticles = options.maxArticles ?? pageSize;
  const ttlMs = options.ttlMs ?? 15 * 60_000;
  const cacheKey = `news:${q}:${pageSize}:${maxArticles}`;

  const cached = cacheGet(cacheKey);
  if (cached) {
    return {
      items: cached.data,
      meta: {
        source: 'newsapi',
        fromCache: true,
        stale: false,
        budget: getBudgetSnapshot(),
      },
    };
  }

  if (!canSpend(1)) {
    const lastGood = getLastGood();
    if (lastGood?.data) {
      return {
        items: lastGood.data,
        meta: {
          source: 'newsapi',
          fromCache: true,
          stale: true,
          budget: getBudgetSnapshot(),
          reason: 'quota-exhausted',
        },
      };
    }
    throw new Error('News API quota exhausted');
  }

  const key = getApiKey();
  const qs = new URLSearchParams({
    q,
    pageSize: String(pageSize),
    sortBy: 'publishedAt',
    language: 'en',
    apiKey: key,
  });

  const response = await fetch(`${API_BASE}/everything?${qs.toString()}`, {
    cache: 'no-store',
  });

  spend(1);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`News API HTTP ${response.status}: ${text || response.statusText}`);
  }

  const payload = await response.json();
  if (payload?.status !== 'ok') {
    throw new Error(`News API error: ${payload?.message || 'unknown'}`);
  }

  const normalized = normalizeArticles(payload?.articles || [], maxArticles);
  const enriched = await enrichNewsWithFinBert(normalized);
  cacheSet(cacheKey, enriched, ttlMs);
  setLastGood(enriched);

  return {
    items: enriched,
    meta: {
      source: 'newsapi',
      fromCache: false,
      stale: false,
      budget: getBudgetSnapshot(),
    },
  };
}
