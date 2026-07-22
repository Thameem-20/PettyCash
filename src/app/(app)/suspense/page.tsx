import { requireRole } from "@/lib/session";
import { countRequestsWhere, getRequestsWhere } from "@/lib/requests";
import { PageHeader } from "@/components/page-chrome";
import RequestTable from "@/components/RequestTable";
import Pagination from "@/components/Pagination";
import { OPEN_SUSPENSE_STATUSES } from "@/lib/status";
import { PAGE_SIZE, pageMeta, pageOffset, parsePage } from "@/lib/pagination";

export const dynamic = "force-dynamic";

export default async function MySuspensePage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const session = await requireRole(["cash_requester", "messenger", "operations", "supervisor", "admin"]);
  const ph = OPEN_SUSPENSE_STATUSES.map(() => "?").join(",");
  const where = `(r.submitted_by_user_id = ? OR r.cash_receiver_user_id = ?) AND r.status IN (${ph})`;
  const params = [session.id, session.id, ...OPEN_SUSPENSE_STATUSES];
  const total = await countRequestsWhere(where, params);
  const meta = pageMeta(total, parsePage(searchParams.page));
  const rows = await getRequestsWhere(where, params, "r.created_at DESC", {
    limit: PAGE_SIZE,
    offset: pageOffset(meta.page),
  });

  return (
    <div>
      <PageHeader
        title="My Open Suspense"
        subtitle="Advances issued to you. Upload final receipt to settle."
      />
      <RequestTable rows={rows} showBranch={false} emptyMessage="You have no open suspense." />
      <Pagination meta={meta} />
    </div>
  );
}
