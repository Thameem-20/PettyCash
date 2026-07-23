import Link from "next/link";
import { requireRole } from "@/lib/session";
import { countRequestsWhere, getRequestsWhere } from "@/lib/requests";
import { PageHeader } from "@/components/page-chrome";
import RequestTable from "@/components/RequestTable";
import Tabs from "@/components/Tabs";
import Pagination from "@/components/Pagination";
import { EXACT_STATUS, SUSPENSE_STATUS } from "@/lib/status";
import { PAGE_SIZE, pageMeta, pageOffset, parsePage } from "@/lib/pagination";
import { money, formatDate } from "@/lib/util";

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
    where = isAdmin
      ? `r.status IN (${phPending})`
      : `r.status IN (${phPending}) AND (r.supervisor_id = ? OR r.supervisor_id IS NULL)`;
    params = isAdmin ? [...pendingStatuses] : [...pendingStatuses, session.id];
    order = "r.created_at ASC";
    emptyMessage = "No requests pending your approval.";
  } else if (tab === "approved") {
    where = isAdmin
      ? `r.approved_at IS NOT NULL AND r.status NOT IN (?, ?, ?, ?)`
      : `r.supervisor_id = ? AND r.approved_at IS NOT NULL AND r.status NOT IN (?, ?, ?, ?)`;
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
      : `r.supervisor_id = ? AND r.status IN (?, ?)`;
    params = isAdmin
      ? [EXACT_STATUS.REJECTED, SUSPENSE_STATUS.REJECTED]
      : [session.id, EXACT_STATUS.REJECTED, SUSPENSE_STATUS.REJECTED];
    order = "r.updated_at DESC";
    emptyMessage = "No rejected requests.";
  } else if (tab === "returned") {
    where = isAdmin
      ? `r.status IN (?, ?)`
      : `r.supervisor_id = ? AND r.status IN (?, ?)`;
    params = isAdmin
      ? [EXACT_STATUS.RETURNED, SUSPENSE_STATUS.RETURNED]
      : [session.id, EXACT_STATUS.RETURNED, SUSPENSE_STATUS.RETURNED];
    order = "r.updated_at DESC";
    emptyMessage = "No requests returned for correction.";
  }

  const confirmWhere = "r.cash_receiver_user_id = ? AND r.status IN (?, ?)";
  const confirmParams = [
    session.id,
    EXACT_STATUS.AWAITING_RECEIVER,
    SUSPENSE_STATUS.AWAITING_CASH_RECEIPT,
  ];

  const [total, confirmTotal] = await Promise.all([
    countRequestsWhere(where, params),
    countRequestsWhere(confirmWhere, confirmParams),
  ]);
  const meta = pageMeta(total, parsePage(searchParams.page));
  const [rows, confirmRows] = await Promise.all([
    getRequestsWhere(where, params, order, {
      limit: PAGE_SIZE,
      offset: pageOffset(meta.page),
    }),
    confirmTotal > 0
      ? getRequestsWhere(confirmWhere, confirmParams, "r.created_at ASC", {
          limit: 8,
          offset: 0,
        })
      : Promise.resolve([]),
  ]);

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

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <RequestTable rows={rows} emptyMessage={emptyMessage} />
          <Pagination meta={meta} />
        </div>

        <aside className="w-full shrink-0 lg:sticky lg:top-24 lg:w-80">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Confirm cash received</p>
                <p className="text-xs text-slate-500">
                  Ops / others named you as cash receiver
                </p>
              </div>
              {confirmTotal > 0 && (
                <span className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-rose-600 px-1.5 text-xs font-bold text-white">
                  {confirmTotal > 99 ? "99+" : confirmTotal}
                </span>
              )}
            </div>

            {confirmTotal === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">
                Nothing awaiting your cash confirmation.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {confirmRows.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/requests/${r.id}`}
                      className="block px-4 py-3 transition-colors hover:bg-slate-50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800">{r.request_no}</p>
                        <p className="shrink-0 text-sm font-medium text-brand-700">
                          {money(r.paid_amount ?? r.approved_amount ?? r.requested_amount)}
                        </p>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {r.submitted_by_name}
                        {r.branch_name ? ` · ${r.branch_name}` : ""}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">{formatDate(r.created_at)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <div className="border-t border-slate-200 px-4 py-3">
              <Link href="/confirm" className="text-xs font-semibold text-brand-700 hover:underline">
                Open full Confirm Cash list →
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
