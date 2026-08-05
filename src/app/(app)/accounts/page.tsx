import Link from "next/link";
import { Suspense } from "react";
import { requireRole } from "@/lib/session";
import { query, queryOne } from "@/lib/db";
import { getRequestsWhere, countRequestsWhere, countPendingZyboVouchers } from "@/lib/requests";
import { getBranchListForSession } from "@/lib/accountsBranchServer";
import { getBranchBalance } from "@/lib/ledger";
import {
  resolveBranchScope,
  branchScopeLabel,
  branchScopeQuery,
  scopeIdsFrom,
  allowAllBranchesForRole,
  branchIdInSql,
} from "@/lib/accountsBranch";
import { resolveActiveBranchParam } from "@/lib/preferredBranch";
import { PageHeader, StatCard } from "@/components/page-chrome";
import RequestTable from "@/components/RequestTable";
import Tabs from "@/components/Tabs";
import Pagination from "@/components/Pagination";
import AccountsQueueFilters from "@/components/AccountsQueueFilters";
import { money, formatDate } from "@/lib/util";
import {
  ACCOUNTS_PENDING_STATUSES,
  OPEN_SUSPENSE_STATUSES,
  SUSPENSE_STATUS,
  EXACT_STATUS,
} from "@/lib/status";
import { PAGE_SIZE, pageMeta, pageOffset, parsePage } from "@/lib/pagination";
import type { ChargeType, RequestType } from "@/lib/types";

const CHARGE_TYPES: ChargeType[] = ["job", "non_job", "truck_trailer", "general"];
const REQUEST_TYPES: RequestType[] = ["exact", "suspense"];

export const dynamic = "force-dynamic";

const TABS = [
  { key: "pending", label: "Pending for Payment" },
  { key: "paid_today", label: "Paid Today" },
  { key: "open_suspense", label: "Open Suspense" },
  { key: "settlement_pending", label: "Settlement Pending" },
  { key: "returned", label: "Returned Cash" },
  { key: "partial_returns", label: "Partial Returns" },
  { key: "acc_sup_pending", label: "Acc Sup Pending", highlight: "blue" as const },
  { key: "balance", label: "Branch Cash Balance" },
] as const;

async function tabCount(sql: string, params: unknown[]): Promise<number> {
  const row = await queryOne<{ c: number }>(sql, params);
  return row ? Number(row.c) : 0;
}

