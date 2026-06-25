'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AuthRefresh() {
  const router = useRouter();

  useEffect(() => {
    let alive = true;

    const run = async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST' });
        if (!alive) return;
        if (!res.ok) {
          router.replace('/login');
        }
      } catch {
        if (alive) router.replace('/login');
      }
    };

    // Refresh shortly after mount, then every 5 minutes.
    run();
    const interval = setInterval(run, 5 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [router]);

  return null;
}
