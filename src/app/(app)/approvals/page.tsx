import { requireRole } from "@/lib/session";
import { countRequestsWhere, getRequestsWhere } from "@/lib/requests";
import { PageHeader } from "@/components/page-chrome";
import RequestTable from "@/components/RequestTable";
import Tabs from "@/components/Tabs";
import Pagination from "@/components/Pagination";
import { EXACT_STATUS, SUSPENSE_STATUS } from "@/lib/status";
import { PAGE_SIZE, pageMeta, pageOffset, parsePage } from "@/lib/pagination";
import {
  supervisorActionExistsSql,
  supervisorApprovedExistsSql,
} from "@/lib/supervisorScope";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "returned", label: "Returned" },
];

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: { tab?: string; page?: string };
}) {
  const session = await requireRole(["supervisor", "admin"]);
  const tab = searchParams.tab || "pending";
  const isAdmin = session.role === "admin";

  const pendingStatuses = [EXACT_STATUS.PENDING_SUPERVISOR, SUSPENSE_STATUS.PENDING_SUPERVISOR];
  const phPending = pendingStatuses.map(() => "?").join(",");

  let where = "";
  let params: unknown[] = [];
  let order = "r.created_at DESC";
  let emptyMessage = "No requests found.";

  if (tab === "pending") {
    // Only requests assigned to this supervisor — not unassigned / accounts self-routes.
    where = isAdmin
      ? `r.status IN (${phPending})`
      : `r.status IN (${phPending}) AND r.supervisor_id = ?`;
    params = isAdmin ? [...pendingStatuses] : [...pendingStatuses, session.id];
    order = "r.created_at ASC";
    emptyMessage = "No requests pending your approval.";
  } else if (tab === "approved") {
    // Only requests this supervisor actually approved (not accounts-direct / self routes).
    where = isAdmin
      ? `r.approved_at IS NOT NULL AND r.status NOT IN (?, ?, ?, ?)`
      : `${supervisorApprovedExistsSql("r")} AND r.status NOT IN (?, ?, ?, ?)`;
    params = isAdmin
      ? [
          EXACT_STATUS.PENDING_SUPERVISOR,
          SUSPENSE_STATUS.PENDING_SUPERVISOR,
          EXACT_STATUS.REJECTED,
          SUSPENSE_STATUS.REJECTED,
        ]
      : [
          session.id,
          EXACT_STATUS.PENDING_SUPERVISOR,
          SUSPENSE_STATUS.PENDING_SUPERVISOR,
          EXACT_STATUS.REJECTED,
          SUSPENSE_STATUS.REJECTED,
        ];
    order = "r.approved_at DESC";
    emptyMessage = "No approved requests yet.";
  } else if (tab === "rejected") {
    where = isAdmin
      ? `r.status IN (?, ?)`
      : `${supervisorActionExistsSql(["reject"], "r")} AND r.status IN (?, ?)`;
    params = isAdmin
      ? [EXACT_STATUS.REJECTED, SUSPENSE_STATUS.REJECTED]
      : [session.id, "reject", EXACT_STATUS.REJECTED, SUSPENSE_STATUS.REJECTED];
    order = "r.updated_at DESC";
    emptyMessage = "No rejected requests.";
  } else if (tab === "returned") {
    where = isAdmin
      ? `r.status IN (?, ?)`
      : `${supervisorActionExistsSql(["return"], "r")} AND r.status IN (?, ?)`;
    params = isAdmin
      ? [EXACT_STATUS.RETURNED, SUSPENSE_STATUS.RETURNED]
      : [session.id, "return", EXACT_STATUS.RETURNED, SUSPENSE_STATUS.RETURNED];
    order = "r.updated_at DESC";
    emptyMessage = "No requests returned for correction.";
  }

  const total = await countRequestsWhere(where, params);
  const meta = pageMeta(total, parsePage(searchParams.page));
  const rows = await getRequestsWhere(where, params, order, {
    limit: PAGE_SIZE,
    offset: pageOffset(meta.page),
  });

  const subtitles: Record<string, string> = {
    pending: "Approve, reject or return requests for correction",
    approved: "Requests you approved — track progress through accounts and payment",
    rejected: "Requests you rejected",
    returned: "Requests returned to the submitter for correction",
  };

  return (
    <div>
      <PageHeader title="Approvals" subtitle={subtitles[tab] || subtitles.pending} />
      <Tabs tabs={TABS} current={tab} />
      <RequestTable rows={rows} emptyMessage={emptyMessage} />
      <Pagination meta={meta} />
    </div>
  );
}
