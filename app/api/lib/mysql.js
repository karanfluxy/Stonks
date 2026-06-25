import mysql from 'mysql2/promise';

import { loadServerEnvOnce } from './loadEnv';

loadServerEnvOnce();

const host = process.env.DB_HOST ?? process.env.MYSQL_HOST;
const user = process.env.DB_USER ?? process.env.MYSQL_USER;
const password = process.env.DB_PASS ?? process.env.MYSQL_PASSWORD;

const portRaw = process.env.DB_PORT ?? process.env.MYSQL_PORT;
const port = portRaw ? Number(portRaw) : undefined;

const database = process.env.DB_NAME ?? process.env.MYSQL_DATABASE ?? 'stonks';

if (!host || !user) {
  throw new Error(
    [
      'MySQL is not configured. Missing required environment variables.',
      'Set DB_HOST and DB_USER (or MYSQL_HOST and MYSQL_USER) in a .env.local at the project root.',
      'Example keys: DB_HOST=127.0.0.1, DB_USER=stonks_app, DB_PASS=..., DB_NAME=stonks, DB_PORT=3306',
    ].join('\n')
  );
}

const pool = mysql.createPool({
  host,
  user,
  password,
  port: Number.isFinite(port) ? port : undefined,
  database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const getConnection = async (databaseOverride = database) => {
  const connection = await pool.getConnection();
  if (databaseOverride) {
    await connection.query(`USE \`${databaseOverride}\``);
  }
  return connection;
}
export default getConnection;