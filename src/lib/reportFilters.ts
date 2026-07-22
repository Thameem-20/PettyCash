/** Report types that compare across branches — branch filter is ignored. */
export const BRANCH_COMPARISON_REPORTS = new Set(["branch"]);

/** Reports where date range does not apply (status-based lists). */
export const REPORTS_WITHOUT_DATE_FILTER = new Set(["open_suspense", "overdue_suspense"]);

/** Reports where messenger filter does not apply. */
export const REPORTS_WITHOUT_MESSENGER_FILTER = new Set(["topup_history"]);

export const REQUEST_LIST_TABS = [
  { key: "petty_cash_paid", label: "Petty Cash Paid" },
  { key: "closed_suspense", label: "Closed Suspense" },
  { key: "open_suspense_paid", label: "Open Suspense Paid" },
] as const;

export type RequestListTabKey = (typeof REQUEST_LIST_TABS)[number]["key"];

export function resolveRequestListTab(tab: string | undefined): RequestListTabKey {
  if (tab === "closed_suspense") return "closed_suspense";
  if (tab === "open_suspense_paid") return "open_suspense_paid";
  return "petty_cash_paid";
}

export function effectiveReportBranchId(
  reportType: string,
  branchId: number | null
): number | null {
  if (BRANCH_COMPARISON_REPORTS.has(reportType)) return null;
  return branchId;
}

export function reportUsesDateFilter(reportType: string): boolean {
  return !REPORTS_WITHOUT_DATE_FILTER.has(reportType);
}

export function reportUsesMessengerFilter(reportType: string): boolean {
  return !REPORTS_WITHOUT_MESSENGER_FILTER.has(reportType);
}

export function resolveReportMessenger(
  messengerParam: string | undefined,
  messengers: { id: number }[]
): number | null {
  if (!messengerParam || messengerParam === "all") return null;
  const id = Number(messengerParam);
  if (!Number.isFinite(id) || !messengers.some((m) => m.id === id)) return null;
  return id;
}
