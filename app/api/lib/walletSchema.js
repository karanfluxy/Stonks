import { loadServerEnvOnce } from './loadEnv';

loadServerEnvOnce();

function autoMigrateEnabled() {
  return (
    process.env.AUTO_MIGRATE_DB === '1' ||
    process.env.AUTO_MIGRATE_AUTH === '1' ||
    process.env.NEXT_PUBLIC_AUTO_MIGRATE_DB === '1'
  );
}

export async function ensureWalletTable(conn) {
  const [tableRows] = await conn.query("SHOW TABLES LIKE 'wallets'");
  if (tableRows && tableRows.length > 0) {
    return { ok: true, migrated: false };
  }

  if (!autoMigrateEnabled()) {
    return {
      ok: false,
      migrated: false,
      error:
        "Database schema missing 'wallets' table. Create it manually, or set AUTO_MIGRATE_DB=1 to let the API create it automatically.",
    };
  }

  try {
    await conn.query(`
      CREATE TABLE wallets (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        balance DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_wallets_user_id (user_id),
        CONSTRAINT fk_wallets_user FOREIGN KEY (user_id)
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
        "Failed to auto-migrate DB to create wallets table. Run the SQL manually. Underlying error: " +
        message,
    };
  }
}

export async function ensureWalletRow(conn, userId) {
  await conn.query(
    'INSERT IGNORE INTO wallets (user_id, balance) VALUES (?, 0.00)',
    [userId]
  );
}
