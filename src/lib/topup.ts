import { query, queryOne } from "./db";

export interface EnrichedTopUp {
  id: number;
  top_up_no: string;
  branch_id: number;
  branch_name: string;
  requested_by_user_id: number;
  requested_by_name: string;
  amount: number;
  reason: string | null;
  cp_number: string | null;
  payment_source: "cash" | "bank_account" | null;
  bank_account_id: number | null;
  bank_account_label: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  accounts_supervisor_status: string;
  treasury_status: string;
  treasury_released_status: string;
  accounts_received_status: string;
  status: string;
  comments: string | null;
  created_at: string;
  supervisor_approved_at: string | null;
  treasury_approved_at: string | null;
  cash_released_at: string | null;
  accounts_received_at: string | null;
}

const SELECT = `
  SELECT t.*, b.branch_name, u.name AS requested_by_name
    FROM top_up_requests t
    JOIN branches b ON b.id = t.branch_id
    JOIN users u ON u.id = t.requested_by_user_id
`;

export function getTopUpsWhere(
  where: string,
  params: unknown[] = [],
  order = "t.created_at DESC",
  paging?: { limit: number; offset: number }
) {
  if (!paging) {
    return query<EnrichedTopUp>(`${SELECT} WHERE ${where} ORDER BY ${order}`, params);
  }
  return query<EnrichedTopUp>(
    `${SELECT} WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...params, paging.limit, paging.offset]
  );
}

export async function countTopUpsWhere(where: string, params: unknown[] = []): Promise<number> {
  const row = await queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM top_up_requests t WHERE ${where}`,
    params
  );
  return row ? Number(row.c) : 0;
}

export function getAllTopUps(
  order = "t.created_at DESC",
  paging?: { limit: number; offset: number }
) {
  if (!paging) {
    return query<EnrichedTopUp>(`${SELECT} ORDER BY ${order}`);
  }
  return query<EnrichedTopUp>(`${SELECT} ORDER BY ${order} LIMIT ? OFFSET ?`, [
    paging.limit,
    paging.offset,
  ]);
}

export async function countAllTopUps(): Promise<number> {
  const row = await queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM top_up_requests");
  return row ? Number(row.c) : 0;
}

export function getTopUpById(id: number) {
  return queryOne<EnrichedTopUp>(`${SELECT} WHERE t.id = ?`, [id]);
}
