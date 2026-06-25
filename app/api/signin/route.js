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
    REFRESH_TOKEN_TTL_SECONDS_REMEMBER_ME,
} from '../lib/jwt';

export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}));
        const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
        const password = typeof body?.password === 'string' ? body.password : '';
        const rememberMe = Boolean(body?.rememberMe);

        if (!email || !password) {
            return NextResponse.json({ error: 'Missing email or password' }, { status: 400 });
        }

        if (email.length > 254 || password.length > 256) {
            return NextResponse.json({ error: 'Invalid input length' }, { status: 400 });
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

            if (!rows || rows.length === 0) {
                return NextResponse.json(
                    { error: 'Invalid email or password' },
                    { status: 401 }
                );
            }

            const user = rows[0];
            if (!user.password_hash) {
                return NextResponse.json(
                    { error: 'Password auth is not enabled for this user' },
                    { status: 401 }
                );
            }

            const ok = await bcrypt.compare(password, user.password_hash);
            if (!ok) {
                return NextResponse.json(
                    { error: 'Invalid email or password' },
                    { status: 401 }
                );
            }

            const refreshTtl = rememberMe
                ? REFRESH_TOKEN_TTL_SECONDS_REMEMBER_ME
                : REFRESH_TOKEN_TTL_SECONDS_DEFAULT;

            const refreshTokenId = createRefreshTokenId();

            const accessToken = await signAccessToken({ sub: user.id, email: user.email, name: user.name });
            const refreshToken = await signRefreshToken({ sub: user.id, jti: refreshTokenId }, refreshTtl);
            const refreshTokenHash = hashToken(refreshToken);

            await conn.query(
                'UPDATE users SET refresh_token_hash = ?, refresh_token_expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND) WHERE id = ?',
                [refreshTokenHash, refreshTtl, user.id]
            );
            const cookies = buildAuthCookies({
                accessToken,
                refreshToken,
                refreshMaxAgeSeconds: refreshTtl,
            });

            const res = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email } }, { status: 200 });
            res.cookies.set(cookies.access);
            res.cookies.set(cookies.refresh);
            return res;
        } finally {
            conn.release();
        }
    } catch (error) {
        const message = process.env.NODE_ENV === 'production'
            ? 'Authentication failed'
            : (error instanceof Error ? error.message : 'Authentication failed');
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}