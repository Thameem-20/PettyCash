import Link from "next/link";
import { requireRole } from "@/lib/session";
import { query, queryOne } from "@/lib/db";
import { accountsBranchIds } from "@/lib/requests";
import {
  resolveBranchScope,
  branchScopeLabel,
  scopeIdsFrom,
  allowAllBranchesForRole,
} from "@/lib/accountsBranch";
import { resolveActiveBranchParam } from "@/lib/preferredBranch";
import { getBranchProfile, isCompassionMode } from "@/lib/branchProfile";
import {
  getDailyLedgerSummary,
  normalizeLedgerDate,
  ledgerEntryGroup,
  ledgerDisplayRequestNo,
  LEDGER_LABELS,
  type DailyLedgerEntry,
  type OpenSuspenseLedgerRow,
  type ClosedSuspenseLedgerRow,
  type LedgerTxnType,
} from "@/lib/ledger";
import { PageHeader, StatCard } from "@/components/page-chrome";
import { money, formatDateOnly } from "@/lib/util";
import LedgerDateFilter, { type LedgerDayPeriod } from "./LedgerDateFilter";

export const dynamic = "force-dynamic";

function ledgerTypeLabel(type: string): string {
  const short: Partial<Record<LedgerTxnType, string>> = {
    exact_paid: "Exact paid",
    suspense_issued: "Issued",
    suspense_returned: "Returned",
    additional_paid: "Addl. paid",
    topup_received: "Top-up",
    adjustment: "Adjust",
  };
  return short[type as LedgerTxnType] || LEDGER_LABELS[type as LedgerTxnType] || type.replace(/_/g, " ");
}

