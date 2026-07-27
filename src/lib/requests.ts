import { query, queryOne } from "./db";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { EXACT_STATUS, SUSPENSE_STATUS, isStaffReimbursementRole } from "./status";
import { SessionUser, Role, PettyCashRequest } from "./types";

export interface EnrichedRequest {
  id: number;
  request_no: string;
  closed_request_no: string | null;
  request_type: "exact" | "suspense";
  charge_type: "job" | "non_job" | "truck_trailer" | "general";
  category_id: number;
  category_name: string;
  submitted_by_user_id: number;
  submitter_role: Role | null;
  submitted_by_name: string;
  cash_receiver_user_id: number | null;
  cash_receiver_label: string | null;
  receiver_name: string | null;
  branch_id: number;
  branch_name: string;
  branch_code: string;
  job_number: string | null;
  description: string | null;
  truck_numbers: string | null;
  trailer_numbers: string | null;
  driver_names: string | null;
  requested_amount: number;
  approved_amount: number | null;
  paid_amount: number | null;
  actual_expense_amount: number | null;
  returned_amount: number | null;
  additional_paid_amount: number | null;
  currency: string;
  status: string;
  supervisor_id: number | null;
  accounts_user_id: number | null;
  processing_by_user_id: number | null;
  processing_by_name: string | null;
  branch_override: number;
  reject_reason: string | null;
  created_at: string;
  approved_at: string | null;
  paid_at: string | null;
  closed_at: string | null;
  zybo_voucher_suffix: string | null;
  zybo_voucher_code: string | null;
  zybo_voucher_at: string | null;
  pcp_number: string | null;
  jv_number: string | null;
  pcp_jv_at: string | null;
}

const FROM = `
    FROM petty_cash_requests r
    JOIN expense_categories c ON c.id = r.category_id
    JOIN branches b ON b.id = r.branch_id
    JOIN users su ON su.id = r.submitted_by_user_id
    LEFT JOIN users ru ON ru.id = r.cash_receiver_user_id
    LEFT JOIN users pu ON pu.id = r.processing_by_user_id
`;

const SELECT = `
  SELECT r.*,
         c.category_name,
         b.branch_name,
         b.branch_code,
         su.name AS submitted_by_name,
         ru.name AS receiver_name,
         pu.name AS processing_by_name,
         (
           SELECT GROUP_CONCAT(DISTINCT ch.truck_number ORDER BY ch.sort_order, ch.id SEPARATOR ', ')
             FROM request_charges ch
            WHERE ch.request_id = r.id AND ch.truck_number IS NOT NULL AND TRIM(ch.truck_number) <> ''
         ) AS truck_numbers,
         (
           SELECT GROUP_CONCAT(DISTINCT ch.trailer_number ORDER BY ch.sort_order, ch.id SEPARATOR ', ')
             FROM request_charges ch
            WHERE ch.request_id = r.id AND ch.trailer_number IS NOT NULL AND TRIM(ch.trailer_number) <> ''
         ) AS trailer_numbers,
         (
           SELECT GROUP_CONCAT(DISTINCT d.name ORDER BY ch.sort_order, ch.id SEPARATOR ', ')
             FROM request_charges ch
             JOIN compassion_drivers d ON d.id = ch.driver_id
            WHERE ch.request_id = r.id
         ) AS driver_names
  ${FROM}
`;

export async function getRequestById(id: number): Promise<EnrichedRequest | null> {
  return queryOne<EnrichedRequest>(`${SELECT} WHERE r.id = ?`, [id]);
}

export async function getRequestsWhere(
  where: string,
  params: unknown[] = [],
  order = "r.created_at DESC",
  paging?: { limit: number; offset: number }
): Promise<EnrichedRequest[]> {
  if (!paging) {
    return query<EnrichedRequest>(`${SELECT} WHERE ${where} ORDER BY ${order}`, params);
  }
  return query<EnrichedRequest>(
    `${SELECT} WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...params, paging.limit, paging.offset]
  );
}

export async function countRequestsWhere(
  where: string,
  params: unknown[] = []
): Promise<number> {
  const row = await queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c ${FROM} WHERE ${where}`,
    params
  );
  return row ? Number(row.c) : 0;
}

