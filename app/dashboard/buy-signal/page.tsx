'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Brain, ArrowLeft, Loader2, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';

type BuySignalResponse = {
  ticker: string;
  current_price: number;
  predicted_price_5d: number;
  predicted_return_percent: number;
  signal: 'BUY' | 'DO NOT BUY';
  disclaimer: string;
};

export default function BuySignalPage() {
  const [ticker, setTicker] = useState('AAPL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BuySignalResponse | null>(null);

  const handlePredict = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/predict-buy-signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || data.error || 'Failed to fetch buy signal prediction.');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="p-2 rounded-xl bg-[#1a1a2e] border border-[#2a2a3e] text-gray-400 hover:text-white transition-all">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="w-5 h-5 text-[#8b5cf6]" />
            AAPL/TSLA Buy Signal Predictor
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Independent 5-day horizon ML model</p>
        </div>
      </div>

      <div className="rounded-2xl border border-[#1a1a2e] bg-[#0c0c18] p-5 sm:p-8 space-y-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Select Target Stock</label>
            <select
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              className="w-full h-12 rounded-xl bg-[#0f0f1a] border border-[#2a2a3e] px-4 text-white focus:border-[#8b5cf6] outline-none appearance-none cursor-pointer"
            >
              <option value="AAPL">AAPL - Apple Inc.</option>
              <option value="TSLA">TSLA - Tesla Inc.</option>
            </select>
          </div>

          <button
            onClick={handlePredict}
            disabled={loading}
            className="w-full h-12 rounded-xl bg-[#8b5cf6] text-white font-semibold text-sm hover:bg-[#a78bfa] disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Evaluating Market...' : 'Predict Signal'}
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {result && (
          <div className="space-y-4 pt-4 border-t border-[#1a1a2e] animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-[#1a1a2e] bg-[#0f0f1a] p-4 text-center">
                <p className="text-xs text-gray-500">Target</p>
                <p className="text-lg font-bold text-white mt-1">{result.ticker}</p>
              </div>
              <div className="rounded-xl border border-[#1a1a2e] bg-[#0f0f1a] p-4 text-center">
                <p className="text-xs text-gray-500">Current Price</p>
                <p className="text-lg font-bold text-white mt-1">${result.current_price.toFixed(2)}</p>
              </div>
              <div className="rounded-xl border border-[#1a1a2e] bg-[#0f0f1a] p-4 text-center">
                <p className="text-xs text-gray-500">5-Day Target</p>
                <p className="text-lg font-bold text-white mt-1">${result.predicted_price_5d.toFixed(2)}</p>
              </div>
              <div className="rounded-xl border border-[#1a1a2e] bg-[#0f0f1a] p-4 text-center">
                <p className="text-xs text-gray-500">Est. Return</p>
                <p className={`text-lg font-bold mt-1 ${result.predicted_return_percent >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                  {result.predicted_return_percent >= 0 ? '+' : ''}{result.predicted_return_percent.toFixed(2)}%
                </p>
              </div>
            </div>

            <div className={`rounded-xl border p-6 text-center space-y-2 ${
              result.signal === 'BUY' 
                ? 'border-[#22c55e]/30 bg-[#22c55e]/10' 
                : 'border-orange-500/30 bg-orange-500/10'
            }`}>
              <div className="flex justify-center mb-2">
                {result.signal === 'BUY' ? (
                  <TrendingUp className="w-8 h-8 text-[#22c55e]" />
                ) : (
                  <TrendingDown className="w-8 h-8 text-orange-400" />
                )}
              </div>
              <p className="text-sm text-gray-400">ML Signal Output</p>
              <h2 className={`text-3xl font-black tracking-tight ${
                result.signal === 'BUY' ? 'text-[#22c55e]' : 'text-orange-400'
              }`}>
                {result.signal}
              </h2>
            </div>

            <p className="text-[11px] text-gray-600 text-center italic mt-4">
              {result.disclaimer}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
