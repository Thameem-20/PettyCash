import mysql, { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";

declare global {
  // eslint-disable-next-line no-var
  var __pettyCashPool: Pool | undefined;
}

function createPool(): Pool {
  return mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "petty_cash",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    decimalNumbers: true,
    dateStrings: true,
    /** Business timezone — report date filters and CURDATE() use this. */
    timezone: process.env.DB_TIMEZONE || "+04:00",
  });
}

// Reuse a single pool across hot reloads in dev.
export const pool: Pool = global.__pettyCashPool ?? createPool();
if (process.env.NODE_ENV !== "production") global.__pettyCashPool = pool;

/** Run a SELECT and return typed rows. */
export async function query<T = RowDataPacket>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const [rows] = await pool.query<RowDataPacket[]>(sql, params as any[]);
  return rows as T[];
}

/** Run a SELECT and return the first row or null. */
export async function queryOne<T = RowDataPacket>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length ? rows[0] : null;
}

/** Run an INSERT/UPDATE/DELETE. Returns the ResultSetHeader. */
export async function execute(
  sql: string,
  params: unknown[] = []
): Promise<ResultSetHeader> {
  const [result] = await pool.execute<ResultSetHeader>(sql, params as any[]);
  return result;
}

/** Run a set of statements inside a transaction. */
export async function withTransaction<T>(
  fn: (conn: PoolConnection) => Promise<T>
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export type { PoolConnection, RowDataPacket, ResultSetHeader };
