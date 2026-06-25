import { NextResponse } from 'next/server';
import { getBatchQuotes, getSpark } from '../../lib/finnhub';

const INDEX_CONFIG = [
  { id: 'nifty', label: 'NIFTY 50', symbol: process.env.TD_SYMBOL_NIFTY || 'NIFTY', color: '#10b981', flag: '🇮🇳' },
  { id: 'sensex', label: 'SENSEX', symbol: process.env.TD_SYMBOL_SENSEX || 'SENSEX', color: '#6366f1', flag: '🇮🇳' },
  { id: 'nasdaq', label: 'NASDAQ', symbol: process.env.TD_SYMBOL_NASDAQ || 'IXIC', color: '#f59e0b', flag: '🇺🇸' },
  { id: 'sp500', label: 'S&P 500', symbol: process.env.TD_SYMBOL_SP500 || 'GSPC', color: '#ec4899', flag: '🇺🇸' },
];

const WATCHLIST_CONFIG = [
  { sym: 'AAPL', name: 'Apple Inc.' },
  { sym: 'TSLA', name: 'Tesla Inc.' },
  { sym: 'NVDA', name: 'NVIDIA Corp.' },
  { sym: process.env.TD_SYMBOL_RELIANCE || 'RELIANCE.NSE', name: 'Reliance Ind.' },
  { sym: process.env.TD_SYMBOL_INFY || 'INFY.NSE', name: 'Infosys Ltd.' },
  { sym: 'MSFT', name: 'Microsoft Corp.' },
];

function randomPct(seed) {
  return Number(((Math.sin(seed) + 1) * 1.2 - 1.2).toFixed(2));
}

function fallbackPayload(reason = 'provider-unavailable') {
  const now = Date.now();
  const indices = INDEX_CONFIG.map((item, idx) => {
    const base = idx === 0 ? 22400 : idx === 1 ? 73800 : idx === 2 ? 17900 : 5200;
    const chgPct = randomPct(now / (10000 + idx * 1500));
    const price = Number((base * (1 + chgPct / 100)).toFixed(2));
    return {
      id: item.id,
      label: item.label,
      symbol: item.symbol,
      flag: item.flag,
      color: item.color,
      price,
      chgPct,
      spark: toSpark([], price),
    };
  });

  const watchlist = WATCHLIST_CONFIG.map((item, idx) => {
    const base = idx === 0 ? 190 : idx === 1 ? 250 : idx === 2 ? 870 : idx === 3 ? 2940 : idx === 4 ? 1780 : 415;
    const chg = randomPct(now / (7000 + idx * 1300));
    const price = Number((base * (1 + chg / 100)).toFixed(2));
    return {
      sym: item.sym,
      name: item.name,
      price,
      chg,
      vol: '—',
      color: chg >= 0 ? '#10b981' : '#ef4444',
      spark: toSpark([], price),
    };
  });

  return {
    indices,
    watchlist,
    meta: {
      source: 'fallback',
      fallbackReason: reason,
      pollMs: 120_000,
      requestedAt: new Date().toISOString(),
    },
  };
}

async function getQuotesResilient(allSymbols) {
  try {
    const quotes = await getBatchQuotes(allSymbols, { ttlMs: 1_000 });
    return {
      quotes,
      meta: { fromCache: false, stale: false },
    };
  } catch {
    const mergedQuotes = {};
    let budgetMeta = null;

    await Promise.all(
      allSymbols.map(async (symbol) => {
        try {
          const single = await getBatchQuotes([symbol], { ttlMs: 1_000 });
          if (single?.[symbol]) {
            mergedQuotes[symbol] = single[symbol];
          }
          if (!budgetMeta) budgetMeta = { partial: true };
        } catch {
          // ignore invalid symbols / transient failures for individual requests
        }
      })
    );

    return {
      quotes: mergedQuotes,
      meta: budgetMeta || { fromCache: false, stale: true },
    };
  }
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
  const volume = Number(quote?.volume);
  if (!Number.isFinite(volume) || volume <= 0) return '—';
  if (volume >= 1_000_000_000) return `${(volume / 1_000_000_000).toFixed(1)}B`;
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(1)}M`;
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(1)}K`;
  return String(Math.round(volume));
}

function toSpark(values, fallback) {
  if (!Array.isArray(values) || values.length === 0) {
    return Array.from({ length: 20 }, () => ({ v: fallback }));
  }
  return values.slice(-20).map((item) => ({ v: parseNumber(item?.close, fallback) }));
}

export async function GET() {
  try {
    const indexSymbols = INDEX_CONFIG.map((item) => item.symbol);
    const watchSymbols = WATCHLIST_CONFIG.map((item) => item.sym);
    const allSymbols = [...new Set([...indexSymbols, ...watchSymbols])];

    const quoteResult = await getQuotesResilient(allSymbols);

    const hasAnyQuote = Object.keys(quoteResult.quotes || {}).length > 0;
    if (!hasAnyQuote) {
      return NextResponse.json(fallbackPayload('no-valid-symbol-response'), {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const sparkBySymbol = {};
    await Promise.all(
      allSymbols.map(async (symbol) => {
        try {
          const spark = await getSpark(symbol, { resolution: '5', points: 20, ttlMs: 1_000 });
          const fallbackPrice = quotePrice(quoteResult.quotes[symbol]);
          sparkBySymbol[symbol] = spark.length > 0 ? spark : toSpark([], fallbackPrice || 1);
        } catch {
          const fallbackPrice = quotePrice(quoteResult.quotes[symbol]) || 1;
          sparkBySymbol[symbol] = toSpark([], fallbackPrice);
        }
      })
    );

    const indices = INDEX_CONFIG.map((item) => {
      const quote = quoteResult.quotes[item.symbol] || null;
      const price = quotePrice(quote);
      return {
        id: item.id,
        label: item.label,
        symbol: item.symbol,
        flag: item.flag,
        color: item.color,
        price,
        chgPct: quotePct(quote),
        spark: sparkBySymbol[item.symbol] || toSpark([], price || 1),
      };
    });

    const watchlist = WATCHLIST_CONFIG.map((item) => {
      const quote = quoteResult.quotes[item.sym] || null;
      const price = quotePrice(quote);
      const chg = quotePct(quote);
      return {
        sym: item.sym,
        name: item.name,
        price,
        chg,
        vol: quoteVolume(quote),
        color: chg >= 0 ? '#10b981' : '#ef4444',
        spark: sparkBySymbol[item.sym] || toSpark([], price || 1),
      };
    });

    return NextResponse.json(
      {
        indices,
        watchlist,
        meta: {
          source: 'finnhub',
          cache: quoteResult.meta,
          pollMs: 1_000,
          requestedAt: new Date().toISOString(),
        },
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    const message = process.env.NODE_ENV === 'production'
      ? 'provider-error'
      : (error instanceof Error ? error.message : 'provider-error');

    return NextResponse.json(fallbackPayload(message), {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
