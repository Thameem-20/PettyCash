import Link from "next/link";
import { requireRole } from "@/lib/session";
import { query, queryOne } from "@/lib/db";
import {
  resolveBranchScope,
  branchScopeLabel,
  branchScopeQuery,
  scopeIdsFrom,
  branchIdInSql,
} from "@/lib/accountsBranch";
import { resolveActiveBranchParam } from "@/lib/preferredBranch";
import { getAllBranchBalances } from "@/lib/ledger";
import { PageHeader, StatCard } from "@/components/page-chrome";
import { OPEN_SUSPENSE_STATUSES, TOPUP_STATUS, EXACT_STATUS } from "@/lib/status";
import { getRequestsWhere, countRequestsWhere } from "@/lib/requests";
import RequestTable from "@/components/RequestTable";
import { money, formatDate } from "@/lib/util";
import {
  accountsProcessingQueueChart,
  paymentTrend,
  topExpenseCategories,
  orgRequestPipeline,
} from "@/lib/dashboardStats";
import { ChartCard } from "@/components/charts/ChartCard";
import { BarChart, moneyBarFormat } from "@/components/charts/BarChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { TrendChart } from "@/components/charts/TrendChart";

export const dynamic = "force-dynamic";

export default async function AccountsSupervisorPage({
  searchParams,
}: {
  searchParams: { branch?: string };
}) {
  const session = await requireRole(["accounts_supervisor", "admin"]);

  const branchList = await query<{ id: number; branch_name: string; branch_code: string }>(
    "SELECT id, branch_name, branch_code FROM branches WHERE is_active = 1 ORDER BY branch_name"
  );

  if (branchList.length === 0) {
    return (
      <div>
        <PageHeader title="Accounts Supervisor Overview" />
        <p className="text-sm text-slate-500">No branches available.</p>
      </div>
    );
  }

  const scope = resolveBranchScope(resolveActiveBranchParam(session.preferred_branch_param, searchParams.branch), branchList, true);
  const scopeIds = scopeIdsFrom(scope);
  const branchName = branchScopeLabel(scope, branchList);
  const branchQ = `?${branchScopeQuery(scope)}`;
  const { sql: branchSql, params: branchParams } = branchIdInSql(scopeIds);

  const allBalances = (await getAllBranchBalances()).filter((b) => scopeIds.includes(b.branchId));
  const branchBalance = scope.all
    ? {
        cashInHand: allBalances.reduce((s, b) => s + b.cashInHand, 0),
        openSuspense: allBalances.reduce((s, b) => s + b.openSuspense, 0),
        totalFloat: allBalances.reduce((s, b) => s + b.totalFloat, 0),
      }
    : (allBalances[0] ?? { cashInHand: 0, openSuspense: 0, totalFloat: 0 });

  const paidToday = await sumPaid("DATE(paid_at) = CURDATE()", scopeIds);
  const paidWeek = await sumPaid("YEARWEEK(paid_at, 1) = YEARWEEK(CURDATE(), 1)", scopeIds);
  const paidMonth = await sumPaid(
    "YEAR(paid_at) = YEAR(CURDATE()) AND MONTH(paid_at) = MONTH(CURDATE())",
    scopeIds
  );

  const branchSqlR = branchSql.replace(/branch_id/g, "r.branch_id");

  const topCat = await queryOne<{ category_name: string; total: number }>(
    `SELECT c.category_name, COALESCE(SUM(r.paid_amount),0) AS total
       FROM petty_cash_requests r JOIN expense_categories c ON c.id = r.category_id
      WHERE r.paid_amount IS NOT NULL AND ${branchSqlR}
      GROUP BY c.id ORDER BY total DESC LIMIT 1`,
    branchParams
  );

  const ph = OPEN_SUSPENSE_STATUSES.map(() => "?").join(",");
  const overdue = await query<{
    request_no: string;
    submitted_by_name: string;
    paid_amount: number;
    paid_at: string;
  }>(
    `SELECT r.request_no, u.name AS submitted_by_name, r.paid_amount, r.paid_at
       FROM petty_cash_requests r
       JOIN users u ON u.id = r.submitted_by_user_id
      WHERE ${branchSqlR}
        AND r.request_type='suspense' AND r.status IN (${ph})
        AND r.paid_at IS NOT NULL AND r.paid_at < (NOW() - INTERVAL 7 DAY)
      ORDER BY r.paid_at ASC`,
    [...branchParams, ...OPEN_SUSPENSE_STATUSES]
  );

  const pendingTopups = await queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM top_up_requests WHERE ${branchSql} AND status = ?`,
    [...branchParams, TOPUP_STATUS.PENDING_ACC_SUP]
  );

  const pendingStaffWhere = `r.branch_id IN (${scopeIds.map(() => "?").join(",")}) AND r.status = ?`;
  const pendingStaffParams = [...scopeIds, EXACT_STATUS.PENDING_ACC_SUP];
  const pendingStaffCount = await countRequestsWhere(pendingStaffWhere, pendingStaffParams);
  const pendingStaffRows =
    pendingStaffCount > 0
      ? await getRequestsWhere(pendingStaffWhere, pendingStaffParams, "r.created_at ASC", {
          limit: 10,
          offset: 0,
        })
      : [];

  const activity = await query<{ name: string; paid_count: number; paid_total: number }>(
    `SELECT u.name, COUNT(*) AS paid_count, COALESCE(SUM(r.paid_amount),0) AS paid_total
       FROM petty_cash_requests r JOIN users u ON u.id = r.accounts_user_id
      WHERE r.paid_at IS NOT NULL AND ${branchSqlR}
      GROUP BY u.id ORDER BY paid_total DESC`,
    branchParams
  );

  const [pipeline, queueData, trend, categories] = await Promise.all([
    orgRequestPipeline(scopeIds),
    accountsProcessingQueueChart(scopeIds),
    paymentTrend(7, scopeIds),
    topExpenseCategories(6, scopeIds),
  ]);

  return (
    <div>
      <PageHeader
        title="Accounts Supervisor Overview"
        subtitle={`${branchName} — branch summary and activity`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/accounts${branchQ}`} className="btn-secondary">
              Accounts
            </Link>
            <Link href={`/accounts/payments${branchQ}`} className="btn-secondary">
              Payments
            </Link>
            <Link href={`/reports${branchQ}`} className="btn-secondary">
              Reports
            </Link>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total Petty Cash Float" value={money(branchBalance.totalFloat)} />
        <StatCard label="Cash in Hand" value={money(branchBalance.cashInHand)} tone="good" />
        <StatCard label="Open Suspense" value={money(branchBalance.openSuspense)} tone="info" />
        <StatCard
          label="Pending Top-Up Approvals"
          value={pendingTopups?.c || 0}
          tone="warn"
          href={`/accounts-supervisor/topup${branchQ}`}
        />
        <StatCard
          label="Pending Acc Sup Approvals"
          value={pendingStaffCount}
          tone={pendingStaffCount > 0 ? "warn" : "good"}
          hint="Staff reimbursements and escalated requests"
          href={`/accounts?tab=pending&${branchScopeQuery(scope)}`}
        />
        <StatCard label="Paid Today" value={money(paidToday)} />
        <StatCard label="Paid This Week" value={money(paidWeek)} />
        <StatCard label="Paid This Month" value={money(paidMonth)} />
        <StatCard
          label="Top Expense Category"
          value={topCat?.category_name || "-"}
          hint={topCat ? money(topCat.total) : undefined}
        />
      </div>

      {pendingStaffCount > 0 && (
        <div className="card mb-4">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <p className="text-sm font-semibold text-slate-700">
              Pending Accounts Supervisor Approval ({pendingStaffCount})
            </p>
            <Link
              href={`/accounts?tab=pending&${branchScopeQuery(scope)}`}
              className="text-xs font-medium text-brand-700 hover:underline"
            >
              Open queue
            </Link>
          </div>
          <div className="p-2">
            <RequestTable
              rows={pendingStaffRows}
              showBranch={scope.all}
              emptyMessage="None pending."
            />
          </div>
        </div>
      )}

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <ChartCard title="Request Pipeline" subtitle={`${branchName} — all requests by status`}>
          <DonutChart data={pipeline} />
        </ChartCard>
        <ChartCard title="Processing Queue" subtitle={`${branchName} — paid and items needing action`}>
          <DonutChart data={queueData} />
        </ChartCard>
        <ChartCard title="Payments This Week" subtitle={`${branchName} — daily total paid (AED)`}>
          <TrendChart data={trend} isCurrency />
        </ChartCard>
        <ChartCard title="Top Expense Categories" subtitle={`${branchName} — highest spending`}>
          <BarChart data={categories} horizontal formatValue={moneyBarFormat} />
        </ChartCard>
      </div>

      <div className="card mb-4 overflow-x-auto">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
          Branch Cash Balance
        </div>
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Branch</th>
              <th className="th text-right">Cash in Hand</th>
              <th className="th text-right">Open Suspense</th>
              <th className="th text-right">Total Float</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {scope.all ? (
              allBalances.map((b) => {
                const name = branchList.find((x) => x.id === b.branchId)?.branch_name ?? `Branch ${b.branchId}`;
                return (
                  <tr key={b.branchId}>
                    <td className="td font-medium">{name}</td>
                    <td className="td text-right">{money(b.cashInHand)}</td>
                    <td className="td text-right text-brand-600">{money(b.openSuspense)}</td>
                    <td className="td text-right font-medium">{money(b.totalFloat)}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td className="td font-medium">{branchName}</td>
                <td className="td text-right">{money(branchBalance.cashInHand)}</td>
                <td className="td text-right text-brand-600">{money(branchBalance.openSuspense)}</td>
                <td className="td text-right font-medium">{money(branchBalance.totalFloat)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card overflow-x-auto">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
            Overdue Suspense (&gt; 7 days)
          </div>
          {overdue.length === 0 ? (
            <p className="p-4 text-sm text-slate-400">No overdue suspense for this branch.</p>
          ) : (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Request</th>
                  <th className="th">Submitted By</th>
                  <th className="th text-right">Amount</th>
                  <th className="th">Issued</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overdue.map((o) => (
                  <tr key={o.request_no}>
                    <td className="td">{o.request_no}</td>
                    <td className="td">{o.submitted_by_name}</td>
                    <td className="td text-right">{money(o.paid_amount)}</td>
                    <td className="td text-xs">{formatDate(o.paid_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card overflow-x-auto">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
            Accounts User Activity
          </div>
          {activity.length === 0 ? (
            <p className="p-4 text-sm text-slate-400">No activity for this branch yet.</p>
          ) : (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">User</th>
                  <th className="th text-right">Payments</th>
                  <th className="th text-right">Total Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activity.map((a) => (
                  <tr key={a.name}>
                    <td className="td font-medium">{a.name}</td>
                    <td className="td text-right">{a.paid_count}</td>
                    <td className="td text-right">{money(a.paid_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

async function sumPaid(where: string, branchIds: number[]): Promise<number> {
  const { sql, params } = branchIdInSql(branchIds);
  const row = await queryOne<{ s: number }>(
    `SELECT COALESCE(SUM(paid_amount),0) AS s FROM petty_cash_requests
      WHERE paid_amount IS NOT NULL AND ${sql} AND ${where}`,
    params
  );
  return row ? Number(row.s) : 0;
}
