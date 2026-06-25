'use client';

import { useState, useEffect, useCallback } from 'react';

const KEY = 'stonks_wishlist';

export function useWishlist() {
  const [list, setList] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setList(JSON.parse(raw));
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  const toggle = useCallback((sym: string) => {
    setList((prev) => {
      const next = prev.includes(sym)
        ? prev.filter((s) => s !== sym)
        : [...prev, sym];
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* quota exceeded */
      }
      return next;
    });
  }, []);

  const has = useCallback((sym: string) => list.includes(sym), [list]);

  return { list, toggle, has };
}
