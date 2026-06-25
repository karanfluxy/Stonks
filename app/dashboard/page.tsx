'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useWishlist } from '@/hooks/use-wishlist';
import {
  AreaChart, Area, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, LineChart, Line, ReferenceLine,
} from 'recharts';
import {
  Heart, ChevronRight, ArrowUpRight, ArrowDownRight,
  Newspaper, BarChart3, TrendingUp, TrendingDown, Clock,
  ExternalLink, Wallet, RefreshCw, Zap, Brain,
  PieChart as PieIcon, Receipt,
} from 'lucide-react';

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

type NewsItem = {
  headline: string;
  description?: string | null;
  sentiment: string;
  sentimentReview?: string | null;
  impact: string;
  time: string;
  source: string;
  url: string | null;
};

type PortfolioHolding = {
  sym: string;
  name: string;
  quantity: number;
  avgPrice: number;
  costBasis: number;
};

type PortfolioTxn = {
  realizedPnl: number;
  createdAt: string;
};

type PortfolioSnapshot = {
  holdings: PortfolioHolding[];
  transactions: PortfolioTxn[];
  summary: {
    totalInvested: number;
    realizedPnl: number;
  };
};

/* ── sentiment / impact constants ──────────────────────────────────────── */
const SENTIMENT_STYLES: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  bullish: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', icon: '↑' },
  bearish: { bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/20',     icon: '↓' },
  neutral: { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20',   icon: '→' },
};

const IMPACT_COLORS: Record<string, string> = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' };
const ALLOCATION_COLORS = ['#10b981', '#38bdf8', '#a78bfa', '#f59e0b', '#ef4444', '#22c55e'];

function formatInr(value: number): string {
  return `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function AllocationTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0];
  const name = row?.name || 'Stock';
  const value = Number(row?.value || 0);

  return (
    <div className="rounded-lg border border-[#2a3958] bg-[#0a1226]/95 px-2.5 py-1.5 shadow-[0_8px_20px_rgba(0,0,0,0.45)] backdrop-blur-sm">
      <div className="flex items-center gap-2 text-xs">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: row?.color || '#38bdf8' }} />
        <span className="font-semibold text-white">{name}</span>
        <span className="text-[#93c5fd] tabular-nums">{formatInr(value)}</span>
      </div>
    </div>
  );
}

/** Derive accent color from spark trend: green / yellow / red */
function sparkAccent(spark?: { v: number }[]): { color: string; pct: number } {
  if (!spark || spark.length < 2) return { color: '#f59e0b', pct: 0 };
  const first = spark[0].v;
  const last = spark[spark.length - 1].v;
  const pct = ((last - first) / first) * 100;
  if (pct > 0.3) return { color: '#10b981', pct };
  if (pct < -0.3) return { color: '#ef4444', pct };
  return { color: '#f59e0b', pct };
}

/* ── main page ─────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const { toggle, has } = useWishlist();
  const [stocks, setStocks]   = useState<Stock[]>([]);
  const [news, setNews]       = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletAmount, setWalletAmount] = useState('');
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletSubmitting, setWalletSubmitting] = useState(false);
  const [walletError, setWalletError] = useState('');
  const [walletSuccess, setWalletSuccess] = useState('');
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(true);

  // per-symbol sparkline data keyed by sym
  const [sparks, setSparks] = useState<Record<string, { v: number }[]>>({});
  const loadedStocksRef = useRef(false);

  useEffect(() => {
    let alive = true;

    const pull = async () => {
      try {
        const r = await fetch('/api/market/stocks', { cache: 'no-store' });
        const d = await r.json();
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
        if (!loadedStocksRef.current) {
          loadedStocksRef.current = true;
          setLoading(false);
        }
      }
    };

    pull();
    const iv = setInterval(pull, 1_000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch('/api/news/realtime', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (Array.isArray(d?.news)) setNews(d.news);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const loadWallet = useCallback(async () => {
    setWalletLoading(true);
    setWalletError('');
    try {
      const res = await fetch('/api/wallet', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Failed to fetch wallet');
      }
      const nextBalance = Number(data?.balance ?? 0);
      setWalletBalance(Number.isFinite(nextBalance) ? nextBalance : 0);
    } catch (e) {
      setWalletError(e instanceof Error ? e.message : 'Failed to fetch wallet');
    } finally {
      setWalletLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  useEffect(() => {
    let alive = true;

    const loadPortfolio = async () => {
      try {
        const res = await fetch('/api/portfolio', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        if (res.ok) {
          setPortfolio(data as PortfolioSnapshot);
        }
      } catch {
        // keep previous portfolio snapshot
      } finally {
        if (alive) setPortfolioLoading(false);
      }
    };

    loadPortfolio();
    const iv = setInterval(loadPortfolio, 12_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  const addMoneyToWallet = useCallback(async () => {
    setWalletError('');
    setWalletSuccess('');
    const amount = Number(walletAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setWalletError('Enter a valid amount greater than 0');
      return;
    }

    setWalletSubmitting(true);
    try {
      const res = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Failed to add money');
      }

      const nextBalance = Number(data?.balance ?? walletBalance);
      setWalletBalance(Number.isFinite(nextBalance) ? nextBalance : walletBalance);
      setWalletAmount('');
      setWalletSuccess('Money added successfully');
    } catch (e) {
      setWalletError(e instanceof Error ? e.message : 'Failed to add money');
    } finally {
      setWalletSubmitting(false);
    }
  }, [walletAmount, walletBalance]);

  const wishlisted    = stocks.filter((s) => has(s.sym));
  const previewStocks = stocks.slice(0, 6);
  const previewNews   = news.slice(0, 4);

  const priceBySym = useCallback(
    (sym: string) => {
      const row = stocks.find((s) => s.sym === sym);
      const p = Number(row?.price);
      return Number.isFinite(p) && p > 0 ? p : null;
    },
    [stocks]
  );

  const investedCurrentData = useCallback(() => {
    const invested = Number(portfolio?.summary?.totalInvested || 0);
    const realized = Number(portfolio?.summary?.realizedPnl || 0);

    const current = (portfolio?.holdings || []).reduce((sum, h) => {
      const live = priceBySym(h.sym);
      const value = live != null ? live * Number(h.quantity || 0) : Number(h.costBasis || 0);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);

    return [
      { name: 'Invested', value: Number(invested.toFixed(2)) },
      { name: 'Current', value: Number(current.toFixed(2)) },
      { name: 'Realized', value: Number(realized.toFixed(2)) },
    ];
  }, [portfolio, priceBySym]);

  const allocationData = useCallback(() => {
    const rows = (portfolio?.holdings || []).map((h) => {
      const live = priceBySym(h.sym);
      const value = live != null ? live * Number(h.quantity || 0) : Number(h.costBasis || 0);
      return { name: h.sym, value: Number.isFinite(value) ? value : 0 };
    });
    return rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [portfolio, priceBySym]);

  const realizedTrendData = useCallback(() => {
    const tx = Array.isArray(portfolio?.transactions) ? [...portfolio.transactions] : [];
    tx.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    let running = 0;
    const rows = tx.map((t) => {
      running += Number(t.realizedPnl || 0);
      const d = new Date(t.createdAt);
      const label = Number.isNaN(d.getTime())
        ? 'N/A'
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return { date: label, value: Number(running.toFixed(2)) };
    });

    return rows.slice(-10);
  }, [portfolio]);

  const moneyChartData = useMemo(() => investedCurrentData(), [investedCurrentData]);
  const allocationChartData = useMemo(() => allocationData(), [allocationData]);
  const realizedChartData = useMemo(() => realizedTrendData(), [realizedTrendData]);

  const totalInvested = Number(portfolio?.summary?.totalInvested || 0);
  const totalCurrent = moneyChartData.find((row) => row.name === 'Current')?.value || 0;
  const unrealized = totalCurrent - totalInvested;
  const unrealizedPct = totalInvested > 0 ? (unrealized / totalInvested) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* ── header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs text-primary font-medium tracking-widest uppercase mb-1">
            Live · Auto-refreshing
          </p>
          <h1 className="text-2xl font-bold">Market Dashboard</h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 bg-card border border-border px-3 py-1.5 rounded-full shadow-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          Markets Open
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* ═══════════ LEFT COLUMN ═══════════ */}
        <div className="xl:col-span-8 space-y-6">
          
          {/* Portfolio Summaries */}
          {portfolioLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-24 rounded-2xl border border-border bg-card animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-[#1d2537] bg-linear-to-br from-[#11172a] to-[#0c1220] p-4 shadow-sm">
                <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Invested</p>
                <p className="mt-2 text-2xl font-bold text-white tabular-nums">{formatInr(totalInvested)}</p>
              </div>
              <div className="rounded-2xl border border-[#1d2537] bg-linear-to-br from-[#0f1b28] to-[#0b1420] p-4 shadow-sm">
                <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Current Value</p>
                <p className="mt-2 text-2xl font-bold text-white tabular-nums">{formatInr(totalCurrent)}</p>
              </div>
              <div className="rounded-2xl border border-[#1d2537] bg-linear-to-br from-[#1a1828] to-[#121022] p-4 shadow-sm">
                <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Unrealized P&amp;L</p>
                <p className={`mt-2 text-2xl font-bold tabular-nums ${unrealized >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatInr(unrealized)}
                </p>
                <p className={`text-xs mt-1 font-medium ${unrealized >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {unrealizedPct >= 0 ? '+' : ''}{unrealizedPct.toFixed(2)}% vs Invested
                </p>
              </div>
            </div>
          )}

          {/* Portfolio Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-[#1a1f33] bg-linear-to-b from-[#0f1528] to-[#0a1020] p-5 shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
              <h3 className="text-sm font-bold text-white mb-4">Money Overview</h3>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={moneyChartData} barGap={10}>
                    <defs>
                      <linearGradient id="portfolioBarGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#67e8f9" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.45} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2740" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: '#a7b2cb', fontSize: 12, fontWeight: 500 }} axisLine={false} tickLine={false} dy={10} />
                    <YAxis tick={{ fill: '#a7b2cb', fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                    <Tooltip
                      cursor={{ fill: 'rgba(34, 211, 238, 0.08)' }}
                      contentStyle={{ background: '#0c1120', border: '1px solid #25304b', borderRadius: 12, color: '#e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)' }}
                      formatter={(value: number) => formatInr(Number(value || 0))}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="url(#portfolioBarGradient)" maxBarSize={60} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-[#1a1f33] bg-linear-to-b from-[#10251f] to-[#0b1614] p-5 shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
              <h3 className="text-sm font-bold text-white mb-4">Realized P&amp;L Trend</h3>
              {realizedChartData.length === 0 ? (
                <div className="h-60 flex items-center justify-center">
                  <p className="text-sm text-gray-500 text-center">No realized P&amp;L history yet.</p>
                </div>
              ) : (
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={realizedChartData}>
                      <defs>
                        <linearGradient id="realizedTrendGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#34d399" stopOpacity={0.75} />
                          <stop offset="100%" stopColor="#34d399" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1d2d2a" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: '#9fb6ae', fontSize: 11 }} axisLine={false} tickLine={false} dy={10} />
                      <YAxis tick={{ fill: '#9fb6ae', fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                      <Tooltip
                        contentStyle={{ background: '#0c1120', border: '1px solid #27413a', borderRadius: 12, color: '#d1fae5', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)' }}
                        formatter={(value: number) => formatInr(Number(value || 0))}
                      />
                      <Area type="monotone" dataKey="value" stroke="none" fill="url(#realizedTrendGradient)" />
                      <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Market Stocks */}
          <section>
            <SectionHeader
              icon={<BarChart3 className="w-5 h-5 text-[#10b981]" />}
              title="Market Overview"
              count={`${stocks.length} live stocks`}
              href="/dashboard/stocks"
            />
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-28 rounded-2xl border border-border bg-card animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {previewStocks.map((s) => (
                  <StockCard key={s.sym} stock={s} wished={has(s.sym)} onToggle={() => toggle(s.sym)} spark={sparks[s.sym]} />
                ))}
              </div>
            )}
          </section>

          {/* Top Gainers & Losers */}
          <section>
            <SectionHeader
              icon={<Zap className="w-5 h-5 text-[#f59e0b]" />}
              title="Top Movers"
            />
            {!loading && stocks.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Gainers */}
                <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                  <div className="px-4 py-3 border-b border-border bg-emerald-500/5 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-bold text-emerald-400">Top Gainers</span>
                  </div>
                  <div className="divide-y divide-border/50">
                    {[...stocks]
                      .sort((a, b) => Number(b.chg) - Number(a.chg))
                      .slice(0, 4)
                      .map((s) => {
                        const chg = Number(s.chg || 0);
                        return (
                          <div key={s.sym} className="flex items-center justify-between px-4 py-3 hover:bg-muted/10 transition-colors">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-[10px] font-black text-emerald-400">
                                {s.sym.replace('.NSE', '').slice(0, 2)}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-white">{s.sym.replace('.NSE', '')}</p>
                                <p className="text-[10px] text-gray-500 truncate w-20">{s.name}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-white tabular-nums">
                                {s.sym.includes('.NSE') ? '₹' : '$'}{Number(s.price).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              </p>
                              <p className="text-xs font-bold text-emerald-400 flex items-center justify-end gap-0.5">
                                <ArrowUpRight className="w-3 h-3" />
                                +{Math.abs(chg).toFixed(2)}%
                              </p>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Losers */}
                <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                  <div className="px-4 py-3 border-b border-border bg-red-500/5 flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-red-400" />
                    <span className="text-sm font-bold text-red-400">Top Losers</span>
                  </div>
                  <div className="divide-y divide-border/50">
                    {[...stocks]
                      .sort((a, b) => Number(a.chg) - Number(b.chg))
                      .slice(0, 4)
                      .map((s) => {
                        const chg = Number(s.chg || 0);
                        return (
                          <div key={s.sym} className="flex items-center justify-between px-4 py-3 hover:bg-muted/10 transition-colors">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-[10px] font-black text-red-400">
                                {s.sym.replace('.NSE', '').slice(0, 2)}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-white">{s.sym.replace('.NSE', '')}</p>
                                <p className="text-[10px] text-gray-500 truncate w-20">{s.name}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-white tabular-nums">
                                {s.sym.includes('.NSE') ? '₹' : '$'}{Number(s.price).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              </p>
                              <p className="text-xs font-bold text-red-400 flex items-center justify-end gap-0.5">
                                <ArrowDownRight className="w-3 h-3" />
                                {Math.abs(chg).toFixed(2)}%
                              </p>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Quick Actions */}
          <section>
            <SectionHeader
              icon={<Zap className="w-5 h-5 text-primary" />}
              title="Quick Actions"
            />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Portfolio', href: '/dashboard/portfolio', icon: Wallet, color: '#10b981' },
                { label: 'AI Chat', href: '/dashboard/ai', icon: Brain, color: '#38bdf8' },
                { label: 'ML Rater', href: '/dashboard/portfolio-rater', icon: PieIcon, color: '#f59e0b' },
                { label: 'Transactions', href: '/dashboard/transactions', icon: Receipt, color: '#a78bfa' },
              ].map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className="group flex flex-col items-center gap-3 p-5 rounded-2xl border border-border bg-card hover:border-gray-600 transition-all duration-300 hover:shadow-lg"
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center border shadow-sm transition-transform group-hover:scale-110"
                    style={{ background: action.color + '10', borderColor: action.color + '25', color: action.color }}
                  >
                    <action.icon className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-bold text-gray-300 group-hover:text-white transition-colors">{action.label}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>

        {/* ═══════════ RIGHT COLUMN ═══════════ */}
        <div className="xl:col-span-4 space-y-6">
          
          {/* Virtual Wallet */}
          <div className="rounded-2xl border border-primary/20 bg-card p-5 shadow-sm relative overflow-hidden">
            <div className="absolute -top-4 -right-4 w-24 h-24 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center justify-between mb-4 relative z-10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Wallet className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Virtual Wallet</h3>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Trading Power</p>
                </div>
              </div>
              {walletLoading && <RefreshCw className="w-4 h-4 text-gray-500 animate-spin" />}
            </div>

            <p className="text-3xl font-black text-white tabular-nums mb-4 relative z-10">
              ₹{walletBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>

            <div className="flex flex-col gap-3 relative z-10">
              <div className="flex gap-2">
                <input
                  id="wallet-amount"
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="Amount to add"
                  value={walletAmount}
                  onChange={(e) => setWalletAmount(e.target.value)}
                  className="flex-1 h-10 rounded-xl border border-border bg-background px-3 text-sm text-white placeholder:text-gray-500 outline-none focus:border-primary/60 transition-colors"
                />
                <button
                  onClick={addMoneyToWallet}
                  disabled={walletSubmitting || walletLoading}
                  className="h-10 shrink-0 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
                >
                  {walletSubmitting ? 'Adding...' : 'Add Funds'}
                </button>
              </div>
              <div className="flex gap-2">
                {[500, 1000, 5000].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setWalletAmount(String(amt))}
                    className="flex-1 h-8 rounded-lg border border-border bg-muted/50 text-xs font-semibold text-gray-400 hover:text-white hover:bg-muted transition-colors"
                  >
                    +₹{amt}
                  </button>
                ))}
              </div>
            </div>
            
            {walletError && <p className="text-[11px] text-[#ef4444] mt-3 relative z-10">{walletError}</p>}
            {!walletError && walletSuccess && <p className="text-[11px] text-[#10b981] mt-3 relative z-10 font-medium">{walletSuccess}</p>}
          </div>

          {/* Top Allocation */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h3 className="text-sm font-bold text-white mb-4">Portfolio Allocation</h3>
            {allocationChartData.length === 0 ? (
              <p className="text-sm text-gray-500 py-10 text-center">No allocation data yet.</p>
            ) : (
              <>
                <div className="h-48 mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={allocationChartData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={3}
                        stroke="#0b1020"
                        strokeWidth={2}
                      >
                        {allocationChartData.map((_, idx) => (
                          <Cell key={idx} fill={ALLOCATION_COLORS[idx % ALLOCATION_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={<AllocationTooltip />}
                        cursor={false}
                        wrapperStyle={{ outline: 'none', zIndex: 20 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {allocationChartData.map((row, idx) => (
                    <div key={row.name} className="flex items-center justify-between text-sm p-2 rounded-lg bg-muted/20 border border-border/50">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: ALLOCATION_COLORS[idx % ALLOCATION_COLORS.length] }}
                        />
                        <span className="font-semibold text-gray-200">{row.name}</span>
                      </div>
                      <span className="tabular-nums font-bold text-white">{formatInr(row.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Wishlist */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Heart className="w-4 h-4 text-[#ef4444]" />
                Wishlist
              </h3>
              <Link href="/dashboard/stocks?filter=wishlist" className="text-xs font-semibold text-primary hover:underline">
                View All
              </Link>
            </div>

            {wishlisted.length === 0 ? (
              <div className="py-8 text-center bg-muted/20 rounded-xl border border-dashed border-border">
                <Heart className="w-6 h-6 text-gray-600 mx-auto mb-2" />
                <p className="text-xs text-gray-400">Your wishlist is empty</p>
              </div>
            ) : (
              <div className="space-y-2">
                {wishlisted.slice(0, 5).map((s) => {
                  const { color, pct } = sparkAccent(sparks[s.sym] || s.spark);
                  const isUp = pct >= 0;
                  return (
                    <div key={s.sym} className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggle(s.sym)}
                          className="text-[#ef4444] hover:scale-110 transition-transform"
                        >
                          <Heart className="w-4 h-4 fill-current" />
                        </button>
                        <div>
                          <p className="text-sm font-bold text-white">{s.sym}</p>
                          <p className="text-[10px] text-gray-500 w-24 truncate">{s.name}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold tabular-nums text-white">₹{s.price.toLocaleString('en-IN')}</p>
                        <p className={`text-[10px] font-bold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                          {isUp ? '+' : ''}{pct.toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* News Feed */}
          <div>
            <SectionHeader
              icon={<Newspaper className="w-5 h-5 text-[#f59e0b]" />}
              title="Latest Insights"
              href="/dashboard/news"
            />
            {previewNews.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
                <Newspaper className="w-6 h-6 text-gray-700 mx-auto mb-2" />
                <p className="text-xs text-gray-400">Fetching latest news...</p>
              </div>
            ) : (
              <div className="space-y-3">
                {previewNews.map((n, i) => (
                  <NewsCard key={i} item={n} />
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */

function SectionHeader({
  icon,
  title,
  count,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  count?: string;
  href?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        {icon}
        <h2 className="text-lg font-black tracking-tight">{title}</h2>
        {count && (
          <span className="text-[10px] text-gray-400 bg-muted px-2.5 py-1 rounded-full font-bold">
            {count}
          </span>
        )}
      </div>
      {href && (
        <Link href={href} className="flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/80 transition-colors bg-primary/10 px-3 py-1.5 rounded-lg">
          View All <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </div>
  );
}

/* ── STOCK CARD (vertical with sparkline) ── */
function StockCard({
  stock,
  wished,
  onToggle,
  spark,
}: {
  stock: Stock;
  wished: boolean;
  onToggle: () => void;
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
        const nextSeries = [...source, { v: Number(next.toFixed(3)) }];
        return nextSeries.slice(-28);
      });
    }, 900);

    return () => clearInterval(iv);
  }, [seedSpark, shouldUseDemoFlow, stock.price]);

  const chartSeries = shouldUseDemoFlow ? demoSpark : seedSpark;
  const basePrice = Number(chartSeries[0]?.v || stock.price || 1);
  const deviationSeries = chartSeries.map((point) => ({
    dev: Number((((Number(point.v || basePrice) - basePrice) / basePrice) * 100 * 4).toFixed(3)),
  }));

  const displayedPrice = shouldUseDemoFlow
    ? Number(chartSeries[chartSeries.length - 1]?.v || stock.price)
    : Number(stock.price);

  const { color: accent, pct } = sparkAccent(chartSeries);
  const up = pct >= 0;
  const gradientId = `sg-${stock.sym.replace(/[^a-zA-Z0-9]/g, '')}`;
  const glowId = `sg-glow-${stock.sym.replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <div className="group relative rounded-2xl border border-border bg-card hover:border-gray-700 transition-all duration-300 hover:shadow-lg overflow-hidden flex flex-col justify-between">
      {/* header row */}
      <div className="flex items-center gap-3 p-4 pb-2">
        {/* icon */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-[12px] font-black shrink-0 border shadow-sm"
          style={{
            background: `linear-gradient(135deg, ${accent}15, ${accent}05)`,
            borderColor: accent + '30',
            color: accent,
          }}
        >
          {stock.sym.replace('.NSE', '').slice(0, 2)}
        </div>

        {/* name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-black text-white">{stock.sym.replace('.NSE', '')}</span>
            {stock.live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] shrink-0" />}
          </div>
          <p className="text-[11px] font-medium text-gray-500 truncate mt-0.5">{stock.name}</p>
        </div>

        {/* heart */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="p-2 rounded-xl bg-muted/50 hover:bg-muted transition-all shrink-0 border border-border"
        >
          <Heart
            className={`w-4 h-4 transition-all duration-300 ${
              wished
                ? 'fill-[#ef4444] text-[#ef4444] scale-110'
                : 'text-gray-500 group-hover:text-gray-300'
            }`}
          />
        </button>
      </div>

      {/* sparkline chart */}
      <div className="h-20 px-2 mt-2">
        {chartSeries && chartSeries.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={deviationSeries} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={accent} stopOpacity={0.5} />
                  <stop offset="95%" stopColor={accent} stopOpacity={0} />
                </linearGradient>
                <linearGradient id={glowId} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#111827" stopOpacity={0} />
                  <stop offset="50%" stopColor={accent} stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#111827" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1e2437" strokeDasharray="3 5" vertical={false} />
              <YAxis hide domain={[-3.2, 3.2]} />
              <ReferenceLine y={0} stroke="#334155" strokeDasharray="4 4" />
              <Area
                type="monotone" dataKey="dev" stroke={accent} strokeWidth={2.5}
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
      <div className="flex items-end justify-between p-4 pt-2 border-t border-border bg-muted/10">
        <p className="text-xl font-black tabular-nums text-white">
          {stock.sym.includes('.NSE') ? '₹' : '$'}
          {displayedPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
        </p>
        <span
          className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg border shadow-sm"
          style={{ background: accent + '10', color: accent, borderColor: accent + '20' }}
        >
          {up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
          {Math.abs(pct).toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

/* ── NEWS CARD ── */
function NewsCard({ item }: { item: NewsItem }) {
  const s = SENTIMENT_STYLES[item.sentiment] ?? SENTIMENT_STYLES.neutral;

  return (
    <div className="group rounded-2xl border border-border bg-card hover:border-gray-600 transition-all duration-300 overflow-hidden shadow-sm hover:shadow-md flex flex-col justify-between">
      {/* top accent strip */}
      <div className="h-1" style={{ background: `linear-gradient(90deg, ${IMPACT_COLORS[item.impact] ?? '#6b7280'}, transparent)` }} />

      <div className="p-4 flex flex-col h-full justify-between">
        <div>
          {/* meta row */}
          <div className="flex items-center gap-2 mb-3">
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border shadow-sm ${s.bg} ${s.text} ${s.border}`}>
              {s.icon} {item.sentiment}
            </span>
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border shadow-sm"
              style={{
                color: IMPACT_COLORS[item.impact],
                borderColor: (IMPACT_COLORS[item.impact] ?? '#6b7280') + '30',
                background: (IMPACT_COLORS[item.impact] ?? '#6b7280') + '10',
              }}
            >
              {item.impact}
            </span>
          </div>

          {/* headline */}
          <p className="text-sm font-bold text-gray-200 leading-snug line-clamp-2 group-hover:text-white transition-colors mb-3">
            {item.headline}
          </p>

          {/* sentiment review */}
          {item.sentimentReview ? (
            <p className="text-[11px] font-medium text-gray-400 leading-relaxed line-clamp-2 mb-4 bg-muted/30 p-2 rounded-lg border border-border">
              {item.sentimentReview}
            </p>
          ) : null}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between mt-auto pt-3 border-t border-border">
          <div className="flex items-center gap-3 text-[11px] font-semibold text-gray-500">
            <span className="text-gray-400">{item.source}</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {item.time}
            </span>
          </div>
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold text-primary hover:underline flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-md"
              onClick={(e) => e.stopPropagation()}
            >
              Read <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
