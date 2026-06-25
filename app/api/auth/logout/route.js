import { NextResponse } from 'next/server';
import { clearAuthCookies } from '../../lib/authCookies';
import getConnection from '../../lib/mysql';
import { ensureRefreshTokenColumns } from '../../lib/userSchema';
import { REFRESH_TOKEN_COOKIE, verifyRefreshToken } from '../../lib/jwt';

export async function POST(req) {
  const refreshToken = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  if (refreshToken) {
    try {
      const decoded = await verifyRefreshToken(refreshToken);
      const userId = decoded?.sub;
      if (userId) {
        const conn = await getConnection();
        try {
          const schema = await ensureRefreshTokenColumns(conn);
          if (schema.ok) {
            await conn.query(
              'UPDATE users SET refresh_token_hash = NULL, refresh_token_expires_at = NULL WHERE id = ?',
              [userId]
            );
          }
        } finally {
          conn.release();
        }
      }
    } catch {
      // Clear cookies even when token validation fails.
    }
  }

  const cookies = clearAuthCookies();
  const res = NextResponse.json({ ok: true }, { status: 200 });
  res.cookies.set(cookies.access);
  res.cookies.set(cookies.refresh);
  return res;
}
