import Link from "next/link";
import {
  Banknote,
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  Receipt,
  Send,
  Wallet,
} from "lucide-react";
import { requireSession } from "@/lib/session";
import { query, queryOne } from "@/lib/db";
import { getAllBranchBalances } from "@/lib/ledger";
import { StatCard } from "@/components/page-chrome";
import { money } from "@/lib/util";
import {
  ACCOUNTS_PENDING_STATUSES,
  EXACT_STATUS,
  OPEN_SUSPENSE_STATUSES,
  SUSPENSE_STATUS,
} from "@/lib/status";
import { ROLE_LABELS } from "@/lib/rbac";
import { resolveBranchScope, branchScopeLabel, branchScopeQuery, scopeIdsFrom, branchIdInSql } from "@/lib/accountsBranch";
import { getBranchListForSession } from "@/lib/accountsBranchServer";
import { resolveActiveBranchParam } from "@/lib/preferredBranch";
import { countPendingZyboVouchers } from "@/lib/requests";
import {
  accountsProcessingQueueChart,
  branchCashChart,
  paymentTrend,
  supervisorApprovalBreakdown,
  supervisorWeeklyTrend,
  topUpPendingByBranch,
  topUpStatusBreakdown,
  userRequestStatusBreakdown,
  userSubmissionTrend,
} from "@/lib/dashboardStats";
import { ChartCard } from "@/components/charts/ChartCard";
import { BarChart, moneyBarFormat } from "@/components/charts/BarChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { TrendChart } from "@/components/charts/TrendChart";

export const dynamic = "force-dynamic";

