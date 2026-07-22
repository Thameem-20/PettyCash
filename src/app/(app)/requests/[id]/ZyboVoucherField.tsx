"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EnrichedRequest } from "@/lib/requests";
import type { SessionUser } from "@/lib/types";
import { zyboVoucherPreview } from "@/lib/zyboVoucher";

export default function ZyboVoucherField({
  request,
  session,
  accountsBranchIds,
  branchSegment,
}: {
  request: EnrichedRequest;
  session: SessionUser;
  accountsBranchIds: number[];
  branchSegment: string;
}) {
  const router = useRouter();
  const isAccountsRole =
    session.role === "accounts" ||
    session.role === "accounts_supervisor" ||
    session.role === "admin";
  const hasBranchAccess =
    session.role === "accounts_supervisor" ||
    session.role === "admin" ||
    accountsBranchIds.includes(request.branch_id);

  const [suffix, setSuffix] = useState(request.zybo_voucher_suffix ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const preview = useMemo(() => zyboVoucherPreview(branchSegment, suffix), [branchSegment, suffix]);

  if (!isAccountsRole || !hasBranchAccess) {
    if (!request.zybo_voucher_code) return null;
    return (
      <div className="card mt-4 p-4">
        <p className="label">Zybo Voucher Code</p>
        <p className="font-mono text-sm font-semibold text-brand-800">{request.zybo_voucher_code}</p>
      </div>
    );
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/requests/${request.id}/zybo-voucher`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suffix }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Could not save voucher code");
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
    <div className="card mt-4 space-y-3 p-4">
      <div>
        <p className="label">Zybo Voucher Code</p>
        <p className="text-xs text-slate-500">
          Enter digits only. Full code format: PC-branch-year-number (e.g. PC-101-26-2554).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm text-brand-800">{preview}</span>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="w-32">
          <label className="label">Voucher digits</label>
          <input
            className="input font-mono tracking-widest"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="2554"
            value={suffix}
            onChange={(e) => setSuffix(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <button
          type="button"
          className="btn-primary"
          disabled={busy || !suffix.trim()}
          onClick={save}
        >
          {request.zybo_voucher_code ? "Update" : "Save"}
        </button>
      </div>

      {request.zybo_voucher_code && (
        <p className="text-xs text-slate-500">
          Saved: <span className="font-mono font-medium text-slate-700">{request.zybo_voucher_code}</span>
        </p>
      )}

      {error && <p className="text-sm text-rose-700">{error}</p>}
    </div>
  );
}
