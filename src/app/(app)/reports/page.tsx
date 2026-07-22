import Link from "next/link";
import { requireRole } from "@/lib/session";
import { resolveReportBranch, branchScopeLabel, resolveBranchScope } from "@/lib/accountsBranch";
import { getBranchListForSession } from "@/lib/accountsBranchServer";
import { resolveActiveBranchParam } from "@/lib/preferredBranch";
import { resolveReportDateRange } from "@/lib/reportDateRange";
import { runReport, REPORT_TYPES, type ReportColumn, type ReportSection } from "@/lib/reports";
import {
  effectiveReportBranchId,
  reportUsesDateFilter,
  REQUEST_LIST_TABS,
  resolveRequestListTab,
  resolveReportMessenger,
} from "@/lib/reportFilters";
import { getReportMessengers } from "@/lib/reportMessengers";
import { PageHeader } from "@/components/page-chrome";
import PrintButton from "@/components/PrintButton";
import ReportFilters from "./ReportFilters";
import QuickHoverTip from "./QuickHoverTip";
import Tabs from "@/components/Tabs";
import Pagination from "@/components/Pagination";
import { money, formatDateOnly } from "@/lib/util";
import { PAGE_SIZE, pageMeta, pageOffset, parsePage } from "@/lib/pagination";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: {
    type?: string;
    period?: string;
    from?: string;
    to?: string;
    branch?: string;
    tab?: string;
    messenger?: string;
    page?: string;
    detailed?: string;
  };
}) {
  const session = await requireRole(["accounts", "accounts_supervisor", "admin"]);

  const [branches, messengers] = await Promise.all([
    getBranchListForSession(session),
    getReportMessengers(),
  ]);

  const type = searchParams.type || "request_list";
  const detailed = searchParams.detailed === "1";
  const allowAllBranches = session.role !== "accounts";
  const activeBranch = resolveActiveBranchParam(session.preferred_branch_param, searchParams.branch);
  const branchId = resolveReportBranch(activeBranch, branches, allowAllBranches);
  const branchScope = branches.length
    ? resolveBranchScope(activeBranch, branches, allowAllBranches)
    : null;
  const branchLabel = branchScope ? branchScopeLabel(branchScope, branches) : "Branch";
  const exportBranchParam =
    branchScope?.all ? "all" : branchScope ? String(branchScope.branchId) : "all";

  const dateRange = resolveReportDateRange(
    searchParams.period,
    searchParams.from,
    searchParams.to,
    type
  );

  const useDates = reportUsesDateFilter(type);

  const result = await runReport(type, {
    period: useDates ? dateRange.period : undefined,
    from: useDates && dateRange.period === "custom" ? dateRange.from : undefined,
    to: useDates && dateRange.period === "custom" ? dateRange.to : undefined,
    branchId: effectiveReportBranchId(type, branchId),
    messengerUserId: resolveReportMessenger(searchParams.messenger, messengers),
    detailed: type === "request_list" ? detailed : false,
  });

  const typeLabel = REPORT_TYPES.find((r) => r.key === type)?.label || "Report";
  const allSections =
    result.sections ?? (result.columns ? [{ title: result.title, columns: result.columns, rows: result.rows ?? [] }] : []);

  const isRequestList = type === "request_list";
  const requestListTab = resolveRequestListTab(searchParams.tab);
  const sections = isRequestList
    ? allSections.filter((s) => s.key === requestListTab)
    : allSections;

  const requestListTabCounts = isRequestList
    ? REQUEST_LIST_TABS.map((t) => ({
        ...t,
        count: allSections.find((s) => s.key === t.key)?.rows.length ?? 0,
      }))
    : [];

  // Paginate the primary (first) section; multi-section reports share one page control.
  const primary = sections[0];
  const primaryTotal = primary?.rows.length ?? 0;
  const meta = pageMeta(primaryTotal, parsePage(searchParams.page));
  const pagedSections = sections.map((section, index) => {
    if (index !== 0) return section;
    const start = pageOffset(meta.page);
    return {
      ...section,
      rows: section.rows.slice(start, start + PAGE_SIZE),
      _fullRowCount: section.rows.length,
      _fullAmountTotal: section.rows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    };
  });

  return (
    <div className="w-full">
      <PageHeader
        title="Reports"
        subtitle={`${typeLabel} — ${branchLabel}`}
        actions={<PrintButton />}
      />
      <ReportFilters messengers={messengers} exportBranch={exportBranchParam} />

      {isRequestList && (
        <Tabs tabs={requestListTabCounts} current={requestListTab} />
      )}

      <div className="space-y-6">
        {pagedSections.map((section) => (
          <ReportTable key={section.title} section={section} detailed={detailed} />
        ))}
      </div>
      {primary && <Pagination meta={meta} />}
    </div>
  );
}

