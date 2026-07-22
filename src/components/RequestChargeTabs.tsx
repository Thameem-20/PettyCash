"use client";

import { useState } from "react";
import { money } from "@/lib/util";
import ReceiptPreview from "@/components/ReceiptPreview";
import type { RequestCharge } from "@/lib/requests";

type ChargeReceipt = {
  id: number;
  charge_id: number | null;
  file_name: string;
  mime_type: string | null;
  receipt_type: string;
};

export default function RequestChargeTabs({
  charges,
  receipts,
  currency,
  showJob,
}: {
  charges: RequestCharge[];
  receipts: ChargeReceipt[];
  currency: string;
  showJob: boolean;
}) {
  const [active, setActive] = useState(0);

  if (charges.length === 0) return null;

  const charge = charges[Math.min(active, charges.length - 1)];
  const chargeReceipts = receipts.filter(
    (r) => r.receipt_type === "request" && r.charge_id === charge.id
  );
  // Legacy receipts with no charge_id: show on first tab only
  const legacyReceipts =
    active === 0
      ? receipts.filter((r) => r.receipt_type === "request" && r.charge_id == null)
      : [];
  const shownReceipts = [...chargeReceipts, ...legacyReceipts];
  const settlementReceipts = receipts.filter((r) => r.receipt_type === "settlement");

  return (
    <div className="card mt-4 overflow-hidden">
      {charges.length > 1 && (
        <div className="flex gap-0 overflow-x-auto border-b border-border bg-muted/50">
          {charges.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActive(i)}
              className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                i === active
                  ? "border-primary bg-background text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-3 p-4">
        {charges.length > 1 && (
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Charge {active + 1} of {charges.length}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {showJob && charge.job_number && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Job Number</p>
              <p className="mt-0.5 text-sm font-medium text-slate-700">{charge.job_number}</p>
            </div>
          )}
          {charge.truck_number && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Truck Number</p>
              <p className="mt-0.5 text-sm font-medium text-slate-700">{charge.truck_number}</p>
            </div>
          )}
          {charge.trailer_number && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Trailer Number</p>
              <p className="mt-0.5 text-sm font-medium text-slate-700">{charge.trailer_number}</p>
            </div>
          )}
          {charge.driver_name && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Driver</p>
              <p className="mt-0.5 text-sm font-medium text-slate-700">{charge.driver_name}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {charge.actual_amount != null ? "Requested Amount" : "Amount"}
            </p>
            <p className="mt-0.5 text-sm font-medium text-slate-700">{money(charge.amount, currency)}</p>
          </div>
          {charge.actual_amount != null && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Actual Expense</p>
              <p className="mt-0.5 text-sm font-medium text-slate-700">
                {money(charge.actual_amount, currency)}
              </p>
            </div>
          )}
          {charge.category_name && !charge.truck_number && !charge.trailer_number && (
            <div className="sm:col-span-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Category</p>
              <p className="mt-0.5 text-sm font-medium text-slate-700">{charge.category_name}</p>
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Description</p>
          <p className="mt-0.5 text-sm text-slate-700">{charge.description}</p>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Receipts</p>
          {shownReceipts.length === 0 ? (
            <p className="text-sm text-slate-400">No receipts for this charge.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {shownReceipts.map((rc) => (
                <ReceiptPreview
                  key={rc.id}
                  id={rc.id}
                  fileName={rc.file_name}
                  mimeType={rc.mime_type}
                  compact
                />
              ))}
            </div>
          )}
        </div>

        {settlementReceipts.length > 0 && active === 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              Settlement Receipts
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {settlementReceipts.map((rc) => (
                <ReceiptPreview
                  key={rc.id}
                  id={rc.id}
                  fileName={rc.file_name}
                  mimeType={rc.mime_type}
                  compact
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
