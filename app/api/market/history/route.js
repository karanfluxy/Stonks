import { NextResponse } from 'next/server';
import { getTimeSeries, parseNumber } from '../../lib/twelveData';

/** * Configuration & Constant Mappings 
 */
const DEFAULT_LIMIT = 60;
const LIMIT_BOUNDS = { MIN: 5, MAX: 200 };

const CACHE_TTL_MAP = {
  '1min': 120_000,
  '5min': 180_000,
  '15min': 300_000,
  '1h': 900_000,
  'default': 3_600_000
};

const YAHOO_INTERVAL_MAP = {
  '1day': '1d',
  '1week': '1wk',
  '1month': '1mo'
};

/** * Utility Helpers 
 */
const normalizeLimit = (val, fallback = DEFAULT_LIMIT) => {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(LIMIT_BOUNDS.MIN, Math.min(LIMIT_BOUNDS.MAX, Math.floor(num)));
};

const getTickerForYahoo = (ticker) => ticker.endsWith('.NSE') ? ticker.replace(/\.NSE$/, '.NS') : ticker;

const getFrequencyForYahoo = (freq) => YAHOO_INTERVAL_MAP[freq] || freq;

const getCacheDuration = (freq) => CACHE_TTL_MAP[freq] || CACHE_TTL_MAP.default;

/** * Data Fetching Strategy: Yahoo Finance 
 */
async function fetchYahooProvider(symbol, range, interval) {
  const ticker = getTickerForYahoo(symbol);
  const frequency = getFrequencyForYahoo(interval);
  const endpoint = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(frequency)}&includePrePost=false&events=div%2Csplits`;

  const response = await fetch(endpoint, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'market-data-service/1.1',
      'Accept': 'application/json',
    },
  });

  if (!response.ok) throw new Error(`Yahoo provider error: ${response.status}`);

  const data = await response.json();
  const resSet = data?.chart?.result?.[0];
  const quotes = resSet?.indicators?.quote?.[0];
  const timeframes = Array.isArray(resSet?.timestamp) ? resSet.timestamp : [];

  if (!resSet || !quotes || timeframes.length === 0) {
    throw new Error('Yahoo provider returned no data points');
  }

  const candles = timeframes
    .map((ts, i) => {
      const o = Number(quotes?.open?.[i]);
      const h = Number(quotes?.high?.[i]);
      const l = Number(quotes?.low?.[i]);
      const c = Number(quotes?.close?.[i]);
      const v = Number(quotes?.volume?.[i]);

      if (![o, h, l, c].every(Number.isFinite)) return null;

      return {
        datetime: new Date(ts * 1000).toISOString(),
        open: o,
        high: h,
        low: l,
        close: c,
        volume: Number.isFinite(v) ? v : 0,
      };
    })
    .filter(Boolean);

  if (candles.length === 0) throw new Error('No valid OHLC records found');

  return {
    candles,
    metadata: {
      source: 'yahoo-finance',
      symbol: ticker,
      range,
      interval: frequency,
    },
  };
}

/** * Main API Route Handler 
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Extracting and cleaning parameters
    const symbol = (searchParams.get('symbol') || '').trim().toUpperCase();
    const interval = (searchParams.get('interval') || '1day').trim();
    const limit = normalizeLimit(searchParams.get('outputsize'));
    const range = (searchParams.get('range') || '3mo').trim();
    const dataSource = (searchParams.get('source') || 'twelve-data').trim().toLowerCase();

    if (!symbol) {
      return NextResponse.json({ error: 'Ticker symbol is required' }, { status: 400 });
    }

    // --- Branch 1: Yahoo Finance Source ---
    if (dataSource === 'yahoo') {
      const result = await fetchYahooProvider(symbol, range, interval);
      const slicedCandles = result.candles.slice(-limit);

      return NextResponse.json({
        symbol,
        interval,
        ohlc: slicedCandles,
        meta: {
          ...result.metadata,
          requestedAt: new Date().toISOString(),
        }
      }, { 
        status: 200, 
        headers: { 'Cache-Control': 'no-store' } 
      });
    }

    // --- Branch 2: Twelve Data Source ---
    const rawSeries = await getTimeSeries(symbol, interval, limit, {
      ttlMs: getCacheDuration(interval),
    });

    const formattedCandles = rawSeries.values.map((point) => ({
      datetime: point.datetime,
      open: parseNumber(point.open),
      high: parseNumber(point.high),
      low: parseNumber(point.low),
      close: parseNumber(point.close),
      volume: parseNumber(point.volume),
    }));

    return NextResponse.json({
      symbol,
      interval,
      ohlc: formattedCandles,
      meta: {
        source: 'twelve-data',
        ...rawSeries.meta,
        requestedAt: new Date().toISOString(),
      }
    }, { 
      status: 200, 
      headers: { 'Cache-Control': 'no-store' } 
    });

  } catch (err) {
    const isProd = process.env.NODE_ENV === 'production';
    const errorMessage = isProd ? 'Internal market data error' : (err.message || 'Unknown error');
    
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}