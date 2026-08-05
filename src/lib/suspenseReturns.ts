import type { PoolConnection } from "mysql2/promise";
import { query } from "./db";
import { round2 } from "./util";

export type SuspenseReturnRow = {
  id: number;
  request_id: number;
  amount: number;
  note: string | null;
  recorded_by_user_id: number;
  recorded_by_name: string;
  created_at: string;
};

export async function listSuspenseReturns(requestId: number): Promise<SuspenseReturnRow[]> {
  return query<SuspenseReturnRow>(
    `SELECT sr.id, sr.request_id, sr.amount, sr.note, sr.recorded_by_user_id,
            u.name AS recorded_by_name, sr.created_at
       FROM suspense_returns sr
       JOIN users u ON u.id = sr.recorded_by_user_id ll
      WHERE sr.request_id = ?
      ORDER BY sr.created_at ASC, sr.id ASC`,
    [requestId]
  );
}

export async function sumSuspenseReturns(
  conn: PoolConnection,
  requestId: number
): Promise<number> {
  const [rows] = await conn.query<any[]>(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM suspense_returns WHERE request_id = ?`,
    [requestId]
  );
  return round2(Number(rows[0]?.total || 0));
}

export function outstandingSuspense(input: {
  paid_amount: number | null;
  returned_amount: number | null;
  actual_expense_amount: number | null;
}): number {
  return round2(
    Math.max(
      0,
      Number(input.paid_amount || 0) -
        Number(input.returned_amount || 0) -
        Number(input.actual_expense_amount || 0)
    )
  );
}
