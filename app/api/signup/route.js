import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import getConnection from '../lib/mysql';
import { buildAuthCookies } from '../lib/authCookies';
import { ensureUsersTable, ensurePasswordHashColumn, ensureRefreshTokenColumns } from '../lib/userSchema';
import {
  createRefreshTokenId,
  hashToken,
  signAccessToken,
  signRefreshToken,
  REFRESH_TOKEN_TTL_SECONDS_DEFAULT,
} from '../lib/jwt';

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Missing name, email, or password' }, { status: 400 });
    }

    if (name.length > 120 || email.length > 254) {
      return NextResponse.json({ error: 'Invalid input length' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const conn = await getConnection();
    try {
      const usersTable = await ensureUsersTable(conn);
      if (!usersTable.ok) {
        return NextResponse.json({ error: usersTable.error }, { status: 500 });
      }

      const schema = await ensurePasswordHashColumn(conn);
      if (!schema.ok) {
        return NextResponse.json({ error: schema.error }, { status: 500 });
      }
      const refreshSchema = await ensureRefreshTokenColumns(conn);
      if (!refreshSchema.ok) {
        return NextResponse.json({ error: refreshSchema.error }, { status: 500 });
      }

      const [rows] = await conn.query(
        'SELECT id, name, email, password_hash FROM users WHERE email = ? LIMIT 1',
        [email]
      );

      if (rows && rows.length > 0) {
        return NextResponse.json({ error: 'Email is already in use' }, { status: 409 });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const [result] = await conn.query(
        'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
        [name, email, passwordHash]
      );

      const [createdRows] = await conn.query(
        'SELECT id, name, email FROM users WHERE id = ? LIMIT 1',
        [result.insertId]
      );

      const user = createdRows?.[0] || null;
      if (!user) {
        return NextResponse.json({ error: 'User creation failed' }, { status: 500 });
      }

      const refreshTokenId = createRefreshTokenId();
      const accessToken = await signAccessToken({ sub: user.id, email: user.email, name: user.name });
      const refreshToken = await signRefreshToken({ sub: user.id, jti: refreshTokenId }, REFRESH_TOKEN_TTL_SECONDS_DEFAULT);
      const refreshTokenHash = hashToken(refreshToken);

      await conn.query(
        'UPDATE users SET refresh_token_hash = ?, refresh_token_expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND) WHERE id = ?',
        [refreshTokenHash, REFRESH_TOKEN_TTL_SECONDS_DEFAULT, user.id]
      );
      const cookies = buildAuthCookies({
        accessToken,
        refreshToken,
        refreshMaxAgeSeconds: REFRESH_TOKEN_TTL_SECONDS_DEFAULT,
      });

      const res = NextResponse.json({ user }, { status: 201 });
      res.cookies.set(cookies.access);
      res.cookies.set(cookies.refresh);
      return res;
    } finally {
      conn.release();
    }
  } catch (error) {
    const message = process.env.NODE_ENV === 'production'
      ? 'Signup failed'
      : (error instanceof Error ? error.message : 'Signup failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
