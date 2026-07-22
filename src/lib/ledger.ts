import { PoolConnection, query, queryOne } from "./db";

export type LedgerTxnType =
  | "exact_paid"
  | "suspense_issued"
  | "suspense_returned"
  | "additional_paid"
  | "topup_received"
  | "adjustment";

export const LEDGER_LABELS: Record<LedgerTxnType, string> = {
  exact_paid: "Exact reimbursement paid",
  suspense_issued: "Suspense advance issued",
  suspense_returned: "Suspense returned",
  additional_paid: "Additional suspense paid",
  topup_received: "Treasury top-up received",
  adjustment: "Adjustment / correction",
};

export interface BranchBalance {
  branchId: number;
  cashInHand: number;
  openSuspense: number;
  totalFloat: number;
}

/**
 * Post a ledger entry inside an existing transaction and update the branch
 * cash balance. Debit reduces cash in hand, credit increases it.
 * Returns the new running balance.
 */
export async function postLedger(
  conn: PoolConnection,
  opts: {
    branchId: number;
    transactionType: LedgerTxnType;
    debit?: number;
    credit?: number;
    requestId?: number | null;
    topUpId?: number | null;
    createdByUserId: number;
    remarks?: string;
    allowNegative?: boolean;
  }
): Promise<number> {
  const debit = Number(opts.debit || 0);
  const credit = Number(opts.credit || 0);

  // Lock the branch row for a consistent running balance.
  const [rows] = await conn.query<any[]>(
    "SELECT current_cash_balance FROM branches WHERE id = ? FOR UPDATE",
    [opts.branchId]
  );
  if (!rows.length) throw new Error("Branch not found for ledger entry");
  const current = Number(rows[0].current_cash_balance);
  const newBalance = current + credit - debit;

  if (newBalance < 0 && !opts.allowNegative) {
    throw new Error(
      "INSUFFICIENT_FUNDS: Branch cash balance would go negative. Accounts Supervisor override required."
    );
  }

  await conn.execute(
    `INSERT INTO cash_ledger
       (branch_id, request_id, top_up_id, transaction_type, debit_amount, credit_amount, running_balance, created_by_user_id, remarks)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      opts.branchId,
      opts.requestId ?? null,
      opts.topUpId ?? null,
      opts.transactionType,
      debit,
      credit,
      newBalance,
      opts.createdByUserId,
      opts.remarks ?? LEDGER_LABELS[opts.transactionType],
    ]
  );

  await conn.execute("UPDATE branches SET current_cash_balance = ? WHERE id = ?", [
    newBalance,
    opts.branchId,
  ]);

  return newBalance;
}

/**
 * Outstanding open suspense for branch(es) as of end of a calendar day.
 * Issued on/before that day and not yet closed by end of that day.
 */
export async function getOpenSuspenseAsOf(
  branchIds: number[],
  day: string
): Promise<number> {
  if (branchIds.length === 0) return 0;
  const ph = branchIds.map(() => "?").join(",");
  const row = await queryOne<{ outstanding: number }>(
    `SELECT COALESCE(SUM(
        COALESCE(paid_amount,0)
        - COALESCE(returned_amount,0)
        - COALESCE(actual_expense_amount,0)
     ),0) AS outstanding
       FROM petty_cash_requests
      WHERE branch_id IN (${ph})
        AND request_type = 'suspense'
        AND paid_amount IS NOT NULL
        AND DATE(paid_at) <= ?
        AND (
          closed_at IS NULL
          OR DATE(closed_at) > ?
        )
        AND status <> 'Rejected'`,
    [...branchIds, day, day]
  );
  return row ? Math.max(0, Number(row.outstanding)) : 0;
}

/**
 * Compute live balances for a branch:
 *   Cash in Hand     = branch.current_cash_balance
 *   Open Suspense    = sum of (issued - returned - actual settled) still outstanding
 *   Total Float      = Cash in Hand + Open Suspense
 */
export async function getBranchBalance(branchId: number): Promise<BranchBalance> {
  const branch = await queryOne<{ current_cash_balance: number }>(
    "SELECT current_cash_balance FROM branches WHERE id = ?",
    [branchId]
  );
  const cashInHand = branch ? Number(branch.current_cash_balance) : 0;

  // Outstanding suspense = advances issued and not yet fully settled (returned + actual).
  const susp = await queryOne<{ outstanding: number }>(
    `SELECT COALESCE(SUM(
        COALESCE(paid_amount,0)
        - COALESCE(returned_amount,0)
        - COALESCE(actual_expense_amount,0)
     ),0) AS outstanding
       FROM petty_cash_requests
      WHERE branch_id = ?
        AND request_type = 'suspense'
        AND status NOT IN ('Closed','Rejected')
        AND paid_amount IS NOT NULL`,
    [branchId]
  );
  const openSuspense = susp ? Math.max(0, Number(susp.outstanding)) : 0;

  return {
    branchId,
    cashInHand,
    openSuspense,
    totalFloat: cashInHand + openSuspense,
  };
}

/** Truck / trailer / driver aggregates from request_charges (Compassion). */
const LEDGER_COMPASSION_FIELDS = `
            (
              SELECT GROUP_CONCAT(DISTINCT NULLIF(TRIM(ch.truck_number), '') ORDER BY ch.sort_order, ch.id SEPARATOR ', ')
                FROM request_charges ch WHERE ch.request_id = r.id
            ) AS truck_numbers,
            (
              SELECT GROUP_CONCAT(DISTINCT NULLIF(TRIM(ch.trailer_number), '') ORDER BY ch.sort_order, ch.id SEPARATOR ', ')
                FROM request_charges ch WHERE ch.request_id = r.id
            ) AS trailer_numbers,
            (
              SELECT GROUP_CONCAT(DISTINCT d.name ORDER BY ch.sort_order, ch.id SEPARATOR ', ')
                FROM request_charges ch
                JOIN compassion_drivers d ON d.id = ch.driver_id
               WHERE ch.request_id = r.id
            ) AS driver_names`;

export interface DailyLedgerEntry {
  id: number;
  branch_id: number;
  branch_name: string;
  transaction_type: string;
  debit_amount: number;
  credit_amount: number;
  running_balance: number;
  remarks: string | null;
  request_id: number | null;
  request_no: string | null;
  closed_request_no: string | null;
  request_type: "exact" | "suspense" | null;
  job_number: string | null;
  truck_numbers: string | null;
  trailer_numbers: string | null;
  driver_names: string | null;
  requested_by: string | null;
  paid_to: string | null;
  zybo_voucher_code: string | null;
  pcp_number: string | null;
  jv_number: string | null;
  created_by_name: string;
  created_at: string;
}

export type LedgerRequestGroup = "PCR" | "OSR" | "OTHER";

/**
 * Group a daily cash_ledger row for display.
 * Suspense issue / return / additional are not listed as PCR rows —
 * closed suspense appears once via getClosedSuspenseEntriesForDay.
 */
export function ledgerEntryGroup(e: DailyLedgerEntry): LedgerRequestGroup | null {
  if (e.transaction_type === "exact_paid" || e.request_type === "exact") {
    return "PCR";
  }
  if (
    e.transaction_type === "suspense_issued" ||
    e.transaction_type === "suspense_returned" ||
    e.transaction_type === "additional_paid" ||
    e.request_type === "suspense"
  ) {
    return null;
  }
  return "OTHER";
}

export function ledgerDisplayRequestNo(e: DailyLedgerEntry): string | null {
  return e.request_no?.trim() || null;
}

export interface OpenSuspenseLedgerRow {
  id: number;
  branch_id: number;
  branch_name: string;
  request_no: string;
  job_number: string | null;
  truck_numbers: string | null;
  trailer_numbers: string | null;
  driver_names: string | null;
  requested_by: string | null;
  paid_to: string | null;
  zybo_voucher_code: string | null;
  pcp_number: string | null;
  jv_number: string | null;
  created_by_name: string;
  paid_at: string;
  paid_amount: number;
  outstanding: number;
}

export interface ClosedSuspenseLedgerRow {
  id: number;
  branch_id: number;
  branch_name: string;
  request_no: string | null;
  closed_request_no: string;
  job_number: string | null;
  truck_numbers: string | null;
  trailer_numbers: string | null;
  driver_names: string | null;
  requested_by: string | null;
  paid_to: string | null;
  zybo_voucher_code: string | null;
  pcp_number: string | null;
  jv_number: string | null;
  created_by_name: string;
  closed_at: string;
  /** Actual expense at close — shown as Paid Out in PCR. */
  actual_expense_amount: number;
}

/**
 * Currently active open suspense (not closed), regardless of issue date.
 * Used for the ledger OSR section — date filter does not hide these.
 */
export async function getActiveOpenSuspenseEntries(
  branchIds: number[]
): Promise<OpenSuspenseLedgerRow[]> {
  if (branchIds.length === 0) return [];
  const ph = branchIds.map(() => "?").join(",");
  return query<OpenSuspenseLedgerRow>(
    `SELECT r.id,
            r.branch_id,
            b.branch_name,
            r.request_no,
            COALESCE(
              NULLIF((
                SELECT GROUP_CONCAT(ch.job_number ORDER BY ch.sort_order, ch.id SEPARATOR ', ')
                  FROM request_charges ch
                 WHERE ch.request_id = r.id
                   AND ch.job_number IS NOT NULL AND TRIM(ch.job_number) <> ''
              ), ''),
              NULLIF((
                SELECT GROUP_CONCAT(jn.job_number ORDER BY jn.sort_order, jn.id SEPARATOR ', ')
                  FROM request_job_numbers jn WHERE jn.request_id = r.id
              ), ''),
              NULLIF(r.job_number, '')
            ) AS job_number,
            ${LEDGER_COMPASSION_FIELDS},
            su.name AS requested_by,
            COALESCE(ru.name, r.cash_receiver_label, su.name) AS paid_to,
            r.zybo_voucher_code,
            r.pcp_number,
            r.jv_number,
            COALESCE(au.name, pu.name, su.name) AS created_by_name,
            r.paid_at,
            COALESCE(r.paid_amount, 0) AS paid_amount,
            GREATEST(
              0,
              COALESCE(r.paid_amount, 0)
              - COALESCE(r.returned_amount, 0)
              - COALESCE(r.actual_expense_amount, 0)
            ) AS outstanding
       FROM petty_cash_requests r
       JOIN branches b ON b.id = r.branch_id
       LEFT JOIN users su ON su.id = r.submitted_by_user_id
       LEFT JOIN users ru ON ru.id = r.cash_receiver_user_id
       LEFT JOIN users au ON au.id = r.accounts_user_id
       LEFT JOIN users pu ON pu.id = r.processing_by_user_id
      WHERE r.branch_id IN (${ph})
        AND r.request_type = 'suspense'
        AND r.paid_amount IS NOT NULL
        AND r.paid_at IS NOT NULL
        AND r.status NOT IN ('Closed', 'Rejected')
      ORDER BY r.paid_at ASC, r.id ASC`,
    [...branchIds]
  );
}

/**
 * Open suspense still outstanding as of end of a calendar day
 * (for Zybo / historical balance math).
 */
export async function getOpenSuspenseEntriesAsOf(
  branchIds: number[],
  day: string
): Promise<OpenSuspenseLedgerRow[]> {
  if (branchIds.length === 0) return [];
  const ph = branchIds.map(() => "?").join(",");
  return query<OpenSuspenseLedgerRow>(
    `SELECT r.id,
            r.branch_id,
            b.branch_name,
            r.request_no,
            COALESCE(
              NULLIF((
                SELECT GROUP_CONCAT(ch.job_number ORDER BY ch.sort_order, ch.id SEPARATOR ', ')
                  FROM request_charges ch
                 WHERE ch.request_id = r.id
                   AND ch.job_number IS NOT NULL AND TRIM(ch.job_number) <> ''
              ), ''),
              NULLIF((
                SELECT GROUP_CONCAT(jn.job_number ORDER BY jn.sort_order, jn.id SEPARATOR ', ')
                  FROM request_job_numbers jn WHERE jn.request_id = r.id
              ), ''),
              NULLIF(r.job_number, '')
            ) AS job_number,
            ${LEDGER_COMPASSION_FIELDS},
            su.name AS requested_by,
            COALESCE(ru.name, r.cash_receiver_label, su.name) AS paid_to,
            r.zybo_voucher_code,
            r.pcp_number,
            r.jv_number,
            COALESCE(au.name, pu.name, su.name) AS created_by_name,
            r.paid_at,
            COALESCE(r.paid_amount, 0) AS paid_amount,
            GREATEST(
              0,
              COALESCE(r.paid_amount, 0)
              - COALESCE(r.returned_amount, 0)
              - COALESCE(r.actual_expense_amount, 0)
            ) AS outstanding
       FROM petty_cash_requests r
       JOIN branches b ON b.id = r.branch_id
       LEFT JOIN users su ON su.id = r.submitted_by_user_id
       LEFT JOIN users ru ON ru.id = r.cash_receiver_user_id
       LEFT JOIN users au ON au.id = r.accounts_user_id
       LEFT JOIN users pu ON pu.id = r.processing_by_user_id
      WHERE r.branch_id IN (${ph})
        AND r.request_type = 'suspense'
        AND r.paid_amount IS NOT NULL
        AND r.paid_at IS NOT NULL
        AND DATE(r.paid_at) <= ?
        AND (
          r.closed_at IS NULL
          OR DATE(r.closed_at) > ?
        )
        AND r.status <> 'Rejected'
      ORDER BY r.paid_at ASC, r.id ASC`,
    [...branchIds, day, day]
  );
}

/** Suspense closed on this calendar day — one PCR row each (CSR id + actual expense). */
export async function getClosedSuspenseEntriesForDay(
  branchIds: number[],
  day: string
): Promise<ClosedSuspenseLedgerRow[]> {
  if (branchIds.length === 0) return [];
  const ph = branchIds.map(() => "?").join(",");
  return query<ClosedSuspenseLedgerRow>(
    `SELECT r.id,
            r.branch_id,
            b.branch_name,
            r.request_no,
            r.closed_request_no,
            COALESCE(
              NULLIF((
                SELECT GROUP_CONCAT(ch.job_number ORDER BY ch.sort_order, ch.id SEPARATOR ', ')
                  FROM request_charges ch
                 WHERE ch.request_id = r.id
                   AND ch.job_number IS NOT NULL AND TRIM(ch.job_number) <> ''
              ), ''),
              NULLIF((
                SELECT GROUP_CONCAT(jn.job_number ORDER BY jn.sort_order, jn.id SEPARATOR ', ')
                  FROM request_job_numbers jn WHERE jn.request_id = r.id
              ), ''),
              NULLIF(r.job_number, '')
            ) AS job_number,
            ${LEDGER_COMPASSION_FIELDS},
            su.name AS requested_by,
            COALESCE(ru.name, r.cash_receiver_label, su.name) AS paid_to,
            r.zybo_voucher_code,
            r.pcp_number,
            r.jv_number,
            COALESCE(au.name, pu.name, su.name) AS created_by_name,
            r.closed_at,
            COALESCE(r.actual_expense_amount, 0) AS actual_expense_amount
       FROM petty_cash_requests r
       JOIN branches b ON b.id = r.branch_id
       LEFT JOIN users su ON su.id = r.submitted_by_user_id
       LEFT JOIN users ru ON ru.id = r.cash_receiver_user_id
       LEFT JOIN users au ON au.id = r.accounts_user_id
       LEFT JOIN users pu ON pu.id = r.processing_by_user_id
      WHERE r.branch_id IN (${ph})
        AND r.request_type = 'suspense'
        AND r.closed_at IS NOT NULL
        AND DATE(r.closed_at) = ?
        AND r.closed_request_no IS NOT NULL
        AND TRIM(r.closed_request_no) <> ''
      ORDER BY r.closed_at ASC, r.id ASC`,
    [...branchIds, day]
  );
}

export interface DailyLedgerSummary {
  openingBalance: number;
  totalPaidOut: number;
  totalReceived: number;
  closingBalance: number;
  /** Closing cash with open-suspense advances added back (Zybo-style books). */
  balanceAsPerZybo: number;
  paymentCount: number;
  entries: DailyLedgerEntry[];
  /** Still-open suspense as of this day (any prior issue date). */
  openSuspenseEntries: OpenSuspenseLedgerRow[];
  /** Suspense closed on this day — one CSR row each for PCR. */
  closedSuspenseEntries: ClosedSuspenseLedgerRow[];
  date: string;
}

/** YYYY-MM-DD validation for ledger day filter. */
export function normalizeLedgerDate(value: string | undefined | null): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T12:00:00`);
  if (isNaN(d.getTime())) return null;
  return value;
}

