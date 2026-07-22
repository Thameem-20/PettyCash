"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EnrichedTopUp } from "@/lib/topup";
import { money, formatDate } from "@/lib/util";
import StatusBadge from "./StatusBadge";
import TopUpAttachment from "./TopUpAttachment";
import { EmptyState } from "./page-chrome";
import { TOPUP_STATUS } from "@/lib/status";

type Ctx = "accounts" | "accsup" | "treasury";

export default function TopUpList({ rows, ctx }: { rows: EnrichedTopUp[]; ctx: Ctx }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function act(id: number, path: string, body: Record<string, unknown> = {}) {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/topup/${id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!d.ok) setError(d.error || "Action failed");
      else router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) return <EmptyState message="No top-up requests." />;

  return (
    <div className="space-y-2">
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {rows.map((t) => (
        <div key={t.id} className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-medium text-slate-800">{t.top_up_no}</span>
              <span className="ml-2 text-sm text-slate-500">{t.branch_name}</span>
            </div>
            <StatusBadge status={t.status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-slate-600">
              {money(t.amount)} · by {t.requested_by_name} · {formatDate(t.created_at)}
            </span>
          </div>
          {t.reason && <p className="mt-1 text-sm text-slate-500">Reason: {t.reason}</p>}
          {t.cp_number && <p className="mt-1 text-sm text-slate-600">CP No: {t.cp_number}</p>}
          {t.payment_source && (
            <p className="mt-1 text-sm text-slate-600">
              Payment source:{" "}
              {t.payment_source === "bank_account"
                ? `Bank Account${t.bank_account_label ? ` — ${t.bank_account_label}` : ""}`
                : "Cash"}
            </p>
          )}
          {t.comments && <p className="mt-1 text-xs text-slate-400">Note: {t.comments}</p>}

          {t.attachment_url && (
            <TopUpAttachment topUpId={t.id} mime={t.attachment_mime} name={t.attachment_name} />
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {ctx === "accsup" && t.status === TOPUP_STATUS.PENDING_ACC_SUP && (
              <>
                <button className="btn-success" disabled={busyId === t.id} onClick={() => act(t.id, "acc-sup", { action: "approve" })}>
                  Approve
                </button>
                <RejectBtn onReject={(c) => act(t.id, "acc-sup", { action: "reject", comments: c })} disabled={busyId === t.id} />
              </>
            )}
            {ctx === "treasury" && t.status === TOPUP_STATUS.PENDING_TREASURY && (
              <>
                <button className="btn-success" disabled={busyId === t.id} onClick={() => act(t.id, "treasury", { action: "approve" })}>
                  Approve
                </button>
                <RejectBtn onReject={(c) => act(t.id, "treasury", { action: "reject", comments: c })} disabled={busyId === t.id} />
              </>
            )}
            {ctx === "treasury" && t.status === TOPUP_STATUS.TREASURY_APPROVED && (
              <button className="btn-primary" disabled={busyId === t.id} onClick={() => act(t.id, "release")}>
                Mark Cash Released
              </button>
            )}
            {ctx === "accounts" && t.status === TOPUP_STATUS.CASH_RELEASED && (
              <button className="btn-success" disabled={busyId === t.id} onClick={() => act(t.id, "receive")}>
                Confirm Cash Received
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function RejectBtn({ onReject, disabled }: { onReject: (c: string) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open)
    return (
      <button className="btn-danger" disabled={disabled} onClick={() => setOpen(true)}>
        Reject
      </button>
    );
  return (
    <div className="flex w-full gap-2">
      <input className="input" placeholder="Rejection reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button
        className="btn-danger"
        disabled={disabled || !reason.trim()}
        onClick={() => onReject(reason.trim())}
      >
        Confirm
      </button>
    </div>
  );
}
