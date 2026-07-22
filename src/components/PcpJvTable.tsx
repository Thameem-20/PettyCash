"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { money, formatDate } from "@/lib/util";
import { zyboVoucherDueLabel, zyboVoucherDueTone } from "@/lib/zyboVoucher";
import { EmptyState } from "./page-chrome";
import StatusBadge from "./StatusBadge";

export type PcpJvTableRow = {
  id: number;
  request_no: string;
  request_type: "exact" | "suspense";
  branch_name: string;
  submitted_by_name: string;
  receiver_name: string | null;
  cash_receiver_label: string | null;
  paid_at: string;
  paid_amount: number;
  currency: string;
  status: string;
  due_days: number;
};

function DueBadge({ dueDays }: { dueDays: number }) {
  const tone = zyboVoucherDueTone(dueDays);
  const classes =
    tone === "due-today"
      ? "bg-amber-100 text-amber-800"
      : tone === "due-soon"
        ? "bg-orange-100 text-orange-800"
        : "bg-rose-100 text-rose-800";

  return (
    <span className={`inline-block whitespace-nowrap px-2 py-0.5 text-[11px] font-semibold ${classes}`}>
      {zyboVoucherDueLabel(dueDays)}
    </span>
  );
}

function PcpJvEntry({ requestId }: { requestId: number }) {
  const router = useRouter();
  const [pcp, setPcp] = useState("");
  const [jv, setJv] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!pcp.trim() || !jv.trim()) return;

    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/requests/${requestId}/pcp-jv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pcp_number: pcp, jv_number: jv }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Could not save");
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
    <form
      className="min-w-[16rem] space-y-1"
      onSubmit={save}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap items-center gap-1">
        <input
          className="input w-28 px-2 py-1 font-mono text-xs"
          placeholder="PCP"
          value={pcp}
          disabled={busy}
          onChange={(e) => setPcp(e.target.value)}
        />
        <input
          className="input w-28 px-2 py-1 font-mono text-xs"
          placeholder="JV"
          value={jv}
          disabled={busy}
          onChange={(e) => setJv(e.target.value)}
        />
        <button
          type="submit"
          className="btn-primary px-2 py-1 text-[11px]"
          disabled={busy || !pcp.trim() || !jv.trim()}
        >
          {busy ? "…" : "Save"}
        </button>
      </div>
      {error && <p className="text-[10px] text-rose-700">{error}</p>}
    </form>
  );
}

export default function PcpJvTable({
  rows,
  showBranch,
  emptyMessage,
}: {
  rows: PcpJvTableRow[];
  showBranch: boolean;
  emptyMessage: string;
}) {
  if (rows.length === 0) return <EmptyState message={emptyMessage} />;

  return (
    <>
      <div className="card hidden overflow-x-auto md:block">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Due</th>
              <th className="th">Request No</th>
              <th className="th">Type</th>
              {showBranch && <th className="th">Branch</th>}
              <th className="th">By / Receiver</th>
              <th className="th text-right">Amount</th>
              <th className="th">Paid On</th>
              <th className="th">Status</th>
              <th className="th min-w-[18rem]">PCP / JV</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-brand-50/50">
                <td className="td">
                  <DueBadge dueDays={r.due_days} />
                </td>
                <td className="td">
                  <Link href={`/requests/${r.id}`} className="font-medium text-brand-700 hover:underline">
                    {r.request_no}
                  </Link>
                </td>
                <td className="td">{r.request_type === "exact" ? "Exact" : "Suspense"}</td>
                {showBranch && <td className="td">{r.branch_name}</td>}
                <td className="td">
                  <span className="block">{r.submitted_by_name}</span>
                  <span className="text-xs text-slate-400">
                    {r.receiver_name || r.cash_receiver_label || "-"}
                  </span>
                </td>
                <td className="td text-right font-medium">{money(r.paid_amount, r.currency)}</td>
                <td className="td whitespace-nowrap text-xs text-slate-500">{formatDate(r.paid_at)}</td>
                <td className="td">
                  <StatusBadge status={r.status} />
                </td>
                <td className="td align-top">
                  <PcpJvEntry requestId={r.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {rows.map((r) => (
          <div key={r.id} className="card p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <Link href={`/requests/${r.id}`} className="font-semibold text-brand-700">
                {r.request_no}
              </Link>
              <DueBadge dueDays={r.due_days} />
            </div>
            <p className="text-sm text-slate-600">
              {r.request_type === "exact" ? "Exact" : "Suspense"} · {money(r.paid_amount, r.currency)}
            </p>
            {showBranch && <p className="text-xs text-slate-500">{r.branch_name}</p>}
            <p className="text-xs text-slate-500">Paid {formatDate(r.paid_at)}</p>
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="label mb-1">PCP / JV</p>
              <PcpJvEntry requestId={r.id} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
