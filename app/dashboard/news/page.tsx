'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Newspaper, ExternalLink, Clock, ChevronDown, ChevronUp,
  Zap,
} from 'lucide-react';

/* ── types ─────────────────────────────────────────────────────────────── */
type NewsItem = {
  headline: string;
  description?: string | null;
  sentiment: string;
  sentimentReview?: string | null;
  impact: string;
  time: string;
  source: string;
  url: string | null;
  imageUrl?: string | null;
};

/* ── constants ─────────────────────────────────────────────────────────── */
const SENTIMENT_STYLES: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  bullish: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', icon: '↑' },
  bearish: { bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/20',     icon: '↓' },
  neutral: { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20',   icon: '→' },
};

const IMPACT_COLORS: Record<string, string> = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' };

/* ── page ──────────────────────────────────────────────────────────────── */
export default function NewsPage() {
  const [news, setNews]         = useState<NewsItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/news/realtime?count=50', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (Array.isArray(d?.news)) setNews(d.news);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => { alive = false; };
  }, []);

  return (
    <>
      {/* header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="p-2 rounded-xl bg-muted border border-border text-gray-400 hover:text-white transition-all">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">News &amp; Sentiment</h1>
          <p className="text-xs text-gray-500 mt-0.5">{news.length} articles from live feed</p>
        </div>
      </div>

      {/* articles grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-48 rounded-2xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : news.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-14 text-center">
          <Newspaper className="w-8 h-8 text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No news available</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {news.map((n, i) => (
            <NewsFullCard
              key={i}
              item={n}
              index={i}
              isExpanded={expanded === i}
              onToggle={() => setExpanded(expanded === i ? null : i)}
            />
          ))}
        </div>
      )}
    </>
  );
}

/* ── news full card ───────────────────────────────────────────────────── */
function NewsFullCard({
  item,
  index,
  isExpanded,
  onToggle,
}: {
  item: NewsItem;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const s = SENTIMENT_STYLES[item.sentiment] ?? SENTIMENT_STYLES.neutral;
  const impactColor = IMPACT_COLORS[item.impact] ?? '#6b7280';

  return (
    <div
      className={`group rounded-2xl border bg-card transition-all duration-200 overflow-hidden
        ${isExpanded ? 'border-border ring-1 ring-[#2a2a3e]/50' : 'border-border hover:border-border'}`}
    >
      {/* accent strip */}
      <div className="h-0.75" style={{ background: `linear-gradient(90deg, ${impactColor}80, ${impactColor}20, transparent)` }} />

      {/* main content */}
      <div className="p-5">
        {/* badges row */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border ${s.bg} ${s.text} ${s.border}`}>
            {s.icon} {item.sentiment}
          </span>
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border"
            style={{
              color: impactColor,
              borderColor: impactColor + '30',
              background: impactColor + '10',
            }}
          >
            <Zap className="w-2.5 h-2.5 inline -mt-0.5 mr-0.5" />
            {item.impact}
          </span>
          <span className="text-[10px] text-gray-600 ml-auto flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {item.time}
          </span>
        </div>

        {/* headline */}
        <h3 className="text-[15px] font-semibold text-gray-100 leading-snug mb-2 group-hover:text-white transition-colors">
          {item.headline}
        </h3>

        {/* source */}
        <p className="text-[11px] text-gray-500 font-medium mb-3">{item.source}</p>

        {/* sentiment review */}
        {item.sentimentReview ? (
          <p className="text-[11px] text-gray-400 mb-3 leading-relaxed">
            {item.sentimentReview}
          </p>
        ) : null}

        {/* expand / collapse */}
        <button
          onClick={onToggle}
          className="flex items-center gap-1.5 text-[11px] font-medium text-[#10b981] hover:text-[#34d399] transition-colors"
        >
          {isExpanded ? (
            <>Hide details <ChevronUp className="w-3 h-3" /></>
          ) : (
            <>Show details <ChevronDown className="w-3 h-3" /></>
          )}
        </button>
      </div>

      {/* expanded section */}
      {isExpanded && (
        <div className="border-t border-border bg-[#0a0a14] px-5 py-4 space-y-3">
          {item.description ? (
            <p className="text-sm text-gray-400 leading-relaxed">{item.description}</p>
          ) : (
            <p className="text-sm text-gray-600 italic">No description available from the source.</p>
          )}

          <div className="flex items-center gap-4 pt-1">
            <span className="text-xs text-gray-500">
              Source: <span className="text-gray-400 font-medium">{item.source}</span>
            </span>
            {item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#10b981] hover:text-[#34d399] transition-colors px-3 py-1.5 rounded-lg bg-[#10b981]/10 border border-[#10b981]/20 hover:border-[#10b981]/40"
              >
                Read full article <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
