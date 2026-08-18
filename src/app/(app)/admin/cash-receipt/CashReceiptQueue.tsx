"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { EnrichedRequest } from "@/lib/requests";
import { money, formatDate } from "@/lib/util";
import { formatCashReceiverDisplay } from "@/lib/supervisorCashReceiverShared";
import StatusBadge from "@/components/StatusBadge";
import { EmptyState } from "@/components/page-chrome";

export default function CashReceiptQueue({
  rows,
  emptyMessage,
}: {
  rows: EnrichedRequest[];
  emptyMessage: string;
}) {
  if (rows.length === 0) return <EmptyState message={emptyMessage} />;

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <CashReceiptRow key={r.id} request={r} />
      ))}
    </div>
  );
}

function CashReceiptRow({ request }: { request: EnrichedRequest }) {
  const router = useRouter();
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const amount = money(
    request.paid_amount ?? request.approved_amount ?? request.requested_amount,
    request.currency
  );
  const receiver = formatCashReceiverDisplay(
    request.receiver_name,
    request.cash_receiver_label
  );
  const receiverUnlinked = !request.cash_receiver_user_id && Boolean(request.cash_receiver_label?.trim());

  async function confirm() {
    const note = remarks.trim();
    if (!note) {
      setError("Remarks are required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/requests/${request.id}/confirm-receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remarks: note }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Confirmation failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/requests/${request.id}`}
              className="font-semibold text-primary hover:underline"
            >
              {request.request_no}
            </Link>
            <StatusBadge status={request.status} />
          </div>
          <p className="text-sm text-slate-600">
            {request.branch_name} · {request.request_type === "exact" ? "Exact" : "Suspense"} ·{" "}
            {request.category_name}
          </p>
          <p className="text-sm text-slate-600">
            By <span className="font-medium text-slate-800">{request.submitted_by_name}</span>
            {" · "}
            Receiver <span className="font-medium text-slate-800">{receiver}</span>
          </p>
          {receiverUnlinked && (
            <p className="text-xs text-amber-800">
              Receiver was typed by name only — the messenger may not see this on their Confirm list.
            </p>
          )}
          {request.paid_at && (
            <p className="text-xs text-slate-500">Paid / issued {formatDate(request.paid_at)}</p>
          )}
        </div>
        <p className="text-lg font-bold text-slate-800">{amount}</p>
      </div>

      <div>
        <label className="label" htmlFor={`remarks-${request.id}`}>
          Remarks (required)
        </label>
        <textarea
          id={`remarks-${request.id}`}
          className="input"
          rows={2}
          placeholder="e.g. Confirmed with messenger by phone — cash handed over at Dubai office"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          disabled={busy}
        />
      </div>

      {error && (
        <p className="border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      <button
        type="button"
        className="btn-success w-full sm:w-auto"
        disabled={busy}
        onClick={confirm}
      >
        {busy ? "Confirming…" : `Confirm cash received (${amount})`}
      </button>
    </div>
  );
}
