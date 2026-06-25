const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

function parseLooseEnvFile(contents) {
  const out = {};
  const lines = contents.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) continue;

    let key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if (key.startsWith('export ')) {
      key = key.slice('export '.length).trim();
    }

    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }

    out[key] = value;
  }

  return out;
}

function tryLoad(dotenvPath) {
  if (!fs.existsSync(dotenvPath)) return;
  dotenv.config({ path: dotenvPath, override: false });

  const loose = parseLooseEnvFile(fs.readFileSync(dotenvPath, 'utf8'));
  for (const [k, v] of Object.entries(loose)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

function loadEnv() {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, '.env.local'),
    path.join(cwd, '.env'),
    path.join(cwd, 'app', 'api', '.env.local'),
    path.join(cwd, 'app', 'api', '.env'),
  ];

  for (const candidate of candidates) {
    tryLoad(candidate);
  }
}

function getDbConfig() {
  const host = process.env.DB_HOST ?? process.env.MYSQL_HOST;
  const user = process.env.DB_USER ?? process.env.MYSQL_USER;
  const password = process.env.DB_PASS ?? process.env.MYSQL_PASSWORD;
  const portRaw = process.env.DB_PORT ?? process.env.MYSQL_PORT;
  const database = process.env.DB_NAME ?? process.env.MYSQL_DATABASE ?? 'stonks';
  const port = portRaw ? Number(portRaw) : undefined;

  if (!host || !user) {
    throw new Error(
      'MySQL is not configured. Set DB_HOST and DB_USER (or MYSQL_HOST and MYSQL_USER) in .env.local'
    );
  }

  return {
    host,
    user,
    password,
    port: Number.isFinite(port) ? port : undefined,
    database,
  };
}

async function main() {
  loadEnv();
  const config = getDbConfig();

  const connection = await mysql.createConnection(config);
  try {
    const [result] = await connection.query('DELETE FROM `users`');
    console.log(`Deleted ${result.affectedRows ?? 0} user row(s) from users table.`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Failed to delete users:', error.message || error);
  process.exitCode = 1;
});
