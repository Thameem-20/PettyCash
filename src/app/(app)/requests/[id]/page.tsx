import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { queryOne } from "@/lib/db";
import {
  getRequestById,
  getReceipts,
  getApprovals,
  buildRequestActivity,
  canViewRequest,
  accountsBranchIds,
  getJobNumbers,
  getRequestCharges,
  isPaymentReceiptDownloadReady,
} from "@/lib/requests";
import { PageHeader } from "@/components/page-chrome";
import StatusBadge from "@/components/StatusBadge";
import RequestActivity from "@/components/RequestActivity";
import RequestActions from "./RequestActions";
import DeleteRequestPanel from "./DeleteRequestPanel";
import RequestDetailsEditor from "./RequestDetailsEditor";
import { AccountsPaymentProvider } from "./AccountsPaymentBalance";
import RequestPageRefresh from "./RequestPageRefresh";
import ZyboVoucherField from "./ZyboVoucherField";
import PcpJvField from "./PcpJvField";
import PaymentReceiptDownloadButton from "@/components/PaymentReceiptDownloadButton";
import { resolveZyboBranchSegment } from "@/lib/zyboVoucherServer";
import { getBranchBalance } from "@/lib/ledger";
import { shouldShowAccountsBalanceBar } from "@/lib/accountsRequestBalance";
import { CLOSED_STATUSES, EXACT_STATUS, SUSPENSE_STATUS } from "@/lib/status";
import { codingType, getBranchProfile } from "@/lib/branchProfile";
import { listSuspenseReturns } from "@/lib/suspenseReturns";
import { canAccSupAmend } from "@/lib/accSupAmend";
import {
  isRoleSupervisorReceiver,
  syncRoleSupervisorCashReceiverStandalone,
} from "@/lib/supervisorCashReceiver";
import RequestEditButton from "./RequestEditButton";

export const dynamic = "force-dynamic";