function addDaysYmd(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function resolveLedgerDay(
  periodParam: string | undefined,
  dateParam: string | undefined,
  today: string
): { period: LedgerDayPeriod; date: string } {
  if (periodParam === "yesterday") {
    return { period: "yesterday", date: addDaysYmd(today, -1) };
  }
  if (periodParam === "custom") {
    const custom = normalizeLedgerDate(dateParam) || today;
    const date = custom > today ? today : custom;
    return { period: "custom", date };
  }
  return { period: "today", date: today };
}

type PcrDisplayRow = {
  key: string;
  sortAt: string;
  branch_name: string;
  typeLabel: string;
  requestId: number | null;
  requestNo: string | null;
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
  paidOut: number;
};

function buildPcrRows(
  exactEntries: DailyLedgerEntry[],
  closed: ClosedSuspenseLedgerRow[]
): PcrDisplayRow[] {
  const rows: PcrDisplayRow[] = [];

  for (const e of exactEntries) {
    rows.push({
      key: `exact-${e.id}`,
      sortAt: e.created_at,
      branch_name: e.branch_name,
      typeLabel: ledgerTypeLabel(e.transaction_type),
      requestId: e.request_id,
      requestNo: ledgerDisplayRequestNo(e),
      job_number: e.job_number,
      truck_numbers: e.truck_numbers,
      trailer_numbers: e.trailer_numbers,
      driver_names: e.driver_names,
      requested_by: e.requested_by,
      paid_to: e.paid_to,
      zybo_voucher_code: e.zybo_voucher_code,
      pcp_number: e.pcp_number,
      jv_number: e.jv_number,
      created_by_name: e.created_by_name,
      paidOut: Number(e.debit_amount),
    });
  }

  for (const c of closed) {
    rows.push({
      key: `csr-${c.id}`,
      sortAt: c.closed_at,
      branch_name: c.branch_name,
      typeLabel: "Closed",
      requestId: c.id,
      requestNo: c.closed_request_no,
      job_number: c.job_number,
      truck_numbers: c.truck_numbers,
      trailer_numbers: c.trailer_numbers,
      driver_names: c.driver_names,
      requested_by: c.requested_by,
      paid_to: c.paid_to,
      zybo_voucher_code: c.zybo_voucher_code,
      pcp_number: c.pcp_number,
      jv_number: c.jv_number,
      created_by_name: c.created_by_name,
      paidOut: Number(c.actual_expense_amount),
    });
  }

  rows.sort((a, b) => a.sortAt.localeCompare(b.sortAt) || a.key.localeCompare(b.key));
  return rows;
}

const cell = "px-2 py-1.5 text-xs text-slate-700";
const head = "px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500";

function JobNumbers({ value }: { value: string | null | undefined }) {
  const jobs = (value || "")
    .split(/[,;]+/)
    .map((j) => j.trim())
    .filter(Boolean);
  if (jobs.length === 0) return <>-</>;
  return (
    <div className="flex flex-col gap-0.5 leading-tight" title={jobs.join(", ")}>
      {jobs.map((j) => (
        <span key={j} className="block truncate">
          {j}
        </span>
      ))}
    </div>
  );
}

function PcrSection({
  rows,
  showBranch,
  compassionMode,
  emptyLabel,
  footer,
}: {
  rows: PcrDisplayRow[];
  showBranch: boolean;
  compassionMode: boolean;
  emptyLabel: string;
  footer: { totalPaidLabel: string; totalPaid: number };
}) {
  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="flex shrink-0 items-baseline justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <div>
          <p className="text-sm font-semibold text-slate-700">
            PCR — Petty Cash Paid
            <span className="ml-2 font-normal text-slate-400">({rows.length})</span>
          </p>
          <p className="text-[11px] text-slate-400">
            Exact reimbursements and closed suspense (CSR — actual expense)
          </p>
        </div>
      </div>

      <div className="h-76 overflow-auto">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">{emptyLabel}</p>
        ) : (
          <table className="w-full table-fixed divide-y divide-slate-200">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                <th className={`${head} w-[6.5rem]`}>Paid Date</th>
                {showBranch && <th className={`${head} w-[7rem]`}>Branch</th>}
                <th className={`${head} w-[5.5rem]`}>Type</th>
                <th className={`${head} w-[6.5rem]`}>Request</th>
                {compassionMode ? (
                  <>
                    <th className={`${head} w-[6rem]`}>Truck</th>
                    <th className={`${head} w-[6rem]`}>Trailer</th>
                    <th className={`${head} w-[7rem]`}>Driver</th>
                  </>
                ) : (
                  <th className={`${head} w-[9rem]`}>Job No</th>
                )}
                <th className={`${head} w-[7rem]`}>Requested By</th>
                <th className={`${head} w-[7rem]`}>Paid To</th>
                <th className={`${head} w-[6rem]`}>Paid By</th>
                {compassionMode ? (
                  <>
                    <th className={`${head} w-[6rem]`}>PCP</th>
                    <th className={`${head} w-[6rem]`}>JV</th>
                  </>
                ) : (
                  <th className={`${head} w-[7rem]`}>Zybo PCV</th>
                )}
                <th className={`${head} w-[7rem] text-right`}>Paid Out</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((e) => (
                <tr key={e.key}>
                  <td className={`${cell} whitespace-nowrap`}>{formatDateOnly(e.sortAt)}</td>
                  {showBranch && (
                    <td className={`${cell} truncate`} title={e.branch_name}>
                      {e.branch_name}
                    </td>
                  )}
                  <td className={`${cell} truncate`}>{e.typeLabel}</td>
                  <td className={`${cell} truncate`}>
                    {e.requestId && e.requestNo ? (
                      <Link
                        href={`/requests/${e.requestId}`}
                        className="font-medium text-brand-700 hover:underline"
                        title={e.requestNo}
                      >
                        {e.requestNo}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                  {compassionMode ? (
                    <>
                      <td className={`${cell} truncate`} title={e.truck_numbers || undefined}>
                        {e.truck_numbers || "-"}
                      </td>
                      <td className={`${cell} truncate`} title={e.trailer_numbers || undefined}>
                        {e.trailer_numbers || "-"}
                      </td>
                      <td className={`${cell} truncate`} title={e.driver_names || undefined}>
                        {e.driver_names || "-"}
                      </td>
                    </>
                  ) : (
                    <td className={cell}>
                      <JobNumbers value={e.job_number} />
                    </td>
                  )}
                  <td className={`${cell} truncate`} title={e.requested_by || undefined}>
                    {e.requested_by || "-"}
                  </td>
                  <td className={`${cell} truncate`} title={e.paid_to || undefined}>
                    {e.paid_to || "-"}
                  </td>
                  <td className={`${cell} truncate`} title={e.created_by_name}>
                    {e.created_by_name}
                  </td>
                  {compassionMode ? (
                    <>
                      <td className={`${cell} truncate font-medium`} title={e.pcp_number || undefined}>
                        {e.pcp_number || "-"}
                      </td>
                      <td className={`${cell} truncate font-medium`} title={e.jv_number || undefined}>
                        {e.jv_number || "-"}
                      </td>
                    </>
                  ) : (
                    <td className={`${cell} truncate font-medium`} title={e.zybo_voucher_code || undefined}>
                      {e.zybo_voucher_code || "-"}
                    </td>
                  )}
                  <td className={`${cell} whitespace-nowrap text-right text-rose-600`}>
                    {money(e.paidOut)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-3 py-2.5">
        <p className="text-sm font-semibold text-slate-700">
          {footer.totalPaidLabel}:{" "}
          <span className="text-rose-600">{money(footer.totalPaid)}</span>
        </p>
      </div>
    </div>
  );
}

function OpenSuspenseSection({
  entries,
  showBranch,
  compassionMode,
  emptyLabel,
}: {
  entries: OpenSuspenseLedgerRow[];
  showBranch: boolean;
  compassionMode: boolean;
  emptyLabel: string;
}) {
  const totalOutstanding = entries.reduce((s, e) => s + Number(e.outstanding), 0);

  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="flex shrink-0 items-baseline justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <div>
          <p className="text-sm font-semibold text-slate-700">
            OSR — Open Suspense
            <span className="ml-2 font-normal text-slate-400">({entries.length})</span>
          </p>
          <p className="text-[11px] text-slate-400">
            All active open suspense (until closed — not limited by date filter)
          </p>
        </div>
        {entries.length > 0 && (
          <p className="shrink-0 text-xs text-slate-500">{entries.length} open</p>
        )}
      </div>

      <div className="h-56 overflow-auto">
        {entries.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">{emptyLabel}</p>
        ) : (
          <table className="w-full table-fixed divide-y divide-slate-200">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                <th className={`${head} w-[6.5rem]`}>Paid Date</th>
                {showBranch && <th className={`${head} w-[7rem]`}>Branch</th>}
                <th className={`${head} w-[5.5rem]`}>Type</th>
                <th className={`${head} w-[6.5rem]`}>Request</th>
                {compassionMode ? (
                  <>
                    <th className={`${head} w-[6rem]`}>Truck</th>
                    <th className={`${head} w-[6rem]`}>Trailer</th>
                    <th className={`${head} w-[7rem]`}>Driver</th>
                  </>
                ) : (
                  <th className={`${head} w-[9rem]`}>Job No</th>
                )}
                <th className={`${head} w-[7rem]`}>Requested By</th>
                <th className={`${head} w-[7rem]`}>Paid To</th>
                <th className={`${head} w-[6rem]`}>Paid By</th>
                {compassionMode ? (
                  <>
                    <th className={`${head} w-[6rem]`}>PCP</th>
                    <th className={`${head} w-[6rem]`}>JV</th>
                  </>
                ) : (
                  <th className={`${head} w-[7rem]`}>Zybo PCV</th>
                )}
                <th className={`${head} w-[7rem] text-right`}>Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className={`${cell} whitespace-nowrap`}>{formatDateOnly(e.paid_at)}</td>
                  {showBranch && (
                    <td className={`${cell} truncate`} title={e.branch_name}>
                      {e.branch_name}
                    </td>
                  )}
                  <td className={cell}>Open</td>
                  <td className={`${cell} truncate`}>
                    <Link
                      href={`/requests/${e.id}`}
                      className="font-medium text-brand-700 hover:underline"
                      title={e.request_no}
                    >
                      {e.request_no}
                    </Link>
                  </td>
                  {compassionMode ? (
                    <>
                      <td className={`${cell} truncate`} title={e.truck_numbers || undefined}>
                        {e.truck_numbers || "-"}
                      </td>
                      <td className={`${cell} truncate`} title={e.trailer_numbers || undefined}>
                        {e.trailer_numbers || "-"}
                      </td>
                      <td className={`${cell} truncate`} title={e.driver_names || undefined}>
                        {e.driver_names || "-"}
                      </td>
                    </>
                  ) : (
                    <td className={cell}>
                      <JobNumbers value={e.job_number} />
                    </td>
                  )}
                  <td className={`${cell} truncate`} title={e.requested_by || undefined}>
                    {e.requested_by || "-"}
                  </td>
                  <td className={`${cell} truncate`} title={e.paid_to || undefined}>
                    {e.paid_to || "-"}
                  </td>
                  <td className={`${cell} truncate`} title={e.created_by_name}>
                    {e.created_by_name}
                  </td>
                  {compassionMode ? (
                    <>
                      <td className={`${cell} truncate font-medium`} title={e.pcp_number || undefined}>
                        {e.pcp_number || "-"}
                      </td>
                      <td className={`${cell} truncate font-medium`} title={e.jv_number || undefined}>
                        {e.jv_number || "-"}
                      </td>
                    </>
                  ) : (
                    <td className={`${cell} truncate font-medium`} title={e.zybo_voucher_code || undefined}>
                      {e.zybo_voucher_code || "-"}
                    </td>
                  )}
                  <td className={`${cell} whitespace-nowrap text-right font-medium text-amber-700`}>
                    {money(e.outstanding)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-3 py-2.5">
        <p className="text-sm font-semibold text-slate-700">
          Total outstanding:{" "}
          <span className="text-amber-700">{money(totalOutstanding)}</span>
        </p>
      </div>
    </div>
  );
}

function OtherSection({
  entries,
  showBranch,
  emptyLabel,
}: {
  entries: DailyLedgerEntry[];
  showBranch: boolean;
  emptyLabel: string;
}) {
  const totalCredit = entries.reduce((s, e) => s + Number(e.credit_amount), 0);
  const totalDebit = entries.reduce((s, e) => s + Number(e.debit_amount), 0);
  const netTotal = totalCredit - totalDebit;
  const netIsIn = netTotal >= 0;

  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="flex shrink-0 items-baseline justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <div>
          <p className="text-sm font-semibold text-slate-700">
            Other
            <span className="ml-2 font-normal text-slate-400">({entries.length})</span>
          </p>
          <p className="text-[11px] text-slate-400">Top-ups, adjustments</p>
        </div>
      </div>

      <div className="h-56 overflow-auto">
        {entries.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">{emptyLabel}</p>
        ) : (
          <table className="w-full table-fixed divide-y divide-slate-200">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                <th className={`${head} w-[6.5rem]`}>Paid Date</th>
                {showBranch && <th className={`${head} w-[7rem]`}>Branch</th>}
                <th className={`${head} w-[5.5rem]`}>Type</th>
                <th className={`${head} w-[9rem]`}>Remarks</th>
                <th className={`${head} w-[6rem]`}>By</th>
                <th className={`${head} w-[7rem] text-right`}>Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {entries.map((e) => {
                const debit = Number(e.debit_amount);
                const credit = Number(e.credit_amount);
                const amount = credit > 0 ? credit : debit;
                const isIn = credit > 0;
                return (
                  <tr key={e.id}>
                    <td className={`${cell} whitespace-nowrap`}>{formatDateOnly(e.created_at)}</td>
                    {showBranch && (
                      <td className={`${cell} truncate`} title={e.branch_name}>
                        {e.branch_name}
                      </td>
                    )}
                    <td className={`${cell} truncate`}>{ledgerTypeLabel(e.transaction_type)}</td>
                    <td className={`${cell} truncate`} title={e.remarks || undefined}>
                      {e.remarks || "-"}
                    </td>
                    <td className={`${cell} truncate`} title={e.created_by_name}>
                      {e.created_by_name}
                    </td>
                    <td
                      className={`${cell} whitespace-nowrap text-right ${
                        isIn ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {isIn ? "+" : "-"}
                      {money(amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {entries.length > 0 && (
        <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-3 py-2.5">
          <p className="text-sm font-semibold text-slate-700">
            Total:{" "}
            <span className={netIsIn ? "text-emerald-600" : "text-rose-600"}>
              {netIsIn ? "+" : "-"}
              {money(Math.abs(netTotal))}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: { branch?: string; period?: string; date?: string };
}) {
  const session = await requireRole(["accounts", "accounts_supervisor", "admin"]);

  let branchList: { id: number; branch_name: string; branch_code: string }[];
  if (session.role === "accounts") {
    const ids = await accountsBranchIds(session.id);
    branchList = ids.length
      ? await query(
          "SELECT id, branch_name, branch_code FROM branches WHERE id IN (?) ORDER BY branch_name",
          [ids]
        )
      : [];
  } else {
    branchList = await query(
      "SELECT id, branch_name, branch_code FROM branches WHERE is_active = 1 ORDER BY branch_name"
    );
  }

  if (branchList.length === 0) {
    return (
      <div>
        <PageHeader title="Ledger" />
        <p className="text-sm text-slate-500">No branches assigned to you. Contact admin.</p>
      </div>
    );
  }

  const allowAll = allowAllBranchesForRole(session.role);
  const activeBranch = resolveActiveBranchParam(session.preferred_branch_param, searchParams.branch);
  const scope = resolveBranchScope(activeBranch, branchList, allowAll);
  const scopeIds = scopeIdsFrom(scope);
  const branchName = branchScopeLabel(scope, branchList);

  const todayRow = await queryOne<{ today: string }>("SELECT CURDATE() AS today");
  const today = String(todayRow?.today || "").slice(0, 10);
  const { period, date } = resolveLedgerDay(searchParams.period, searchParams.date, today);
  const dayLabel = formatDateOnly(date);

  const summary = await getDailyLedgerSummary(scopeIds, date);
  const isToday = date === today;
  const paidLabel = isToday ? "Paid Today" : "Paid Out";

  const exactEntries: DailyLedgerEntry[] = [];
  const otherEntries: DailyLedgerEntry[] = [];
  for (const e of summary.entries) {
    const g = ledgerEntryGroup(e);
    if (g === "PCR") exactEntries.push(e);
    else if (g === "OTHER") otherEntries.push(e);
  }

  const pcrRows = buildPcrRows(exactEntries, summary.closedSuspenseEntries);
  const pcrTotalPaid = pcrRows.reduce((s, r) => s + r.paidOut, 0);
  const compassionMode = scope.all
    ? false
    : isCompassionMode(await getBranchProfile(scope.branchId));

  const exportParams = new URLSearchParams();
  if (activeBranch) exportParams.set("branch", activeBranch);
  if (period === "yesterday") exportParams.set("period", "yesterday");
  if (period === "custom") {
    exportParams.set("period", "custom");
    exportParams.set("date", date);
  }
  const exportHref = `/api/accounts/ledger/export${
    exportParams.toString() ? `?${exportParams.toString()}` : ""
  }`;

  return (
    <div>
      <PageHeader
        title="Ledger"
        subtitle={`${branchName} — ${dayLabel}`}
        actions={
          <a href={exportHref} className="btn-secondary">
            Export to PDF
          </a>
        }
      />

      <LedgerDateFilter period={period} date={date} maxDate={today} />

      <div className="mb-5 grid grid-cols-1 items-start gap-2 sm:grid-cols-3 md:gap-3">
        <div className="flex flex-col gap-1">
          <StatCard
            compact
            label="Opening — Cash In-hand"
            value={money(summary.openingBalance)}
            tone="info"
          />
          <StatCard
            compact
            label="Opening — Zybo"
            value={money(summary.openingBalanceAsPerZybo)}
            tone="neutral"
          />
        </div>
        <div className="flex flex-col gap-1">
          <StatCard
            compact
            label={`${paidLabel} · ${summary.paymentCount}`}
            value={money(summary.totalPaidOut)}
            tone="bad"
          />
          <StatCard
            compact
            label={`Suspense Paid · ${summary.suspensePaymentCount}`}
            value={money(summary.totalSuspensePaid)}
            tone="warn"
          />
        </div>
        <div className="flex flex-col gap-1">
          <StatCard
            compact
            label="Closing — Cash In-hand"
            value={money(summary.closingBalance)}
            tone="good"
          />
          <StatCard
            compact
            label="Closing — Zybo"
            value={money(summary.balanceAsPerZybo)}
            tone="neutral"
          />
        </div>
      </div>

      {summary.totalReceived > 0 && (
        <p className="mb-4 text-sm text-slate-500">
          Received{isToday ? " today" : ""}: {money(summary.totalReceived)} (top-ups, returns, etc.)
        </p>
      )}

      <div className="space-y-4">
        <PcrSection
          rows={pcrRows}
          showBranch={scope.all}
          compassionMode={compassionMode}
          emptyLabel={`No PCR / CSR movements on ${dayLabel}.`}
          footer={{
            totalPaidLabel: isToday ? "Total paid today" : "Total paid out",
            totalPaid: pcrTotalPaid,
          }}
        />

        <OpenSuspenseSection
          entries={summary.openSuspenseEntries}
          showBranch={scope.all}
          compassionMode={compassionMode}
          emptyLabel="No active open suspense."
        />

        {otherEntries.length > 0 && (
          <OtherSection
            entries={otherEntries}
            showBranch={scope.all}
            emptyLabel={`No other movements on ${dayLabel}.`}
          />
        )}
      </div>
    </div>
  );
}
