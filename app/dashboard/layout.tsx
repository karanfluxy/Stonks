'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import AuthRefresh from '@/components/auth-refresh';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  TrendingUp, Search, Bell, Settings, LogOut, Menu, Home, User,
  BarChart3, Newspaper, Wallet, Brain, PieChart, Receipt,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react';

/* ── constants ─────────────────────────────────────────────────────────── */
const BACKEND_POLL_MS = 120_000;
const BLUFF_TICK_MS = 2_500;

type IndexItem = {
  id: string;
  label: string;
  price: number;
  chgPct: number;
  flag?: string;
  color?: string;
};

const SEED_INDICES: IndexItem[] = [
  { id: 'nifty', label: 'NIFTY 50', price: 22400, chgPct: 0.45, flag: '🇮🇳', color: '#10b981' },
  { id: 'sensex', label: 'SENSEX', price: 73800, chgPct: 0.32, flag: '🇮🇳', color: '#3b82f6' },
  { id: 'nasdaq', label: 'NASDAQ', price: 17900, chgPct: -0.18, flag: '🇺🇸', color: '#f59e0b' },
  { id: 'sp500', label: 'S&P 500', price: 5200, chgPct: 0.21, flag: '🇺🇸', color: '#8b5cf6' },
];

const NAV = [
  { icon: Home, label: 'Dashboard', href: '/dashboard' },
  { icon: BarChart3, label: 'Stocks', href: '/dashboard/stocks' },
  { icon: Newspaper, label: 'News', href: '/dashboard/news' },
  { icon: Brain, label: 'AI Chat', href: '/dashboard/ai' },
  { icon: Wallet, label: 'Portfolio', href: '/dashboard/portfolio' },
  { icon: Receipt, label: 'Transactions', href: '/dashboard/transactions' },
  { icon: PieChart, label: 'Portfolio Rater', href: '/dashboard/portfolio-rater' },
];

/* ── layout ────────────────────────────────────────────────────────────── */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [indices, setIndices] = useState<IndexItem[]>(SEED_INDICES);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  /* fetch live indices for the ticker */
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const res = await fetch('/api/market/realtime', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!alive) return;
        if (Array.isArray(data?.indices)) setIndices(data.indices);
      } catch { /* keep last data */ }
    };
    pull();
    const iv = setInterval(pull, BACKEND_POLL_MS);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  /* bluff micro-movements for the ticker */
  useEffect(() => {
    const iv = setInterval(() => {
      setIndices((prev) =>
        prev.map((item) => {
          const p = Number(item.price);
          if (!Number.isFinite(p) || p <= 0) return item;
          const d = (Math.random() - 0.5) * 0.06;
          return {
            ...item,
            price: Math.max(0.01, Number((p * (1 + d / 100)).toFixed(2))),
            chgPct: Number((Number(item.chgPct ?? 0) + d * 0.35).toFixed(2)),
          };
        })
      );
    }, BLUFF_TICK_MS);
    return () => clearInterval(iv);
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  };

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!profileMenuRef.current?.contains(target)) {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  return (
    <div className="h-screen bg-background text-foreground flex overflow-hidden">
      <AuthRefresh />

      {/* ═══════ SIDEBAR ═══════ */}
      <aside
        className={`relative z-20 flex flex-col shrink-0 transition-all duration-300 ease-in-out
          bg-card border-r border-border
          ${sidebarOpen ? 'w-56' : 'w-16'}`}
      >
        {/* logo */}
        <div className={`flex items-center gap-3 px-4 py-5 border-b border-border ${sidebarOpen ? '' : 'justify-center'}`}>
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-sm shrink-0">
            <TrendingUp className="w-4 h-4 text-primary-foreground" />
          </div>
          {sidebarOpen && <span className="text-lg font-bold tracking-tight">Stonks</span>}
        </div>

        {/* nav */}
        <nav className="flex-1 py-4 space-y-1 px-2">
          {NAV.map(({ icon: Icon, label, href }) => {
            const active = pathname === href;
            return (
              <Link
                key={label}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200
                  ${active
                    ? 'bg-primary/15 text-primary border border-primary/25'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  } ${sidebarOpen ? '' : 'justify-center'}`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-primary' : ''}`} />
                {sidebarOpen && <span className="text-sm font-medium">{label}</span>}
                {sidebarOpen && active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
              </Link>
            );
          })}
        </nav>

        {/* bottom */}
        <div className="px-2 pb-4 space-y-1 border-t border-border pt-3">
          <ThemeToggle collapsed={!sidebarOpen} />
          <Link
            href="#settings"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-all ${sidebarOpen ? '' : 'justify-center'}`}
          >
            <Settings className="w-4 h-4 shrink-0" />
            {sidebarOpen && <span className="text-sm font-medium">Settings</span>}
          </Link>
          <button
            onClick={handleLogout}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all ${sidebarOpen ? '' : 'justify-center'}`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {sidebarOpen && <span className="text-sm font-medium">Logout</span>}
          </button>
        </div>
      </aside>

      {/* ═══════ MAIN ═══════ */}
      <div className="relative z-10 flex-1 flex flex-col min-w-0 overflow-auto">
        {/* top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-4 px-6 py-3.5 bg-background/80 backdrop-blur-xl border-b border-border">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <Menu className="w-4 h-4" />
          </button>

          {/* live ticker */}
          <div className="flex-1 overflow-hidden">
            <div className="flex gap-5 animate-[tickerScroll_30s_linear_infinite]">
              {[...indices, ...indices].map((idx, i) => (
                <span key={i} className="text-xs whitespace-nowrap flex items-center gap-1.5 text-muted-foreground">
                  <span className="text-foreground font-medium">{idx.label}</span>
                  <span style={{ color: (idx.chgPct ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
                    {(idx.chgPct ?? 0) >= 0 ? '+' : ''}
                    {(idx.chgPct ?? 0).toFixed(2)}%
                  </span>
                </span>
              ))}
            </div>
          </div>

          {/* search → stocks page */}
          <Link
            href="/dashboard/stocks"
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground transition-all text-sm"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden md:block">Search stocks…</span>
            <kbd className="hidden md:block text-[10px] px-1.5 py-0.5 bg-background rounded border border-border">⌘K</kbd>
          </Link>

          {/* bell */}
          <button className="relative p-2 rounded-xl bg-muted border border-border text-muted-foreground hover:text-foreground transition-all">
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-destructive" />
          </button>

          {/* avatar dropdown */}
          <div ref={profileMenuRef} className="relative">
            <button
              onClick={() => setProfileMenuOpen((v) => !v)}
              title="Account"
              aria-label="Account"
              className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold cursor-pointer hover:opacity-90 active:scale-[0.98] transition-all"
            >
              R
            </button>

            {profileMenuOpen && (
              <div className="absolute right-0 top-10 w-40 rounded-xl border border-border bg-card p-1.5 shadow-[0_12px_28px_rgba(0,0,0,0.25)]">
                <button
                  onClick={() => {
                    setProfileMenuOpen(false);
                    router.push('/dashboard/profile');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <User className="w-4 h-4" />
                  Profile
                </button>
                <button
                  onClick={async () => {
                    setProfileMenuOpen(false);
                    await handleLogout();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </header>

        {/* page content */}
        <main className="flex-1 px-6 py-6 space-y-6">{children}</main>
      </div>
    </div>
  );
}