async function countWhere(where: string, params: unknown[] = []): Promise<number> {
  const row = await queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM petty_cash_requests WHERE ${where}`,
    params
  );
  return row ? Number(row.c) : 0;
}

function ChartGrid({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 grid gap-3 md:mt-6 md:grid-cols-2 md:gap-4">{children}</div>;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { branch?: string };
}) {
  const session = await requireSession();
  const role = session.role;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gradient-to-br from-brand-600 to-brand-700 px-3.5 py-3.5 text-white shadow-sm md:mb-6 md:gap-4 md:rounded-2xl md:px-6 md:py-6">
        <div>
          <h1 className="text-lg font-bold tracking-tight md:text-2xl">
            Welcome, {session.name}
          </h1>
          <p className="mt-0.5 text-xs text-brand-100 md:text-sm">{ROLE_LABELS[role]}</p>
        </div>
        {(role === "cash_requester" || role === "messenger" || role === "operations") && (
          <Link
            href="/requests/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-sm transition-colors hover:bg-brand-50 md:gap-2 md:px-4 md:py-2 md:text-sm"
          >
            <Plus className="size-3.5 md:size-4" /> New Request
          </Link>
        )}
      </div>

      {(role === "cash_requester" || role === "messenger" || role === "operations") && (
        <FieldStaffDashboard userId={session.id} />
      )}
      {role === "supervisor" && <SupervisorDashboard userId={session.id} />}
      {role === "accounts" && (
        <AccountsDashboard
          session={session}
          branchParam={resolveActiveBranchParam(session.preferred_branch_param, searchParams.branch)}
          allowAll={false}
        />
      )}
      {(role === "accounts_supervisor" || role === "admin") && (
        <ElevatedAccountsDashboard
          session={session}
          branchParam={resolveActiveBranchParam(session.preferred_branch_param, searchParams.branch)}
          allowAll
        />
      )}
      {role === "treasury" && <TreasuryDashboard />}
    </div>
  );
}

async function FieldStaffDashboard({ userId }: { userId: number }) {
  const [mine, awaiting, openSusp, statusData, trendData] = await Promise.all([
    countWhere("submitted_by_user_id = ?", [userId]),
    countWhere("cash_receiver_user_id = ? AND status IN (?, ?)", [
      userId,
      EXACT_STATUS.AWAITING_RECEIVER,
      SUSPENSE_STATUS.AWAITING_CASH_RECEIPT,
    ]),
    countWhere(
      `(submitted_by_user_id = ? OR cash_receiver_user_id = ?) AND status IN (${OPEN_SUSPENSE_STATUSES.map(() => "?").join(",")})`,
      [userId, userId, ...OPEN_SUSPENSE_STATUSES]
    ),
    userRequestStatusBreakdown(userId),
    userSubmissionTrend(userId),
  ]);

  return (
    <>
      <div className="grid auto-rows-fr grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
        <StatCard label="My Requests" value={mine} href="/requests" icon={<FileText />} />
        <StatCard label="Awaiting My Confirmation" value={awaiting} tone="warn" href="/confirm" icon={<Clock />} />
        <StatCard label="My Open Suspense" value={openSusp} tone="info" href="/suspense" icon={<Wallet />} />
        <StatCard label="New Request" value="+" tone="good" href="/requests/new" icon={<Plus />} />
      </div>
      <ChartGrid>
        <ChartCard title="My Requests by Status" subtitle="All requests you submitted">
          <DonutChart data={statusData} />
        </ChartCard>
        <ChartCard title="Submissions This Week" subtitle="Daily count — last 7 days">
          <TrendChart data={trendData} />
        </ChartCard>
      </ChartGrid>
    </>
  );
}

async function SupervisorDashboard({ userId }: { userId: number }) {
  const pendingWhere = `supervisor_id = ? AND status = ?`;
  const [pendingExact, pendingSusp, approved, breakdown, trend] = await Promise.all([
    countWhere(`${pendingWhere} AND request_type = 'exact'`, [
      userId,
      EXACT_STATUS.PENDING_SUPERVISOR,
    ]),
    countWhere(`${pendingWhere} AND request_type = 'suspense'`, [
      userId,
      SUSPENSE_STATUS.PENDING_SUPERVISOR,
    ]),
    countWhere(
      `EXISTS (
         SELECT 1 FROM approvals a
          WHERE a.request_id = petty_cash_requests.id
            AND a.approver_user_id = ?
            AND a.approval_level = 'supervisor'
            AND a.action IN ('approve', 'edit_amount')
       ) AND status NOT IN (?, ?, ?, ?)`,
      [
        userId,
        EXACT_STATUS.PENDING_SUPERVISOR,
        SUSPENSE_STATUS.PENDING_SUPERVISOR,
        EXACT_STATUS.REJECTED,
        SUSPENSE_STATUS.REJECTED,
      ]
    ),
    supervisorApprovalBreakdown(userId, false),
    supervisorWeeklyTrend(userId, false),
  ]);

  return (
    <>
      <div className="grid auto-rows-fr grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
        <StatCard
          label="Pending Approval"
          value={pendingExact + pendingSusp}
          tone="warn"
          href="/approvals?tab=pending"
          icon={<Clock />}
        />
        <StatCard label="Approved" value={approved} tone="good" href="/approvals?tab=approved" icon={<CheckCircle2 />} />
        <StatCard label="Exact Pending" value={pendingExact} href="/approvals?tab=pending" icon={<FileText />} />
        <StatCard label="Suspense Pending" value={pendingSusp} href="/approvals?tab=pending" icon={<Wallet />} />
      </div>
      <ChartGrid>
        <ChartCard title="Approval Pipeline" subtitle="Requests under your supervision">
          <DonutChart data={breakdown} />
        </ChartCard>
        <ChartCard title="Approvals This Week" subtitle="Daily approvals — last 7 days">
          <TrendChart data={trend} />
        </ChartCard>
      </ChartGrid>
    </>
  );
}

async function ElevatedAccountsDashboard({
  session,
  branchParam,
  allowAll,
}: {
  session: { id: number; role: string };
  branchParam?: string;
  allowAll: boolean;
}) {
  const branchList = await getBranchListForSession(session);
  if (branchList.length === 0) {
    return <p className="text-sm text-slate-500">No branches available.</p>;
  }
  return <BranchAccountsDashboard branchList={branchList} branchParam={branchParam} allowAll={allowAll} />;
}

async function AccountsDashboard({
  session,
  branchParam,
  allowAll,
}: {
  session: { id: number; role: string; primary_role?: string };
  branchParam?: string;
  allowAll: boolean;
}) {
  // Includes Control Panel memberships (user_branch_roles) and legacy access rows.
  const branchList = await getBranchListForSession(session);

  if (branchList.length === 0) {
    return <p className="text-sm text-slate-500">No branches assigned. Contact admin.</p>;
  }

  return <BranchAccountsDashboard branchList={branchList} branchParam={branchParam} allowAll={allowAll} />;
}

async function BranchAccountsDashboard({
  branchList,
  branchParam,
  allowAll,
}: {
  branchList: { id: number; branch_name: string; branch_code?: string }[];
  branchParam?: string;
  allowAll: boolean;
}) {
  const scope = resolveBranchScope(branchParam, branchList, allowAll);
  const scopeIds = scopeIdsFrom(scope);
  const branchName = branchScopeLabel(scope, branchList);
  const branchQ = branchScopeQuery(scope);
  const { sql: branchSql, params: branchParams } = branchIdInSql(scopeIds);

  // Acc Sup / admin must also see accounts-staff requests awaiting Acc Sup approval.
  const pendingStatuses = allowAll
    ? [...ACCOUNTS_PENDING_STATUSES, EXACT_STATUS.PENDING_ACC_SUP]
    : ACCOUNTS_PENDING_STATUSES;

  const [pendingPay, openSusp, paidToday, pendingZyboVc, cash, queueData, trendData, branchData] = await Promise.all([
    countWhere(
      `${branchSql} AND status IN (${pendingStatuses.map(() => "?").join(",")})`,
      [...branchParams, ...pendingStatuses]
    ),
    countWhere(
      `${branchSql} AND status IN (${OPEN_SUSPENSE_STATUSES.map(() => "?").join(",")})`,
      [...branchParams, ...OPEN_SUSPENSE_STATUSES]
    ),
    countWhere(`${branchSql} AND DATE(paid_at) = CURDATE()`, branchParams),
    countPendingZyboVouchers(scopeIds),
    getAllBranchBalances().then((balances) =>
      balances
        .filter((b) => scopeIds.includes(b.branchId))
        .reduce((sum, b) => sum + b.cashInHand, 0)
    ),
    accountsProcessingQueueChart(scopeIds, { includeAccSupPending: allowAll }),
    paymentTrend(7, scopeIds),
    branchCashChart(scopeIds),
  ]);

  return (
    <>
      <div className="grid auto-rows-fr grid-cols-2 gap-2 md:grid-cols-3 md:gap-3 xl:grid-cols-5">
        <StatCard
          label="Pending for Payment"
          value={pendingPay}
          tone="warn"
          href={`/accounts?tab=pending&${branchQ}`}
          icon={<Clock />}
        />
        <StatCard
          label="Open Suspense"
          value={openSusp}
          tone="info"
          href={`/accounts?${branchQ}&tab=open_suspense`}
          icon={<Wallet />}
        />
        <StatCard
          label="Paid Today"
          value={paidToday}
          tone="good"
          href={`/accounts?${branchQ}&tab=paid_today`}
          icon={<CheckCircle2 />}
        />
        <StatCard
          label="Pending Zybo VC"
          value={pendingZyboVc}
          tone={pendingZyboVc > 0 ? "warn" : "good"}
          href={`/accounts/zybo-vc?${branchQ}`}
          icon={<Receipt />}
        />
        <StatCard label="Cash in Hand" value={money(cash)} href={`/accounts?${branchQ}&tab=balance`} icon={<Banknote />} />
      </div>
      <ChartGrid>
        <ChartCard title="Processing Queue" subtitle={`${branchName} — paid and items needing action`}>
          <DonutChart data={queueData} />
        </ChartCard>
        <ChartCard title="Payments This Week" subtitle={`${branchName} — daily total (AED)`}>
          <TrendChart data={trendData} isCurrency />
        </ChartCard>
        <ChartCard title="Cash in Hand" subtitle={branchName} className="md:col-span-2">
          <div className="w-full">
            <BarChart data={branchData} horizontal formatValue={moneyBarFormat} />
          </div>
        </ChartCard>
      </ChartGrid>
    </>
  );
}

async function TreasuryDashboard() {
  const pending = await queryOne<{ c: number }>(
    "SELECT COUNT(*) AS c FROM top_up_requests WHERE status = 'Pending Treasury Approval'"
  );
  const approved = await queryOne<{ c: number }>(
    "SELECT COUNT(*) AS c FROM top_up_requests WHERE status = 'Treasury Approved'"
  );

  const [statusData, branchData] = await Promise.all([
    topUpStatusBreakdown(),
    topUpPendingByBranch(),
  ]);

  return (
    <>
      <div className="grid auto-rows-fr grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
        <StatCard label="Pending Top-Up Approval" value={pending?.c || 0} tone="warn" href="/treasury" icon={<Clock />} />
        <StatCard label="Awaiting Release" value={approved?.c || 0} tone="info" href="/treasury" icon={<Send />} />
      </div>
      <ChartGrid>
        <ChartCard title="Top-Up Status" subtitle="All top-up requests">
          <DonutChart data={statusData} />
        </ChartCard>
        <ChartCard title="Pending Top-Up by Branch" subtitle="Awaiting treasury action (AED)">
          <BarChart data={branchData} horizontal formatValue={moneyBarFormat} />
        </ChartCard>
      </ChartGrid>
    </>
  );
}
