import type { ReportDatePeriod } from "./reportDateRange";

export interface ReportFiltersInput {
  period?: ReportDatePeriod;
  from?: string;
  to?: string;
  branchId?: number | null;
  messengerUserId?: number | null;
}

/** MySQL date filter using session timezone (DB_TIMEZONE, default Asia/Dubai +04:00). */
export function reportDateClause(
  col: string,
  f: ReportFiltersInput,
  params: unknown[],
  branchCol = "r.branch_id"
): string {
  let c = "";

  if (f.period && f.period !== "custom") {
    c += periodSql(col, f.period);
  } else {
    if (f.from) {
      c += ` AND DATE(${col}) >= ?`;
      params.push(f.from);
    }
    if (f.to) {
      c += ` AND DATE(${col}) <= ?`;
      params.push(f.to);
    }
  }

  if (f.branchId) {
    c += ` AND ${branchCol} = ?`;
    params.push(f.branchId);
  }

  return c;
}

/** Filter requests by messenger / field staff (submitter or cash receiver). */
export function reportMessengerClause(
  f: ReportFiltersInput,
  params: unknown[],
  alias = "r"
): string {
  if (!f.messengerUserId) return "";
  params.push(f.messengerUserId, f.messengerUserId);
  return ` AND (${alias}.submitted_by_user_id = ? OR ${alias}.cash_receiver_user_id = ?)`;
}

function periodSql(col: string, period: ReportDatePeriod): string {
  switch (period) {
    case "today":
      return ` AND DATE(${col}) = CURDATE()`;
    case "yesterday":
      return ` AND DATE(${col}) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`;
    case "last_week":
      return ` AND DATE(${col}) BETWEEN DATE_SUB(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 7 DAY) AND DATE_SUB(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 1 DAY)`;
    case "last_month":
      return ` AND DATE(${col}) BETWEEN DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01') AND LAST_DAY(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))`;
    case "last_6_months":
      return ` AND DATE(${col}) BETWEEN DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 6 MONTH), '%Y-%m-01') AND CURDATE()`;
    case "last_year":
      return ` AND YEAR(${col}) = YEAR(CURDATE()) - 1`;
    default:
      return "";
  }
}
