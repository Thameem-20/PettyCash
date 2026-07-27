import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getTopUpsWhere, countTopUpsWhere } from "@/lib/topup";
import { getAllBranchBalances } from "@/lib/ledger";
import { treasuryBranchIds } from "@/lib/requests";
import { PageHeader, StatCard } from "@/components/page-chrome";
import TopUpList from "@/components/TopUpList";
import Pagination from "@/components/Pagination";
import { TOPUP_STATUS } from "@/lib/status";
import { money } from "@/lib/util";
import { PAGE_SIZE, pageMeta, pageOffset, parsePage } from "@/lib/pagination";

export const dynamic = "force-dynamic";

export default async function TreasuryPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const session = await requireRole(["treasury", "admin"]);

  const assigned =
    session.role === "admin" ? [] : await treasuryBranchIds(session.id);
  const branchSql =
    assigned.length > 0
      ? ` AND t.branch_id IN (${assigned.map(() => "?").join(",")})`
      : "";
  const branchParams = assigned.length > 0 ? assigned : [];

  const pending = await getTopUpsWhere(`t.status = ?${branchSql}`, [
    TOPUP_STATUS.PENDING_TREASURY,
    ...branchParams,
  ]);
  const toRelease = await getTopUpsWhere(`t.status = ?${branchSql}`, [
    TOPUP_STATUS.TREASURY_APPROVED,
    ...branchParams,
  ]);

  const historyWhere = `t.status NOT IN (?, ?)${branchSql}`;
  const historyParams = [
    TOPUP_STATUS.PENDING_TREASURY,
    TOPUP_STATUS.TREASURY_APPROVED,
    ...branchParams,
  ];
  const historyTotal = await countTopUpsWhere(historyWhere, historyParams);
  const historyMeta = pageMeta(historyTotal, parsePage(searchParams.page));
  const history = await getTopUpsWhere(historyWhere, historyParams, "t.created_at DESC", {
    limit: PAGE_SIZE,
    offset: pageOffset(historyMeta.page),
  });

  const pendingTotal = pending.reduce((s, t) => s + Number(t.amount), 0);
  const allBalances = await getAllBranchBalances();
  const balances =
    assigned.length > 0
      ? allBalances.filter((b) => assigned.includes(b.branchId))
      : allBalances;
  const totalCash = balances.reduce((s, b) => s + b.cashInHand, 0);

  return (
    <div>
      <PageHeader
        title="Treasury"
        subtitle="Approve and release branch top-up requests"
        actions={
          <Link href="/reports" className="btn-secondary">
            Reports
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Pending Approval" value={pending.length} tone="warn" />
        <StatCard label="Awaiting Release" value={toRelease.length} tone="info" />
        <StatCard label="Pending Amount" value={money(pendingTotal)} />
        <StatCard label="Total Cash in Hand" value={money(totalCash)} tone="good" />
      </div>

      <section className="mb-6 space-y-3">
        <h2 className="text-sm font-semibold text-slate-600">Cash in hand by branch</h2>
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Branch</th>
                <th className="th text-right">Cash in Hand</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {balances.length === 0 ? (
                <tr>
                  <td className="td text-sm text-slate-500" colSpan={2}>
                    No branches found.
                  </td>
                </tr>
              ) : (
                balances.map((b) => (
                  <tr key={b.branchId}>
                    <td className="td font-medium">{b.branch_name}</td>
                    <td className="td text-right">{money(b.cashInHand)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <h2 className="mb-2 text-sm font-semibold text-slate-600">Pending Treasury Approval</h2>
      <TopUpList rows={pending} ctx="treasury" />

      <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-600">Approved - Awaiting Release</h2>
      <TopUpList rows={toRelease} ctx="treasury" />

      <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-600">History</h2>
      <TopUpList rows={history} ctx="treasury" />
      <Pagination meta={historyMeta} />
    </div>
  );
}
