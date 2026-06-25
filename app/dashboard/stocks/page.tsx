'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWishlist } from '@/hooks/use-wishlist';
import {
  AreaChart, Area, ResponsiveContainer, CartesianGrid, ReferenceLine, YAxis,
} from 'recharts';
import {
  Heart, Search, ArrowUpRight, ArrowDownRight, ArrowLeft, X,
} from 'lucide-react';

function sparkAccent(spark?: { v: number }[]): { color: string; pct: number } {
  if (!spark || spark.length < 2) return { color: '#f59e0b', pct: 0 };
  const first = spark[0].v;
  const last = spark[spark.length - 1].v;
  const pct = ((last - first) / first) * 100;
  if (pct > 0.3) return { color: '#10b981', pct };
  if (pct < -0.3) return { color: '#ef4444', pct };
  return { color: '#f59e0b', pct };
}

/* ── types ─────────────────────────────────────────────────────────────── */
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

const SECTORS = [
  'All', 'Technology', 'Financial Services', 'Healthcare',
  'Consumer Cyclical', 'Consumer Defensive', 'Energy',
  'Automotive', 'Entertainment', 'Telecom', 'Industrials',
];

/* ── page ──────────────────────────────────────────────────────────────── */
export default function StocksPage() {
  const router = useRouter();
  const { toggle, has } = useWishlist();
  const [stocks, setStocks]                     = useState<Stock[]>([]);
  const [loading, setLoading]                   = useState(true);
  const [search, setSearch]                     = useState('');
  const [sector, setSector]                     = useState('All');
  const [showWishlistOnly, setShowWishlistOnly] = useState(false);

  // sparkline data keyed by symbol
  const [sparks, setSparks] = useState<Record<string, { v: number }[]>>({});
  const loadedOnceRef = useRef(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('filter') === 'wishlist') setShowWishlistOnly(true);
    } catch { /* SSR guard */ }
  }, []);

  useEffect(() => {
    let alive = true;

    const pull = async () => {
      try {
        const res = await fetch('/api/market/stocks', { cache: 'no-store' });
        const d = await res.json();
        if (!alive) return;

        if (Array.isArray(d?.stocks)) {
          const nextStocks = d.stocks as Stock[];
          setStocks(nextStocks);

          const nextSparks: Record<string, { v: number }[]> = {};
          nextStocks.forEach((s) => {
            if (Array.isArray(s.spark) && s.spark.length > 0) {
              nextSparks[s.sym] = s.spark;
            }
          });
          setSparks(nextSparks);
        }
      } catch {
        // keep previous snapshot
      } finally {
        if (!loadedOnceRef.current) {
          loadedOnceRef.current = true;
          setLoading(false);
        }
      }
    };

    pull();
    const iv = setInterval(pull, 1_000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const filtered = useMemo(() => {
    let result = stocks;
    if (showWishlistOnly) result = result.filter((s) => has(s.sym));
    if (sector !== 'All') result = result.filter((s) => s.sector === sector);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) => s.sym.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
      );
    }
    return result;
  }, [stocks, search, sector, showWishlistOnly, has]);

  const activeFilters = (sector !== 'All' ? 1 : 0) + (showWishlistOnly ? 1 : 0) + (search ? 1 : 0);

  return (
    <>
      {/* header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="p-2 rounded-xl bg-muted border border-border text-gray-400 hover:text-white transition-all">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">All Stocks</h1>
          <p className="text-xs text-gray-500 mt-0.5">{filtered.length} of {stocks.length} stocks</p>
        </div>
      </div>

      {/* filters bar */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* search */}
          <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-card border border-border focus-within:border-[#10b981]/40 transition-all flex-1 max-w-md">
            <Search className="w-4 h-4 text-gray-500 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or symbol…"
              className="bg-transparent text-white placeholder-gray-600 outline-none text-sm flex-1"
              autoFocus
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-gray-500 hover:text-white transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* wishlist toggle */}
          <button
            onClick={() => setShowWishlistOnly((v) => !v)}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all
              ${showWishlistOnly
                ? 'bg-[#ef4444]/10 border-[#ef4444]/25 text-[#ef4444]'
                : 'bg-card border-border text-gray-400 hover:text-white hover:border-border'
              }`}
          >
            <Heart className={`w-3.5 h-3.5 ${showWishlistOnly ? 'fill-current' : ''}`} />
            Wishlist
          </button>

          {activeFilters > 0 && (
            <button
              onClick={() => { setSearch(''); setSector('All'); setShowWishlistOnly(false); }}
              className="text-xs text-gray-500 hover:text-white transition-colors underline"
            >
              Clear all
            </button>
          )}
        </div>

        {/* sector pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {SECTORS.map((s) => (
            <button
              key={s}
              onClick={() => setSector(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150
                ${sector === s
                  ? 'bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/25 shadow-[0_0_8px_rgba(16,185,129,0.1)]'
                  : 'bg-card text-gray-500 hover:text-gray-300 border border-border hover:border-border'
                }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="h-22 rounded-2xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-14 text-center">
          <Search className="w-8 h-8 text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No stocks match your filters</p>
          <p className="text-xs text-gray-600 mt-1">Try adjusting your search or sector filter</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((s) => (
            <StockCard
              key={s.sym}
              stock={s}
              wished={has(s.sym)}
              onToggle={() => toggle(s.sym)}
              onOpen={() => router.push(`/dashboard/stocks/${encodeURIComponent(s.sym)}`)}
              spark={sparks[s.sym]}
            />
          ))}
        </div>
      )}
    </>
  );
}

/* ── stock card (vertical with sparkline) ──────────────────────────────── */
function StockCard({
  stock,
  wished,
  onToggle,
  onOpen,
  spark,
}: {
  stock: Stock;
  wished: boolean;
  onToggle: () => void;
  onOpen: () => void;
  spark?: { v: number }[];
}) {
  const symbol = stock.sym.replace('.NSE', '');
  const shouldUseDemoFlow = symbol !== 'AAPL' && symbol !== 'TSLA';

  const seedSpark = useMemo(() => {
    if (Array.isArray(spark) && spark.length > 0) return spark.map((p) => ({ v: Number(p.v || 0) }));
    const base = Number(stock.price || 1);
    return Array.from({ length: 26 }).map((_, i) => ({
      v: Number((base * (1 + Math.sin(i / 4) * 0.0025)).toFixed(3)),
    }));
  }, [spark, stock.price]);

  const [demoSpark, setDemoSpark] = useState<{ v: number }[]>(seedSpark);
  const demoVelocityRef = useRef(0);

  useEffect(() => {
    setDemoSpark(seedSpark);
    demoVelocityRef.current = 0;
  }, [seedSpark]);

  useEffect(() => {
    if (!shouldUseDemoFlow) return;

    const iv = setInterval(() => {
      setDemoSpark((prev) => {
        const source = prev.length > 1 ? prev : seedSpark;
        const last = Number(source[source.length - 1]?.v || stock.price || 1);
        const base = Number(seedSpark[0]?.v || stock.price || 1);
        const distanceFromBasePct = ((last - base) / base) * 100;
        const meanRevert = -distanceFromBasePct * 0.18;
        const momentum = demoVelocityRef.current * 0.55;
        const baseShock = (Math.random() - 0.5) * 1.8;
        const burstShock = Math.random() < 0.12 ? (Math.random() - 0.5) * 3.2 : 0;
        const driftPct = meanRevert + momentum + baseShock + burstShock;
        demoVelocityRef.current = driftPct;

        const unclampedNext = last * (1 + driftPct / 100);
        const upperBand = base * 1.045;
        const lowerBand = base * 0.955;
        const next = Math.max(lowerBand, Math.min(upperBand, unclampedNext));
        const nextSeries = [...source, { v: Number(next.toFixed(4)) }];
        return nextSeries.slice(-28);
      });
    }, 900);

    return () => clearInterval(iv);
  }, [seedSpark, shouldUseDemoFlow, stock.price]);

  const chartSeries = shouldUseDemoFlow ? demoSpark : seedSpark;
  const basePrice = Number(chartSeries[0]?.v || stock.price || 1);
  const deviationSeries = chartSeries.map((point) => ({
    dev: Number((((Number(point.v || basePrice) - basePrice) / basePrice) * 100 * 4).toFixed(4)),
  }));

  const displayedPrice = shouldUseDemoFlow
    ? Number(chartSeries[chartSeries.length - 1]?.v || stock.price)
    : Number(stock.price);

  const { color: accent, pct } = sparkAccent(chartSeries);
  const up = pct >= 0;
  const gradientId = `sg-${stock.sym.replace(/[^a-zA-Z0-9]/g, '')}`;
  const glowId = `sg-glow-${stock.sym.replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group relative block rounded-2xl border border-border bg-card hover:border-border transition-all duration-200 hover:bg-muted overflow-hidden cursor-pointer"
    >
      {/* header row */}
      <div className="flex items-center gap-2.5 p-3.5 pb-0">
        {/* icon */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-extrabold shrink-0 border"
          style={{
            background: `linear-gradient(135deg, ${accent}12, ${accent}06)`,
            borderColor: accent + '20',
            color: accent,
          }}
        >
          {stock.sym.replace('.NSE', '').slice(0, 2)}
        </div>

        {/* name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-white">{stock.sym.replace('.NSE', '')}</span>
            {stock.live && <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] shrink-0" />}
          </div>
          <p className="text-[10px] text-gray-500 truncate">{stock.name}</p>
        </div>

        {/* heart */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="p-1.5 rounded-lg hover:bg-white/5 transition-all shrink-0"
        >
          <Heart
            className={`w-4 h-4 transition-all duration-200 ${
              wished
                ? 'fill-[#ef4444] text-[#ef4444] scale-110'
                : 'text-gray-600 group-hover:text-gray-400'
            }`}
          />
        </button>
      </div>

      {/* sparkline chart */}
      <div className="h-16 px-2 mt-1">
        {chartSeries && chartSeries.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={deviationSeries} margin={{ top: 2, right: 0, left: 0, bottom: 1 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={accent} stopOpacity={0.42} />
                  <stop offset="95%" stopColor={accent} stopOpacity={0} />
                </linearGradient>
                <linearGradient id={glowId} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#111827" stopOpacity={0} />
                  <stop offset="50%" stopColor={accent} stopOpacity={0.12} />
                  <stop offset="100%" stopColor="#111827" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1e2437" strokeDasharray="3 5" vertical={false} />
              <YAxis
                hide
                domain={[-3.2, 3.2]}
              />
              <ReferenceLine y={0} stroke="#334155" strokeDasharray="4 4" />
              <Area
                type="monotone" dataKey="dev" stroke={accent} strokeWidth={1.8}
                fill={`url(#${gradientId})`} dot={false} isAnimationActive={false}
              />
              <Area
                type="monotone" dataKey="dev" stroke="none"
                fill={`url(#${glowId})`} dot={false} isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full rounded-lg bg-muted/40 animate-pulse" />
        )}
      </div>

      {/* price row */}
      <div className="flex items-end justify-between px-3.5 pb-3 pt-1">
        <p className="text-base font-bold tabular-nums text-white">
          {stock.sym.includes('.NSE') ? '₹' : '$'}
          {displayedPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
        </p>
        <span
          className="flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-full"
          style={{ background: accent + '20', color: accent }}
        >
          {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {Math.abs(pct).toFixed(2)}%
        </span>
      </div>
    </div>
  );
}
