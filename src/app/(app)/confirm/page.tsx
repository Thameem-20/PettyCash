import { requireRole } from "@/lib/session";
import { countRequestsWhere, getRequestsWhere } from "@/lib/requests";
import { PageHeader } from "@/components/page-chrome";
import RequestTable from "@/components/RequestTable";
import RefreshButton from "@/components/RefreshButton";
import Pagination from "@/components/Pagination";
import { EXACT_STATUS, SUSPENSE_STATUS } from "@/lib/status";
import { PAGE_SIZE, pageMeta, pageOffset, parsePage } from "@/lib/pagination";
import { syncAwaitingRoleSupervisorReceivers } from "@/lib/supervisorCashReceiver";

export const dynamic = "force-dynamic";

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const session = await requireRole([
    "cash_requester",
    "messenger",
    "operations",
    "supervisor",
    "accounts",
    "accounts_supervisor",
    "admin",
  ]);
  await syncAwaitingRoleSupervisorReceivers();
  const where = "r.cash_receiver_user_id = ? AND r.status IN (?, ?)";
  const params = [session.id, EXACT_STATUS.AWAITING_RECEIVER, SUSPENSE_STATUS.AWAITING_CASH_RECEIPT];
  const total = await countRequestsWhere(where, params);
  const meta = pageMeta(total, parsePage(searchParams.page));
  const rows = await getRequestsWhere(where, params, "r.created_at DESC", {
    limit: PAGE_SIZE,
    offset: pageOffset(meta.page),
  });

  return (
    <div>
      <PageHeader
        title="Pending Confirmation"
        subtitle="Confirm cash you have received, including jobs from other branches."
        actions={<span className="md:hidden"><RefreshButton /></span>}
      />
      <RequestTable
        rows={rows}
        showBranch
        emptyMessage="Nothing awaiting your confirmation."
      />
      <Pagination meta={meta} />
    </div>
  );
}