/** Branch ids an accounts user can handle/view. */
export async function accountsBranchIds(userId: number): Promise<number[]> {
  const rows = await query<{ branch_id: number }>(
    `SELECT branch_id FROM user_branch_access WHERE user_id = ?
     UNION
     SELECT branch_id FROM user_branch_roles
      WHERE user_id = ? AND role IN ('accounts', 'accounts_supervisor')`,
    [userId, userId]
  );
  return [...new Set(rows.map((r) => r.branch_id))];
}

/** Branches assigned to a treasury user via Control Panel (empty = all branches). */
export async function treasuryBranchIds(userId: number): Promise<number[]> {
  const rows = await query<{ branch_id: number }>(
    `SELECT branch_id FROM user_branch_roles WHERE user_id = ? AND role = 'treasury'`,
    [userId]
  );
  return rows.map((r) => r.branch_id);
}

/** Whether treasury may act on a branch (no assignments → all branches). */
export async function treasuryCanHandle(
  session: SessionUser,
  branchId: number
): Promise<boolean> {
  const primary = session.primary_role || session.role;
  if (session.role === "admin" || primary === "admin") return true;
  if (session.role !== "treasury" && primary !== "treasury") return false;
  const ids = await treasuryBranchIds(session.id);
  return ids.length === 0 || ids.includes(branchId);
}

/** Whether a session user may view a particular request. */
export async function canViewRequest(session: SessionUser, r: EnrichedRequest): Promise<boolean> {
  switch (session.role) {
    case "admin":
      return true;
    case "accounts_supervisor": {
      const ids = await accountsBranchIds(session.id);
      return ids.length === 0 || ids.includes(r.branch_id);
    }
    case "supervisor":
      return r.supervisor_id === session.id || true; // supervisors can view all for context
    case "accounts": {
      const ids = await accountsBranchIds(session.id);
      return ids.includes(r.branch_id);
    }
    case "treasury": {
      const ids = await treasuryBranchIds(session.id);
      return ids.length === 0 || ids.includes(r.branch_id);
    }
    case "cash_requester":
    case "messenger":
    case "operations":
    default:
      return r.submitted_by_user_id === session.id || r.cash_receiver_user_id === session.id;
  }
}

/** Whether a session user may act as accounts on a request's branch. */
export async function accountsCanHandle(session: SessionUser, branchId: number): Promise<boolean> {
  const primary = session.primary_role || session.role;
  if (session.role === "admin" || primary === "admin") {
    return true;
  }
  if (session.role === "accounts_supervisor" || primary === "accounts_supervisor") {
    const ids = await accountsBranchIds(session.id);
    // No assignments yet → keep legacy all-branch access.
    return ids.length === 0 || ids.includes(branchId);
  }
  // Effective or primary accounts, or an accounts membership on this branch.
  if (session.role === "accounts" || primary === "accounts") {
    const ids = await accountsBranchIds(session.id);
    return ids.includes(branchId);
  }
  const membership = await queryOne<{ role: string }>(
    `SELECT role FROM user_branch_roles
      WHERE user_id = ? AND branch_id = ?
        AND role IN ('accounts', 'accounts_supervisor')`,
    [session.id, branchId]
  );
  return Boolean(membership);
}

/**
 * Pay eligibility for exact requests, including staff reimbursement routing.
 * Returns null if OK, otherwise an error message.
 */
