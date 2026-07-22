import { query } from "./db";
import { getBranchProfile, isCompassionMode } from "./branchProfile";
import { OPEN_SUSPENSE_STATUSES, SUSPENSE_STATUS } from "./status";
import type { ReportDatePeriod } from "./reportDateRange";
import { reportDateClause, reportMessengerClause, type ReportFiltersInput } from "./reportPeriodSql";
export { REPORT_TYPES } from "./reportTypes";

export interface ReportColumn {
  key: string;
  label: string;
  money?: boolean;
  small?: boolean;
}

export interface ReportSection {
  title: string;
  key?: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  receiptLink?: boolean;
}

export interface ReportResult {
  title: string;
  columns?: ReportColumn[];
  rows?: Record<string, unknown>[];
  sections?: ReportSection[];
  receiptLink?: boolean;
}

interface Filters extends ReportFiltersInput {
  period?: ReportDatePeriod;
  /** Expand multi-charge requests into one row per charge (with per-charge amount). */
  detailed?: boolean;
}

const REQUEST_LIST_COLUMNS: ReportColumn[] = [
  { key: "request_no", label: "Request No" },
  { key: "description", label: "Description", small: true },
  { key: "job_number", label: "Job Number", small: true },
  { key: "branch_name", label: "Branch", small: true },
  { key: "submitted_by", label: "Submitted By", small: true },
  { key: "paid_to", label: "Paid To", small: true },
  { key: "amount", label: "Amount", money: true },
  { key: "status", label: "Status" },
  { key: "created_at", label: "Created Date" },
  { key: "date", label: "Paid Date" },
  { key: "zybo_voucher_code", label: "Zybo Voucher" },
];

const REQUEST_COMPASSION_COLUMNS: ReportColumn[] = [
  { key: "truck_numbers", label: "Truck", small: true },
  { key: "trailer_numbers", label: "Trailer", small: true },
  { key: "driver_names", label: "Driver", small: true },
];

function withCompassionColumns(columns: ReportColumn[], compassion: boolean): ReportColumn[] {
  if (!compassion) return columns;
  const out: ReportColumn[] = [];
  for (const c of columns) {
    if (c.key === "job_number") {
      out.push(...REQUEST_COMPASSION_COLUMNS);
      continue;
    }
    if (c.key === "zybo_voucher_code") {
      out.push(
        { key: "pcp_number", label: "PCP", small: true },
        { key: "jv_number", label: "JV", small: true }
      );
      continue;
    }
    out.push(c);
  }
  return out;
}

const REQUEST_JOB_NUMBER = `
  COALESCE(
    NULLIF((
      SELECT GROUP_CONCAT(ch.job_number ORDER BY ch.sort_order, ch.id SEPARATOR ', ')
      FROM request_charges ch
      WHERE ch.request_id = r.id AND ch.job_number IS NOT NULL AND TRIM(ch.job_number) <> ''
    ), ''),
    NULLIF((
      SELECT GROUP_CONCAT(jn.job_number ORDER BY jn.sort_order, jn.id SEPARATOR ', ')
      FROM request_job_numbers jn WHERE jn.request_id = r.id
    ), ''),
    NULLIF(r.job_number, '')
  ) AS job_number`;

const REQUEST_COMPASSION_FIELDS = `
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

/** Prefer per-charge descriptions (separate lines) over the request summary blob. */
const REQUEST_DESCRIPTION = `
  COALESCE(
    NULLIF((
      SELECT GROUP_CONCAT(ch.description ORDER BY ch.sort_order, ch.id SEPARATOR '\n')
      FROM request_charges ch
      WHERE ch.request_id = r.id AND ch.description IS NOT NULL AND TRIM(ch.description) <> ''
    ), ''),
    r.description
  ) AS description`;

const REQUEST_LIST_RECEIVER_JOIN = `
  LEFT JOIN users ru ON ru.id = r.cash_receiver_user_id
