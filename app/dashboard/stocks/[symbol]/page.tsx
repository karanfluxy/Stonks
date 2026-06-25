'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Line,
  Customized,
} from 'recharts';
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  CalendarRange,
  BrainCircuit,
  Wallet,
  RefreshCw,
  ShoppingCart,
} from 'lucide-react';

type Stock = {
  sym: string;
  name: string;
  sector: string;
  price: number;
  chg: number;
  vol: string;
  color: string;
  live: boolean;
  spark?: { v: number }[];
};

type MinutePoint = {
  datetime: string;
  close: number;
};

type DailyPoint = {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

type DailyCandle = {
  day: string;
  open: number;
  high: number;
  low: number;
  close: number;
  ma: number;
};

type Holding = {
  sym: string;
  quantity: number;
  avgPrice: number;
  costBasis: number;
};

type Txn = {
  id: number;
  sym: string;
  name: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  totalValue: number;
  createdAt: string;
};

type PortfolioResponse = {
  walletBalance: number;
  holdings: Holding[];
  transactions: Txn[];
};

type BuySignalResponse = {
  ticker: string;
  current_price: number;
  predicted_price_5d: number;
  predicted_return_percent: number;
  signal: 'BUY' | 'DO NOT BUY';
  disclaimer: string;
};

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function symbolSeed(symbol: string) {
  let h = 2166136261;
  for (let i = 0; i < symbol.length; i++) {
    h ^= symbol.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h >>> 0);
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

function moneyINR(v: number) {
  return `₹${Number(v || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function createDailyCandles(symbol: string, base: number, days = 16): DailyCandle[] {
  const seed = symbolSeed(symbol);
  const points: Omit<DailyCandle, 'ma'>[] = [];
  const now = new Date();

  let prevClose = base;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);

    const vol = 0.012 + seededRandom(seed + i * 1.7) * 0.02;
    const drift = (seededRandom(seed + i * 4.1) - 0.48) * vol;
    const open = prevClose * (1 + (seededRandom(seed + i * 2.3) - 0.5) * 0.012);
    const close = open * (1 + drift);

    const upperWick = Math.max(open, close) * (0.003 + seededRandom(seed + i * 3.1) * 0.014);
    const lowerWick = Math.min(open, close) * (0.003 + seededRandom(seed + i * 5.9) * 0.014);

    const high = Math.max(open, close) + upperWick;
    const low = Math.max(0.01, Math.min(open, close) - lowerWick);

    points.push({
      day: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      open: round2(open),
      close: round2(close),
      high: round2(high),
      low: round2(low),
    });

    prevClose = close;
  }

  return points.map((p, idx) => {
    const from = Math.max(0, idx - 4);
    const window = points.slice(from, idx + 1);
    const ma = window.reduce((sum, item) => sum + item.close, 0) / window.length;
    return { ...p, ma: round2(ma) };
  });
}

function formatPrice(symbol: string, price: number) {
  const isInr = symbol.endsWith('.NSE');
  return `${isInr ? '₹' : '$'}${price.toLocaleString(isInr ? 'en-IN' : 'en-US', {
    maximumFractionDigits: 2,
  })}`;
}

function CandleLayer({
  candles,
  xAxisMap,
  yAxisMap,
}: {
  candles: DailyCandle[];
  xAxisMap?: Record<string, { scale: (value: string) => number; bandwidth?: () => number }>;
  yAxisMap?: Record<string, { scale: (value: number) => number }>;
}) {
  const xAxis = xAxisMap ? (Object.values(xAxisMap)[0] ?? null) : null;
  const yAxis = yAxisMap ? (Object.values(yAxisMap)[0] ?? null) : null;

  if (!xAxis || !yAxis || candles.length === 0) return null;

  const band = typeof xAxis.bandwidth === 'function' ? xAxis.bandwidth() : 18;
  const bodyWidth = Math.max(5, Math.min(14, band * 0.58));

  return (
    <g>
      {candles.map((c) => {
        const xRaw = xAxis.scale(c.day);
        const xCenter = xRaw + band / 2;
        const yHigh = yAxis.scale(c.high);
        const yLow = yAxis.scale(c.low);
        const yOpen = yAxis.scale(c.open);
        const yClose = yAxis.scale(c.close);

        const isUp = c.close >= c.open;
        const top = Math.min(yOpen, yClose);
        const height = Math.max(1.5, Math.abs(yClose - yOpen));
        const color = isUp ? '#22c55e' : '#ef4444';

        return (
          <g key={c.day}>
            <line
              x1={xCenter}
              x2={xCenter}
              y1={yHigh}
              y2={yLow}
              stroke={color}
              strokeWidth={1.4}
              strokeLinecap="round"
              opacity={0.9}
            />
            <rect
              x={xCenter - bodyWidth / 2}
              y={top}
              width={bodyWidth}
              height={height}
              rx={1}
              fill={color}
              opacity={0.95}
            />
          </g>
        );
      })}
    </g>
  );
}

export default function StockDetailsPage() {
  const params = useParams<{ symbol: string }>();
  const routeSymbol = decodeURIComponent(params.symbol || '').toUpperCase();

  const [stock, setStock] = useState<Stock | null>(null);
  const [minuteData, setMinuteData] = useState<MinutePoint[]>([]);
  const [dailyData, setDailyData] = useState<DailyPoint[]>([]);
  const [modelPredictedPrice, setModelPredictedPrice] = useState<number | null>(null);
  const [buySignalResult, setBuySignalResult] = useState<BuySignalResponse | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null);
  const [tradeSide, setTradeSide] = useState<'BUY' | 'SELL'>('BUY');
  const [tradeQty, setTradeQty] = useState('');
  const [tradeSubmitting, setTradeSubmitting] = useState(false);
  const [tradeError, setTradeError] = useState('');
  const [tradeSuccess, setTradeSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadPortfolio = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      if (Array.isArray(json?.holdings) && Array.isArray(json?.transactions)) {
        setPortfolio(json as PortfolioResponse);
      }
    } catch {
      // keep previous snapshot
    }
  }, []);

  useEffect(() => {
    if (!routeSymbol) return;

    let alive = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [stocksRes, dailyRes] = await Promise.all([
          fetch('/api/market/stocks', { cache: 'no-store' }),
          fetch(`/api/market/history?symbol=${encodeURIComponent(routeSymbol)}&source=yahoo&range=3mo&interval=1day&outputsize=50`, {
            cache: 'no-store',
          }),
        ]);

        const stocksJson = await stocksRes.json();
        const dailyJson = await dailyRes.json();

        if (!alive) return;

        const stockMatch = Array.isArray(stocksJson?.stocks)
          ? (stocksJson.stocks as Stock[]).find((s) => s.sym.toUpperCase() === routeSymbol)
          : null;

        if (!stockMatch) {
          setError('Stock not found in market list');
          setLoading(false);
          return;
        }

        const minutePoints: MinutePoint[] = Array.isArray(stockMatch?.spark)
          ? stockMatch.spark
              .map((p: { v: number }, idx: number) => ({
                datetime: String(idx),
                close: Number(p.v),
              }))
              .filter((p: MinutePoint) => Number.isFinite(p.close))
          : [];

        const dailyPoints: DailyPoint[] = Array.isArray(dailyJson?.ohlc)
          ? dailyJson.ohlc
              .map((p: { datetime: string; open: number; high: number; low: number; close: number }) => ({
                datetime: p.datetime,
                open: Number(p.open),
                high: Number(p.high),
                low: Number(p.low),
                close: Number(p.close),
              }))
              .filter((p: DailyPoint) => [p.open, p.high, p.low, p.close].every(Number.isFinite))
              .sort((a: DailyPoint, b: DailyPoint) => {
                return new Date(a.datetime).getTime() - new Date(b.datetime).getTime();
              })
          : [];

        setStock(stockMatch);
        setMinuteData(minutePoints);
        setDailyData(dailyPoints);
        await loadPortfolio();
      } catch {
        if (!alive) return;
        setError('Unable to load stock details right now');
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();

    const iv = setInterval(async () => {
      if (!alive) return;
      try {
        const res = await fetch('/api/market/stocks', { cache: 'no-store' });
        const json = await res.json();
        if (!alive) return;
        const stockMatch = Array.isArray(json?.stocks)
          ? (json.stocks as Stock[]).find((s) => s.sym.toUpperCase() === routeSymbol)
          : null;
        if (stockMatch) {
          const minutePoints: MinutePoint[] = Array.isArray(stockMatch?.spark)
            ? stockMatch.spark
                .map((p: { v: number }, idx: number) => ({
                  datetime: String(idx),
                  close: Number(p.v),
                }))
                .filter((p: MinutePoint) => Number.isFinite(p.close))
            : [];
          setStock(stockMatch);
          setMinuteData(minutePoints);
        }
      } catch {
        // keep old quote
      }
    }, 1000);

    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [routeSymbol, loadPortfolio]);

  const todayPrice = useMemo(() => {
    const last = minuteData[minuteData.length - 1]?.close;
    if (Number.isFinite(last)) return Number(last);
    return stock?.price ?? 0;
  }, [minuteData, stock?.price]);

  useEffect(() => {
    let alive = true;

    const runPrediction = async () => {
      try {
        const res = await fetch('/api/predict/eod', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker: routeSymbol }),
          cache: 'no-store',
        });
        const json = await res.json();

        if (!alive) return;
        if (res.ok && Number.isFinite(Number(json?.predicted_close))) {
          setModelPredictedPrice(Number(json.predicted_close));
        } else {
          setModelPredictedPrice(null);
        }
      } catch {
        if (!alive) return;
        setModelPredictedPrice(null);
      }
    };

    runPrediction();

    const fetchBuySignal = async () => {
      try {
        const res = await fetch('/api/predict-buy-signal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker: routeSymbol }),
          cache: 'no-store',
        });
        const json = await res.json();

        if (!alive) return;
        if (res.ok && json?.signal) {
          setBuySignalResult(json);
        } else {
          setBuySignalResult(null);
        }
      } catch {
        if (!alive) return;
        setBuySignalResult(null);
      }
    };
    
    if (routeSymbol === 'AAPL' || routeSymbol === 'TSLA') {
      fetchBuySignal();
    }

    return () => {
      alive = false;
    };
  }, [routeSymbol]);

  const predictedPrice = useMemo(() => {
    if (Number.isFinite(modelPredictedPrice)) return round2(Number(modelPredictedPrice));
    const seed = symbolSeed(routeSymbol || 'STOCK') % 1000;
    const bump = ((seed % 28) - 7) / 1000;
    return round2(todayPrice * (1 + bump));
  }, [modelPredictedPrice, routeSymbol, todayPrice]);

  const dailyCandles = useMemo(() => {
    if (dailyData.length > 0) {
      return dailyData.map((p, idx) => {
        const day = new Date(p.datetime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const from = Math.max(0, idx - 4);
        const window = dailyData.slice(from, idx + 1);
        const ma = window.reduce((sum, item) => sum + item.close, 0) / window.length;

        return {
          day,
          open: round2(p.open),
          high: round2(p.high),
          low: round2(p.low),
          close: round2(p.close),
          ma: round2(ma),
        };
      });
    }

    const base = todayPrice || stock?.price || 100;
    return createDailyCandles(routeSymbol || 'STOCK', base, 18);
  }, [dailyData, routeSymbol, todayPrice, stock?.price]);

  const intraday = useMemo(() => {
    if (minuteData.length === 0) {
      return { open: todayPrice, high: todayPrice, low: todayPrice, changePct: 0 };
    }
    const open = minuteData[0].close;
    const values = minuteData.map((p) => p.close);
    const high = Math.max(...values);
    const low = Math.min(...values);
    const changePct = open > 0 ? ((todayPrice - open) / open) * 100 : 0;

    return {
      open: round2(open),
      high: round2(high),
      low: round2(low),
      changePct,
    };
  }, [minuteData, todayPrice]);

  const todayChangePct = useMemo(() => {
    const quoteChange = Number(stock?.chg);
    if (Number.isFinite(quoteChange) && Math.abs(quoteChange) > 0.0001) {
      return quoteChange;
    }
    return intraday.changePct;
  }, [stock?.chg, intraday.changePct]);

  const predictionDelta = predictedPrice - todayPrice;
  const predictionUp = predictionDelta >= 0;

  const currentHolding = useMemo(() => {
    return (portfolio?.holdings || []).find((h) => h.sym.toUpperCase() === routeSymbol) || null;
  }, [portfolio?.holdings, routeSymbol]);

  const recentTrades = useMemo(() => {
    return (portfolio?.transactions || [])
      .filter((t) => t.sym?.toUpperCase?.() === routeSymbol)
      .slice(0, 5);
  }, [portfolio?.transactions, routeSymbol]);

  const tradeQtyNum = Number(tradeQty);
  const tradeValue = Number.isFinite(tradeQtyNum) && tradeQtyNum > 0 ? round2(tradeQtyNum * todayPrice) : 0;

  const submitTrade = useCallback(async () => {
    if (!stock) return;
    setTradeError('');
    setTradeSuccess('');

    const quantity = Number(tradeQty);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setTradeError('Enter valid quantity');
      return;
    }
    if (!Number.isFinite(todayPrice) || todayPrice <= 0) {
      setTradeError('Live price unavailable');
      return;
    }

    setTradeSubmitting(true);
    try {
      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          side: tradeSide,
          sym: stock.sym,
          name: stock.name,
          sector: stock.sector,
          quantity,
          price: todayPrice,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json?.error === 'string' ? json.error : 'Trade failed');
      }

      setTradeSuccess(`${tradeSide === 'BUY' ? 'Bought' : 'Sold'} ${quantity} ${stock.sym}`);
      setTradeQty('');
      await loadPortfolio();
    } catch (e) {
      setTradeError(e instanceof Error ? e.message : 'Trade failed');
    } finally {
      setTradeSubmitting(false);
    }
  }, [stock, tradeQty, todayPrice, tradeSide, loadPortfolio]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/stocks"
          className="p-2.5 rounded-xl bg-muted border border-border text-gray-400 hover:text-white hover:border-gray-600 transition-all shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black truncate">{routeSymbol || 'Stock Details'}</h1>
            {stock?.live && (
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1 truncate">
            {stock?.name || 'Live stock view'} · {stock?.sector || 'Equity'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-8 h-[500px] rounded-2xl border border-border bg-card animate-pulse" />
          <div className="xl:col-span-4 h-[500px] rounded-2xl border border-border bg-card animate-pulse" />
        </div>
      ) : error || !stock ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-14 text-center">
          <p className="text-sm font-medium text-gray-300">{error || 'Unable to load this stock'}</p>
          <p className="text-xs text-gray-500 mt-2">Try another symbol from the stocks list.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <section className="xl:col-span-8 space-y-6">

            {/* Price Hero */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Current Price</p>
                  <p className="text-4xl font-black text-white tabular-nums tracking-tight">{formatPrice(stock.sym, todayPrice)}</p>
                  <div className={`mt-2 inline-flex items-center gap-1 text-sm font-bold px-2.5 py-1 rounded-lg ${todayChangePct >= 0 ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' : 'text-red-400 bg-red-500/10 border border-red-500/20'}`}>
                    {todayChangePct >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    {Math.abs(todayChangePct).toFixed(2)}% today
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Metric label="Open" value={formatPrice(stock.sym, intraday.open)} icon={<CalendarRange className="w-3.5 h-3.5" />} />
                  <Metric label="High" value={formatPrice(stock.sym, intraday.high)} icon={<ArrowUpRight className="w-3.5 h-3.5" />} />
                  <Metric label="Low" value={formatPrice(stock.sym, intraday.low)} icon={<ArrowDownRight className="w-3.5 h-3.5" />} />
                  <Metric label="Volume" value={stock.vol} icon={<Activity className="w-3.5 h-3.5" />} />
                </div>
              </div>
            </div>

            {/* Chart */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="text-base font-bold text-white">Daily Price Movement</h2>
                <p className="text-xs text-gray-500 mt-1">Candlestick chart with 5-day moving average overlay</p>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md bg-muted text-gray-400 border border-border">
                {dailyData.length > 0 ? 'Yahoo · 50 sessions' : 'Demo data'}
              </span>
            </div>

            <div className="h-96 w-full rounded-xl bg-[#060610] border border-[#151527] p-3">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailyCandles} margin={{ top: 14, right: 16, bottom: 8, left: 2 }}>
                  <defs>
                    <linearGradient id="maGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.5} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 6" opacity={0.7} />
                  <XAxis dataKey="day" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={74}
                    domain={['dataMin - 1', 'dataMax + 1']}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#0b1220',
                      border: '1px solid #1e293b',
                      borderRadius: '12px',
                    }}
                    labelStyle={{ color: '#e2e8f0', fontWeight: 700 }}
                    formatter={(value: number, key: string) => {
                      if (['open', 'high', 'low', 'close', 'ma'].includes(key)) {
                        return [formatPrice(stock.sym, Number(value)), key.toUpperCase()];
                      }
                      return [value, key];
                    }}
                  />

                  <Customized component={(p: unknown) => (
                    <CandleLayer
                      {...(p as { xAxisMap: Record<string, { scale: (value: string) => number; bandwidth?: () => number }>; yAxisMap: Record<string, { scale: (value: number) => number }> })}
                      candles={dailyCandles}
                    />
                  )}
                  />

                  <Line
                    type="monotone"
                    dataKey="ma"
                    stroke="url(#maGlow)"
                    strokeWidth={2.4}
                    dot={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            </div>

            {/* AI Predictions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">EOD Price Predictor</p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#38bdf8]/10 text-[#38bdf8] border border-[#38bdf8]/20">
                    {modelPredictedPrice !== null ? 'LSTM' : 'Heuristic'}
                  </span>
                </div>
                <p className="text-3xl font-black text-white tracking-tight">{formatPrice(stock.sym, predictedPrice)}</p>
                <p className={`text-sm mt-2 font-semibold ${predictionUp ? 'text-emerald-400' : 'text-red-400'}`}>
                  {predictionUp ? '+' : '-'}{formatPrice(stock.sym, Math.abs(predictionDelta))} vs current
                </p>
              </div>

              {buySignalResult ? (
                <div className="rounded-2xl border border-[#8b5cf6]/30 bg-[#8b5cf6]/5 p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">RF Buy Signal (5-Day)</p>
                    <BrainCircuit className="w-4 h-4 text-[#8b5cf6]" />
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className={`text-3xl font-black tracking-tight ${buySignalResult.signal === 'BUY' ? 'text-emerald-400' : 'text-orange-400'}`}>
                        {buySignalResult.signal}
                      </p>
                      <p className={`text-sm mt-1 font-semibold ${buySignalResult.predicted_return_percent >= 0 ? 'text-emerald-400' : 'text-orange-400'}`}>
                        {buySignalResult.predicted_return_percent >= 0 ? '+' : ''}{buySignalResult.predicted_return_percent.toFixed(2)}% expected
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">5-Day Target</p>
                      <p className="text-2xl font-black text-white tracking-tight mt-1">{formatPrice(stock.sym, buySignalResult.predicted_price_5d)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col justify-center items-center text-center">
                  <BrainCircuit className="w-8 h-8 text-gray-700 mb-2" />
                  <p className="text-xs text-gray-500 font-medium">Buy signal available for AAPL & TSLA only</p>
                </div>
              )}
            </div>

            {/* Recent Trades for this stock */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-border bg-muted/20 flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Your Trades · {stock.sym}</h3>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-gray-400">{recentTrades.length}</span>
              </div>
              {recentTrades.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500">No transactions for this stock yet.</div>
              ) : (
                <div className="divide-y divide-border/50">
                  {recentTrades.map((t) => (
                    <div key={t.id} className="flex items-center justify-between px-5 py-3 hover:bg-muted/10 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${t.side === 'BUY' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                          {t.side}
                        </span>
                        <span className="text-xs text-gray-500">{fmtDate(t.createdAt)}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-white">{t.quantity.toLocaleString('en-IN', { maximumFractionDigits: 4 })} @ {formatPrice(stock.sym, t.price)}</p>
                        <p className="text-xs text-gray-400">{formatPrice(stock.sym, t.totalValue)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* RIGHT COLUMN */}
          <aside className="xl:col-span-4 space-y-6">

            {/* Trade Ticket */}
            <div className="rounded-2xl border border-primary/20 bg-linear-to-b from-card to-background p-5 shadow-lg relative overflow-hidden">
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
              
              <div className="flex items-center justify-between mb-5 relative z-10">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-primary" />
                  Trade {stock.sym}
                </h2>
                <div className="flex items-center gap-2">
                  <button onClick={loadPortfolio} className="text-xs text-gray-400 hover:text-white inline-flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" />
                  </button>
                  <Link href="/dashboard/portfolio" className="text-xs font-bold text-primary hover:underline">Portfolio</Link>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-5 relative z-10">
                <button
                  onClick={() => setTradeSide('BUY')}
                  className={`h-11 rounded-xl text-sm font-bold border-2 transition-all ${
                    tradeSide === 'BUY'
                      ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                      : 'bg-card border-border text-gray-400 hover:border-gray-500'
                  }`}
                >
                  Buy Order
                </button>
                <button
                  onClick={() => setTradeSide('SELL')}
                  className={`h-11 rounded-xl text-sm font-bold border-2 transition-all ${
                    tradeSide === 'SELL'
                      ? 'bg-red-500/10 border-red-500 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.1)]'
                      : 'bg-card border-border text-gray-400 hover:border-gray-500'
                  }`}
                >
                  Sell Order
                </button>
              </div>

              <div className="space-y-4 relative z-10">
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Quantity</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      value={tradeQty}
                      onChange={(e) => setTradeQty(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 h-11 rounded-xl border border-border bg-background px-3 text-sm font-medium text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    />
                    <button
                      onClick={() => {
                        if (tradeSide === 'BUY') {
                          const max = (portfolio?.walletBalance || 0) / Math.max(todayPrice, 0.0001);
                          setTradeQty(String(round2(max)));
                        } else {
                          setTradeQty(String(round2(currentHolding?.quantity || 0)));
                        }
                      }}
                      className="h-11 px-4 rounded-xl border border-border bg-muted/50 text-xs font-bold text-gray-300 hover:text-white hover:bg-muted transition-all"
                    >
                      Max
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-400 font-medium">Wallet Balance</span>
                    <span className="text-sm font-bold text-white inline-flex items-center gap-1"><Wallet className="w-3.5 h-3.5 text-primary" />{moneyINR(portfolio?.walletBalance || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-400 font-medium">Your Holding</span>
                    <span className="text-sm font-bold text-white">{currentHolding ? currentHolding.quantity.toLocaleString('en-IN', { maximumFractionDigits: 4 }) : '0'} units</span>
                  </div>
                  <div className="w-full h-px bg-border my-1" />
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-400 font-medium">Live Price</span>
                    <span className="text-sm font-bold text-white">{formatPrice(stock.sym, todayPrice)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-400 font-medium">Estimated Value</span>
                    <span className="text-sm font-bold text-primary">{tradeValue > 0 ? formatPrice(stock.sym, tradeValue) : '—'}</span>
                  </div>
                </div>

                <button
                  onClick={submitTrade}
                  disabled={tradeSubmitting || !Number.isFinite(tradeQtyNum) || tradeQtyNum <= 0 || todayPrice <= 0}
                  className={`w-full h-12 rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md ${
                    tradeSide === 'BUY'
                      ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                      : 'bg-red-500 text-white hover:bg-red-600'
                  }`}
                >
                  {tradeSubmitting ? 'Processing...' : `Confirm ${tradeSide} Order`}
                </button>

                {tradeError && <p className="text-xs text-red-400 bg-red-500/10 p-2 rounded-lg">{tradeError}</p>}
                {!tradeError && tradeSuccess && <p className="text-xs text-emerald-400 bg-emerald-500/10 p-2 rounded-lg font-medium">{tradeSuccess}</p>}
              </div>
            </div>

            {/* Stock Info */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h3 className="text-sm font-bold text-white mb-3">About {stock.sym}</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400 font-medium">Sector</span>
                  <span className="text-sm font-semibold text-white">{stock.sector || 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400 font-medium">Symbol</span>
                  <span className="text-sm font-semibold text-white">{stock.sym}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400 font-medium">Market Status</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {stock.live ? 'Live' : 'Delayed'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400 font-medium">Data Source</span>
                  <span className="text-xs text-gray-300">Finnhub + Yahoo</span>
                </div>
              </div>
            </div>

            <div className="text-[11px] text-gray-500 leading-relaxed border border-border rounded-xl p-3 bg-muted/20">
              Daily candles from Yahoo (3mo, last 50 sessions). Live price via Finnhub per-minute market feed.
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 shadow-sm">
      <div className="flex items-center gap-1.5 text-gray-400 text-[11px] font-semibold uppercase tracking-wider">
        <span className="text-primary">{icon}</span>
        <span>{label}</span>
      </div>
      <p className="text-sm font-bold mt-2 text-white truncate tabular-nums">{value}</p>
    </div>
  );
}
