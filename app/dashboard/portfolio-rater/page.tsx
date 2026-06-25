'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { PieChart, Activity, AlertCircle, ShieldCheck, CheckCircle2, Brain, ArrowLeft, RefreshCw } from 'lucide-react';
import Link from 'next/link';

type MarketStock = {
  sym: string;
  price: number;
};

type DbHolding = {
  sym: string;
  quantity: number;
};

type Holding = {
  id: string;
  ticker: string;
  weight: number;
  value: number;
};

type RateResponse = {
  score: number;
  rating: string;
  features: {
    num_stocks: number;
    largest_position: number;
    top_3_concentration: number;
    portfolio_return: number;
    portfolio_volatility: number;
    sharpe_ratio: number;
    max_drawdown: number;
    cash_percent: number;
  };
  suggestions: string[];
};

export default function PortfolioRaterPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  
  const [loadingData, setLoadingData] = useState(true);
  const [loadingRate, setLoadingRate] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RateResponse | null>(null);

  const loadPortfolioData = useCallback(async () => {
    setLoadingData(true);
    setError(null);
    setResult(null);
    
    try {
      const [portfolioRes, marketRes] = await Promise.all([
        fetch('/api/portfolio', { cache: 'no-store' }),
        fetch('/api/market/stocks?liveOnly=1', { cache: 'no-store' }),
      ]);

      if (!portfolioRes.ok) {
        throw new Error('Failed to load portfolio data');
      }

      const portfolioData = await portfolioRes.json();
      const marketData = await marketRes.json().catch(() => ({}));

      const walletBalance = Number(portfolioData.walletBalance || 0);
      const dbHoldings: DbHolding[] = portfolioData.holdings || [];
      const liveStocks: MarketStock[] = Array.isArray(marketData?.stocks) ? marketData.stocks : [];
      
      const marketMap = new Map<string, number>();
      liveStocks.forEach(s => marketMap.set(s.sym, Number(s.price || 0)));

      let calcTotalValue = walletBalance;
      const calcHoldings: Holding[] = [];

      dbHoldings.forEach((h, idx) => {
        const price = marketMap.get(h.sym) || 0;
        const value = h.quantity * price;
        calcTotalValue += value;
        
        calcHoldings.push({
          id: `stock-${idx}`,
          ticker: h.sym,
          weight: 0, // will calculate after total
          value: value
        });
      });

      // Add Cash
      calcHoldings.push({
        id: 'cash',
        ticker: 'CASH',
        weight: 0,
        value: walletBalance
      });

      // Calculate weights
      if (calcTotalValue > 0) {
        calcHoldings.forEach(h => {
          h.weight = (h.value / calcTotalValue) * 100;
        });
      }

      // Sort by weight descending
      calcHoldings.sort((a, b) => b.weight - a.weight);

      setTotalValue(calcTotalValue);
      setHoldings(calcHoldings);

    } catch (err: any) {
      setError(err.message || 'An error occurred fetching your portfolio.');
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    loadPortfolioData();
  }, [loadPortfolioData]);

  const handleRate = async () => {
    setError(null);
    setResult(null);
    
    const validHoldings = holdings.filter(h => h.ticker.trim() !== '' && h.weight > 0);
    if (validHoldings.length === 0) {
      setError('Your portfolio is empty.');
      return;
    }

    setLoadingRate(true);
    
    try {
      const response = await fetch('/api/portfolio-rater', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings: validHoldings }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to rate portfolio');
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred rating the portfolio.');
    } finally {
      setLoadingRate(false);
    }
  };

  const getRatingColor = (rating: string) => {
    switch (rating) {
      case 'Excellent': return 'text-[#10b981] bg-[#10b981]/10 border-[#10b981]/30';
      case 'Good': return 'text-[#3b82f6] bg-[#3b82f6]/10 border-[#3b82f6]/30';
      case 'Moderate Risk': return 'text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/30';
      case 'Risky': return 'text-[#f97316] bg-[#f97316]/10 border-[#f97316]/30';
      case 'Very Risky': return 'text-[#ef4444] bg-[#ef4444]/10 border-[#ef4444]/30';
      default: return 'text-gray-400 bg-muted border-border';
    }
  };

  function money(v: number) {
    return `₹${Number(v || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="p-2 rounded-xl bg-muted border border-border text-gray-400 hover:text-white transition-all">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">ML Portfolio Rater</h1>
          <p className="text-xs text-gray-500 mt-0.5">Analyze your real portfolio holdings using our ML model.</p>
        </div>
        <button
          onClick={loadPortfolioData}
          disabled={loadingData}
          className="h-9 rounded-xl border border-border bg-card px-3 text-xs text-gray-300 hover:text-white disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin' : ''}`} />
          Sync Portfolio
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
        {/* Left Col: Holdings */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-white flex items-center gap-2">
                <PieChart className="w-4 h-4 text-primary" />
                Current Allocation
              </h2>
              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-muted text-gray-300">
                Total: {money(totalValue)}
              </span>
            </div>

            {loadingData ? (
              <div className="py-10 text-center flex flex-col items-center justify-center">
                <RefreshCw className="w-6 h-6 text-gray-500 animate-spin mb-3" />
                <p className="text-sm text-gray-500">Syncing live portfolio data...</p>
              </div>
            ) : holdings.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm text-gray-500">No holdings found in your portfolio.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {holdings.map((holding) => (
                  <div key={holding.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-background">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-xs font-bold text-gray-300">
                        {holding.ticker.substring(0, 2)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{holding.ticker}</p>
                        <p className="text-xs text-gray-500">{money(holding.value)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-white">{holding.weight.toFixed(1)}%</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleRate}
              disabled={loadingRate || loadingData || holdings.length === 0 || totalValue <= 0}
              className="mt-6 w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loadingRate ? (
                <>
                  <Activity className="w-5 h-5 animate-pulse" />
                  Analyzing Portfolio...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5" />
                  Rate My Portfolio
                </>
              )}
            </button>

            {error && (
              <div className="mt-4 p-3 rounded-lg border border-red-500/30 bg-red-500/10 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Results */}
        <div className="lg:col-span-7">
          {result ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Top Cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-border bg-card p-6 flex flex-col items-center justify-center text-center">
                  <p className="text-sm text-gray-500 font-medium mb-1">Portfolio Score</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-bold text-white tracking-tighter">{result.score.toFixed(1)}</span>
                    <span className="text-xl text-gray-500 font-medium">/ 100</span>
                  </div>
                </div>
                
                <div className="rounded-2xl border border-border bg-card p-6 flex flex-col items-center justify-center text-center">
                  <p className="text-sm text-gray-500 font-medium mb-3">Risk Rating</p>
                  <div className={`px-4 py-1.5 rounded-full border text-sm font-bold tracking-wide uppercase ${getRatingColor(result.rating)}`}>
                    {result.rating}
                  </div>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="rounded-2xl border border-border bg-card p-5">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" />
                  Calculated Metrics
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <MetricBox label="Holdings" value={result.features.num_stocks.toString()} />
                  <MetricBox label="Cash Alloc." value={`${(result.features.cash_percent * 100).toFixed(1)}%`} />
                  <MetricBox label="Largest Pos." value={`${(result.features.largest_position * 100).toFixed(1)}%`} />
                  <MetricBox label="Top 3 Conc." value={`${(result.features.top_3_concentration * 100).toFixed(1)}%`} />
                  
                  <MetricBox label="Est. Return" value={`${(result.features.portfolio_return * 100).toFixed(1)}%`} color={result.features.portfolio_return >= 0 ? 'text-[#10b981]' : 'text-red-400'} />
                  <MetricBox label="Volatility" value={`${(result.features.portfolio_volatility * 100).toFixed(1)}%`} />
                  <MetricBox label="Sharpe Ratio" value={result.features.sharpe_ratio.toFixed(2)} />
                  <MetricBox label="Max Drawdown" value={`${(result.features.max_drawdown * 100).toFixed(1)}%`} color="text-red-400" />
                </div>
              </div>

              {/* Suggestions */}
              {result.suggestions && result.suggestions.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-5">
                  <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                    <Brain className="w-4 h-4 text-primary" />
                    AI Suggestions
                  </h3>
                  <div className="space-y-3">
                    {result.suggestions.map((sug, idx) => (
                      <div key={idx} className="flex items-start gap-3 p-3 rounded-xl bg-muted/50 border border-border/50">
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <p className="text-sm text-gray-300 leading-relaxed">{sug}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full min-h-[400px] rounded-2xl border border-dashed border-border bg-card/30 flex flex-col items-center justify-center text-center p-8">
              <ShieldCheck className="w-12 h-12 text-gray-600 mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">Ready to analyze</h3>
              <p className="text-sm text-gray-500 max-w-md">
                We've synced your live portfolio data. Click "Rate My Portfolio" to run it through our Machine Learning engine.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function MetricBox({ label, value, color = "text-white" }: { label: string, value: string, color?: string }) {
  return (
    <div className="p-3 rounded-xl bg-background border border-border flex flex-col justify-center">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-lg font-bold tracking-tight ${color}`}>{value}</p>
    </div>
  );
}