export async function assertCanPayExact(
  session: SessionUser,
  request: Pick<
    PettyCashRequest,
    "request_type" | "status" | "submitted_by_user_id" | "submitter_role" | "branch_id" | "approved_amount"
  >
): Promise<string | null> {
  if (request.request_type !== "exact") return "Not an exact payment request.";
  if (request.submitted_by_user_id === session.id) {
    return "You cannot pay your own reimbursement request.";
  }

  const role = request.submitter_role;

  if (isStaffReimbursementRole(role)) {
    if (role === "accounts") {
      if (session.role !== "accounts_supervisor" && session.role !== "admin") {
        return "Only Accounts Supervisor can approve and pay this reimbursement.";
      }
      if (request.status !== EXACT_STATUS.PENDING_ACC_SUP) {
        return `Request is not ready for payment (status: ${request.status}).`;
      }
    } else if (role === "accounts_supervisor") {
      if (session.role !== "accounts") {
        return "Only Accounts can pay Accounts Supervisor reimbursements.";
      }
      if (request.status !== EXACT_STATUS.PENDING_PAYMENT) {
        return `Request is not ready for payment (status: ${request.status}).`;
      }
      if (request.approved_amount == null) {
        return "Request has not been approved.";
      }
    } else {
      // supervisor-created
      if (
        session.role !== "accounts" &&
        session.role !== "accounts_supervisor" &&
        session.role !== "admin"
      ) {
        return "Only Accounts can pay this reimbursement.";
      }
      if (request.status !== EXACT_STATUS.PENDING_PAYMENT) {
        return `Request is not ready for payment (status: ${request.status}).`;
      }
      if (request.approved_amount == null) {
        return "Request has not been approved.";
      }
    }
  } else {
    if (
      request.status !== EXACT_STATUS.PENDING_PAYMENT &&
      request.status !== EXACT_STATUS.PENDING_ACCOUNTS_REVIEW
    ) {
      return `Request is not ready for payment (status: ${request.status}).`;
    }
    if (request.approved_amount == null) {
      return "Request has not been approved by a supervisor.";
    }
  }

  if (!(await accountsCanHandle(session, request.branch_id))) {
    return "Not your branch";
  }
  return null;
}

/** Initial status / approved amount when a staff role creates an exact reimbursement. */
export function staffReimbursementCreateState(
  role: Role,
  requestedAmount: number
): { status: string; approvedAmount: number | null } | null {
  if (role === "accounts") {
    return { status: EXACT_STATUS.PENDING_ACC_SUP, approvedAmount: null };
  }
  if (role === "supervisor" || role === "accounts_supervisor") {
    return { status: EXACT_STATUS.PENDING_PAYMENT, approvedAmount: requestedAmount };
  }
  return null;
}

/** Status after staff resubmit following correction. */
export function staffResubmitStatus(submitterRole: string | null | undefined): string | null {
  if (submitterRole === "accounts") return EXACT_STATUS.PENDING_ACC_SUP;
  if (submitterRole === "supervisor" || submitterRole === "accounts_supervisor") {
    return EXACT_STATUS.PENDING_PAYMENT;
  }
  return null;
}

export async function getReceipts(requestId: number) {
  return query<{
    id: number;
    charge_id: number | null;
    file_url: string;
    file_name: string;
    mime_type: string | null;
    receipt_type: string;
    uploaded_at: string;
  }>(
    `SELECT id, charge_id, file_url, file_name, mime_type, receipt_type, uploaded_at
       FROM receipts WHERE request_id = ? ORDER BY uploaded_at`,
    [requestId]
  );
}

export interface RequestCharge {
  id: number;
  request_id: number;
  sort_order: number;
  description: string;
  amount: number;
  actual_amount: number | null;
  job_number: string | null;
  truck_number: string | null;
  trailer_number: string | null;
  driver_id: number | null;
  driver_name: string | null;
  category_id: number | null;
  category_name: string | null;
}

export async function getRequestCharges(requestId: number): Promise<RequestCharge[]> {
  return query<RequestCharge>(
    `SELECT ch.id, ch.request_id, ch.sort_order, ch.description, ch.amount, ch.actual_amount,
            ch.job_number, ch.truck_number, ch.trailer_number, ch.driver_id,
            d.name AS driver_name, ch.category_id, c.category_name
       FROM request_charges ch
       LEFT JOIN expense_categories c ON c.id = ch.category_id
       LEFT JOIN compassion_drivers d ON d.id = ch.driver_id
      WHERE ch.request_id = ?
      ORDER BY ch.sort_order, ch.id`,
    [requestId]
  );
}

