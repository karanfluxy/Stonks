'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, ArrowDownRight, Search, RefreshCw, Receipt } from 'lucide-react';

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
  transactions: Txn[];
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
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSide, setFilterSide] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/portfolio', { cache: 'no-store' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to load transactions');
      }

      setTransactions((data as PortfolioResponse).transactions || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const matchesSearch =
        t.sym.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.name.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesSide = filterSide === 'ALL' || t.side === filterSide;
      
      return matchesSearch && matchesSide;
    });
  }, [transactions, searchQuery, filterSide]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/portfolio" className="p-2 rounded-xl bg-muted border border-border text-gray-400 hover:text-white transition-all shadow-sm">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="w-6 h-6 text-primary" />
            All Transactions
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">View and filter your complete trading history.</p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="h-10 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-gray-300 hover:text-white disabled:opacity-50 inline-flex items-center gap-2 transition-all shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && <p className="text-sm text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/30 p-3 rounded-xl">{error}</p>}

      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        {/* Filters */}
        <div className="p-5 border-b border-border bg-muted/20 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search by symbol or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-background text-sm text-white placeholder:text-gray-500 outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
          </div>
          
          <div className="flex bg-background rounded-xl p-1 border border-border w-full sm:w-auto">
            <button
              onClick={() => setFilterSide('ALL')}
              className={`flex-1 sm:px-4 h-8 rounded-lg text-xs font-bold transition-all ${
                filterSide === 'ALL' ? 'bg-muted text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterSide('BUY')}
              className={`flex-1 sm:px-4 h-8 rounded-lg text-xs font-bold transition-all ${
                filterSide === 'BUY' ? 'bg-[#10b981]/20 text-[#10b981] shadow-sm' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Buy
            </button>
            <button
              onClick={() => setFilterSide('SELL')}
              className={`flex-1 sm:px-4 h-8 rounded-lg text-xs font-bold transition-all ${
                filterSide === 'SELL' ? 'bg-[#ef4444]/20 text-[#ef4444] shadow-sm' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Sell
            </button>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center text-gray-500">
            <RefreshCw className="w-6 h-6 animate-spin mb-3" />
            <span className="text-sm">Loading transactions...</span>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <Receipt className="w-10 h-10 text-gray-600 mb-3" />
            <p className="text-sm font-medium text-gray-400">No transactions found.</p>
            {searchQuery || filterSide !== 'ALL' ? (
              <button
                onClick={() => { setSearchQuery(''); setFilterSide('ALL'); }}
                className="mt-3 text-xs text-primary hover:underline"
              >
                Clear Filters
              </button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="text-xs text-gray-400 uppercase tracking-wider bg-muted/10">
                <tr>
                  <th className="text-left px-5 py-4 font-semibold">Date & Time</th>
                  <th className="text-left px-5 py-4 font-semibold">Asset</th>
                  <th className="text-center px-5 py-4 font-semibold">Order Type</th>
                  <th className="text-right px-5 py-4 font-semibold">Quantity</th>
                  <th className="text-right px-5 py-4 font-semibold">Price per Unit</th>
                  <th className="text-right px-5 py-4 font-semibold">Total Value</th>
                  <th className="text-right px-5 py-4 font-semibold">Realized P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredTransactions.map((t) => {
                  const pnlUp = t.realizedPnl >= 0;
                  return (
                    <tr key={t.id} className="hover:bg-muted/10 transition-colors">
                      <td className="px-5 py-4 text-xs font-medium text-gray-400 whitespace-nowrap">{fmtDate(t.createdAt)}</td>
                      <td className="px-5 py-4">
                        <div className="font-bold text-white text-base">{t.sym}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{t.name}</div>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider ${
                            t.side === 'BUY'
                              ? 'bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20'
                              : 'bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/20'
                          }`}
                        >
                          {t.side === 'BUY' ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                          {t.side}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right font-medium text-gray-200">{qty(t.quantity)}</td>
                      <td className="px-5 py-4 text-right text-gray-300">{money(t.price)}</td>
                      <td className="px-5 py-4 text-right font-bold text-white">{money(t.totalValue)}</td>
                      <td className="px-5 py-4 text-right">
                        {t.side === 'SELL' ? (
                          <div className={`inline-flex flex-col items-end ${pnlUp ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                            <span className="font-bold">{pnlUp ? '+' : ''}{money(t.realizedPnl)}</span>
                          </div>
                        ) : (
                          <span className="text-gray-500 font-medium">—</span>
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
    </div>
  );
}
