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

export async function nextRequestNo(conn: PoolConnection, kind: RequestNoKind): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = REQUEST_NO_PREFIX[kind];
  const column = kind === "closed_suspense" ? "closed_request_no" : "request_no";
  const [rows] = await conn.query<any[]>(
    `SELECT COUNT(*) AS c FROM petty_cash_requests WHERE ${column} LIKE ?`,
    [`${prefix}-${year}-%`]
  );
  const seq = Number(rows[0].c) + 1;
  return `${prefix}-${year}-${String(seq).padStart(6, "0")}`;
}

export async function nextTopUpNo(conn: PoolConnection): Promise<string> {
  const year = new Date().getFullYear();
  const [rows] = await conn.query<any[]>(
    "SELECT COUNT(*) AS c FROM top_up_requests WHERE top_up_no LIKE ?",
    [`TUP-${year}-%`]
  );
  const seq = Number(rows[0].c) + 1;
  return `TUP-${year}-${String(seq).padStart(6, "0")}`;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
