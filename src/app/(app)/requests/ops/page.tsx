import { Suspense } from "react";
import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import { countRequestsWhere, getRequestsWhere } from "@/lib/requests";
import { PageHeader } from "@/components/page-chrome";
import RequestTable from "@/components/RequestTable";
import OpsPersonFilter from "@/components/OpsPersonFilter";
import Pagination from "@/components/Pagination";
import { PAGE_SIZE, pageMeta, pageOffset, parsePage } from "@/lib/pagination";

export const dynamic = "force-dynamic";

async function getActiveOpsUsers() {
  return query<{ id: number; name: string }>(
    "SELECT id, name FROM users WHERE is_active = 1 AND role = 'operations' ORDER BY name"
  );
}

export default async function OpsRequestsPage({
  searchParams,
}: {
  searchParams: { ops?: string; page?: string };
}) {
  const session = await requireRole(["messenger", "cash_requester"]);

  const opsUsers = await getActiveOpsUsers();
  const opsParam = searchParams.ops?.trim();
  const opsId = opsParam && /^\d+$/.test(opsParam) ? Number(opsParam) : null;
  const validOpsId =
    opsId != null && opsUsers.some((u) => u.id === opsId) ? opsId : null;

  const where =
    validOpsId != null
      ? "r.cash_receiver_user_id = ? AND su.role = 'operations' AND r.submitted_by_user_id = ?"
      : "r.cash_receiver_user_id = ? AND su.role = 'operations'";
  const params =
    validOpsId != null ? [session.id, validOpsId] : [session.id];

  const total = await countRequestsWhere(where, params);
  const meta = pageMeta(total, parsePage(searchParams.page));
  const rows = await getRequestsWhere(where, params, "r.created_at DESC", {
    limit: PAGE_SIZE,
    offset: pageOffset(meta.page),
  });

  return (
    <div>
      <PageHeader
        title="Ops Requests"
        subtitle="Requests submitted by operations and assigned to you as cash receiver"
        actions={
          <Suspense fallback={<div className="input h-10 w-full animate-pulse bg-slate-100 sm:w-48" />}>
            <OpsPersonFilter users={opsUsers} currentOpsId={validOpsId} />
          </Suspense>
        }
      />
      <RequestTable
        rows={rows}
        mobilePrimary="submitter"
        emptyMessage={
          validOpsId
            ? "No ops requests from this person assigned to you."
            : "No ops requests assigned to you yet."
        }
      />
      <Pagination meta={meta} />
    </div>
  );
}
