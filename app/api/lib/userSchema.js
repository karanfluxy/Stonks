import { loadServerEnvOnce } from './loadEnv';

loadServerEnvOnce();

function autoMigrateEnabled() {
  return (
    process.env.AUTO_MIGRATE_DB === '1' ||
    process.env.AUTO_MIGRATE_AUTH === '1' ||
    process.env.NEXT_PUBLIC_AUTO_MIGRATE_DB === '1'
  );
}

export async function ensureUsersTable(conn) {
  const [tableRows] = await conn.query("SHOW TABLES LIKE 'users'");
  if (tableRows && tableRows.length > 0) {
    return { ok: true, migrated: false };
  }

  if (!autoMigrateEnabled()) {
    return {
      ok: false,
      migrated: false,
      error:
        "Database schema missing 'users' table. Create it manually, or set AUTO_MIGRATE_AUTH=1 to let the API create it automatically.",
    };
  }

  try {
    await conn.query(`
      CREATE TABLE users (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(254) NOT NULL,
        password_hash VARCHAR(255) NULL,
        refresh_token_hash VARCHAR(64) NULL,
        refresh_token_expires_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_users_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    return { ok: true, migrated: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      migrated: false,
      error:
        "Failed to auto-migrate DB to create users table. Run the SQL manually. Underlying error: " +
        message,
    };
  }
}

export async function ensurePasswordHashColumn(conn) {
  const [colRows] = await conn.query("SHOW COLUMNS FROM users LIKE 'password_hash'");
  if (colRows && colRows.length > 0) {
    return { ok: true, migrated: false };
  }

  if (!autoMigrateEnabled()) {
    return {
      ok: false,
      migrated: false,
      error:
        "Database schema missing column 'password_hash' in users table. Add it (e.g. VARCHAR(255) NULL/NOT NULL). Or set AUTO_MIGRATE_AUTH=1 to let the API add it automatically.",
    };
  }

  try {
    await conn.query("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL");
    return { ok: true, migrated: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      migrated: false,
      error:
        "Failed to auto-migrate DB to add users.password_hash. Run the SQL manually. Underlying error: " +
        message,
    };
  }
}

export async function ensureRefreshTokenColumns(conn) {
  const requiredColumns = [
    {
      name: 'refresh_token_hash',
      alterSql: "ALTER TABLE users ADD COLUMN refresh_token_hash VARCHAR(64) NULL",
    },
    {
      name: 'refresh_token_expires_at',
      alterSql: "ALTER TABLE users ADD COLUMN refresh_token_expires_at DATETIME NULL",
    },
  ];

  for (const column of requiredColumns) {
    const [colRows] = await conn.query(`SHOW COLUMNS FROM users LIKE '${column.name}'`);
    if (colRows && colRows.length > 0) {
      continue;
    }

    if (!autoMigrateEnabled()) {
      return {
        ok: false,
        migrated: false,
        error:
          `Database schema missing column '${column.name}' in users table. Add it manually, or set AUTO_MIGRATE_AUTH=1 to auto-migrate.`,
      };
    }

    try {
      await conn.query(column.alterSql);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        migrated: false,
        error:
          `Failed to auto-migrate DB for '${column.name}'. Run the SQL manually. Underlying error: ${message}`,
      };
    }
  }

  return { ok: true, migrated: true };
}
