import { query, queryOne } from "./db";

export type ChartPoint = { label: string; value: number; color?: string };

export const CHART_COLORS = [
  "#0d9488",
  "#14b8a6",
  "#2dd4bf",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#0ea5e9",
  "#8b5cf6",
];

function lastNDays(n: number): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function dayLabel(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short" });
}

function shortStatus(status: string): string {
  return status
    .replace("Pending Supervisor Approval", "Pending Sup.")
    .replace("Pending Accounts Supervisor Approval", "Pending Acc Sup")
    .replace("Pending Accounts Review", "Pending Acct.")
    .replace("Pending Accounts Issue", "Pending Issue")
    .replace("Awaiting Receiver Confirmation", "Awaiting Confirm")
    .replace("Awaiting Cash Receipt Confirmation", "Awaiting Receipt")
    .replace("Pending Settlement Review", "Settlement")
    .replace("Pending Payment", "Pending Pay")
    .replace("Open Suspense", "Open Susp.")
    .slice(0, 22);
}

export async function userRequestStatusBreakdown(userId: number): Promise<ChartPoint[]> {
  const rows = await query<{ label: string; value: number }>(
    `SELECT status AS label, COUNT(*) AS value
       FROM petty_cash_requests
      WHERE submitted_by_user_id = ?
      GROUP BY status
      ORDER BY value DESC`,
    [userId]
  );
  return rows.map((r, i) => ({
    label: shortStatus(r.label),
    value: Number(r.value),
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
}

export async function userSubmissionTrend(userId: number, days = 7): Promise<ChartPoint[]> {
  const rows = await query<{ d: string; c: number }>(
    `SELECT DATE(created_at) AS d, COUNT(*) AS c
       FROM petty_cash_requests
      WHERE submitted_by_user_id = ?
        AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(created_at)`,
    [userId, days - 1]
  );
  const map = new Map(rows.map((r) => [String(r.d).slice(0, 10), Number(r.c)]));
  return lastNDays(days).map((d) => ({ label: dayLabel(d), value: map.get(d) || 0 }));
}

export async function supervisorApprovalBreakdown(
  userId: number,
  isAdmin: boolean
): Promise<ChartPoint[]> {
  if (isAdmin) {
    const rows = await query<{ bucket: string; c: number }>(
      `SELECT
         CASE
           WHEN status IN ('Pending Supervisor Approval') THEN 'Pending'
           WHEN status IN ('Rejected') THEN 'Rejected'
           WHEN status IN ('Returned for Correction') THEN 'Returned'
           WHEN approved_at IS NOT NULL THEN 'Approved'
           ELSE 'Other'
         END AS bucket,
         COUNT(*) AS c
       FROM petty_cash_requests
       GROUP BY bucket
       HAVING bucket <> 'Other'
       ORDER BY c DESC`
    );
    const order = ["Pending", "Approved", "Returned", "Rejected"];
    return order
      .map((label, i) => {
        const row = rows.find((r) => r.bucket === label);
        return row
          ? { label, value: Number(row.c), color: CHART_COLORS[i % CHART_COLORS.length] }
          : null;
      })
      .filter(Boolean) as ChartPoint[];
  }

  const approvedSql = `EXISTS (
    SELECT 1 FROM approvals a
     WHERE a.request_id = petty_cash_requests.id
       AND a.approver_user_id = ?
       AND a.approval_level = 'supervisor'
       AND a.action IN ('approve', 'edit_amount')
  )`;
  const rejectedSql = `EXISTS (
    SELECT 1 FROM approvals a
     WHERE a.request_id = petty_cash_requests.id
       AND a.approver_user_id = ?
       AND a.approval_level = 'supervisor'
       AND a.action = 'reject'
  )`;
  const returnedSql = `EXISTS (
    SELECT 1 FROM approvals a
     WHERE a.request_id = petty_cash_requests.id
       AND a.approver_user_id = ?
       AND a.approval_level = 'supervisor'
       AND a.action = 'return'
  )`;

  const [pending, approved, returned, rejected] = await Promise.all([
    queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM petty_cash_requests
        WHERE supervisor_id = ? AND status = 'Pending Supervisor Approval'`,
      [userId]
    ),
    queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM petty_cash_requests WHERE ${approvedSql}`,
      [userId]
    ),
    queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM petty_cash_requests
        WHERE status = 'Returned for Correction' AND ${returnedSql}`,
      [userId]
    ),
    queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM petty_cash_requests
        WHERE status = 'Rejected' AND ${rejectedSql}`,
      [userId]
    ),
  ]);

  return [
    { label: "Pending", value: Number(pending?.c || 0), color: CHART_COLORS[0] },
    { label: "Approved", value: Number(approved?.c || 0), color: CHART_COLORS[1] },
    { label: "Returned", value: Number(returned?.c || 0), color: CHART_COLORS[2] },
    { label: "Rejected", value: Number(rejected?.c || 0), color: CHART_COLORS[3] },
  ].filter((r) => r.value > 0);
}

export async function supervisorWeeklyTrend(userId: number, isAdmin: boolean): Promise<ChartPoint[]> {
  const base = isAdmin
    ? ""
    : `AND EXISTS (
         SELECT 1 FROM approvals a
          WHERE a.request_id = petty_cash_requests.id
            AND a.approver_user_id = ?
            AND a.approval_level = 'supervisor'
            AND a.action IN ('approve', 'edit_amount')
       )`;
  const params = isAdmin ? [6] : [6, userId];
  const rows = await query<{ d: string; c: number }>(
    `SELECT DATE(approved_at) AS d, COUNT(*) AS c
       FROM petty_cash_requests
      WHERE approved_at IS NOT NULL
        AND approved_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        ${base}
      GROUP BY DATE(approved_at)`,
    params
  );
  const map = new Map(rows.map((r) => [String(r.d).slice(0, 10), Number(r.c)]));
  return lastNDays(7).map((d) => ({ label: dayLabel(d), value: map.get(d) || 0 }));
}

export async function branchCashChart(branchIds?: number[]): Promise<ChartPoint[]> {
  let sql = `SELECT b.branch_name AS label, b.current_cash_balance AS value
               FROM branches b WHERE b.is_active = 1`;
  const params: unknown[] = [];
  if (branchIds?.length) {
    sql += ` AND b.id IN (${branchIds.map(() => "?").join(",")})`;
    params.push(...branchIds);
  }
  sql += " ORDER BY value DESC LIMIT 8";
  const rows = await query<{ label: string; value: number }>(sql, params);
  return rows.map((r, i) => ({
    label: r.label.length > 14 ? r.label.slice(0, 14) + "…" : r.label,
    value: Number(r.value),
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
}

export async function branchFloatComparison(branchIds?: number[]): Promise<{
  cash: ChartPoint[];
  suspense: ChartPoint[];
}> {
  let sql = `SELECT b.branch_name,
                    b.current_cash_balance AS cash,
                    COALESCE((
                      SELECT SUM(COALESCE(paid_amount,0) - COALESCE(returned_amount,0) - COALESCE(actual_expense_amount,0))
                        FROM petty_cash_requests r
                       WHERE r.branch_id = b.id AND r.request_type = 'suspense'
                         AND r.status NOT IN ('Closed','Rejected') AND r.paid_amount IS NOT NULL
                    ), 0) AS suspense
               FROM branches b WHERE b.is_active = 1`;
  const params: unknown[] = [];
  if (branchIds?.length) {
    sql += ` AND b.id IN (${branchIds.map(() => "?").join(",")})`;
    params.push(...branchIds);
  }
  sql += " ORDER BY b.branch_name LIMIT 8";
  const rows = await query<{ branch_name: string; cash: number; suspense: number }>(sql, params);
  const trunc = (s: string) => (s.length > 12 ? s.slice(0, 12) + "…" : s);
  return {
    cash: rows.map((r, i) => ({
      label: trunc(r.branch_name),
      value: Math.max(0, Number(r.cash)),
      color: CHART_COLORS[i % CHART_COLORS.length],
    })),
    suspense: rows.map((r) => ({
      label: trunc(r.branch_name),
      value: Math.max(0, Number(r.suspense)),
    })),
  };
}

export async function topExpenseCategories(limit = 6, branchIds?: number[]): Promise<ChartPoint[]> {
  let sql = `SELECT c.category_name AS label, COALESCE(SUM(r.paid_amount),0) AS value
               FROM petty_cash_requests r
               JOIN expense_categories c ON c.id = r.category_id
              WHERE r.paid_amount IS NOT NULL`;
  const params: unknown[] = [];
  if (branchIds?.length) {
    sql += ` AND r.branch_id IN (${branchIds.map(() => "?").join(",")})`;
    params.push(...branchIds);
  }
  sql += ` GROUP BY c.id ORDER BY value DESC LIMIT ?`;
  params.push(limit);
  const rows = await query<{ label: string; value: number }>(sql, params);
  return rows.map((r, i) => ({
    label: r.label.length > 18 ? r.label.slice(0, 18) + "…" : r.label,
    value: Number(r.value),
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
}

export async function paymentTrend(days = 7, branchIds?: number[]): Promise<ChartPoint[]> {
  let sql = `SELECT DATE(paid_at) AS d, COALESCE(SUM(paid_amount),0) AS total
               FROM petty_cash_requests
              WHERE paid_at IS NOT NULL
                AND paid_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`;
  const params: unknown[] = [days - 1];
  if (branchIds?.length) {
    sql += ` AND branch_id IN (${branchIds.map(() => "?").join(",")})`;
    params.push(...branchIds);
  }
  sql += " GROUP BY DATE(paid_at)";
  const rows = await query<{ d: string; total: number }>(sql, params);
  const map = new Map(rows.map((r) => [String(r.d).slice(0, 10), Number(r.total)]));
  return lastNDays(days).map((d) => ({ label: dayLabel(d), value: map.get(d) || 0 }));
}

const PAID_SLICE_COLOR = "#10b981";

export async function accountsProcessingQueueChart(
  branchIds: number[],
  opts?: { includeAccSupPending?: boolean }
): Promise<ChartPoint[]> {
  if (branchIds.length === 0) return [];
  const ph = branchIds.map(() => "?").join(",");
  const statuses = [
    "Pending Payment",
    "Pending Accounts Review",
    "Pending Accounts Issue",
    ...(opts?.includeAccSupPending ? ["Pending Accounts Supervisor Approval"] : []),
    "Open Suspense",
    "Receipt Submitted",
    "Pending Settlement Review",
  ];
  const statusPh = statuses.map(() => "?").join(",");

  const [queueRows, paidRow] = await Promise.all([
    query<{ label: string; value: number }>(
      `SELECT status AS label, COUNT(*) AS value
         FROM petty_cash_requests
        WHERE branch_id IN (${ph})
          AND status IN (${statusPh})
        GROUP BY status
        ORDER BY value DESC`,
      [...branchIds, ...statuses]
    ),
    queryOne<{ value: number }>(
      `SELECT COUNT(*) AS value
         FROM petty_cash_requests
        WHERE branch_id IN (${ph})
          AND paid_at IS NOT NULL`,
      branchIds
    ),
  ]);

  const points: ChartPoint[] = queueRows.map((r, i) => ({
    label: shortStatus(r.label),
    value: Number(r.value),
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const paidCount = Number(paidRow?.value || 0);
  if (paidCount > 0) {
    points.push({ label: "Paid", value: paidCount, color: PAID_SLICE_COLOR });
  }

  return points;
}

export async function topUpStatusBreakdown(): Promise<ChartPoint[]> {
  const rows = await query<{ label: string; value: number }>(
    `SELECT status AS label, COUNT(*) AS value
       FROM top_up_requests
      GROUP BY status
      ORDER BY value DESC`
  );
  return rows.map((r, i) => ({
    label: r.label.replace("Pending Treasury Approval", "Pending Treasury").slice(0, 24),
    value: Number(r.value),
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
}

export async function topUpPendingByBranch(): Promise<ChartPoint[]> {
  const rows = await query<{ label: string; value: number }>(
    `SELECT b.branch_name AS label, COALESCE(SUM(t.amount),0) AS value
       FROM top_up_requests t
       JOIN branches b ON b.id = t.branch_id
      WHERE t.status IN ('Pending Treasury Approval','Treasury Approved')
      GROUP BY b.id
      ORDER BY value DESC
      LIMIT 6`
  );
  return rows.map((r, i) => ({
    label: r.label.length > 14 ? r.label.slice(0, 14) + "…" : r.label,
    value: Number(r.value),
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
}

export async function orgRequestPipeline(branchIds?: number[]): Promise<ChartPoint[]> {
  let sql = `SELECT
       CASE
         WHEN status IN ('Paid','Closed') THEN 'Completed'
         WHEN status LIKE 'Pending%' THEN 'Pending'
         WHEN status IN ('Open Suspense','Suspense Issued','Receipt Submitted','Pending Settlement Review') THEN 'Open Suspense'
         ELSE 'In Progress'
       END AS label,
       COUNT(*) AS value
     FROM petty_cash_requests
     WHERE 1=1`;
  const params: unknown[] = [];
  if (branchIds?.length) {
    sql += ` AND branch_id IN (${branchIds.map(() => "?").join(",")})`;
    params.push(...branchIds);
  }
  sql += " GROUP BY label ORDER BY value DESC";
  const rows = await query<{ label: string; value: number }>(sql, params);
  return rows.map((r, i) => ({
    label: r.label,
    value: Number(r.value),
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
}
