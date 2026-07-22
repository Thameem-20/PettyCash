import { PoolConnection, queryOne, execute } from "./db";
import { ChargeType } from "./types";

/** Resolve category from description text, or create one if new. */
export async function resolveOrCreateCategory(
  description: string,
  chargeType: ChargeType,
  conn?: PoolConnection
): Promise<number> {
  const desc = description.trim();
  if (!desc) throw new Error("Description is required");

  const run = async <T>(sql: string, params: unknown[]): Promise<T | null> => {
    if (conn) {
      const [rows] = await conn.query<any[]>(sql, params);
      return rows.length ? (rows[0] as T) : null;
    }
    return queryOne<T>(sql, params);
  };

  // 1. Exact match on category name + charge type.
  const byName = await run<{ id: number }>(
    `SELECT id FROM expense_categories
      WHERE is_active = 1 AND LOWER(category_name) = LOWER(?) AND charge_type = ?`,
    [desc, chargeType]
  );
  if (byName) return byName.id;

  // 2. Same description used on a past request of this charge type.
  const byPast = await run<{ category_id: number }>(
    `SELECT category_id FROM petty_cash_requests
      WHERE LOWER(description) = LOWER(?) AND charge_type = ?
      ORDER BY id DESC LIMIT 1`,
    [desc, chargeType]
  );
  if (byPast) return byPast.category_id;

  // 3. Create a new category from this description (becomes available next time).
  const jobReq = chargeType === "job" ? 1 : 0;
  if (conn) {
    const [res] = await conn.execute<any>(
      "INSERT INTO expense_categories (category_name, charge_type, job_number_required) VALUES (?,?,?)",
      [desc, chargeType, jobReq]
    );
    return res.insertId as number;
  }
  const res = await execute(
    "INSERT INTO expense_categories (category_name, charge_type, job_number_required) VALUES (?,?,?)",
    [desc, chargeType, jobReq]
  );
  return res.insertId;
}
