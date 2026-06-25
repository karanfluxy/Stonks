'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  PieChart,
  Activity,
  Receipt,
  TrendingUp,
  RefreshCw,
  Star,
  Brain,
} from 'lucide-react';

type MarketStock = {
  sym: string;
  name: string;
  sector: string;
  price: number;
  chg: number;
  live: boolean;
};

type Holding = {
  sym: string;
  name: string;
  sector: string | null;
  quantity: number;
  avgPrice: number;
  costBasis: number;
  updatedAt: string;
};

type Txn = {
  id: number;
  sym: string;
  name: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  totalValue: number;
  realizedPnl: number;
  createdAt: string;
};

type PortfolioResponse = {
  walletBalance: number;
  holdings: Holding[];
  transactions: Txn[];
  summary: {
    positions: number;
    totalInvested: number;
    realizedPnl: number;
  };
};

type PortfolioRating = {
  score: number;
  summary: string;
  suggestions: Array<{ symbol: string; action: 'BUY' | 'SELL' | 'HOLD'; reason: string }>;
  risks?: string[];
  holdingsAnalyzed?: number;
};

type HoldingSignal = {
  label: 'BUY' | 'SELL';
  confidence: number | null;
  predicted_price_5d?: number | null;
};

function money(v: number) {
  return `₹${Number(v || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function qty(v: number) {
  return Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 4 });
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

export default function PortfolioPage() {
  const [marketUniverse, setMarketUniverse] = useState<MarketStock[]>([]);
  const [liveMarket, setLiveMarket] = useState<MarketStock[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [rating, setRating] = useState<PortfolioRating | null>(null);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingError, setRatingError] = useState('');
  const [holdingSignals, setHoldingSignals] = useState<Record<string, HoldingSignal>>({});
  const [signalNotice, setSignalNotice] = useState('');

  const [selectedSym, setSelectedSym] = useState('');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [quantity, setQuantity] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [portfolioRes, marketUniverseRes, liveMarketRes] = await Promise.all([
        fetch('/api/portfolio', { cache: 'no-store' }),
        fetch('/api/market/stocks', { cache: 'no-store' }),
        fetch('/api/market/stocks?liveOnly=1', { cache: 'no-store' }),
      ]);

      const portfolioData = await portfolioRes.json().catch(() => ({}));
      const marketUniverseData = await marketUniverseRes.json().catch(() => ({}));
      const liveMarketData = await liveMarketRes.json().catch(() => ({}));

      if (!portfolioRes.ok) {
        throw new Error(typeof portfolioData?.error === 'string' ? portfolioData.error : 'Failed to load portfolio');
      }

      setPortfolio(portfolioData as PortfolioResponse);
      const universe = Array.isArray(marketUniverseData?.stocks) ? marketUniverseData.stocks : [];
      const live = Array.isArray(liveMarketData?.stocks) ? liveMarketData.stocks : [];
      setMarketUniverse(universe);
      setLiveMarket(live);

      const hasSelectedInUniverse = universe.some((s: MarketStock) => s.sym === selectedSym);
      if ((!selectedSym || !hasSelectedInUniverse) && universe[0]?.sym) {
        setSelectedSym(universe[0].sym);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load portfolio');
    } finally {
      setLoading(false);
    }
  }, [selectedSym]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const marketBySym = useMemo(() => {
    const map = new Map<string, MarketStock>();
    liveMarket.forEach((s) => map.set(s.sym, s));
    return map;
  }, [liveMarket]);

  const enrichedHoldings = useMemo(() => {
    const raw = portfolio?.holdings || [];
    return raw.map((h) => {
      const quote = marketBySym.get(h.sym);
      const hasLivePrice = quote && Number.isFinite(Number(quote.price)) && Number(quote.price) > 0;
      const currentPrice = hasLivePrice ? Number(quote?.price) : null;
      const marketValue = currentPrice != null ? currentPrice * h.quantity : null;
      const unrealizedPnl = marketValue != null ? marketValue - h.costBasis : null;
      const pnlPct = h.costBasis > 0 && unrealizedPnl != null ? (unrealizedPnl / h.costBasis) * 100 : null;
      return {
        ...h,
        hasLivePrice,
        currentPrice,
        marketValue,
        unrealizedPnl,
        pnlPct,
      };
    });
  }, [portfolio?.holdings, marketBySym]);

  const summary = useMemo(() => {
    const totalMarketValue = enrichedHoldings.reduce((sum, h) => sum + (h.marketValue ?? 0), 0);
    const totalCostBasis = enrichedHoldings.reduce((sum, h) => sum + h.costBasis, 0);
    const totalUnrealized = enrichedHoldings.reduce((sum, h) => sum + (h.unrealizedPnl ?? 0), 0);
    const totalUnrealizedPct = totalCostBasis > 0 ? (totalUnrealized / totalCostBasis) * 100 : 0;
    return {
      walletBalance: Number(portfolio?.walletBalance || 0),
      totalMarketValue,
      totalCostBasis,
      totalUnrealized,
      totalUnrealizedPct,
      realizedPnl: Number(portfolio?.summary?.realizedPnl || 0),
      positions: Number(portfolio?.summary?.positions || 0),
    };
  }, [portfolio, enrichedHoldings]);

  const selectedStock = useMemo(
    () => marketUniverse.find((s) => s.sym === selectedSym) || null,
    [marketUniverse, selectedSym]
  );

  const selectedLiveQuote = useMemo(
    () => marketBySym.get(selectedSym) || null,
    [marketBySym, selectedSym]
  );

  const tradePreview = useMemo(() => {
    const q = Number(quantity);
    const price = Number(selectedLiveQuote?.price || 0);
    const total = Number.isFinite(q) && q > 0 ? q * price : 0;
    return {
      q,
      price,
      total,
    };
  }, [quantity, selectedLiveQuote]);

  const submitTrade = useCallback(async () => {
    setError('');
    setSuccess('');

    if (!selectedStock) {
      setError('Please select a stock');
      return;
    }
    if (!selectedLiveQuote || !Number.isFinite(Number(selectedLiveQuote.price)) || Number(selectedLiveQuote.price) <= 0) {
      setError('Live price unavailable for selected stock');
      return;
    }

    const q = Number(quantity);
    if (!Number.isFinite(q) || q <= 0) {
      setError('Enter a valid quantity');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          side,
          sym: selectedStock.sym,
          name: selectedStock.name,
          sector: selectedStock.sector,
          quantity: q,
          price: selectedLiveQuote.price,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Trade failed');
      }

      setSuccess(`${side === 'BUY' ? 'Bought' : 'Sold'} ${q} ${selectedStock.sym}`);
      setQuantity('');
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Trade failed');
    } finally {
      setSubmitting(false);
    }
  }, [selectedStock, selectedLiveQuote, quantity, side, loadData]);

  const ratePortfolio = useCallback(async () => {
    setRatingError('');
    setRatingLoading(true);
    try {
      const res = await fetch('/api/portfolio/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Portfolio rating failed');
      }
      setRating(data as PortfolioRating);
    } catch (e) {
      setRatingError(e instanceof Error ? e.message : 'Portfolio rating failed');
    } finally {
      setRatingLoading(false);
    }
  }, []);

  const allocation = useMemo(() => {
    const total = summary.totalMarketValue;
    if (total <= 0) return [] as Array<{ sym: string; pct: number; value: number }>;
    return enrichedHoldings
      .filter((h) => h.marketValue != null)
      .map((h) => ({
        sym: h.sym,
        pct: ((h.marketValue ?? 0) / total) * 100,
        value: h.marketValue ?? 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [enrichedHoldings, summary.totalMarketValue]);

  useEffect(() => {
    let alive = true;

    const loadSignals = async () => {
      if (enrichedHoldings.length === 0) {
        if (alive) {
          setHoldingSignals({});
          setSignalNotice('');
        }
        return;
      }

      const results = await Promise.all(
        enrichedHoldings.map(async (h) => {
          try {
            // First try the new direct Buy Signal predictor (supports AAPL, TSLA)
            const buySignalRes = await fetch('/api/predict-buy-signal', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ticker: h.sym }),
              cache: 'no-store'
            });

            if (buySignalRes.ok) {
              const buyData = await buySignalRes.json();
              return {
                sym: h.sym,
                signal: {
                  label: buyData.signal, // "BUY" or "DO NOT BUY"
                  confidence: null,      // No confidence score from the Random Forest model
                  predicted_price_5d: buyData.predicted_price_5d
                } as HoldingSignal,
              };
            }

            // Fallback to legacy heuristic route for unsupported stocks
            const res = await fetch(`/api/market/rf-signal?ticker=${encodeURIComponent(h.sym)}`, { cache: 'no-store' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) return null;
            const label = String(data?.label || '').toUpperCase() === 'BUY' ? 'BUY' : 'SELL';
            const confidence = Number(data?.confidence);
            return {
              sym: h.sym,
              signal: {
                label,
                confidence: Number.isFinite(confidence) ? confidence : null,
                predicted_price_5d: Number.isFinite(Number(data?.predicted_price_5d)) ? Number(data?.predicted_price_5d) : null,
              } as HoldingSignal,
            };
          } catch {
            return null;
          }
        })
      );

      if (!alive) return;

      const nextSignals: Record<string, HoldingSignal> = {};
      let buyCount = 0;
      let sellCount = 0;

      for (const row of results) {
        if (!row) continue;
        nextSignals[row.sym] = row.signal;
        if (row.signal.label === 'BUY') buyCount += 1;
        else sellCount += 1;
      }

      setHoldingSignals(nextSignals);
      if (buyCount || sellCount) {
        setSignalNotice(`AI suggestions updated: ${buyCount} BUY, ${sellCount} SELL`);
      } else {
        setSignalNotice('AI suggestions unavailable right now.');
      }
    };

    loadSignals();
    return () => {
      alive = false;
    };
  }, [enrichedHoldings]);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="p-2 rounded-xl bg-muted border border-border text-gray-400 hover:text-white transition-all">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Portfolio Command Center</h1>
          <p className="text-xs text-gray-500 mt-0.5">Buy, sell, monitor and rebalance your positions live.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/portfolio-rater"
            className="h-10 rounded-xl bg-primary text-primary-foreground px-4 text-sm font-semibold hover:bg-primary/90 inline-flex items-center gap-2 transition-all shadow-sm"
          >
            <Brain className="w-4 h-4" />
            ML Rater
          </Link>
          <button
            onClick={loadData}
            disabled={loading}
            className="h-10 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-gray-300 hover:text-white disabled:opacity-50 inline-flex items-center gap-2 transition-all shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/30 p-3 rounded-xl">{error}</p>}
      {success && <p className="text-sm text-[#10b981] bg-[#10b981]/10 border border-[#10b981]/30 p-3 rounded-xl">{success}</p>}

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard icon={<Wallet className="w-5 h-5 text-[#22c55e]" />} title="Wallet Cash" value={money(summary.walletBalance)} sub="Available to trade" />
        <MetricCard icon={<PieChart className="w-5 h-5 text-[#38bdf8]" />} title="Portfolio Value" value={money(summary.totalMarketValue)} sub={`${summary.positions} open positions`} />
        <MetricCard
          icon={<Activity className="w-5 h-5 text-[#f59e0b]" />}
          title="Unrealized P&L"
          value={money(summary.totalUnrealized)}
          sub={`${summary.totalUnrealizedPct >= 0 ? '+' : ''}${summary.totalUnrealizedPct.toFixed(2)}% vs cost`}
          positive={summary.totalUnrealized >= 0}
        />
        <MetricCard
          icon={<Receipt className="w-5 h-5 text-[#a78bfa]" />}
          title="Realized P&L"
          value={money(summary.realizedPnl)}
          sub="From closed units"
          positive={summary.realizedPnl >= 0}
        />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* LEFT COLUMN */}
        <div className="xl:col-span-8 space-y-6">
          
          {/* Open Holdings */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-muted/20">
              <h2 className="text-base font-bold text-white">Open Holdings</h2>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted text-gray-400">{enrichedHoldings.length} positions</span>
            </div>

            {signalNotice && (
              <div className="px-5 py-3 border-b border-border bg-primary/5 text-sm font-medium text-primary flex items-center gap-2">
                <Brain className="w-4 h-4" />
                {signalNotice}
              </div>
            )}

            {loading ? (
              <div className="p-8 text-center text-sm text-gray-400">Loading holdings...</div>
            ) : enrichedHoldings.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">No holdings yet. Start by buying your first stock.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-sm">
                  <thead className="text-xs text-gray-400 uppercase tracking-wider bg-muted/10">
                    <tr>
                      <th className="text-left px-5 py-4 font-semibold">Symbol</th>
                      <th className="text-right px-5 py-4 font-semibold">Qty</th>
                      <th className="text-right px-5 py-4 font-semibold">Avg Cost</th>
                      <th className="text-right px-5 py-4 font-semibold">LTP</th>
                      <th className="text-right px-5 py-4 font-semibold">Market Value</th>
                      <th className="text-right px-5 py-4 font-semibold">Unrealized</th>
                      <th className="text-center px-5 py-4 font-semibold">AI Suggestion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {enrichedHoldings.map((h) => {
                      const up = h.unrealizedPnl >= 0;
                      const signal = holdingSignals[h.sym];
                      return (
                        <tr key={h.sym} className="hover:bg-muted/10 transition-colors">
                          <td className="px-5 py-4">
                            <div className="font-bold text-white text-base">{h.sym}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{h.name}</div>
                          </td>
                          <td className="px-5 py-4 text-right font-medium text-gray-200">{qty(h.quantity)}</td>
                          <td className="px-5 py-4 text-right text-gray-300">{money(h.avgPrice)}</td>
                          <td className="px-5 py-4 text-right font-medium text-white">{h.currentPrice != null ? money(h.currentPrice) : '—'}</td>
                          <td className="px-5 py-4 text-right font-medium text-white">{h.marketValue != null ? money(h.marketValue) : '—'}</td>
                          <td className="px-5 py-4 text-right">
                            {h.unrealizedPnl != null ? (
                              <div className={`inline-flex flex-col items-end ${up ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                                <span className="font-bold">{up ? '+' : ''}{money(h.unrealizedPnl)}</span>
                                <span className="text-xs opacity-80 font-medium">({(h.pnlPct ?? 0) >= 0 ? '+' : ''}{(h.pnlPct ?? 0).toFixed(2)}%)</span>
                              </div>
                            ) : (
                              <span className="text-gray-500 font-normal">N/A</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-center">
                            {signal ? (
                              <div className="flex flex-col items-center gap-1">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold tracking-wide ${
                                    signal.label === 'BUY'
                                      ? 'bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20'
                                      : 'bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/20'
                                  }`}
                                >
                                  {signal.label}
                                </span>
                                {signal.predicted_price_5d && (
                                  <span className="text-[10px] text-gray-400 font-medium">Tgt: {money(signal.predicted_price_5d)}</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-500">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent Transactions */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-muted/20">
              <h2 className="text-base font-bold text-white">Recent Transactions</h2>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted text-gray-400">Last 100</span>
            </div>

            {!portfolio || portfolio.transactions.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">No transactions yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead className="text-xs text-gray-400 uppercase tracking-wider bg-muted/10">
                    <tr>
                      <th className="text-left px-5 py-4 font-semibold">Time</th>
                      <th className="text-left px-5 py-4 font-semibold">Stock</th>
                      <th className="text-center px-5 py-4 font-semibold">Side</th>
                      <th className="text-right px-5 py-4 font-semibold">Qty</th>
                      <th className="text-right px-5 py-4 font-semibold">Price</th>
                      <th className="text-right px-5 py-4 font-semibold">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {portfolio.transactions.slice(0, 5).map((t) => {
                      return (
                        <tr key={t.id} className="hover:bg-muted/10 transition-colors">
                          <td className="px-5 py-4 text-xs text-gray-400 whitespace-nowrap">{fmtDate(t.createdAt)}</td>
                          <td className="px-5 py-4 font-bold text-white">{t.sym}</td>
                          <td className="px-5 py-4 text-center">
                            <span
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider ${
                                t.side === 'BUY'
                                  ? 'bg-[#10b981]/10 text-[#10b981]'
                                  : 'bg-[#ef4444]/10 text-[#ef4444]'
                              }`}
                            >
                              {t.side === 'BUY' ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                              {t.side}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right font-medium text-gray-200">{qty(t.quantity)}</td>
                          <td className="px-5 py-4 text-right text-gray-300">{money(t.price)}</td>
                          <td className="px-5 py-4 text-right font-medium text-white">{money(t.totalValue)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {portfolio && portfolio.transactions.length > 5 && (
              <div className="px-5 py-3 border-t border-border bg-muted/5 flex items-center justify-between">
                <span className="text-xs text-gray-400">Showing 5 of {portfolio.transactions.length}</span>
                <Link
                  href="/dashboard/transactions"
                  className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                >
                  View All Transactions →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="xl:col-span-4 space-y-6">
          
          {/* Trade Ticket */}
          <div className="rounded-2xl border border-primary/20 bg-linear-to-b from-card to-background p-5 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <TrendingUp className="w-24 h-24" />
            </div>
            
            <div className="flex items-center justify-between mb-5 relative z-10">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Trade Ticket
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5 relative z-10">
              <button
                onClick={() => setSide('BUY')}
                className={`h-11 rounded-xl text-sm font-bold border-2 transition-all ${
                  side === 'BUY'
                    ? 'bg-[#10b981]/10 border-[#10b981] text-[#10b981] shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                    : 'bg-card border-border text-gray-400 hover:border-gray-500'
                }`}
              >
                Buy Order
              </button>
              <button
                onClick={() => setSide('SELL')}
                className={`h-11 rounded-xl text-sm font-bold border-2 transition-all ${
                  side === 'SELL'
                    ? 'bg-[#ef4444]/10 border-[#ef4444] text-[#ef4444] shadow-[0_0_15px_rgba(239,68,68,0.1)]'
                    : 'bg-card border-border text-gray-400 hover:border-gray-500'
                }`}
              >
                Sell Order
              </button>
            </div>

            <div className="space-y-4 relative z-10">
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Select Asset</label>
                <select
                  value={selectedSym}
                  onChange={(e) => setSelectedSym(e.target.value)}
                  className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm font-medium text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                >
                  {marketUniverse.map((s) => (
                    <option key={s.sym} value={s.sym}>
                      {s.sym} · {s.name}
                    </option>
                  ))}
                </select>
                {marketUniverse.length === 0 && (
                  <p className="text-[11px] text-[#ef4444] mt-1.5 font-medium">No stocks available to trade.</p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Quantity</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="0.00"
                    className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm font-medium text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-medium">Units</span>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400 font-medium">Live Market Price</span>
                  <span className="text-sm font-bold text-white">{tradePreview.price > 0 ? money(tradePreview.price) : 'Unavailable'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400 font-medium">Estimated Order Value</span>
                  <span className="text-sm font-bold text-primary">{tradePreview.total > 0 ? money(tradePreview.total) : '—'}</span>
                </div>
                <div className="w-full h-px bg-border my-1" />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400 font-medium">Projected Wallet Balance</span>
                  <span className="text-sm font-bold text-white">
                    {money(
                      side === 'BUY'
                        ? summary.walletBalance - tradePreview.total
                        : summary.walletBalance + tradePreview.total
                    )}
                  </span>
                </div>
              </div>

              <button
                onClick={submitTrade}
                disabled={submitting || loading || !selectedStock || !selectedLiveQuote || tradePreview.price <= 0}
                className={`w-full h-12 rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md ${
                  side === 'BUY'
                    ? 'bg-[#10b981] text-white hover:bg-[#059669]'
                    : 'bg-[#ef4444] text-white hover:bg-[#dc2626]'
                }`}
              >
                {submitting ? 'Processing...' : `Confirm ${side} Order`}
              </button>
            </div>
          </div>

          {/* Top Allocation */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <PieChart className="w-5 h-5 text-primary" />
              <h3 className="text-base font-bold text-white">Portfolio Allocation</h3>
            </div>

            {allocation.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">Your portfolio is currently empty.</p>
            ) : (
              <div className="space-y-4">
                {allocation.map((a) => (
                  <div key={a.sym}>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="font-semibold text-gray-200">{a.sym}</span>
                      <span className="font-bold text-white">{a.pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(2, Math.min(100, a.pct))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Gemini AI Rater (Legacy) */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-[#f59e0b]" />
                <h3 className="text-base font-bold text-white">Gemini AI Analysis</h3>
              </div>
              <button
                onClick={ratePortfolio}
                disabled={ratingLoading}
                className="h-8 rounded-lg bg-muted text-xs font-semibold px-3 hover:bg-muted/80 hover:text-white transition-colors disabled:opacity-50"
              >
                {ratingLoading ? 'Analyzing...' : 'Run Analysis'}
              </button>
            </div>

            {ratingError && <p className="text-xs text-[#ef4444] bg-[#ef4444]/10 p-2 rounded-lg mb-3">{ratingError}</p>}

            {!rating ? (
              <p className="text-sm text-gray-500 py-2">Click "Run Analysis" to get LLM-based insights and heuristic suggestions for your portfolio.</p>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-muted/20 p-4 text-center">
                  <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Overall Health Score</p>
                  <p className="text-4xl font-black text-[#f59e0b] tracking-tighter">{rating.score.toFixed(1)}<span className="text-lg text-gray-500 font-medium">/10</span></p>
                  <p className="text-xs text-gray-300 mt-2 leading-relaxed">{rating.summary}</p>
                </div>

                {Array.isArray(rating.suggestions) && rating.suggestions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Key Recommendations</p>
                    {rating.suggestions.slice(0, 4).map((s, idx) => (
                      <div key={`${s.symbol}-${idx}`} className="rounded-xl border border-border bg-background p-3 flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-white">{s.symbol || 'PORTFOLIO'}</span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                              s.action === 'BUY'
                                ? 'bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20'
                                : s.action === 'SELL'
                                  ? 'bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/20'
                                  : 'bg-muted text-gray-300 border border-border'
                            }`}
                          >
                            {s.action}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 leading-relaxed mt-1">{s.reason}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  icon,
  title,
  value,
  sub,
  positive,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  sub: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-gray-500 uppercase tracking-wider">{title}</div>
        {icon}
      </div>
      <div className={`text-xl font-bold tabular-nums ${positive == null ? 'text-white' : positive ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
        {value}
      </div>
      <div className="text-xs text-gray-500 mt-1">{sub}</div>
    </div>
  );
}