/** Cash balance at the start of a given calendar day (YYYY-MM-DD) for one branch. */
export async function getBranchOpeningBalance(branchId: number, day: string): Promise<number> {
  const prior = await queryOne<{ running_balance: number }>(
    `SELECT running_balance FROM cash_ledger
      WHERE branch_id = ? AND created_at < ?
      ORDER BY id DESC LIMIT 1`,
    [branchId, day]
  );
  if (prior) return Number(prior.running_balance);

  const firstOfDay = await queryOne<{
    running_balance: number;
    debit_amount: number;
    credit_amount: number;
  }>(
    `SELECT running_balance, debit_amount, credit_amount FROM cash_ledger
      WHERE branch_id = ? AND DATE(created_at) = ?
      ORDER BY id ASC LIMIT 1`,
    [branchId, day]
  );
  if (firstOfDay) {
    return (
      Number(firstOfDay.running_balance) -
      Number(firstOfDay.credit_amount) +
      Number(firstOfDay.debit_amount)
    );
  }

  // No ledger activity on or before this day — use live balance (typically opening float).
  const branch = await queryOne<{ current_cash_balance: number }>(
    "SELECT current_cash_balance FROM branches WHERE id = ?",
    [branchId]
  );
  return branch ? Number(branch.current_cash_balance) : 0;
}