export async function insertRequestCharges(
  conn: PoolConnection,
  requestId: number,
  charges: {
    description: string;
    amount: number;
    job_number: string | null;
    category_id: number | null;
    truck_number?: string | null;
    trailer_number?: string | null;
    driver_id?: number | null;
  }[]
): Promise<number[]> {
  const ids: number[] = [];
  for (let i = 0; i < charges.length; i++) {
    const ch = charges[i];
    const [res] = await conn.execute<any>(
      `INSERT INTO request_charges
         (request_id, sort_order, description, amount, job_number, truck_number, trailer_number, driver_id, category_id)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        requestId,
        i,
        ch.description,
        ch.amount,
        ch.job_number,
        ch.truck_number ?? null,
        ch.trailer_number ?? null,
        ch.driver_id ?? null,
        ch.category_id,
      ]
    );
    ids.push(res.insertId as number);
  }
  return ids;
}

export async function getJobNumbers(requestId: number): Promise<string[]> {
  const fromCharges = await query<{ job_number: string }>(
    `SELECT job_number FROM request_charges
      WHERE request_id = ? AND job_number IS NOT NULL AND TRIM(job_number) <> ''
      ORDER BY sort_order, id`,
    [requestId]
  );
  if (fromCharges.length > 0) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of fromCharges) {
      if (seen.has(r.job_number)) continue;
      seen.add(r.job_number);
      out.push(r.job_number);
    }
    return out;
  }

  const rows = await query<{ job_number: string }>(
    "SELECT job_number FROM request_job_numbers WHERE request_id = ? ORDER BY sort_order, id",
    [requestId]
  );
  if (rows.length > 0) return rows.map((r) => r.job_number);

  const legacy = await queryOne<{ job_number: string | null }>(
    "SELECT job_number FROM petty_cash_requests WHERE id = ?",
    [requestId]
  );
  return legacy?.job_number?.trim() ? [legacy.job_number.trim()] : [];
}

/** Duplicate: same messenger, category, and job number (any status). */
export async function findDuplicateMessengerJobRequest(
  conn: PoolConnection,
  userId: number,
  categoryId: number,
  jobNumbers: string[]
): Promise<{ id: number; request_no: string } | null> {
  if (jobNumbers.length === 0) return null;

  const jobPh = jobNumbers.map(() => "?").join(",");

  const [rows] = await conn.query<
    (RowDataPacket & { id: number; request_no: string })[]
  >(
    `SELECT r.id, r.request_no
       FROM petty_cash_requests r
      WHERE r.submitted_by_user_id = ?
        AND r.charge_type = 'job'
        AND (
          (
            r.category_id = ?
            AND (
              EXISTS (
                SELECT 1 FROM request_job_numbers jn
                 WHERE jn.request_id = r.id AND jn.job_number IN (${jobPh})
              )
              OR r.job_number IN (${jobPh})
            )
          )
          OR EXISTS (
            SELECT 1 FROM request_charges ch
             WHERE ch.request_id = r.id
               AND ch.category_id = ?
               AND ch.job_number IN (${jobPh})
          )
        )
      LIMIT 1`,
    [userId, categoryId, ...jobNumbers, ...jobNumbers, categoryId, ...jobNumbers]
  );

  return rows[0] ?? null;
}

export async function insertRequestJobNumbers(
  conn: PoolConnection,
  requestId: number,
  jobNumbers: string[]
) {
  for (let i = 0; i < jobNumbers.length; i++) {
    await conn.execute(
      "INSERT INTO request_job_numbers (request_id, job_number, sort_order) VALUES (?,?,?)",
      [requestId, jobNumbers[i], i]
    );
  }
}

export async function replaceRequestJobNumbers(
  conn: PoolConnection,
  requestId: number,
  jobNumbers: string[]
) {
  await conn.execute("DELETE FROM request_job_numbers WHERE request_id = ?", [requestId]);
  if (jobNumbers.length > 0) {
    await insertRequestJobNumbers(conn, requestId, jobNumbers);
  }
}

/** Paid requests still missing a Zybo voucher code. */
export function pendingZyboVoucherWhere(alias = "r"): string {
  return `${alias}.paid_at IS NOT NULL AND ${alias}.paid_amount IS NOT NULL AND (${alias}.zybo_voucher_code IS NULL OR TRIM(${alias}.zybo_voucher_code) = '')`;
}

/** Paid Compassion requests still missing PCP number or JV. */
export function pendingPcpJvWhere(alias = "r"): string {
  return `${alias}.paid_at IS NOT NULL AND ${alias}.paid_amount IS NOT NULL AND (
    ${alias}.pcp_number IS NULL OR TRIM(${alias}.pcp_number) = ''
    OR ${alias}.jv_number IS NULL OR TRIM(${alias}.jv_number) = ''
  )`;
}

export async function countPendingZyboVouchers(branchIds: number[]): Promise<number> {
  if (branchIds.length === 0) return 0;
  const ph = branchIds.map(() => "?").join(",");
  const row = await queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM petty_cash_requests r
      WHERE r.branch_id IN (${ph}) AND ${pendingZyboVoucherWhere("r")}`,
    branchIds
  );
  return row ? Number(row.c) : 0;
}

export async function countPendingPcpJv(branchIds: number[]): Promise<number> {
  if (branchIds.length === 0) return 0;
  const ph = branchIds.map(() => "?").join(",");
  const row = await queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM petty_cash_requests r
      WHERE r.branch_id IN (${ph}) AND ${pendingPcpJvWhere("r")}`,
    branchIds
  );
  return row ? Number(row.c) : 0;
}

export function isPaymentReceiptDownloadReady(
  request: Pick<EnrichedRequest, "paid_at" | "paid_amount" | "status">
): boolean {
  if (!request.paid_at || request.paid_amount == null) return false;
  return (
    request.status !== EXACT_STATUS.AWAITING_RECEIVER &&
    request.status !== SUSPENSE_STATUS.AWAITING_CASH_RECEIPT
  );
}

export async function getCashReceiptConfirmation(requestId: number) {
  return queryOne<{ approver_name: string; created_at: string; comments: string | null }>(
    `SELECT u.name AS approver_name, a.created_at, a.comments
       FROM approvals a
       JOIN users u ON u.id = a.approver_user_id
      WHERE a.request_id = ? AND a.action = 'confirm_receipt'
      ORDER BY a.created_at DESC
      LIMIT 1`,
    [requestId]
  );
}

/** Extract optional receiver note from confirm_receipt approval comments. */
export function parseConfirmReceiptNote(comments: string | null | undefined): string | null {
  if (!comments) return null;
  const m = comments.match(/\. Note:\s*(.+)$/s);
  const note = m?.[1]?.trim();
  return note || null;
}

export async function getApprovals(requestId: number) {
  return query<{
    id: number;
    approver_name: string;
    approval_level: string;
    action: string;
    comments: string | null;
    old_amount: number | null;
    new_amount: number | null;
    created_at: string;
  }>(
    `SELECT a.id, u.name AS approver_name, a.approval_level, a.action, a.comments, a.old_amount, a.new_amount, a.created_at
       FROM approvals a JOIN users u ON u.id = a.approver_user_id
      WHERE a.request_id = ? ORDER BY a.created_at`,
    [requestId]
  );
}

export type RequestActivityItem = {
  id: string | number;
  actor: string;
  level: string;
  action: string;
  comments: string | null;
  old_amount: number | null;
  new_amount: number | null;
  created_at: string;
};

/** Chronological timeline — always starts with messenger submission. */
export function buildRequestActivity(
  req: { submitted_by_name: string; created_at: string },
  approvals: Awaited<ReturnType<typeof getApprovals>>
): RequestActivityItem[] {
  const items: RequestActivityItem[] = [
    {
      id: "submitted",
      actor: req.submitted_by_name,
      level: "messenger",
      action: "submitted",
      comments: null,
      old_amount: null,
      new_amount: null,
      created_at: req.created_at,
    },
    ...approvals.map((a) => ({
      id: a.id,
      actor: a.approver_name,
      level: a.approval_level,
      action: a.action,
      comments: a.comments,
      old_amount: a.old_amount,
      new_amount: a.new_amount,
      created_at: a.created_at,
    })),
  ];

  return items.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}