function ReportTable({
  section,
  detailed = false,
}: {
  section: ReportSection & { _fullRowCount?: number; _fullAmountTotal?: number };
  detailed?: boolean;
}) {
  const total =
    section._fullAmountTotal ??
    section.rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const colSpan = section.columns.length + (section.receiptLink ? 1 : 0);

  return (
    <div className="card w-full overflow-x-auto">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-brand-900">{section.title}</h2>
        {section.columns.some((c) => c.key === "amount") && (
          <p className="text-sm font-semibold text-brand-700">Total: {money(total)}</p>
        )}
      </div>
      <table className="w-full table-auto text-xs">
        <thead className="thead">
          <tr>
            {section.columns.map((c) => (
              <th
                key={c.key}
                className={`th ${c.money ? "whitespace-nowrap text-right" : ""} ${
                  wrapColumn(c.key) ? "min-w-[8rem]" : "whitespace-nowrap"
                }`}
              >
                {c.label}
              </th>
            ))}
            {section.receiptLink && (
              <th className="th whitespace-nowrap text-right no-print">Receipt</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {section.rows.length === 0 ? (
            <tr>
              <td className="td text-slate-400" colSpan={colSpan}>
                No data for the selected filters.
              </td>
            </tr>
          ) : (
            section.rows.map((row, i) => (
              <tr key={i}>
                {section.columns.map((c) => (
                  <td
                    key={c.key}
                    className={`td align-top ${c.money ? "whitespace-nowrap text-right font-medium" : ""} ${
                      wrapColumn(c.key) || c.small
                        ? "min-w-[8rem] max-w-[14rem] text-[11px] leading-snug text-slate-600"
                        : "whitespace-nowrap"
                    }`}
                  >
                    {renderCell(row[c.key], c, row, detailed)}
                  </td>
                ))}
                {section.receiptLink && (
                  <td className="td whitespace-nowrap text-right no-print">
                    <ReceiptLink receiptId={row.receipt_id} requestId={row.request_id} />
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ReceiptLink({
  receiptId,
  requestId,
}: {
  receiptId: unknown;
  requestId: unknown;
}) {
  const rid = receiptId != null ? Number(receiptId) : null;
  const reqId = requestId != null ? Number(requestId) : null;

  if (reqId && reqId > 0 && rid && rid > 0) {
    return (
      <a
        href={`/api/requests/${reqId}/receipts`}
        target="_blank"
        rel="noreferrer"
        className="btn-secondary px-2 py-1 text-[11px]"
      >
        View Receipt
      </a>
    );
  }
  if (reqId && reqId > 0) {
    return (
      <a
        href={`/requests/${reqId}`}
        className="text-[11px] text-slate-400 hover:text-brand-700 hover:underline"
      >
        No receipt
      </a>
    );
  }
  return <span className="text-[11px] text-slate-300">-</span>;
}

function wrapColumn(key: string): boolean {
  return (
    key === "description" ||
    key === "job_number" ||
    key === "truck_numbers" ||
    key === "trailer_numbers" ||
    key === "driver_names" ||
    key === "reject_reason"
  );
}

const COMPASSION_COL_KEYS = new Set(["truck_numbers", "trailer_numbers", "driver_names"]);

function renderCell(
  value: unknown,
  col: ReportColumn,
  row?: Record<string, unknown>,
  detailed = false
): React.ReactNode {
  if (value == null) return "-";
  if (value === "") return "-";

  if (col.key === "request_no") {
    const reqId = row?.request_id != null ? Number(row.request_id) : null;
    if (reqId && reqId > 0) {
      return (
        <Link
          href={`/requests/${reqId}`}
          className="font-medium text-brand-700 hover:underline"
        >
          {String(value)}
        </Link>
      );
    }
    return String(value);
  }

  type ChargeLine = {
    description: string;
    job_number: string;
    truck_number?: string;
    trailer_number?: string;
    driver_name?: string;
    amount: number;
  };
  const charges = Array.isArray(row?._charges) ? (row!._charges as ChargeLine[]) : null;

  // Detailed: stack description / job / Compassion / amount lines inside the same request row.
  if (detailed && charges && charges.length > 0) {
    if (col.key === "description") {
      return (
        <StackedLines
          lines={charges.map((c) => c.description || "-")}
          withSeparators
        />
      );
    }
    if (col.key === "job_number") {
      return (
        <StackedLines
          lines={charges.map((c) => c.job_number || "-")}
          withSeparators
        />
      );
    }
    if (col.key === "truck_numbers") {
      return (
        <StackedLines
          lines={charges.map((c) => c.truck_number || "-")}
          withSeparators
        />
      );
    }
    if (col.key === "trailer_numbers") {
      return (
        <StackedLines
          lines={charges.map((c) => c.trailer_number || "-")}
          withSeparators
        />
      );
    }
    if (col.key === "driver_names") {
      return (
        <StackedLines
          lines={charges.map((c) => c.driver_name || "-")}
          withSeparators
        />
      );
    }
    if (col.key === "amount") {
      return (
        <StackedLines
          lines={charges.map((c) => money(Number(c.amount)))}
          withSeparators
          align="right"
          className="font-medium text-slate-800"
        />
      );
    }
  }

  // Combined (default): single truncated line, full text on hover.
  if (
    !detailed &&
    (col.key === "job_number" ||
      col.key === "description" ||
      COMPASSION_COL_KEYS.has(col.key))
  ) {
    return truncateWithHover(
      value,
      col.key === "description" ? null : /[,;]+/
    );
  }

  if (
    col.key === "job_number" ||
    col.key === "description" ||
    COMPASSION_COL_KEYS.has(col.key)
  ) {
    return String(value);
  }

  if (col.money) return money(Number(value));
  if (col.key.endsWith("_at") || col.key === "date") return formatDateOnly(String(value));
  return String(value);
}

function StackedLines({
  lines,
  withSeparators,
  align = "left",
  className = "",
}: {
  lines: string[];
  withSeparators?: boolean;
  align?: "left" | "right";
  className?: string;
}) {
  if (lines.length === 0) return <>-</>;
  if (lines.length === 1) {
    return <span className={className}>{lines[0]}</span>;
  }
  return (
    <div
      className={`flex flex-col ${align === "right" ? "items-end" : "items-start"} ${className}`}
    >
      {lines.map((line, index) => (
        <span
          key={`${index}-${line.slice(0, 24)}`}
          className={
            withSeparators && index < lines.length - 1
              ? "w-full border-b border-slate-200 py-1"
              : "py-0.5"
          }
        >
          {line}
        </span>
      ))}
    </div>
  );
}

/** Combined view: one line with ellipsis; hover instantly shows the full list. */
function truncateWithHover(value: unknown, splitRe: RegExp | null): React.ReactNode {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";

  let parts: string[];
  if (splitRe) {
    parts = raw
      .split(splitRe)
      .map((p) => p.trim())
      .filter(Boolean);
  } else {
    parts = raw
      .split(/\r?\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length <= 1) {
      parts = raw
        .split(/(?=\d+\.\s)/)
        .map((p) => p.trim())
        .filter(Boolean);
    }
  }
  if (parts.length === 0) return "-";

  if (parts.length === 1) {
    return <span className="block truncate">{parts[0]}</span>;
  }

  return <QuickHoverTip preview={`${parts[0]}…`} lines={parts} />;
}