/** Cash balance at end of a given calendar day for one branch. */
export async function getBranchClosingBalance(branchId: number, day: string): Promise<number> {
  const lastOfDay = await queryOne<{ running_balance: number }>(
    `SELECT running_balance FROM cash_ledger
      WHERE branch_id = ? AND DATE(created_at) = ?
      ORDER BY id DESC LIMIT 1`,
    [branchId, day]
  );
  if (lastOfDay) return Number(lastOfDay.running_balance);

  // No movements that day — closing equals opening.
  return getBranchOpeningBalance(branchId, day);
}

/** Daily cash ledger summary for one or more branches on a specific day (YYYY-MM-DD). */
export async function getDailyLedgerSummary(
  branchIds: number[],
  day: string
): Promise<DailyLedgerSummary> {
  if (branchIds.length === 0) {
    return {
      openingBalance: 0,
      totalPaidOut: 0,
      totalReceived: 0,
      closingBalance: 0,
      balanceAsPerZybo: 0,
      paymentCount: 0,
      entries: [],
      openSuspenseEntries: [],
      closedSuspenseEntries: [],
      date: day,
    };
  }

  let openingBalance = 0;
  let closingBalance = 0;
  for (const id of branchIds) {
    openingBalance += await getBranchOpeningBalance(id, day);
    closingBalance += await getBranchClosingBalance(id, day);
  }

  const ph = branchIds.map(() => "?").join(",");
  const entries = await query<DailyLedgerEntry>(
    `SELECT l.id, l.branch_id, b.branch_name, l.transaction_type,
            l.debit_amount, l.credit_amount, l.running_balance, l.remarks,
            l.request_id, r.request_no, r.closed_request_no, r.request_type,
            COALESCE(
              NULLIF((
                SELECT GROUP_CONCAT(ch.job_number ORDER BY ch.sort_order, ch.id SEPARATOR ', ')
                  FROM request_charges ch
                 WHERE ch.request_id = r.id
                   AND ch.job_number IS NOT NULL AND TRIM(ch.job_number) <> ''
              ), ''),
              NULLIF((
                SELECT GROUP_CONCAT(jn.job_number ORDER BY jn.sort_order, jn.id SEPARATOR ', ')
                  FROM request_job_numbers jn WHERE jn.request_id = r.id
              ), ''),
              NULLIF(r.job_number, '')
            ) AS job_number,
            ${LEDGER_COMPASSION_FIELDS},
            su.name AS requested_by,
            COALESCE(ru.name, r.cash_receiver_label, su.name) AS paid_to,
            r.zybo_voucher_code,
            r.pcp_number,
            r.jv_number,
            u.name AS created_by_name, l.created_at
       FROM cash_ledger l
       JOIN branches b ON b.id = l.branch_id
       JOIN users u ON u.id = l.created_by_user_id
       LEFT JOIN petty_cash_requests r ON r.id = l.request_id
       LEFT JOIN users su ON su.id = r.submitted_by_user_id
       LEFT JOIN users ru ON ru.id = r.cash_receiver_user_id
      WHERE l.branch_id IN (${ph}) AND DATE(l.created_at) = ?
      ORDER BY l.created_at ASC, l.id ASC`,
    [...branchIds, day]
  );

  let totalPaidOut = 0;
  let totalReceived = 0;
  let paymentCount = 0;
  for (const e of entries) {
    const debit = Number(e.debit_amount);
    const credit = Number(e.credit_amount);
    // Cash leaving the box that day (exact, open suspense issue, additional, etc.)
    totalPaidOut += debit;
    totalReceived += credit;
    if (debit > 0) paymentCount += 1;
    // Closing suspense with a balance return puts cash back — net it out of paid.
    if (e.transaction_type === "suspense_returned" && credit > 0) {
      totalPaidOut -= credit;
    }
  }

  // Zybo books ignore advances that are still open. Once settled/closed they
  // are no longer open suspense, so Zybo matches cash. While open, add the
  // outstanding amount back onto closing cash.
  const openSuspenseOutstanding = await getOpenSuspenseAsOf(branchIds, day);
  const balanceAsPerZybo = closingBalance + openSuspenseOutstanding;
  // OSR UI: always show currently active open suspense (date filter independent).
  const openSuspenseEntries = await getActiveOpenSuspenseEntries(branchIds);
  const closedSuspenseEntries = await getClosedSuspenseEntriesForDay(branchIds, day);

  return {
    openingBalance,
    totalPaidOut,
    totalReceived,
    closingBalance,
    balanceAsPerZybo,
    paymentCount,
    entries,
    openSuspenseEntries,
    closedSuspenseEntries,
    date: day,
  };
}

export async function getAllBranchBalances(): Promise<(BranchBalance & { branch_name: string })[]> {
  const branches = await query<{ id: number; branch_name: string }>(
    "SELECT id, branch_name FROM branches WHERE is_active = 1 ORDER BY branch_name"
  );
  const result = [] as (BranchBalance & { branch_name: string })[];
  for (const b of branches) {
    const bal = await getBranchBalance(b.id);
    result.push({ ...bal, branch_name: b.branch_name });
  }
  return result;
}
