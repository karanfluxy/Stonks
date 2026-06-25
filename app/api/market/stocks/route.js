import { NextResponse } from 'next/server';
import { getBatchQuotes, getSpark } from '../../lib/finnhub';
import { upsertStocksToChroma } from '../../lib/chromaMemory';

const REALTIME_SYMBOLS = new Set(['AAPL', 'TSLA']);
const LAST_QUOTES_KEY = '__stonks_last_realtime_quotes__';

function getLastRealtimeQuotes() {
  const globalObj = globalThis;
  if (!globalObj[LAST_QUOTES_KEY]) {
    globalObj[LAST_QUOTES_KEY] = {};
  }
  return globalObj[LAST_QUOTES_KEY];
}

/* ── comprehensive stock pool ─────────────────────────────────────────────── */
const STOCK_POOL = [
  // US — Tech
  { sym: 'AAPL',  name: 'Apple Inc.',               sector: 'Technology' },
  { sym: 'MSFT',  name: 'Microsoft Corp.',           sector: 'Technology' },
  { sym: 'GOOGL', name: 'Alphabet Inc.',             sector: 'Technology' },
  { sym: 'AMZN',  name: 'Amazon.com Inc.',           sector: 'Consumer Cyclical' },
  { sym: 'META',  name: 'Meta Platforms Inc.',        sector: 'Technology' },
  { sym: 'NVDA',  name: 'NVIDIA Corp.',              sector: 'Technology' },
  { sym: 'TSLA',  name: 'Tesla Inc.',                sector: 'Automotive' },
  { sym: 'NFLX',  name: 'Netflix Inc.',              sector: 'Entertainment' },
  { sym: 'AMD',   name: 'Advanced Micro Devices',    sector: 'Technology' },
  { sym: 'INTC',  name: 'Intel Corp.',               sector: 'Technology' },
  { sym: 'CRM',   name: 'Salesforce Inc.',           sector: 'Technology' },
  { sym: 'ORCL',  name: 'Oracle Corp.',              sector: 'Technology' },
  { sym: 'ADBE',  name: 'Adobe Inc.',                sector: 'Technology' },
  { sym: 'PYPL',  name: 'PayPal Holdings',           sector: 'Financial Services' },
  { sym: 'UBER',  name: 'Uber Technologies',         sector: 'Technology' },
  { sym: 'COIN',  name: 'Coinbase Global',           sector: 'Financial Services' },
  { sym: 'SHOP',  name: 'Shopify Inc.',              sector: 'Technology' },
  { sym: 'SQ',    name: 'Block Inc.',                sector: 'Technology' },
  // US — Finance
  { sym: 'V',     name: 'Visa Inc.',                 sector: 'Financial Services' },
  { sym: 'MA',    name: 'Mastercard Inc.',            sector: 'Financial Services' },
  { sym: 'JPM',   name: 'JPMorgan Chase',            sector: 'Financial Services' },
  { sym: 'BAC',   name: 'Bank of America',           sector: 'Financial Services' },
  { sym: 'GS',    name: 'Goldman Sachs',             sector: 'Financial Services' },
  // US — Consumer / Health / Energy
  { sym: 'DIS',   name: 'Walt Disney Co.',           sector: 'Entertainment' },
  { sym: 'NKE',   name: 'Nike Inc.',                 sector: 'Consumer Cyclical' },
  { sym: 'WMT',   name: 'Walmart Inc.',              sector: 'Consumer Defensive' },
  { sym: 'KO',    name: 'Coca-Cola Co.',             sector: 'Consumer Defensive' },
  { sym: 'PEP',   name: 'PepsiCo Inc.',              sector: 'Consumer Defensive' },
  { sym: 'JNJ',   name: 'Johnson & Johnson',         sector: 'Healthcare' },
  { sym: 'PFE',   name: 'Pfizer Inc.',               sector: 'Healthcare' },
  { sym: 'UNH',   name: 'UnitedHealth Group',        sector: 'Healthcare' },
  { sym: 'XOM',   name: 'Exxon Mobil Corp.',         sector: 'Energy' },
  { sym: 'CVX',   name: 'Chevron Corp.',             sector: 'Energy' },
  { sym: 'BA',    name: 'Boeing Co.',                sector: 'Industrials' },
  { sym: 'CAT',   name: 'Caterpillar Inc.',          sector: 'Industrials' },
  // India — NSE
  { sym: 'RELIANCE.NSE',    name: 'Reliance Industries',     sector: 'Energy' },
  { sym: 'TCS.NSE',         name: 'Tata Consultancy',        sector: 'Technology' },
  { sym: 'INFY.NSE',        name: 'Infosys Ltd.',            sector: 'Technology' },
  { sym: 'HDFCBANK.NSE',    name: 'HDFC Bank',               sector: 'Financial Services' },
  { sym: 'ICICIBANK.NSE',   name: 'ICICI Bank',              sector: 'Financial Services' },
  { sym: 'SBIN.NSE',        name: 'State Bank of India',     sector: 'Financial Services' },
  { sym: 'BHARTIARTL.NSE',  name: 'Bharti Airtel',           sector: 'Telecom' },
  { sym: 'ITC.NSE',         name: 'ITC Ltd.',                sector: 'Consumer Defensive' },
  { sym: 'KOTAKBANK.NSE',   name: 'Kotak Mahindra Bank',     sector: 'Financial Services' },
  { sym: 'LT.NSE',          name: 'Larsen & Toubro',         sector: 'Industrials' },
  { sym: 'HINDUNILVR.NSE',  name: 'Hindustan Unilever',      sector: 'Consumer Defensive' },
  { sym: 'BAJFINANCE.NSE',  name: 'Bajaj Finance',           sector: 'Financial Services' },
  { sym: 'MARUTI.NSE',      name: 'Maruti Suzuki',           sector: 'Automotive' },
  { sym: 'WIPRO.NSE',       name: 'Wipro Ltd.',              sector: 'Technology' },
  { sym: 'TATAMOTORS.NSE',  name: 'Tata Motors',             sector: 'Automotive' },
];

