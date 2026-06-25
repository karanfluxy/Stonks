import { loadServerEnvOnce } from './loadEnv';

loadServerEnvOnce();

function autoMigrateEnabled() {
  return (
    process.env.AUTO_MIGRATE_DB === '1' ||
    process.env.AUTO_MIGRATE_AUTH === '1' ||
    process.env.NEXT_PUBLIC_AUTO_MIGRATE_DB === '1'
  );
}

export async function ensurePortfolioHoldingsTable(conn) {
  const [tableRows] = await conn.query("SHOW TABLES LIKE 'portfolio_holdings'");
  if (tableRows && tableRows.length > 0) {
    return { ok: true, migrated: false };
  }

  if (!autoMigrateEnabled()) {
    return {
      ok: false,
      migrated: false,
      error:
        "Database schema missing 'portfolio_holdings' table. Create it manually, or set AUTO_MIGRATE_DB=1 to let the API create it automatically.",
    };
  }

  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS portfolio_holdings (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        sym VARCHAR(40) NOT NULL,
        name VARCHAR(255) NOT NULL,
        sector VARCHAR(120) NULL,
        quantity DECIMAL(18, 6) NOT NULL,
        avg_price DECIMAL(14, 2) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_portfolio_user_sym (user_id, sym),
        KEY idx_portfolio_user_id (user_id),
        CONSTRAINT fk_portfolio_user FOREIGN KEY (user_id)
          REFERENCES users (id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    return { ok: true, migrated: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      migrated: false,
      error:
        "Failed to auto-migrate DB to create portfolio_holdings table. Run the SQL manually. Underlying error: " +
        message,
    };
  }
}

export async function ensurePortfolioTransactionsTable(conn) {
  const [tableRows] = await conn.query("SHOW TABLES LIKE 'portfolio_transactions'");
  if (tableRows && tableRows.length > 0) {
    return { ok: true, migrated: false };
  }

  if (!autoMigrateEnabled()) {
    return {
      ok: false,
      migrated: false,
      error:
        "Database schema missing 'portfolio_transactions' table. Create it manually, or set AUTO_MIGRATE_DB=1 to let the API create it automatically.",
    };
  }

  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS portfolio_transactions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        sym VARCHAR(40) NOT NULL,
        name VARCHAR(255) NOT NULL,
        side ENUM('BUY', 'SELL') NOT NULL,
        quantity DECIMAL(18, 6) NOT NULL,
        price DECIMAL(14, 2) NOT NULL,
        total_value DECIMAL(16, 2) NOT NULL,
        realized_pnl DECIMAL(16, 2) NOT NULL DEFAULT 0.00,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_portfolio_txn_user_created (user_id, created_at),
        CONSTRAINT fk_portfolio_txn_user FOREIGN KEY (user_id)
          REFERENCES users (id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    return { ok: true, migrated: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      migrated: false,
      error:
        "Failed to auto-migrate DB to create portfolio_transactions table. Run the SQL manually. Underlying error: " +
        message,
    };
  }
}
