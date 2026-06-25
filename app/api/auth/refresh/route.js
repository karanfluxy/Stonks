import { NextResponse } from 'next/server';
import getConnection from '../../lib/mysql';
import { buildAuthCookies } from '../../lib/authCookies';
import { ensureRefreshTokenColumns } from '../../lib/userSchema';
import {
  ACCESS_TOKEN_COOKIE,
  createRefreshTokenId,
  hashToken,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_TTL_SECONDS_DEFAULT,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../lib/jwt';

export async function POST(req) {
  try {
    const refreshToken = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
    const accessToken = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

    let refreshDecoded = null;
    let refreshTokenHash = '';
    let refreshTtl = REFRESH_TOKEN_TTL_SECONDS_DEFAULT;

    if (refreshToken) {
      try {
        refreshDecoded = await verifyRefreshToken(refreshToken);
        refreshTokenHash = hashToken(refreshToken);

        const now = Math.floor(Date.now() / 1000);
        const exp = typeof refreshDecoded.exp === 'number' ? refreshDecoded.exp : null;
        refreshTtl = exp ? Math.max(60, exp - now) : REFRESH_TOKEN_TTL_SECONDS_DEFAULT;
      } catch {
        refreshDecoded = null;
        refreshTokenHash = '';
      }
    }

    let accessDecoded = null;
    if (accessToken) {
      try {
        accessDecoded = await verifyAccessToken(accessToken);
      } catch {
        accessDecoded = null;
      }
    }

    // Optional: load user details for access token payload.
    const conn = await getConnection();
    try {
      const schema = await ensureRefreshTokenColumns(conn);
      if (!schema.ok) {
        return NextResponse.json({ error: schema.error }, { status: 500 });
      }

      let user = null;
      let refreshValid = false;

      if (refreshDecoded?.sub) {
        const [rows] = await conn.query(
          'SELECT id, name, email, refresh_token_hash, refresh_token_expires_at FROM users WHERE id = ? LIMIT 1',
          [refreshDecoded.sub]
        );

        user = rows?.[0] || null;
        if (user) {
          const storedHash = user.refresh_token_hash ? String(user.refresh_token_hash) : '';
          if (storedHash && storedHash === refreshTokenHash) {
            if (user.refresh_token_expires_at) {
              const expiresAt = new Date(user.refresh_token_expires_at);
              if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > Date.now()) {
                refreshValid = true;
              }
            } else {
              refreshValid = true;
            }
          }
        }
      }

      if (!refreshValid) {
        const fallbackUserId = accessDecoded?.sub;
        if (!fallbackUserId) {
          return NextResponse.json({ error: 'Invalid refresh token' }, { status: 401 });
        }

        const [fallbackRows] = await conn.query(
          'SELECT id, name, email FROM users WHERE id = ? LIMIT 1',
          [fallbackUserId]
        );

        user = fallbackRows?.[0] || null;
        if (!user) {
          return NextResponse.json({ error: 'User not found' }, { status: 401 });
        }

        refreshTtl = REFRESH_TOKEN_TTL_SECONDS_DEFAULT;
      }

      const newAccessToken = await signAccessToken({ sub: user.id, email: user.email, name: user.name });
      const newRefreshTokenId = createRefreshTokenId();
      const newRefreshToken = await signRefreshToken({ sub: user.id, jti: newRefreshTokenId }, refreshTtl);
      const newRefreshTokenHash = hashToken(newRefreshToken);

      await conn.query(
        'UPDATE users SET refresh_token_hash = ?, refresh_token_expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND) WHERE id = ?',
        [newRefreshTokenHash, refreshTtl, user.id]
      );

      const cookies = buildAuthCookies({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        refreshMaxAgeSeconds: refreshTtl,
      });

      const res = NextResponse.json({ ok: true }, { status: 200 });
      res.cookies.set(cookies.access);
      res.cookies.set(cookies.refresh);
      return res;
    } finally {
      conn.release();
    }
  } catch (error) {
    const message = process.env.NODE_ENV === 'production'
      ? 'Refresh failed'
      : (error instanceof Error ? error.message : 'Refresh failed');
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