/* ── helpers ──────────────────────────────────────────────────────────────── */
const BATCH_SIZE = 8;

async function fetchAllQuotes() {
  const allQuotes = {};
  const symbols = STOCK_POOL.map((s) => s.sym).filter((sym) => REALTIME_SYMBOLS.has(sym));
  const batches = [];
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    batches.push(symbols.slice(i, i + BATCH_SIZE));
  }

  await Promise.all(
    batches.map(async (batch) => {
      try {
        const result = await getBatchQuotes(batch, { ttlMs: 1_000 });
        Object.assign(allQuotes, result || {});
      } catch {
        /* batch failed — continue with others */
      }
    })
  );

  return allQuotes;
}

function quotePrice(quote) {
  const n = Number(quote?.price);
  return Number.isFinite(n) ? n : 0;
}
function quotePct(quote) {
  const n = Number(quote?.percentChange);
  return Number.isFinite(n) ? n : 0;
}
function quoteVolume(quote) {
  const v = Number(quote?.volume);
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
}

function fallbackPrice(sym) {
  let h = 0;
  for (let i = 0; i < sym.length; i++) h = ((h << 5) - h + sym.charCodeAt(i)) | 0;
  return Math.abs(h % 5000) + 50;
}

/* ── route ────────────────────────────────────────────────────────────────── */
export async function GET(request) {
  try {
    const liveOnlyParam = String(request?.nextUrl?.searchParams?.get('liveOnly') || '').toLowerCase();
    const liveOnly = liveOnlyParam === '1' || liveOnlyParam === 'true' || liveOnlyParam === 'yes';

    const quotes = await fetchAllQuotes();
    const lastQuotes = getLastRealtimeQuotes();

    for (const sym of REALTIME_SYMBOLS) {
      if (quotes[sym]) {
        lastQuotes[sym] = quotes[sym];
      } else if (lastQuotes[sym]) {
        quotes[sym] = lastQuotes[sym];
      }
    }

    const sparkBySymbol = {};
    await Promise.all(
      STOCK_POOL.map(async (item) => {
        if (!REALTIME_SYMBOLS.has(item.sym)) {
          sparkBySymbol[item.sym] = [];
          return;
        }
        try {
          const spark = await getSpark(item.sym, { resolution: '5', points: 20, ttlMs: 1_000 });
          sparkBySymbol[item.sym] = Array.isArray(spark) ? spark : [];
        } catch {
          sparkBySymbol[item.sym] = [];
        }
      })
    );

    const allStocks = STOCK_POOL.map((item) => {
      const quote = quotes[item.sym] || null;
      const price = quote
        ? quotePrice(quote)
        : (REALTIME_SYMBOLS.has(item.sym) ? 0 : fallbackPrice(item.sym));
      const chg = quote ? quotePct(quote) : 0;
      return {
        sym: item.sym,
        name: item.name,
        sector: item.sector,
        price,
        chg,
        vol: quote ? quoteVolume(quote) : '—',
        color: chg >= 0 ? '#10b981' : '#ef4444',
        live: !!quote && REALTIME_SYMBOLS.has(item.sym),
        spark: (sparkBySymbol[item.sym] && sparkBySymbol[item.sym].length > 0)
          ? sparkBySymbol[item.sym]
          : [{ v: price }, { v: price }, { v: price }, { v: price }, { v: price }],
      };
    });

    const stocks = liveOnly ? allStocks.filter((s) => s.live) : allStocks;

    const liveStocks = allStocks.filter((s) => s.live);
    if (liveStocks.length > 0) {
      await upsertStocksToChroma(liveStocks).catch(() => {});
    }

    return NextResponse.json(
      {
        stocks,
        meta: {
          source: Object.keys(quotes).length > 0 ? 'finnhub' : 'fallback',
          liveOnly,
          total: stocks.length,
          liveCount: allStocks.filter((s) => s.live).length,
          requestedAt: new Date().toISOString(),
        },
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    const liveOnlyParam = String(request?.nextUrl?.searchParams?.get('liveOnly') || '').toLowerCase();
    const liveOnly = liveOnlyParam === '1' || liveOnlyParam === 'true' || liveOnlyParam === 'yes';

    const allFallbackStocks = STOCK_POOL.map((item) => ({
      sym: item.sym,
      name: item.name,
      sector: item.sector,
      price: REALTIME_SYMBOLS.has(item.sym)
        ? Number(getLastRealtimeQuotes()[item.sym]?.price || 0)
        : fallbackPrice(item.sym),
      chg: 0,
      vol: '—',
      color: '#6b7280',
      live: REALTIME_SYMBOLS.has(item.sym) && Number(getLastRealtimeQuotes()[item.sym]?.price || 0) > 0,
      spark: [{ v: fallbackPrice(item.sym) }, { v: fallbackPrice(item.sym) }, { v: fallbackPrice(item.sym) }, { v: fallbackPrice(item.sym) }, { v: fallbackPrice(item.sym) }],
    }));

    const stocks = liveOnly ? [] : allFallbackStocks;

    return NextResponse.json(
      {
        stocks,
        meta: {
          source: 'fallback',
          liveOnly,
          total: stocks.length,
          liveCount: 0,
          requestedAt: new Date().toISOString(),
        },
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