export default async function RequestDetailPage({ params }: { params: { id: string } }) {
  const session = await requireSession();
  let req = await getRequestById(Number(params.id));
  if (!req) notFound();
  if (!(await canViewRequest(session, req))) redirect("/dashboard");

  // Role-based supervisor receiver: point confirm at current personal/default supervisor.
  if (
    isRoleSupervisorReceiver(req.cash_receiver_label) &&
    (req.status === EXACT_STATUS.AWAITING_RECEIVER ||
      req.status === SUSPENSE_STATUS.AWAITING_CASH_RECEIPT)
  ) {
    await syncRoleSupervisorCashReceiverStandalone(req);
    req = (await getRequestById(req.id)) || req;
  }

  const receipts = await getReceipts(req.id);
  const jobNumbers = await getJobNumbers(req.id);
  const charges = await getRequestCharges(req.id);
  const suspenseReturns =
    req.request_type === "suspense" ? await listSuspenseReturns(req.id) : [];
  const approvals = await getApprovals(req.id);
  const activity = buildRequestActivity(req, approvals);
  const primary = session.primary_role || session.role;
  const isAccSupViewer =
    session.role === "accounts_supervisor" ||
    primary === "accounts_supervisor" ||
    session.role === "admin" ||
    primary === "admin";
  const paymentLedgerType =
    req.request_type === "exact" ? "exact_paid" : "suspense_issued";
  const orphanLedger =
    isAccSupViewer && req.paid_at == null
      ? await queryOne<{ id: number }>(
          `SELECT id FROM cash_ledger
            WHERE request_id = ? AND transaction_type = ?
            LIMIT 1`,
          [req.id, paymentLedgerType]
        )
      : null;
  const hasOrphanPaymentLedger = Boolean(orphanLedger);
  const accBranchIds = session.role === "accounts" ? await accountsBranchIds(session.id) : [];
  const zyboBranchSegment = await resolveZyboBranchSegment(req.branch_id, jobNumbers[0] ?? req.job_number);
  const branchProfile = await getBranchProfile(req.branch_id);
  const requestCoding = codingType(branchProfile);
  const requestReceipts = receipts.filter((r) => r.receipt_type === "request");
  const isCorrectionBySubmitter =
    req.submitted_by_user_id === session.id &&
    (req.status === EXACT_STATUS.RETURNED || req.status === SUSPENSE_STATUS.RETURNED);

  const showPaymentReceiptDownload =
    ["accounts", "accounts_supervisor", "admin"].includes(session.role) &&
    (session.role === "admin" ||
      session.role === "accounts_supervisor" ||
      accBranchIds.includes(req.branch_id)) &&
    isPaymentReceiptDownloadReady(req);

  const showAccountsBalance = shouldShowAccountsBalanceBar(session, req, accBranchIds);
  const branchCashInHand = showAccountsBalance
    ? (await getBranchBalance(req.branch_id)).cashInHand
    : 0;
  const requestPayload = JSON.parse(JSON.stringify(req)) as typeof req;
  const canEditDetails =
    (session.role === "accounts_supervisor" || session.role === "admin") &&
    canAccSupAmend(req.status);
  const canDeleteRequest =
    (session.role === "accounts_supervisor" || session.role === "admin") &&
    !CLOSED_STATUSES.includes(req.status) &&
    req.paid_at == null &&
    req.paid_amount == null &&
    !hasOrphanPaymentLedger;

  const mainContent = (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10">
        {/* Request info — 70% */}
        <div className="min-w-0 lg:w-[70%]">
          <RequestActions
            request={requestPayload}
            session={session}
            accountsBranchIds={accBranchIds}
            requestReceipts={requestReceipts}
            initialJobNumbers={jobNumbers}
            charges={JSON.parse(JSON.stringify(charges))}
            suspenseReturns={JSON.parse(JSON.stringify(suspenseReturns))}
            hasOrphanPaymentLedger={hasOrphanPaymentLedger}
          />

          <RequestDetailsEditor
            request={requestPayload}
            charges={JSON.parse(JSON.stringify(charges))}
            jobNumbers={jobNumbers}
            receipts={JSON.parse(JSON.stringify(receipts))}
            canEdit={canEditDetails}
            isCorrectionBySubmitter={isCorrectionBySubmitter}
          />

          {req.reject_reason && (
            <div className="mt-4 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <b>Reason:</b> {req.reject_reason}
            </div>
          )}

          {requestCoding === "pcp_jv" ? (
            <PcpJvField
              request={requestPayload}
              session={session}
              accountsBranchIds={accBranchIds}
            />
          ) : requestCoding === "zybo" ? (
            <ZyboVoucherField
              request={requestPayload}
              session={session}
              accountsBranchIds={accBranchIds}
              branchSegment={zyboBranchSegment}
            />
          ) : null}

          {canDeleteRequest && (
            <DeleteRequestPanel requestId={req.id} requestNo={req.request_no} />
          )}
        </div>

        {/* Activity — 30% */}
        <aside className="min-w-0 lg:w-[30%]">
          <RequestActivity items={activity} />
        </aside>
      </div>
  );

  return (
    <div className="mx-auto max-w-7xl">
      <RequestPageRefresh />
      <PageHeader
        backHref="/requests"
        title={req.request_no}
        subtitle={`${req.request_type === "exact" ? "Exact Payment" : "Suspense Advance"} · ${
          charges.length > 1 ? `${charges.length} charges` : req.category_name
        }`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canEditDetails && <RequestEditButton />}
            {showPaymentReceiptDownload && <PaymentReceiptDownloadButton requestId={req.id} />}
            <StatusBadge status={req.status} />
          </div>
        }
      />

      {showAccountsBalance ? (
        <AccountsPaymentProvider request={requestPayload} cashInHand={branchCashInHand}>
          {mainContent}
        </AccountsPaymentProvider>
      ) : (
        mainContent
      )}
    </div>
  );
}
