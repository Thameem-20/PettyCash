import { requireRole } from "@/lib/session";
import { getTopUpsWhere, countTopUpsWhere } from "@/lib/topup";
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
  await requireRole(["treasury", "admin"]);

  const pending = await getTopUpsWhere("t.status = ?", [TOPUP_STATUS.PENDING_TREASURY]);
  const toRelease = await getTopUpsWhere("t.status = ?", [TOPUP_STATUS.TREASURY_APPROVED]);

  const historyWhere = "t.status NOT IN (?, ?)";
  const historyParams = [TOPUP_STATUS.PENDING_TREASURY, TOPUP_STATUS.TREASURY_APPROVED];
  const historyTotal = await countTopUpsWhere(historyWhere, historyParams);
  const historyMeta = pageMeta(historyTotal, parsePage(searchParams.page));
  const history = await getTopUpsWhere(historyWhere, historyParams, "t.created_at DESC", {
    limit: PAGE_SIZE,
    offset: pageOffset(historyMeta.page),
  });

  const pendingTotal = pending.reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div>
      <PageHeader title="Treasury" subtitle="Approve and release branch top-up requests" />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Pending Approval" value={pending.length} tone="warn" />
        <StatCard label="Awaiting Release" value={toRelease.length} tone="info" />
        <StatCard label="Pending Amount" value={money(pendingTotal)} />
      </div>

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
