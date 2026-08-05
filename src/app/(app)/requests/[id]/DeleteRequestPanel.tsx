"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteRequestPanel({
  requestId,
  requestNo,
}: {
  requestId: number;
  requestNo: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [open, setOpen] = useState(false);
  const canSubmit = confirmText === "CONFIRM";

  async function doDelete() {
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/requests/${requestId}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: confirmText }),
      });
      const d = await res.json();
      if (!d.ok) {
        setError(d.error || "Delete failed");
        return;
      }
      router.push("/accounts");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mt-8 space-y-3 border border-rose-300 bg-rose-50/40 p-4">
      <p className="label text-rose-800">Delete request</p>
      <p className="text-sm font-medium text-rose-800">Warning: this action cannot be undone.</p>
      <p className="text-sm text-slate-600">
        Permanently remove <b>{requestNo}</b>. Only available while unpaid (including before
        supervisor approval). Closed, rejected, and paid/issued requests cannot be deleted.
      </p>
      {error && <p className="rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-800">{error}</p>}
      {!open ? (
        <button type="button" className="btn-danger" disabled={busy} onClick={() => setOpen(true)}>
          Delete request
        </button>
      ) : (
        <>
          <div>
            <label className="label">
              Type <span className="font-mono">CONFIRM</span> to delete this payment
            </label>
            <input
              className="input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="CONFIRM"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-danger"
              disabled={busy || !canSubmit}
              onClick={doDelete}
            >
              Delete permanently
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setConfirmText("");
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