`;

const REQUEST_LIST_PAID_TO = `COALESCE(ru.name, r.cash_receiver_label, u.name) AS paid_to`;

const REQUEST_RECEIPT_FIELDS = `
  r.id AS request_id,
  (SELECT rc.id FROM receipts rc WHERE rc.request_id = r.id ORDER BY rc.uploaded_at ASC LIMIT 1) AS receipt_id`;

const REQUEST_LIST_COLUMNS_CLOSED: ReportColumn[] = REQUEST_LIST_COLUMNS.map((c) =>
  c.key === "date" ? { ...c, label: "Closed Date" } : c
);

function requestReportFilters(dateCol: string, f: Filters, params: unknown[]): string {
  return reportDateClause(dateCol, f, params) + reportMessengerClause(f, params);
}

async function isCompassionBranchFilter(branchId: number | null | undefined): Promise<boolean> {
  if (branchId == null) return false;
  return isCompassionMode(await getBranchProfile(branchId));
}

type ChargeRow = {
  request_id: number;
  description: string;
  job_number: string | null;
  truck_number: string | null;
  trailer_number: string | null;
  driver_name: string | null;
  amount: number;
};

/** Attach per-charge breakdown for detailed view (still one row per request). */
async function attachChargeBreakdown(
  rows: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  const ids = [
    ...new Set(
      rows
        .map((r) => Number(r.request_id))
        .filter((id) => Number.isFinite(id) && id > 0)
    ),
  ];
  if (ids.length === 0) return rows;

  const charges = await query<ChargeRow>(
    `SELECT ch.request_id, ch.description, ch.job_number,
            ch.truck_number, ch.trailer_number, d.name AS driver_name,
            COALESCE(ch.actual_amount, ch.amount) AS amount
       FROM request_charges ch
       LEFT JOIN compassion_drivers d ON d.id = ch.driver_id
      WHERE ch.request_id IN (?)
      ORDER BY ch.request_id, ch.sort_order, ch.id`,
    [ids]
  );

  const byRequest = new Map<number, ChargeRow[]>();
  for (const ch of charges) {
    const list = byRequest.get(ch.request_id) || [];
    list.push(ch);
    byRequest.set(ch.request_id, list);
  }

  return rows.map((row) => {
    const list = byRequest.get(Number(row.request_id)) || [];
    if (list.length === 0) return row;
    return {
      ...row,
      _charges: list.map((ch) => ({
        description: ch.description,
        job_number: ch.job_number?.trim() || "",
        truck_number: ch.truck_number?.trim() || "",
        trailer_number: ch.trailer_number?.trim() || "",
        driver_name: ch.driver_name?.trim() || "",
        amount: Number(ch.amount),
      })),
    };
  });
}

async function runRequestListReport(f: Filters): Promise<ReportResult> {
  const compassion = await isCompassionBranchFilter(f.branchId);
  const extraSelect = compassion ? `, ${REQUEST_COMPASSION_FIELDS}` : "";
  const listCols = withCompassionColumns(REQUEST_LIST_COLUMNS, compassion);
  const closedCols = withCompassionColumns(REQUEST_LIST_COLUMNS_CLOSED, compassion);

  const exactParams: unknown[] = [];
  const exactFilters = requestReportFilters("r.paid_at", f, exactParams);

  const codingSelect = compassion
    ? "r.pcp_number, r.jv_number"
    : "r.zybo_voucher_code";

  const exactRows = await query(
    `SELECT ${REQUEST_RECEIPT_FIELDS}, ${codingSelect}, r.request_no, ${REQUEST_DESCRIPTION}, ${REQUEST_JOB_NUMBER}${extraSelect}, b.branch_name, u.name AS submitted_by,
            ${REQUEST_LIST_PAID_TO},
            r.paid_amount AS amount, r.status, r.created_at, r.paid_at AS date
       FROM petty_cash_requests r
       JOIN branches b ON b.id = r.branch_id
       JOIN users u ON u.id = r.submitted_by_user_id
       ${REQUEST_LIST_RECEIVER_JOIN}
      WHERE r.request_type = 'exact' AND r.paid_amount IS NOT NULL ${exactFilters}
      ORDER BY r.paid_at DESC, r.id DESC`,
    exactParams
  );

  const closedParams: unknown[] = [];
  const closedFilters = requestReportFilters("r.closed_at", f, closedParams);

  const closedSuspenseRows = await query(
    `SELECT ${REQUEST_RECEIPT_FIELDS}, ${codingSelect},
            COALESCE(r.closed_request_no, r.request_no) AS request_no,
            ${REQUEST_DESCRIPTION}, ${REQUEST_JOB_NUMBER}${extraSelect}, b.branch_name, u.name AS submitted_by,
            ${REQUEST_LIST_PAID_TO},
            CASE
              WHEN COALESCE(r.additional_paid_amount, 0) > 0 THEN r.additional_paid_amount
              ELSE r.actual_expense_amount
            END AS amount,
            r.status,
            r.created_at,
            r.closed_at AS date
       FROM petty_cash_requests r
       JOIN branches b ON b.id = r.branch_id
       JOIN users u ON u.id = r.submitted_by_user_id
       ${REQUEST_LIST_RECEIVER_JOIN}
      WHERE r.request_type = 'suspense'
        AND r.status = ?
        AND r.actual_expense_amount IS NOT NULL ${closedFilters}
      ORDER BY r.closed_at DESC, r.id DESC`,
    [SUSPENSE_STATUS.CLOSED, ...closedParams]
  );

  const openSuspParams: unknown[] = [];
  const openSuspFilters = requestReportFilters("r.paid_at", f, openSuspParams);
  const openPh = OPEN_SUSPENSE_STATUSES.map(() => "?").join(",");

  const openSuspenseRows = await query(
    `SELECT ${REQUEST_RECEIPT_FIELDS}, ${codingSelect}, r.request_no, ${REQUEST_DESCRIPTION}, ${REQUEST_JOB_NUMBER}${extraSelect}, b.branch_name, u.name AS submitted_by,
            ${REQUEST_LIST_PAID_TO},
            r.paid_amount AS amount, r.status, r.created_at, r.paid_at AS date
       FROM petty_cash_requests r
       JOIN branches b ON b.id = r.branch_id
       JOIN users u ON u.id = r.submitted_by_user_id
       ${REQUEST_LIST_RECEIVER_JOIN}
      WHERE r.request_type = 'suspense'
        AND r.paid_amount IS NOT NULL
        AND r.status IN (${openPh}) ${openSuspFilters}
      ORDER BY r.paid_at DESC, r.id DESC`,
    [...OPEN_SUSPENSE_STATUSES, ...openSuspParams]
  );

  return {
    title: "Request List",
    sections: [
      {
        title: "Petty Cash Paid",
        key: "petty_cash_paid",
        columns: listCols,
        rows: f.detailed ? await attachChargeBreakdown(exactRows) : exactRows,
        receiptLink: true,
      },
      {
        title: "Closed Suspense",
        key: "closed_suspense",
        columns: closedCols,
        rows: f.detailed ? await attachChargeBreakdown(closedSuspenseRows) : closedSuspenseRows,
        receiptLink: true,
      },
      {
        title: "Open Suspense Paid",
        key: "open_suspense_paid",
        columns: listCols,
        rows: f.detailed ? await attachChargeBreakdown(openSuspenseRows) : openSuspenseRows,
        receiptLink: true,
      },
    ],
  };
}

export async function runReport(type: string, f: Filters): Promise<ReportResult> {
  switch (type) {
    case "request_list":
      return runRequestListReport(f);
    case "branch": {
      const p: unknown[] = [];
      const rows = await query(
        `SELECT b.branch_name, COUNT(*) AS requests, COALESCE(SUM(r.paid_amount),0) AS total_paid
           FROM petty_cash_requests r JOIN branches b ON b.id = r.branch_id
          WHERE r.paid_amount IS NOT NULL ${requestReportFilters("r.paid_at", f, p)}
          GROUP BY b.id ORDER BY total_paid DESC`,
        p
      );
      return {
        title: "Branch-wise Expense",
        columns: [
          { key: "branch_name", label: "Branch" },
          { key: "requests", label: "Requests" },
          { key: "total_paid", label: "Total Paid", money: true },
        ],
        rows,
      };
    }
    case "category": {
      const p: unknown[] = [];
      const rows = await query(
        `SELECT c.category_name, c.charge_type, COUNT(*) AS requests, COALESCE(SUM(r.paid_amount),0) AS total_paid
           FROM petty_cash_requests r JOIN expense_categories c ON c.id = r.category_id
          WHERE r.paid_amount IS NOT NULL ${requestReportFilters("r.paid_at", f, p)}
          GROUP BY c.id ORDER BY total_paid DESC`,
        p
      );
      return {
        title: "Category-wise Expense",
        columns: [
          { key: "category_name", label: "Category" },
          { key: "charge_type", label: "Charge Type" },
          { key: "requests", label: "Requests" },
          { key: "total_paid", label: "Total Paid", money: true },
        ],
        rows,
      };
    }
    case "user": {
      const p: unknown[] = [];
      const rows = await query(
        `SELECT u.name AS user_name, COUNT(*) AS requests, COALESCE(SUM(r.paid_amount),0) AS total_paid
           FROM petty_cash_requests r JOIN users u ON u.id = r.submitted_by_user_id
          WHERE r.paid_amount IS NOT NULL ${requestReportFilters("r.paid_at", f, p)}
          GROUP BY u.id ORDER BY total_paid DESC`,
        p
      );
      return {
        title: "User-wise Expense",
        columns: [
          { key: "user_name", label: "User" },
          { key: "requests", label: "Requests" },
          { key: "total_paid", label: "Total Paid", money: true },
        ],
        rows,
      };
    }
    case "job": {
      const p1: unknown[] = [];
      const filters1 = requestReportFilters("r.paid_at", f, p1);
      const p2: unknown[] = [];
      const filters2 = requestReportFilters("r.paid_at", f, p2);
      const p3: unknown[] = [];
      const filters3 = requestReportFilters("r.paid_at", f, p3);
      const rows = await query(
        `SELECT ch.job_number, b.branch_name, COUNT(DISTINCT r.id) AS requests,
                COALESCE(SUM(
                  CASE
                    WHEN req_total.total_amt > 0
                    THEN r.paid_amount * (ch.amount / req_total.total_amt)
                    ELSE 0
                  END
                ), 0) AS total_paid
           FROM request_charges ch
           JOIN petty_cash_requests r ON r.id = ch.request_id
           JOIN branches b ON b.id = r.branch_id
           JOIN (
             SELECT request_id, SUM(amount) AS total_amt
               FROM request_charges
              GROUP BY request_id
           ) req_total ON req_total.request_id = r.id
          WHERE r.charge_type='job' AND r.paid_amount IS NOT NULL
            AND ch.job_number IS NOT NULL AND TRIM(ch.job_number) <> ''
            ${filters1}
          GROUP BY ch.job_number, b.id
         UNION ALL
         SELECT jn.job_number, b.branch_name, COUNT(DISTINCT r.id) AS requests,
                COALESCE(SUM(r.paid_amount / jc.n), 0) AS total_paid
           FROM request_job_numbers jn
           JOIN petty_cash_requests r ON r.id = jn.request_id
           JOIN branches b ON b.id = r.branch_id
           JOIN (SELECT request_id, COUNT(*) AS n FROM request_job_numbers GROUP BY request_id) jc
             ON jc.request_id = r.id
          WHERE r.charge_type='job' AND r.paid_amount IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM request_charges ch
               WHERE ch.request_id = r.id AND ch.job_number IS NOT NULL AND TRIM(ch.job_number) <> ''
            )
            ${filters2}
          GROUP BY jn.job_number, b.id
         UNION ALL
         SELECT r.job_number, b.branch_name, COUNT(*) AS requests, COALESCE(SUM(r.paid_amount),0) AS total_paid
           FROM petty_cash_requests r
           JOIN branches b ON b.id = r.branch_id
          WHERE r.charge_type='job' AND r.job_number IS NOT NULL AND r.paid_amount IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM request_job_numbers jn WHERE jn.request_id = r.id)
            AND NOT EXISTS (
              SELECT 1 FROM request_charges ch
               WHERE ch.request_id = r.id AND ch.job_number IS NOT NULL AND TRIM(ch.job_number) <> ''
            )
            ${filters3}
          GROUP BY r.job_number, b.id
          ORDER BY total_paid DESC`,
        [...p1, ...p2, ...p3]
      );
      return {
        title: "Job-wise Expense",
        columns: [
          { key: "job_number", label: "Job Number" },
          { key: "branch_name", label: "Branch" },
          { key: "requests", label: "Requests" },
          { key: "total_paid", label: "Total Paid", money: true },
        ],
        rows,
      };
    }
    case "open_suspense":
    case "overdue_suspense": {
      const compassion = await isCompassionBranchFilter(f.branchId);
      const extraSelect = compassion ? `, ${REQUEST_COMPASSION_FIELDS}` : "";
      const p: unknown[] = [];
      const ph = OPEN_SUSPENSE_STATUSES.map(() => "?").join(",");
      p.push(...OPEN_SUSPENSE_STATUSES);
      const overdue = type === "overdue_suspense" ? " AND r.paid_at < (NOW() - INTERVAL 7 DAY)" : "";
      const branchFilter = f.branchId ? " AND r.branch_id = ?" : "";
      if (f.branchId) p.push(f.branchId);
      const messengerFilter = reportMessengerClause(f, p);
      const rows = await query(
        `SELECT ${REQUEST_RECEIPT_FIELDS}, r.request_no, ${REQUEST_JOB_NUMBER}${extraSelect}, b.branch_name, u.name AS submitted_by, r.paid_amount AS advance,
                COALESCE(r.actual_expense_amount,0) AS actual, COALESCE(r.returned_amount,0) AS returned,
                r.status, r.created_at, r.paid_at
           FROM petty_cash_requests r
           JOIN branches b ON b.id = r.branch_id
           JOIN users u ON u.id = r.submitted_by_user_id
          WHERE r.request_type='suspense' AND r.status IN (${ph})${overdue}${branchFilter}${messengerFilter}
          ORDER BY r.paid_at DESC, r.id DESC`,
        p
      );
      return {
        title: type === "overdue_suspense" ? "Overdue Suspense (>7 days)" : "Open Suspense",
        columns: withCompassionColumns(
          [
            { key: "request_no", label: "Request" },
            { key: "job_number", label: "Job Number", small: true },
            { key: "branch_name", label: "Branch", small: true },
            { key: "submitted_by", label: "Submitted By", small: true },
            { key: "advance", label: "Advance", money: true },
            { key: "status", label: "Status" },
            { key: "created_at", label: "Created Date" },
            { key: "paid_at", label: "Paid Date" },
          ],
          compassion
        ),
        rows,
        receiptLink: true,
      };
    }
    case "topup_history": {
      const p: unknown[] = [];
      const dateSql = reportDateClause("t.created_at", f, p, "t.branch_id");
      const rows = await query(
        `SELECT t.top_up_no, t.cp_number, t.payment_source, t.bank_account_label, b.branch_name, u.name AS requested_by, t.amount, t.status, t.created_at
           FROM top_up_requests t JOIN branches b ON b.id = t.branch_id JOIN users u ON u.id = t.requested_by_user_id
          WHERE 1=1 ${dateSql}
          ORDER BY t.created_at DESC`,
        p
      );
      return {
        title: "Treasury Top-Up History",
        columns: [
          { key: "top_up_no", label: "Top-Up No" },
          { key: "cp_number", label: "CP No" },
          { key: "payment_source", label: "Payment Source" },
          { key: "bank_account_label", label: "Bank Account" },
          { key: "branch_name", label: "Branch" },
          { key: "requested_by", label: "Requested By" },
          { key: "amount", label: "Amount", money: true },
          { key: "status", label: "Status" },
          { key: "created_at", label: "Date" },
        ],
        rows: rows.map((r: Record<string, unknown>) => ({
          ...r,
          payment_source:
            r.payment_source === "bank_account"
              ? "Bank Account"
              : r.payment_source === "cash"
                ? "Cash"
                : r.payment_source,
        })),
      };
    }
    case "paid_register":
    case "rejected_register": {
      const compassion = await isCompassionBranchFilter(f.branchId);
      const extraSelect = compassion ? `, ${REQUEST_COMPASSION_FIELDS}` : "";
      const p: unknown[] = [];
      const dateCol = type === "paid_register" ? "r.paid_at" : "r.created_at";
      const statusCond =
        type === "paid_register" ? "r.paid_amount IS NOT NULL" : "r.status IN ('Rejected')";
      const codingSelect = compassion
        ? "r.pcp_number, r.jv_number"
        : "r.zybo_voucher_code";
      const rows = await query(
        `SELECT ${REQUEST_RECEIPT_FIELDS}, r.request_no, ${codingSelect}, r.request_type, c.category_name, ${REQUEST_JOB_NUMBER}${extraSelect},
                b.branch_name, u.name AS submitted_by,
                COALESCE(r.paid_amount, r.requested_amount) AS amount, r.status,
                r.created_at, COALESCE(r.paid_at, r.created_at) AS date, r.reject_reason
           FROM petty_cash_requests r
           JOIN expense_categories c ON c.id = r.category_id
           JOIN branches b ON b.id = r.branch_id
           JOIN users u ON u.id = r.submitted_by_user_id
          WHERE ${statusCond} ${requestReportFilters(dateCol, f, p)}
          ORDER BY date DESC, r.id DESC`,
        p
      );
      return {
        title: type === "paid_register" ? "Paid Request Register" : "Rejected Request Register",
        columns: withCompassionColumns(
          [
            { key: "request_no", label: "Request" },
            { key: "category_name", label: "Category", small: true },
            { key: "job_number", label: "Job Number", small: true },
            { key: "branch_name", label: "Branch", small: true },
            { key: "submitted_by", label: "Submitted By", small: true },
            { key: "amount", label: "Amount", money: true },
            { key: "status", label: "Status" },
            { key: "created_at", label: "Created Date" },
            { key: "date", label: "Paid Date" },
            ...(type === "paid_register"
              ? [{ key: "zybo_voucher_code", label: "Zybo Voucher" }]
              : []),
            ...(type === "rejected_register"
              ? [{ key: "reject_reason", label: "Reason", small: true }]
              : []),
          ],
          compassion
        ),
        rows,
        receiptLink: true,
      };
    }
    default:
      return { title: "Unknown report", columns: [], rows: [] };
  }
}
