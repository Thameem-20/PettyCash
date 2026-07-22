export const REPORT_DATE_PERIODS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last_week", label: "Last Week" },
  { key: "last_month", label: "Last Month" },
  { key: "last_6_months", label: "Last 6 Months" },
  { key: "last_year", label: "Last Year" },
  { key: "custom", label: "Custom Date" },
] as const;

export type ReportDatePeriod = (typeof REPORT_DATE_PERIODS)[number]["key"];

const VALID_PERIODS = new Set<string>(REPORT_DATE_PERIODS.map((p) => p.key));

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function defaultReportPeriod(_reportType?: string): ReportDatePeriod {
  return "last_6_months";
}

export function normalizeReportPeriod(
  periodParam: string | undefined,
  reportType?: string
): ReportDatePeriod {
  if (periodParam && VALID_PERIODS.has(periodParam)) {
    return periodParam as ReportDatePeriod;
  }
  if (reportType) return defaultReportPeriod(reportType);
  return "today";
}

/** Resolve preset or custom date range for reports. Defaults depend on report type. */
export function resolveReportDateRange(
  periodParam: string | undefined,
  customFrom?: string,
  customTo?: string,
  reportType?: string
): { period: ReportDatePeriod; from?: string; to?: string } {
  const period = normalizeReportPeriod(periodParam, reportType);
  const today = startOfDay(new Date());

  if (period === "custom") {
    return {
      period,
      from: customFrom || undefined,
      to: customTo || undefined,
    };
  }

  let from: Date;
  let to: Date;

  switch (period) {
    case "yesterday": {
      const y = addDays(today, -1);
      from = y;
      to = y;
      break;
    }
    case "last_week": {
      const dow = today.getDay();
      const daysToMonday = dow === 0 ? 6 : dow - 1;
      const thisMonday = addDays(today, -daysToMonday);
      const lastMonday = addDays(thisMonday, -7);
      from = lastMonday;
      to = addDays(lastMonday, 6);
      break;
    }
    case "last_month": {
      const firstThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDayPrevMonth = addDays(firstThisMonth, -1);
      from = new Date(lastDayPrevMonth.getFullYear(), lastDayPrevMonth.getMonth(), 1);
      to = lastDayPrevMonth;
      break;
    }
    case "last_6_months":
      from = new Date(today.getFullYear(), today.getMonth() - 6, 1);
      to = today;
      break;
    case "last_year": {
      const y = today.getFullYear() - 1;
      from = new Date(y, 0, 1);
      to = new Date(y, 11, 31);
      break;
    }
    case "today":
    default:
      from = today;
      to = today;
      break;
  }

  return { period, from: toYmd(from), to: toYmd(to) };
}
