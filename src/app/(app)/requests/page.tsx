import Link from "next/link";
import { requireSession } from "@/lib/session";
import { countRequestsWhere, getRequestsWhere } from "@/lib/requests";
import { PageHeader } from "@/components/page-chrome";
import RequestTable from "@/components/RequestTable";
import Pagination from "@/components/Pagination";
import { PAGE_SIZE, pageMeta, pageOffset, parsePage } from "@/lib/pagination";
import { isStaffReimbursementRole } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function MyRequestsPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const session = await requireSession();
  const staff = isStaffReimbursementRole(session.role);
  const where = "r.submitted_by_user_id = ? OR r.cash_receiver_user_id = ?";
  const params = [session.id, session.id];
  const total = await countRequestsWhere(where, params);
  const meta = pageMeta(total, parsePage(searchParams.page));
  const rows = await getRequestsWhere(where, params, "r.created_at DESC", {
    limit: PAGE_SIZE,
    offset: pageOffset(meta.page),
  });

  return (
    <div>
      <PageHeader
        title="My Requests"
        subtitle={
          staff
            ? "Your reimbursements — create a new one or track payment and confirmation"
            : "Requests you submitted or are receiving cash for"
        }
        actions={
          <Link href="/requests/new" className="btn-primary">
            + New Request
          </Link>
        }
      />
      <RequestTable
        rows={rows}
        emptyMessage={
          staff
            ? "No reimbursements yet. Use New Request to submit one."
            : "You have not submitted any requests yet."
        }
      />
      <Pagination meta={meta} />
    </div>
  );
}
