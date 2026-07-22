"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EnrichedRequest } from "@/lib/requests";
import type { SessionUser } from "@/lib/types";

export default function PcpJvField({
  request,
  session,
  accountsBranchIds,
}: {
  request: EnrichedRequest;
  session: SessionUser;
  accountsBranchIds: number[];
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

  const [pcp, setPcp] = useState(request.pcp_number ?? "");
  const [jv, setJv] = useState(request.jv_number ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!isAccountsRole || !hasBranchAccess) {
    if (!request.pcp_number && !request.jv_number) return null;
    return (
      <div className="card mt-4 space-y-2 p-4">
        <p className="label">PCP / JV</p>
        <p className="text-sm text-slate-700">
          PCP: <span className="font-mono font-semibold text-brand-800">{request.pcp_number || "-"}</span>
        </p>
        <p className="text-sm text-slate-700">
          JV: <span className="font-mono font-semibold text-brand-800">{request.jv_number || "-"}</span>
        </p>
      </div>
    );
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/requests/${request.id}/pcp-jv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pcp_number: pcp, jv_number: jv }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Could not save PCP / JV");
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
        <p className="label">PCP / JV</p>
        <p className="text-xs text-slate-500">
          Compassion payments use PCP number and JV instead of Zybo voucher code.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="w-40">
          <label className="label">PCP number</label>
          <input
            className="input font-mono"
            placeholder="PCP…"
            value={pcp}
            onChange={(e) => setPcp(e.target.value)}
          />
        </div>
        <div className="w-40">
          <label className="label">JV</label>
          <input
            className="input font-mono"
            placeholder="JV…"
            value={jv}
            onChange={(e) => setJv(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="btn-primary"
          disabled={busy || !pcp.trim() || !jv.trim()}
          onClick={save}
        >
          {request.pcp_number || request.jv_number ? "Update" : "Save"}
        </button>
      </div>

      {(request.pcp_number || request.jv_number) && (
        <p className="text-xs text-slate-500">
          Saved:{" "}
          <span className="font-mono font-medium text-slate-700">
            PCP {request.pcp_number || "-"} · JV {request.jv_number || "-"}
          </span>
        </p>
      )}

      {error && <p className="text-sm text-rose-700">{error}</p>}
    </div>
  );
}
