import { NextResponse } from 'next/server';
import getConnection from '../lib/mysql';
import { ACCESS_TOKEN_COOKIE, verifyAccessToken } from '../lib/jwt';
import { ensureWalletRow, ensureWalletTable } from '../lib/walletSchema';

async function getAuthenticatedUserId(req) {
  const accessToken = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) return null;

  try {
    const decoded = await verifyAccessToken(accessToken);
    return decoded?.sub ? String(decoded.sub) : null;
  } catch {
    return null;
  }
}

export async function GET(req) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const conn = await getConnection();
    try {
      const walletTable = await ensureWalletTable(conn);
      if (!walletTable.ok) {
        return NextResponse.json({ error: walletTable.error }, { status: 500 });
      }

      await ensureWalletRow(conn, userId);

      const [rows] = await conn.query(
        'SELECT balance FROM wallets WHERE user_id = ? LIMIT 1',
        [userId]
      );

      const row = rows?.[0] || null;
      const balance = row?.balance != null ? Number(row.balance) : 0;
      return NextResponse.json({ balance }, { status: 200 });
    } finally {
      conn.release();
    }
  } catch (error) {
    const message = process.env.NODE_ENV === 'production'
      ? 'Wallet fetch failed'
      : (error instanceof Error ? error.message : 'Wallet fetch failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const amountRaw = Number(body?.amount);
    const amount = Number(amountRaw.toFixed(2));

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
    }

    if (amount > 1000000) {
      return NextResponse.json({ error: 'Amount exceeds per-transaction limit' }, { status: 400 });
    }

    const conn = await getConnection();
    try {
      const walletTable = await ensureWalletTable(conn);
      if (!walletTable.ok) {
        return NextResponse.json({ error: walletTable.error }, { status: 500 });
      }

      await ensureWalletRow(conn, userId);

      await conn.query(
        'UPDATE wallets SET balance = ROUND(balance + ?, 2) WHERE user_id = ?',
        [amount, userId]
      );

      const [rows] = await conn.query(
        'SELECT balance FROM wallets WHERE user_id = ? LIMIT 1',
        [userId]
      );

      const row = rows?.[0] || null;
      const balance = row?.balance != null ? Number(row.balance) : 0;

      return NextResponse.json({ balance }, { status: 200 });
    } finally {
      conn.release();
    }
  } catch (error) {
    const message = process.env.NODE_ENV === 'production'
      ? 'Wallet update failed'
      : (error instanceof Error ? error.message : 'Wallet update failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