async function getAccountsTabCounts(branchIds: number[], role: string) {
  const { sql: branchSql, params: branchParams } = branchIdInSql(branchIds);
  const phPending = ACCOUNTS_PENDING_STATUSES.map(() => "?").join(",");
  const phSusp = OPEN_SUSPENSE_STATUSES.map(() => "?").join(",");

  const pendingWhere =
    role === "accounts"
      ? `${branchSql} AND status IN (${phPending})`
      : `${branchSql} AND (
           (status IN (${phPending}) AND (submitter_role IS NULL OR submitter_role <> 'accounts_supervisor'))
           OR status = ?
         )`;
  const pendingParams =
    role === "accounts"
      ? [...branchParams, ...ACCOUNTS_PENDING_STATUSES]
      : [...branchParams, ...ACCOUNTS_PENDING_STATUSES, EXACT_STATUS.PENDING_ACC_SUP];

  const [pending, paidToday, openSusp, settlement, returned, partialReturns, accSupPending] =
    await Promise.all([
      tabCount(`SELECT COUNT(*) AS c FROM petty_cash_requests WHERE ${pendingWhere}`, pendingParams),
      tabCount(
        `SELECT COUNT(*) AS c FROM petty_cash_requests WHERE ${branchSql} AND DATE(paid_at) = CURDATE()`,
        branchParams
      ),
      tabCount(
        `SELECT COUNT(*) AS c FROM petty_cash_requests WHERE ${branchSql} AND status IN (${phSusp})`,
        [...branchParams, ...OPEN_SUSPENSE_STATUSES]
      ),
      tabCount(
        `SELECT COUNT(*) AS c FROM petty_cash_requests WHERE ${branchSql} AND status IN (?, ?)`,
        [...branchParams, SUSPENSE_STATUS.RECEIPT_SUBMITTED, SUSPENSE_STATUS.PENDING_SETTLEMENT_REVIEW]
      ),
      tabCount(
        `SELECT COUNT(*) AS c FROM petty_cash_requests WHERE ${branchSql} AND returned_amount IS NOT NULL AND returned_amount > 0`,
        branchParams
      ),
      // Still-open suspense with at least one partial return recorded.
      tabCount(
        `SELECT COUNT(*) AS c FROM petty_cash_requests
          WHERE ${branchSql}
            AND status IN (${phSusp})
            AND returned_amount IS NOT NULL AND returned_amount > 0
            AND EXISTS (SELECT 1 FROM suspense_returns sr WHERE sr.request_id = petty_cash_requests.id)`,
        [...branchParams, ...OPEN_SUSPENSE_STATUSES]
      ),
      tabCount(
        `SELECT COUNT(*) AS c FROM petty_cash_requests WHERE ${branchSql} AND status = ?`,
        [...branchParams, EXACT_STATUS.PENDING_ACC_SUP]
      ),
    ]);

  return {
    pending,
    paid_today: paidToday,
    open_suspense: openSusp,
    settlement_pending: settlement,
    returned,
    partial_returns: partialReturns,
    acc_sup_pending: accSupPending,
  };
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: {
    branch?: string;
    tab?: string;
    page?: string;
    q?: string;
    user?: string;
    charge?: string;
    type?: string;
  };
}) {
  const session = await requireRole(["accounts", "accounts_supervisor", "admin"]);

  // Determine selectable branches.
  const branchList = await getBranchListForSession(session);

  if (branchList.length === 0) {
    return (
      <div>
        <PageHeader title="Accounts" />
        <p className="text-sm text-slate-500">No branches assigned to you. Contact admin.</p>
      </div>
    );
  }

  const allowAll = allowAllBranchesForRole(session.role);
  const scope = resolveBranchScope(resolveActiveBranchParam(session.preferred_branch_param, searchParams.branch), branchList, allowAll);
  const scopeIds = scopeIdsFrom(scope);
  const branchName = branchScopeLabel(scope, branchList);
  const branchQ = branchScopeQuery(scope);
  const phScope = scopeIds.map(() => "?").join(",");
  const tab = searchParams.tab || "pending";

  const submitters = await query<{ id: number; name: string }>(
    `SELECT DISTINCT u.id, u.name
       FROM petty_cash_requests r
       JOIN users u ON u.id = r.submitted_by_user_id
      WHERE r.branch_id IN (${phScope})
      ORDER BY u.name`,
    scopeIds
  );

  const q = (searchParams.q || "").trim();
  const chargeParam = CHARGE_TYPES.includes(searchParams.charge as ChargeType)
    ? (searchParams.charge as ChargeType)
    : "";
  const typeParam = REQUEST_TYPES.includes(searchParams.type as RequestType)
    ? (searchParams.type as RequestType)
    : "";
  const userParam = searchParams.user?.trim();
  const userId = userParam && /^\d+$/.test(userParam) ? Number(userParam) : null;
  const validUserId =
    userId != null && submitters.some((u) => u.id === userId) ? userId : null;
  const hasFilters = Boolean(q || validUserId || chargeParam || typeParam);

  let rows = [] as Awaited<ReturnType<typeof getRequestsWhere>>;
  let balanceView: React.ReactNode = null;
  let listMeta = pageMeta(0, 1);

  if (tab !== "balance") {
    const whereParts: string[] = [];
    const params: unknown[] = [];
    let order = "r.created_at DESC";

    if (tab === "pending") {
      const phStat = ACCOUNTS_PENDING_STATUSES.map(() => "?").join(",");
      if (session.role === "accounts") {
        whereParts.push(`r.branch_id IN (${phScope})`, `r.status IN (${phStat})`);
        params.push(...scopeIds, ...ACCOUNTS_PENDING_STATUSES);
      } else {
        // Acc Sup / admin: normal pending (excluding Acc-Sup-created) + accounts staff reimbursements awaiting Acc Sup.
        whereParts.push(`r.branch_id IN (${phScope})`, `(
          (r.status IN (${phStat}) AND (r.submitter_role IS NULL OR r.submitter_role <> 'accounts_supervisor'))
          OR r.status = ?
        )`);
        params.push(...scopeIds, ...ACCOUNTS_PENDING_STATUSES, EXACT_STATUS.PENDING_ACC_SUP);
      }
    } else if (tab === "paid_today") {
      whereParts.push(`r.branch_id IN (${phScope})`, `DATE(r.paid_at) = CURDATE()`);
      params.push(...scopeIds);
      order = "r.paid_at DESC";
    } else if (tab === "open_suspense") {
      const phStat = OPEN_SUSPENSE_STATUSES.map(() => "?").join(",");
      whereParts.push(`r.branch_id IN (${phScope})`, `r.status IN (${phStat})`);
      params.push(...scopeIds, ...OPEN_SUSPENSE_STATUSES);
    } else if (tab === "settlement_pending") {
      whereParts.push(`r.branch_id IN (${phScope})`, `r.status IN (?, ?)`);
      params.push(...scopeIds, SUSPENSE_STATUS.RECEIPT_SUBMITTED, SUSPENSE_STATUS.PENDING_SETTLEMENT_REVIEW);
    } else if (tab === "returned") {
      whereParts.push(
        `r.branch_id IN (${phScope})`,
        `r.returned_amount IS NOT NULL`,
        `r.returned_amount > 0`
      );
      params.push(...scopeIds);
    } else if (tab === "partial_returns") {
      const phStat = OPEN_SUSPENSE_STATUSES.map(() => "?").join(",");
      whereParts.push(
        `r.branch_id IN (${phScope})`,
        `r.status IN (${phStat})`,
        `r.returned_amount IS NOT NULL`,
        `r.returned_amount > 0`,
        `EXISTS (SELECT 1 FROM suspense_returns sr WHERE sr.request_id = r.id)`
      );
      params.push(...scopeIds, ...OPEN_SUSPENSE_STATUSES);
    } else if (tab === "acc_sup_pending") {
      whereParts.push(`r.branch_id IN (${phScope})`, `r.status = ?`);
      params.push(...scopeIds, EXACT_STATUS.PENDING_ACC_SUP);
    }

    if (typeParam) {
      whereParts.push("r.request_type = ?");
      params.push(typeParam);
    }
    if (chargeParam) {
      whereParts.push("r.charge_type = ?");
      params.push(chargeParam);
    }
    if (validUserId != null) {
      whereParts.push("r.submitted_by_user_id = ?");
      params.push(validUserId);
    }
    if (q) {
      const like = `%${q}%`;
      whereParts.push(
        `(r.request_no LIKE ? OR COALESCE(r.closed_request_no, '') LIKE ?
          OR COALESCE(r.description, '') LIKE ? OR COALESCE(r.job_number, '') LIKE ?
          OR su.name LIKE ? OR COALESCE(ru.name, '') LIKE ?
          OR COALESCE(r.cash_receiver_label, '') LIKE ?
          OR c.category_name LIKE ?)`
      );
      params.push(like, like, like, like, like, like, like, like);
    }

    const where = whereParts.join(" AND ");
    const total = await countRequestsWhere(where, params);
    listMeta = pageMeta(total, parsePage(searchParams.page));
    rows = await getRequestsWhere(where, params, order, {
      limit: PAGE_SIZE,
      offset: pageOffset(listMeta.page),
    });
  } else {
    balanceView = await BalanceView({ branchIds: scopeIds, branchList });
  }

  const tabCounts = await getAccountsTabCounts(scopeIds, session.role);
  const pendingZyboVc = await countPendingZyboVouchers(scopeIds);
  const tabsWithCounts = TABS.map((t) => ({
    ...t,
    count: t.key === "balance" ? undefined : tabCounts[t.key as keyof typeof tabCounts],
  }));

  let cashInHand = 0;
  for (const id of scopeIds) {
    const bal = await getBranchBalance(id);
    cashInHand += bal.cashInHand;
  }

  return (
    <div>
      <PageHeader
        title="Accounts Dashboard"
        subtitle={`${branchName} — process payments and suspense`}
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/accounts/topup?${branchQ}`} className="btn-secondary">
              Top-Up
            </Link>
            <Link href={`/reports?${branchQ}`} className="btn-secondary">
              Reports
            </Link>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 md:mb-5 md:grid-cols-4 md:gap-3">
        <StatCard
          label="Pending Requests"
          value={tabCounts.pending}
          tone={tabCounts.pending > 0 ? "warn" : "good"}
          hint={tabCounts.pending > 0 ? "awaiting payment / issue" : "all clear"}
          href={`/accounts?tab=pending&${branchQ}`}
        />
        <StatCard
          label="Open Suspense"
          value={tabCounts.open_suspense}
          tone={tabCounts.open_suspense > 0 ? "info" : "good"}
          hint={tabCounts.open_suspense > 0 ? "advances outstanding" : undefined}
          href={`/accounts?tab=open_suspense&${branchQ}`}
        />
        <StatCard
          label="Cash in Hand"
          value={money(cashInHand)}
          tone="good"
          hint={branchName}
          href={`/accounts?tab=balance&${branchQ}`}
        />
        <StatCard
          label="Pending Zybo VC"
          value={pendingZyboVc}
          tone={pendingZyboVc > 0 ? "warn" : "good"}
          hint={pendingZyboVc > 0 ? (pendingZyboVc === 1 ? "voucher to enter" : "vouchers to enter") : undefined}
          href={`/accounts/zybo-vc?${branchQ}`}
        />
      </div>

      <Tabs tabs={tabsWithCounts} current={tab} />

      {tab === "balance" ? (
        balanceView
      ) : (
        <>
          <Suspense fallback={<div className="mb-3 h-16 animate-pulse rounded-lg bg-slate-100" />}>
            <AccountsQueueFilters
              users={JSON.parse(JSON.stringify(submitters))}
              current={{
                q,
                userId: validUserId,
                charge: chargeParam,
                type: typeParam,
              }}
            />
          </Suspense>
          <RequestTable
            rows={rows}
            showBranch={scope.all}
            emptyMessage={
              hasFilters
                ? "No requests match your search or filters."
                : tab === "acc_sup_pending"
                  ? "No requests waiting on Accounts Supervisor."
                  : "Nothing here right now."
            }
            usePaidAmount={tab === "paid_today"}
            useReturnedAmount={tab === "returned" || tab === "partial_returns"}
            amountLabel={
              tab === "returned" || tab === "partial_returns" ? "Returned" : "Amount"
            }
          />
          <Pagination meta={listMeta} />
        </>
      )}
    </div>
  );
}

async function BalanceView({
  branchIds,
  branchList,
}: {
  branchIds: number[];
  branchList: { id: number; branch_name: string }[];
}) {
  const balances = [] as { id: number; name: string; cash: number; susp: number; float: number }[];
  for (const id of branchIds) {
    const b = await getBranchBalance(id);
    balances.push({
      id,
      name: branchList.find((x) => x.id === id)?.branch_name || `Branch ${id}`,
      cash: b.cashInHand,
      susp: b.openSuspense,
      float: b.totalFloat,
    });
  }
  const totalCash = balances.reduce((s, b) => s + b.cash, 0);
  const totalSusp = balances.reduce((s, b) => s + b.susp, 0);
  const totalFloat = balances.reduce((s, b) => s + b.float, 0);

  // Recent ledger across scoped branches.
  const ph = branchIds.map(() => "?").join(",");
  const ledger = await query<{
    id: number;
    branch_name: string;
    transaction_type: string;
    debit_amount: number;
    credit_amount: number;
    running_balance: number;
    remarks: string | null;
    created_at: string;
  }>(
    `SELECT l.id, b.branch_name, l.transaction_type, l.debit_amount, l.credit_amount, l.running_balance, l.remarks, l.created_at
       FROM cash_ledger l JOIN branches b ON b.id = l.branch_id
      WHERE l.branch_id IN (${ph}) ORDER BY l.id DESC LIMIT 50`,
    branchIds
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatCard label="Cash in Hand" value={money(totalCash)} tone="good" />
        <StatCard label="Open Suspense" value={money(totalSusp)} tone="info" />
        <StatCard label="Total Petty Cash Float" value={money(totalFloat)} />
      </div>

      <div className="card overflow-x-auto">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
          Balance by Branch
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
            {balances.map((b) => (
              <tr key={b.id}>
                <td className="td font-medium">{b.name}</td>
                <td className="td text-right">{money(b.cash)}</td>
                <td className="td text-right text-sky-600">{money(b.susp)}</td>
                <td className="td text-right font-medium">{money(b.float)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
          Recent Ledger
        </div>
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Date</th>
              <th className="th">Branch</th>
              <th className="th">Type</th>
              <th className="th">Remarks</th>
              <th className="th text-right">Debit</th>
              <th className="th text-right">Credit</th>
              <th className="th text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ledger.map((l) => (
              <tr key={l.id}>
                <td className="td whitespace-nowrap text-xs">{formatDate(l.created_at)}</td>
                <td className="td">{l.branch_name}</td>
                <td className="td">{l.transaction_type}</td>
                <td className="td text-slate-500">{l.remarks}</td>
                <td className="td text-right text-rose-600">
                  {Number(l.debit_amount) > 0 ? money(l.debit_amount) : "-"}
                </td>
                <td className="td text-right text-emerald-600">
                  {Number(l.credit_amount) > 0 ? money(l.credit_amount) : "-"}
                </td>
                <td className="td text-right font-medium">{money(l.running_balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
