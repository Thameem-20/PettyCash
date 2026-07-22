import Link from "next/link";
import { EnrichedRequest } from "@/lib/requests";
import { money, formatDate } from "@/lib/util";
import StatusBadge from "./StatusBadge";
import { EmptyState } from "./page-chrome";
import ClickableTableRow from "./ClickableTableRow";
import PaymentReceiptDownloadButton from "./PaymentReceiptDownloadButton";

function isCompassionRequest(r: EnrichedRequest) {
  return (
    r.charge_type === "truck_trailer" ||
    r.charge_type === "general" ||
    r.branch_code === "COMP"
  );
}

function chargeTypeLabel(r: EnrichedRequest) {
  if (r.charge_type === "truck_trailer") return "Truck / Trailer";
  if (r.charge_type === "general") return "General";
  if (r.request_type === "exact") return "Exact";
  return "Suspense";
}

export default function RequestTable({
  rows,
  emptyMessage = "No requests found.",
  showBranch = true,
  dateField = "created_at",
  dateLabel = "Date",
  usePaidAmount = false,
  useReturnedAmount = false,
  amountLabel = "Amount",
  mobilePrimary = "request_no",
  showPaymentReceiptDownload = false,
  canDownloadPaymentReceipt,
}: {
  rows: EnrichedRequest[];
  emptyMessage?: string;
  showBranch?: boolean;
  dateField?: "created_at" | "paid_at";
  dateLabel?: string;
  usePaidAmount?: boolean;
  /** Show returned_amount (Returned Cash tab). */
  useReturnedAmount?: boolean;
  amountLabel?: string;
  mobilePrimary?: "request_no" | "submitter";
  showPaymentReceiptDownload?: boolean;
  canDownloadPaymentReceipt?: (r: EnrichedRequest) => boolean;
}) {
  if (rows.length === 0) return <EmptyState message={emptyMessage} />;

  const compassionMode = rows.some(isCompassionRequest);

  function displayRequestNo(r: EnrichedRequest) {
    return r.closed_request_no || r.request_no;
  }

  function displayAmount(r: EnrichedRequest) {
    if (useReturnedAmount && r.returned_amount != null) {
      return money(r.returned_amount, r.currency);
    }
    if (
      r.request_type === "suspense" &&
      r.closed_request_no &&
      r.actual_expense_amount != null
    ) {
      return money(r.actual_expense_amount, r.currency);
    }
    if (usePaidAmount && r.paid_amount != null) {
      return money(r.paid_amount, r.currency);
    }
    return money(r.approved_amount ?? r.requested_amount, r.currency);
  }

  function displayDate(r: EnrichedRequest) {
    const raw = dateField === "paid_at" ? r.paid_at : r.created_at;
    return raw ? formatDate(raw) : "-";
  }

  return (
    <>
      <div className="card hidden overflow-x-auto md:block">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted/50">
            <tr>
              <th className="th">Request No</th>
              <th className="th">Type</th>
              {compassionMode ? (
                <>
                  <th className="th">Truck</th>
                  <th className="th">Trailer</th>
                  <th className="th">Driver</th>
                </>
              ) : (
                <th className="th">Category</th>
              )}
              {showBranch && <th className="th">Branch</th>}
              <th className="th">By / Receiver</th>
              <th className="th text-right">{amountLabel}</th>
              <th className="th">Status</th>
              <th className="th">{dateLabel}</th>
              {showPaymentReceiptDownload && <th className="th text-right">Receipt</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <ClickableTableRow key={r.id} href={`/requests/${r.id}`}>
                <td className="td font-medium text-primary">{displayRequestNo(r)}</td>
                <td className="td">
                  {compassionMode
                    ? chargeTypeLabel(r)
                    : r.request_type === "exact"
                      ? "Exact"
                      : "Suspense"}
                </td>
                {compassionMode ? (
                  <>
                    <td className="td">{r.truck_numbers || "-"}</td>
                    <td className="td">{r.trailer_numbers || "-"}</td>
                    <td className="td">{r.driver_names || "-"}</td>
                  </>
                ) : (
                  <td className="td">{r.category_name}</td>
                )}
                {showBranch && <td className="td">{r.branch_name}</td>}
                <td className="td">
                  <span className="block">{r.submitted_by_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.receiver_name || r.cash_receiver_label || "-"}
                  </span>
                </td>
                <td className="td text-right font-medium">{displayAmount(r)}</td>
                <td className="td">
                  <StatusBadge status={r.status} />
                </td>
                <td className="td whitespace-nowrap text-xs text-muted-foreground">{displayDate(r)}</td>
                {showPaymentReceiptDownload &&
                  (canDownloadPaymentReceipt ? canDownloadPaymentReceipt(r) : true) && (
                  <td className="td text-right">
                    <PaymentReceiptDownloadButton requestId={r.id} />
                  </td>
                )}
              </ClickableTableRow>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-1.5 md:hidden">
        {rows.map((r) => {
          const requestNo = displayRequestNo(r);
          const heading =
            mobilePrimary === "submitter" ? r.submitted_by_name : requestNo;
          const metaLeft =
            mobilePrimary === "submitter"
              ? requestNo
              : showBranch
                ? r.branch_name
                : r.submitted_by_name;
          const secondary = compassionMode
            ? [r.truck_numbers, r.trailer_numbers, r.driver_names].filter(Boolean).join(" · ") ||
              chargeTypeLabel(r)
            : r.category_name;

          return (
            <div key={r.id} className="card p-2.5">
              <Link href={`/requests/${r.id}`} className="block">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-xs font-medium text-primary">{heading}</span>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mt-0.5 flex items-center justify-between text-xs">
                  <span className="min-w-0 truncate text-muted-foreground">{secondary}</span>
                  <span className="shrink-0 font-semibold">{displayAmount(r)}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="min-w-0 truncate">{metaLeft}</span>
                  <span className="shrink-0">{displayDate(r)}</span>
                </div>
              </Link>
              {showPaymentReceiptDownload &&
                (canDownloadPaymentReceipt ? canDownloadPaymentReceipt(r) : true) && (
                <div className="mt-1.5 border-t border-border pt-1.5">
                  <PaymentReceiptDownloadButton requestId={r.id} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
