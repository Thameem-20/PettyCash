import type { PoolConnection } from "./db";

/** Format a number as currency (AED default), no locale surprises. */
export function money(amount: number | null | undefined, currency = "AED"): string {
  const n = Number(amount || 0);
  return `${currency} ${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return "-";
  const date = new Date(d.replace(" ", "T"));
  if (isNaN(date.getTime())) return d;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateOnly(d: string | null | undefined): string {
  if (!d) return "-";
  const date = new Date(d.replace(" ", "T"));
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** Request number prefixes: PCR petty cash, OSR open suspense, CSR closed suspense. */
export type RequestNoKind = "exact" | "open_suspense" | "closed_suspense";

const REQUEST_NO_PREFIX: Record<RequestNoKind, string> = {
  exact: "PCR",
  open_suspense: "OSR",
  closed_suspense: "CSR",
};

/**
 * Find the next free sequence number for a "PREFIX-YEAR-000123" style code.
 * Uses MAX() of the parsed numeric suffix (not COUNT(*)) so deleting a row in
 * the middle of the sequence can't produce a number that already exists.
 * Also walks forward past any exact collision as a last-resort safety net
 * (e.g. legacy duplicates or a rare race between concurrent transactions).
 */
async function nextSequenceNo(
  conn: PoolConnection,
  table: string,
  column: string,
  prefix: string,
  year: number
): Promise<string> {
  const [rows] = await conn.query<any[]>(
    `SELECT MAX(CAST(SUBSTRING_INDEX(${column}, '-', -1) AS UNSIGNED)) AS max_seq
       FROM ${table} WHERE ${column} LIKE ?`,
    [`${prefix}-${year}-%`]
  );
  let seq = Number(rows[0]?.max_seq || 0) + 1;

  for (;;) {
    const candidate = `${prefix}-${year}-${String(seq).padStart(6, "0")}`;
    const [existing] = await conn.query<any[]>(
      `SELECT 1 FROM ${table} WHERE ${column} = ? LIMIT 1`,
      [candidate]
    );
    if (existing.length === 0) return candidate;
    seq += 1;
  }
}

export async function nextRequestNo(conn: PoolConnection, kind: RequestNoKind): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = REQUEST_NO_PREFIX[kind];
  const column = kind === "closed_suspense" ? "closed_request_no" : "request_no";
  return nextSequenceNo(conn, "petty_cash_requests", column, prefix, year);
}

export async function nextTopUpNo(conn: PoolConnection): Promise<string> {
  const year = new Date().getFullYear();
  return nextSequenceNo(conn, "top_up_requests", "top_up_no", "TUP", year);
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
