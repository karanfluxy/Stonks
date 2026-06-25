import { NextResponse } from 'next/server';
import getConnection from '../lib/mysql';
import { ACCESS_TOKEN_COOKIE, verifyAccessToken } from '../lib/jwt';
import { ensureWalletRow, ensureWalletTable } from '../lib/walletSchema';
import {
  ensurePortfolioHoldingsTable,
  ensurePortfolioTransactionsTable,
} from '../lib/portfolioSchema';

function roundMoney(value) {
  return Number(Number(value).toFixed(2));
}

function roundQty(value) {
  return Number(Number(value).toFixed(6));
}

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

async function ensurePortfolioSchema(conn) {
  const walletTable = await ensureWalletTable(conn);
  if (!walletTable.ok) return walletTable;

  const holdingsTable = await ensurePortfolioHoldingsTable(conn);
  if (!holdingsTable.ok) return holdingsTable;

  const transactionsTable = await ensurePortfolioTransactionsTable(conn);
  if (!transactionsTable.ok) return transactionsTable;

  return { ok: true };
}

export async function GET(req) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const conn = await getConnection();
    try {
      const schema = await ensurePortfolioSchema(conn);
      if (!schema.ok) {
        return NextResponse.json({ error: schema.error }, { status: 500 });
      }

      await ensureWalletRow(conn, userId);

      const [walletRows] = await conn.query(
        'SELECT balance FROM wallets WHERE user_id = ? LIMIT 1',
        [userId]
      );
      const walletBalance = roundMoney(walletRows?.[0]?.balance ?? 0);

      const [holdingsRows] = await conn.query(
        `SELECT sym, name, sector, quantity, avg_price, updated_at
         FROM portfolio_holdings
         WHERE user_id = ?
         ORDER BY updated_at DESC`,
        [userId]
      );

      const holdings = (holdingsRows || []).map((row) => ({
        sym: String(row.sym),
        name: String(row.name),
        sector: row.sector ? String(row.sector) : null,
        quantity: Number(row.quantity),
        avgPrice: Number(row.avg_price),
        costBasis: roundMoney(Number(row.quantity) * Number(row.avg_price)),
        updatedAt: row.updated_at,
      }));

      const [txnRows] = await conn.query(
        `SELECT id, sym, name, side, quantity, price, total_value, realized_pnl, created_at
         FROM portfolio_transactions
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 100`,
        [userId]
      );

      const transactions = (txnRows || []).map((row) => ({
        id: Number(row.id),
        sym: String(row.sym),
        name: String(row.name),
        side: String(row.side),
        quantity: Number(row.quantity),
        price: Number(row.price),
        totalValue: Number(row.total_value),
        realizedPnl: Number(row.realized_pnl ?? 0),
        createdAt: row.created_at,
      }));

      const totalInvested = roundMoney(
        holdings.reduce((sum, h) => sum + h.costBasis, 0)
      );
      const realizedPnl = roundMoney(
        transactions.reduce((sum, t) => sum + (Number(t.realizedPnl) || 0), 0)
      );

      return NextResponse.json(
        {
          walletBalance,
          holdings,
          transactions,
          summary: {
            positions: holdings.length,
            totalInvested,
            realizedPnl,
          },
        },
        { status: 200 }
      );
    } finally {
      conn.release();
    }
  } catch (error) {
    const message = process.env.NODE_ENV === 'production'
      ? 'Portfolio fetch failed'
      : (error instanceof Error ? error.message : 'Portfolio fetch failed');
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
    const sideRaw = typeof body?.side === 'string' ? body.side.toUpperCase() : '';
    const side = sideRaw === 'BUY' || sideRaw === 'SELL' ? sideRaw : null;
    const sym = typeof body?.sym === 'string' ? body.sym.trim() : '';
    const name = typeof body?.name === 'string' ? body.name.trim() : sym;
    const sector = typeof body?.sector === 'string' ? body.sector.trim() : null;
    const quantity = roundQty(Number(body?.quantity));
    const price = roundMoney(Number(body?.price));

    if (!side) {
      return NextResponse.json({ error: 'Invalid trade side' }, { status: 400 });
    }
    if (!sym || sym.length > 40) {
      return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: 'Quantity must be greater than 0' }, { status: 400 });
    }
    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ error: 'Price must be greater than 0' }, { status: 400 });
    }
    if (quantity > 1_000_000) {
      return NextResponse.json({ error: 'Quantity is too large' }, { status: 400 });
    }

    const totalValue = roundMoney(quantity * price);
    if (totalValue > 100_000_000) {
      return NextResponse.json({ error: 'Trade value exceeds per-transaction limit' }, { status: 400 });
    }

    const conn = await getConnection();
    try {
      const schema = await ensurePortfolioSchema(conn);
      if (!schema.ok) {
        return NextResponse.json({ error: schema.error }, { status: 500 });
      }

      await ensureWalletRow(conn, userId);
      await conn.beginTransaction();

      try {
        const [walletRows] = await conn.query(
          'SELECT id, balance FROM wallets WHERE user_id = ? LIMIT 1 FOR UPDATE',
          [userId]
        );
        const wallet = walletRows?.[0] || null;
        if (!wallet) {
          throw new Error('Wallet not found');
        }

        const walletBalance = roundMoney(wallet.balance ?? 0);

        const [holdingRows] = await conn.query(
          `SELECT id, quantity, avg_price
           FROM portfolio_holdings
           WHERE user_id = ? AND sym = ?
           LIMIT 1 FOR UPDATE`,
          [userId, sym]
        );

        const holding = holdingRows?.[0] || null;
        let nextWallet = walletBalance;
        let realizedPnl = 0;

        if (side === 'BUY') {
          if (walletBalance < totalValue) {
            await conn.rollback();
            return NextResponse.json(
              { error: 'Insufficient wallet balance for this trade' },
              { status: 400 }
            );
          }

          nextWallet = roundMoney(walletBalance - totalValue);

          if (!holding) {
            await conn.query(
              `INSERT INTO portfolio_holdings
               (user_id, sym, name, sector, quantity, avg_price)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [userId, sym, name, sector, quantity, price]
            );
          } else {
            const currentQty = Number(holding.quantity);
            const currentAvg = Number(holding.avg_price);
            const newQty = roundQty(currentQty + quantity);
            const newAvg = roundMoney(((currentQty * currentAvg) + (quantity * price)) / newQty);
            await conn.query(
              `UPDATE portfolio_holdings
               SET quantity = ?, avg_price = ?, name = ?, sector = ?
               WHERE id = ?`,
              [newQty, newAvg, name, sector, holding.id]
            );
          }
        } else {
          if (!holding) {
            await conn.rollback();
            return NextResponse.json({ error: 'No holdings found for this symbol' }, { status: 400 });
          }

          const currentQty = Number(holding.quantity);
          const currentAvg = Number(holding.avg_price);
          if (quantity > currentQty) {
            await conn.rollback();
            return NextResponse.json({ error: 'Sell quantity exceeds current holdings' }, { status: 400 });
          }

          const remainingQty = roundQty(currentQty - quantity);
          nextWallet = roundMoney(walletBalance + totalValue);
          realizedPnl = roundMoney((price - currentAvg) * quantity);

          if (remainingQty <= 0) {
            await conn.query('DELETE FROM portfolio_holdings WHERE id = ?', [holding.id]);
          } else {
            await conn.query(
              'UPDATE portfolio_holdings SET quantity = ? WHERE id = ?',
              [remainingQty, holding.id]
            );
          }
        }

        await conn.query(
          'UPDATE wallets SET balance = ? WHERE user_id = ?',
          [nextWallet, userId]
        );

        await conn.query(
          `INSERT INTO portfolio_transactions
           (user_id, sym, name, side, quantity, price, total_value, realized_pnl)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [userId, sym, name, side, quantity, price, totalValue, realizedPnl]
        );

        await conn.commit();

        return NextResponse.json(
          {
            ok: true,
            trade: {
              sym,
              name,
              side,
              quantity,
              price,
              totalValue,
              realizedPnl,
            },
            walletBalance: nextWallet,
          },
          { status: 200 }
        );
      } catch (e) {
        await conn.rollback();
        throw e;
      }
    } finally {
      conn.release();
    }
  } catch (error) {
    const message = process.env.NODE_ENV === 'production'
      ? 'Trade failed'
      : (error instanceof Error ? error.message : 'Trade failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
