"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type BankOption = { id: number; branch_id: number; bank_name: string; last_four: string };

export default function TopUpForm({
  branches,
  branchId,
  banks = [],
}: {
  branches: { id: number; branch_name: string }[];
  branchId: number;
  banks?: BankOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState(branchId);
  const [amount, setAmount] = useState("");
  const [cpNumber, setCpNumber] = useState("");
  const [paymentSource, setPaymentSource] = useState<"cash" | "bank_account">("cash");
  const [bankAccountId, setBankAccountId] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const previewUrl = useMemo(() => (file?.type.startsWith("image/") ? URL.createObjectURL(file) : null), [file]);
  const branchBanks = useMemo(
    () => banks.filter((b) => b.branch_id === selectedBranchId),
    [banks, selectedBranchId]
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    setSelectedBranchId(branchId);
  }, [branchId]);

  useEffect(() => {
    if (bankAccountId && !branchBanks.some((b) => b.id === bankAccountId)) {
      setBankAccountId("");
    }
  }, [branchBanks, bankAccountId]);

  function resetForm() {
    setAmount("");
    setCpNumber("");
    setPaymentSource("cash");
    setBankAccountId("");
    setReason("");
    setFile(null);
    setError("");
    setSelectedBranchId(branchId);
  }

  function closeModal() {
    if (busy) return;
    setOpen(false);
    resetForm();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!selectedBranchId || !amount || Number(amount) <= 0) {
      setError("Select branch and a valid amount");
      return;
    }
    if (paymentSource === "bank_account") {
      if (!bankAccountId) {
        setError("Select a bank account");
        return;
      }
      if (branchBanks.length === 0) {
        setError("No bank accounts configured for this branch. Ask admin to add one.");
        return;
      }
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("branch_id", String(selectedBranchId));
      fd.set("amount", amount);
      if (cpNumber.trim()) fd.set("cp_number", cpNumber.trim());
      fd.set("payment_source", paymentSource);
      if (paymentSource === "bank_account" && bankAccountId) {
        fd.set("bank_account_id", String(bankAccountId));
      }
      fd.set("reason", reason);
      if (file) fd.set("attachment", file);

      const res = await fetch("/api/topup", { method: "POST", body: fd });
      const d = await res.json();
      if (!d.ok) {
        setError(d.error || "Failed");
        return;
      }
      setOpen(false);
      resetForm();
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        Request Top-Up
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 md:items-center"
          onClick={closeModal}
          role="presentation"
        >
          <div
            className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="topup-modal-title"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="topup-modal-title" className="text-lg font-bold text-slate-800">
                  Request Cash Top-Up
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Submit a branch cashbox refill request for approval.
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary px-2 py-1 text-sm"
                onClick={closeModal}
                disabled={busy}
                aria-label="Close"
              >
                Close
              </button>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="label">
                  Branch <span className="text-rose-600">*</span>
                </label>
                <select
                  className="input"
                  value={selectedBranchId}
                  onChange={(e) => {
                    setSelectedBranchId(Number(e.target.value));
                    setBankAccountId("");
                  }}
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.branch_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">
                    Amount <span className="text-rose-600">*</span>
                  </label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">CP number</label>
                  <input
                    className="input"
                    placeholder="CP number"
                    value={cpNumber}
                    onChange={(e) => setCpNumber(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="label" htmlFor="topup-payment-source">
                  Payment source <span className="text-rose-600">*</span>
                </label>
                <select
                  id="topup-payment-source"
                  className="input"
                  value={paymentSource}
                  onChange={(e) => {
                    const v = e.target.value as "cash" | "bank_account";
                    setPaymentSource(v);
                    if (v !== "bank_account") setBankAccountId("");
                  }}
                >
                  <option value="cash">Cash</option>
                  <option value="bank_account">Bank Account</option>
                </select>
              </div>

              {paymentSource === "bank_account" && (
                <div>
                  <label className="label" htmlFor="topup-bank-account">
                    Bank Account <span className="text-rose-600">*</span>
                  </label>
                  <select
                    id="topup-bank-account"
                    className="input"
                    value={bankAccountId}
                    onChange={(e) => setBankAccountId(Number(e.target.value) || "")}
                    required
                  >
                    <option value="">Select bank account</option>
                    {branchBanks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bank_name} ****{b.last_four}
                      </option>
                    ))}
                  </select>
                  {branchBanks.length === 0 && (
                    <p className="mt-1 text-xs text-amber-700">
                      No active bank accounts for this branch. Ask an admin to add one under Admin →
                      Bank Accounts.
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="label">Reason</label>
                <input
                  className="input"
                  placeholder="Optional reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              <div>
                <label className="label" htmlFor="topup-attachment">
                  Supporting image (optional)
                </label>
                <input
                  id="topup-attachment"
                  className="input"
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <p className="mt-1 text-xs text-slate-400">
                  JPG, PNG, WEBP or PDF, up to 8 MB. Visible to approvers.
                </p>
                {previewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt="Attachment preview"
                    className="mt-3 max-h-40 w-full border border-brand-200 object-contain"
                  />
                )}
                {file && !previewUrl && (
                  <p className="mt-2 text-sm text-slate-600">Attached: {file.name}</p>
                )}
              </div>

              {error && <p className="bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button type="button" className="btn-secondary flex-1" onClick={closeModal} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={busy}>
                  {busy ? "Submitting..." : "Submit Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
