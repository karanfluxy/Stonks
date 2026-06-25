'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle({ collapsed }: { collapsed?: boolean }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const isDark = theme === 'dark';

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-400 hover:bg-slate-500/10 hover:text-foreground transition-all ${collapsed ? 'justify-center' : ''}`}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
      {!collapsed && <span className="text-sm font-medium">{isDark ? 'Light Mode' : 'Dark Mode'}</span>}
    </button>
  );
}
