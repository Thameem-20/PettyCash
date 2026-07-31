import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
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
import { money, formatDate } from "@/lib/util";
import { PageHeader } from "@/components/page-chrome";
import StatusBadge from "@/components/StatusBadge";
import RequestActivity from "@/components/RequestActivity";
import RequestChargeTabs from "@/components/RequestChargeTabs";
import RequestActions from "./RequestActions";
import { AccountsPaymentProvider } from "./AccountsPaymentBalance";
import RequestPageRefresh from "./RequestPageRefresh";
import ZyboVoucherField from "./ZyboVoucherField";
import PcpJvField from "./PcpJvField";
import PaymentReceiptDownloadButton from "@/components/PaymentReceiptDownloadButton";
import { resolveZyboBranchSegment } from "@/lib/zyboVoucherServer";
import { getBranchBalance } from "@/lib/ledger";
import { shouldShowAccountsBalanceBar } from "@/lib/accountsRequestBalance";
import { EXACT_STATUS, SUSPENSE_STATUS } from "@/lib/status";
import { codingType, getBranchProfile } from "@/lib/branchProfile";

export const dynamic = "force-dynamic";

export default async function RequestDetailPage({ params }: { params: { id: string } }) {
  const session = await requireSession();
  const req = await getRequestById(Number(params.id));
  if (!req) notFound();
  if (!(await canViewRequest(session, req))) redirect("/dashboard");

  const receipts = await getReceipts(req.id);
  const jobNumbers = await getJobNumbers(req.id);
  const charges = await getRequestCharges(req.id);
  const approvals = await getApprovals(req.id);
  const activity = buildRequestActivity(req, approvals);
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
  const hasChargeTabs = charges.length > 0 && !isCorrectionBySubmitter;
  const fuelInfo = charges.find(
    (c) =>
      c.vehicle_number != null ||
      c.fuel_from_km != null ||
      c.fuel_to_km != null ||
      c.fuel_liters != null
  );

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
          />

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Detail
              label="Charge Type"
              value={
                req.charge_type === "job"
                  ? "Job Related"
                  : req.charge_type === "non_job"
                    ? "Non Job Related"
                    : req.charge_type === "truck_trailer"
                      ? "Truck / Trailer Related"
                      : req.charge_type === "general"
                        ? "General Charges"
                        : req.charge_type
              }
            />
            {!isCorrectionBySubmitter && (
              <>
                <Detail label="Branch" value={req.branch_name + (req.branch_override ? " (override)" : "")} />
                {!hasChargeTabs && jobNumbers.length > 0 && (
                  <Detail
                    label={jobNumbers.length > 1 ? "Job Numbers" : "Job Number"}
                    value={jobNumbers.join(", ")}
                  />
                )}
                {!hasChargeTabs && req.truck_numbers && !fuelInfo && (
                  <Detail label="Truck Number" value={req.truck_numbers} />
                )}
                {!hasChargeTabs && req.trailer_numbers && (
                  <Detail label="Trailer Number" value={req.trailer_numbers} />
                )}
                {!hasChargeTabs && req.driver_names && (
                  <Detail label="Driver" value={req.driver_names} />
                )}
                {fuelInfo && (
                  <>
                    {(fuelInfo.vehicle_number || fuelInfo.truck_number) && (
                      <Detail
                        label="Vehicle No"
                        value={fuelInfo.vehicle_number || fuelInfo.truck_number || "-"}
                      />
                    )}
                    {fuelInfo.fuel_from_km != null && (
                      <Detail label="From km" value={String(Number(fuelInfo.fuel_from_km))} />
                    )}
                    {fuelInfo.fuel_to_km != null && (
                      <Detail label="To km" value={String(Number(fuelInfo.fuel_to_km))} />
                    )}
                    {fuelInfo.fuel_liters != null && (
                      <Detail label="Liters" value={String(Number(fuelInfo.fuel_liters))} />
                    )}
                  </>
                )}
                {charges.length > 1 && (
                  <Detail label="Charges" value={String(charges.length)} />
                )}
              </>
            )}
            <Detail label="Submitted By" value={req.submitted_by_name} />
            <Detail label="Cash Receiver" value={req.receiver_name || req.cash_receiver_label || "-"} />
            <Detail label="Submitted On" value={formatDate(req.created_at)} />
            {!isCorrectionBySubmitter && (
              <Detail
                label={charges.length > 1 ? "Total Requested" : "Requested Amount"}
                value={money(req.requested_amount, req.currency)}
              />
            )}
            {req.approved_amount != null && (
              <Detail label="Approved Amount" value={money(req.approved_amount, req.currency)} />
            )}
            {req.paid_amount != null && <Detail label="Paid Amount" value={money(req.paid_amount, req.currency)} />}
            {req.closed_request_no && (
              <Detail label="Closed Suspense No" value={req.closed_request_no} />
            )}
            {req.actual_expense_amount != null && (
              <Detail label="Actual Expense" value={money(req.actual_expense_amount, req.currency)} />
            )}
            {req.returned_amount != null && (
              <Detail label="Returned Amount" value={money(req.returned_amount, req.currency)} />
            )}
            {req.additional_paid_amount != null && Number(req.additional_paid_amount) > 0 && (
              <Detail label="Additional Paid" value={money(req.additional_paid_amount, req.currency)} />
            )}
            {req.processing_by_name && <Detail label="Processing By" value={req.processing_by_name} />}
          </div>

          {fuelInfo && (fuelInfo.vehicle_label || fuelInfo.vehicle_number || fuelInfo.truck_number) && (
            <p className="mt-4 border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Vehicle
              {(fuelInfo.vehicle_number || fuelInfo.truck_number) && (
                <>
                  : <b>{fuelInfo.vehicle_number || fuelInfo.truck_number}</b>
                </>
              )}
              {fuelInfo.vehicle_label && (
                <>
                  {(fuelInfo.vehicle_number || fuelInfo.truck_number) ? " · " : ": "}
                  <b>{fuelInfo.vehicle_label}</b>
                </>
              )}
            </p>
          )}

          {hasChargeTabs ? (
            <RequestChargeTabs
              charges={JSON.parse(JSON.stringify(charges))}
              receipts={JSON.parse(JSON.stringify(receipts))}
              currency={req.currency}
              showJob={req.charge_type === "job"}
            />
          ) : (
            !isCorrectionBySubmitter &&
            req.description && (
              <div className="card mt-4 p-4">
                <p className="label">Description</p>
                <p className="text-sm whitespace-pre-line text-slate-700">{req.description}</p>
              </div>
            )
          )}

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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-700">{value}</p>
    </div>
  );
}
