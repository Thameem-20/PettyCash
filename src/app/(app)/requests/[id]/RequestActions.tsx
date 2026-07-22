"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { EnrichedRequest, RequestCharge } from "@/lib/requests";
import type { SessionUser } from "@/lib/types";
import { EXACT_STATUS, SUSPENSE_STATUS, OPEN_SUSPENSE_STATUSES, isStaffReimbursementRole } from "@/lib/status";
import { money, round2 } from "@/lib/util";
import ReceiptFileInput from "@/components/ReceiptFileInput";
import ReceiptPreview from "@/components/ReceiptPreview";
import JobNumbersInput, { JobNumbersStatus } from "@/components/JobNumbersInput";
import { usePaymentAmountContext } from "./AccountsPaymentBalance";

function sessionCanPayRequest(
  session: SessionUser,
  request: EnrichedRequest,
  accountsBranchIds: number[]
): boolean {
  if (request.request_type !== "exact") return false;
  if (request.submitted_by_user_id === session.id) return false;

  const onBranch =
    session.role === "admin" ||
    session.role === "accounts_supervisor" ||
    (session.role === "accounts" && accountsBranchIds.includes(request.branch_id));
  if (!onBranch) return false;

  const role = request.submitter_role;
  if (isStaffReimbursementRole(role)) {
    if (role === "accounts") {
      return (
        (session.role === "accounts_supervisor" || session.role === "admin") &&
        request.status === EXACT_STATUS.PENDING_ACC_SUP
      );
    }
    if (role === "accounts_supervisor") {
      return session.role === "accounts" && request.status === EXACT_STATUS.PENDING_PAYMENT;
    }
    // supervisor
    return (
      (session.role === "accounts" ||
        session.role === "accounts_supervisor" ||
        session.role === "admin") &&
      request.status === EXACT_STATUS.PENDING_PAYMENT
    );
  }

  return (
    request.status === EXACT_STATUS.PENDING_PAYMENT ||
    request.status === EXACT_STATUS.PENDING_ACCOUNTS_REVIEW
  );
}

export type RequestReceipt = {
  id: number;
  file_name: string;
  mime_type: string | null;
  receipt_type: string;
};

export default function RequestActions({
  request,
  session,
  accountsBranchIds,
  requestReceipts = [],
  initialJobNumbers = [],
  charges = [],
}: {
  request: EnrichedRequest;
  session: SessionUser;
  accountsBranchIds: number[];
  requestReceipts?: RequestReceipt[];
  initialJobNumbers?: string[];
  charges?: RequestCharge[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function post(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/requests/${request.id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!d.ok) {
        setError(d.error || "Action failed");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Network error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function postForm(path: string, fd: FormData) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/requests/${request.id}/${path}`, { method: "POST", body: fd });
      const d = await res.json();
      if (!d.ok) {
        setError(d.error || "Action failed");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Network error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const isSupervisor = session.role === "supervisor" || session.role === "admin";
  const isAccounts =
    session.role === "admin" ||
    session.role === "accounts_supervisor" ||
    (session.role === "accounts" && accountsBranchIds.includes(request.branch_id));
  const isReceiver = request.cash_receiver_user_id === session.id;
  const isOwnerOrReceiver =
    request.submitted_by_user_id === session.id || request.cash_receiver_user_id === session.id;
  const isOwnRequest = request.submitted_by_user_id === session.id;
  const canPayExact = sessionCanPayRequest(session, request, accountsBranchIds);
  const isApproveAndPay =
    request.submitter_role === "accounts" &&
    (session.role === "accounts_supervisor" || session.role === "admin");

  const s = request.status;
  const panels: React.ReactNode[] = [];

  // ---- Receiver confirm cash (first — most urgent action) ----
  if (isReceiver && (s === EXACT_STATUS.AWAITING_RECEIVER || s === SUSPENSE_STATUS.AWAITING_CASH_RECEIPT)) {
    panels.push(
      <ConfirmCashPanel
        key="confirm"
        amount={money(request.paid_amount ?? request.approved_amount ?? request.requested_amount)}
        post={post}
        busy={busy}
        allowRemarks={session.role !== "cash_requester" && session.role !== "messenger"}
      />
    );
  }

  // ---- Submitter: resubmit after correction ----
  if (
    request.submitted_by_user_id === session.id &&
    (s === EXACT_STATUS.RETURNED || s === SUSPENSE_STATUS.RETURNED)
  ) {
    panels.push(
      <ResubmitPanel
        key="resubmit"
        request={request}
        requestReceipts={requestReceipts}
        initialJobNumbers={initialJobNumbers}
        post={post}
        postForm={postForm}
        busy={busy}
      />
    );
  }

  // ---- Supervisor approval (not for staff self-reimbursements) ----
  if (
    isSupervisor &&
    (s === EXACT_STATUS.PENDING_SUPERVISOR || s === SUSPENSE_STATUS.PENDING_SUPERVISOR) &&
    !isStaffReimbursementRole(request.submitter_role)
  ) {
    if (isOwnRequest) {
      panels.push(
        <Note key="own">You cannot approve your own request.</Note>
      );
    } else {
      panels.push(<SupervisorPanel key="sup" request={request} post={post} busy={busy} />);
    }
  }

  // ---- Accounts claim / pay / issue ----
  const accountsActionable =
    s === EXACT_STATUS.PENDING_ACCOUNTS_REVIEW ||
    s === EXACT_STATUS.PENDING_PAYMENT ||
    s === EXACT_STATUS.PENDING_ACC_SUP ||
    s === SUSPENSE_STATUS.PENDING_ACCOUNTS_ISSUE;

  const canEscalateToAccSup =
    isAccounts &&
    !isOwnRequest &&
    request.submitter_role !== "accounts" &&
    (s === EXACT_STATUS.PENDING_PAYMENT ||
      s === EXACT_STATUS.PENDING_ACCOUNTS_REVIEW ||
      s === SUSPENSE_STATUS.PENDING_ACCOUNTS_ISSUE) &&
    (!request.processing_by_user_id || request.processing_by_user_id === session.id);

  const isEscalatedAccSupQueue =
    s === EXACT_STATUS.PENDING_ACC_SUP && request.submitter_role !== "accounts";

  if (
    isEscalatedAccSupQueue &&
    (session.role === "accounts_supervisor" || session.role === "admin") &&
    !isOwnRequest
  ) {
    panels.push(
      <AccSupApproveForPaymentPanel key="acc-sup-approve" post={post} busy={busy} />
    );
  } else if (isEscalatedAccSupQueue && isAccounts && session.role === "accounts") {
    panels.push(
      <Note key="waiting-acc-sup">
        Sent to Accounts Supervisor for approval. You can pay or issue after they approve.
      </Note>
    );
  }

  if (isAccounts && accountsActionable && !isEscalatedAccSupQueue) {
    if (isOwnRequest && request.request_type === "exact") {
      panels.push(<Note key="own-pay">You cannot pay your own reimbursement request.</Note>);
    } else if (
      request.request_type === "exact" &&
      !canPayExact &&
      (s === EXACT_STATUS.PENDING_PAYMENT ||
        s === EXACT_STATUS.PENDING_ACC_SUP ||
        s === EXACT_STATUS.PENDING_ACCOUNTS_REVIEW)
    ) {
      panels.push(
        <Note key="pay-role">
          {request.submitter_role === "accounts_supervisor"
            ? "Only Accounts (not Accounts Supervisor) can pay this reimbursement."
            : request.submitter_role === "accounts"
              ? "Waiting for Accounts Supervisor to approve and pay."
              : "You are not allowed to pay this request."}
        </Note>
      );
    } else if (request.processing_by_user_id && request.processing_by_user_id !== session.id) {
      panels.push(
        <Note key="proc">
          Currently being processed by <b>{request.processing_by_name}</b>. To avoid duplicate payment you
          cannot process this request.
        </Note>
      );
    } else if (
      request.request_type === "exact"
        ? canPayExact
        : s === SUSPENSE_STATUS.PENDING_ACCOUNTS_ISSUE
    ) {
      if (!request.processing_by_user_id) {
        panels.push(
          <div key="claim" className="card space-y-3 p-4">
            <p className="mb-2 text-sm text-slate-600">
              Start processing to lock this request to yourself, or send it to Accounts Supervisor
              for approval first.
            </p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" disabled={busy} onClick={() => post("claim", {})}>
                Start Processing
              </button>
              {canEscalateToAccSup && (
                <button
                  className="btn border-sky-300/60 bg-sky-500/15 text-sky-800 hover:bg-sky-500/25"
                  disabled={busy}
                  onClick={() => post("escalate-acc-sup", {})}
                >
                  Send to Accounts Supervisor
                </button>

              )}
            </div>
            <AccountsReturnPanel post={post} busy={busy} />
          </div>
        );
      } else if (request.request_type === "exact") {
        panels.push(
          <PayPanel
            key="pay"
            request={request}
            post={post}
            busy={busy}
            approveAndPay={isApproveAndPay}
            canEscalate={canEscalateToAccSup}
          />
        );
      } else {
        panels.push(
          <IssuePanel
            key="issue"
            request={request}
            post={post}
            busy={busy}
            canEscalate={canEscalateToAccSup}
          />
        );
      }
    }
  }

  // ---- Suspense: upload final receipt (owner/receiver) ----
  if (isOwnerOrReceiver && s === SUSPENSE_STATUS.OPEN_SUSPENSE) {
    panels.push(<FinalReceiptPanel key="final" postForm={postForm} busy={busy} />);
  }

  // ---- Accounts settlement ----
  if (
    isAccounts &&
    request.request_type === "suspense" &&
    (s === SUSPENSE_STATUS.RECEIPT_SUBMITTED || s === SUSPENSE_STATUS.PENDING_SETTLEMENT_REVIEW)
  ) {
    panels.push(
      <SettlePanel key="settle" request={request} charges={charges} post={post} busy={busy} />
    );
  }

  // ---- Open suspense informative panel ----
  if (OPEN_SUSPENSE_STATUSES.includes(s)) {
    const outstanding =
      Number(request.paid_amount || 0) -
      Number(request.returned_amount || 0) -
      Number(request.actual_expense_amount || 0);
    panels.push(
      <div key="susp-info" className="card p-4 text-sm">
        <p className="label">Suspense settlement</p>
        <Line k="Advance Issued" v={money(request.paid_amount)} />
        <Line k="Actual Expense" v={money(request.actual_expense_amount)} />
        <Line k="Returned" v={money(request.returned_amount)} />
        <Line k="Additional Paid" v={money(request.additional_paid_amount)} />
        <Line k="Balance Pending" v={money(outstanding)} strong />
      </div>
    );
  }

  if (panels.length === 0) return null;

  return (
    <div className="mb-4 space-y-3">
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {panels}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <div className="card bg-amber-50 p-4 text-sm text-amber-800">{children}</div>;
}

function ConfirmCashPanel({
  amount,
  post,
  busy,
  allowRemarks = true,
}: {
  amount: string;
  post: (p: string, b: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
  allowRemarks?: boolean;
}) {
  const [remarks, setRemarks] = useState("");
  return (
    <div className="card space-y-3 p-4">
      <p className="label">Confirm Cash Received</p>
      <p className="text-sm text-slate-600">Confirm you have received {amount}.</p>
      {allowRemarks && (
        <div>
          <label className="label" htmlFor="confirm-remarks">
            Remarks / note (optional)
          </label>
          <textarea
            id="confirm-remarks"
            className="input"
            rows={2}
            placeholder="Any note about this receipt"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>
      )}
      <button
        className="btn-success w-full sm:w-auto"
        disabled={busy}
        onClick={() =>
          post("confirm-receipt", allowRemarks && remarks.trim() ? { remarks: remarks.trim() } : {})
        }
      >
        Confirm Cash Received {amount}
      </button>
    </div>
  );
}

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-slate-500">{k}</span>
      <span className={strong ? "font-bold text-slate-800" : "font-medium text-slate-700"}>{v}</span>
    </div>
  );
}

// ---------- Supervisor ----------
function SupervisorPanel({
  request,
  post,
  busy,
}: {
  request: EnrichedRequest;
  post: (p: string, b: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
}) {
  const [comments, setComments] = useState("");
  const [editAmount, setEditAmount] = useState(false);
  const [approvedAmount, setApprovedAmount] = useState(String(request.requested_amount));
  const [reason, setReason] = useState("");

  return (
    <div className="card space-y-3 p-4">
      <p className="label">Supervisor Decision</p>
      <textarea
        className="input"
        rows={2}
        placeholder="Approval comments (optional for approve, required for reject/return)"
        value={comments}
        onChange={(e) => setComments(e.target.value)}
      />

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={editAmount} onChange={(e) => setEditAmount(e.target.checked)} />
        Edit approved amount (original {money(request.requested_amount)})
      </label>
      {editAmount && (
        <div className="grid grid-cols-2 gap-2">
          <input
            className="input"
            type="number"
            step="0.01"
            value={approvedAmount}
            onChange={(e) => setApprovedAmount(e.target.value)}
            placeholder="Approved amount"
          />
          <input
            className="input"
            placeholder="Reason (mandatory)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          className="btn-success"
          disabled={busy}
          onClick={() =>
            post("approve", {
              action: "approve",
              comments,
              approved_amount: editAmount ? Number(approvedAmount) : undefined,
              reason: editAmount ? reason : undefined,
            })
          }
        >
          Approve
        </button>
        <button
          className="btn-warn"
          disabled={busy}
          onClick={() => post("approve", { action: "return", comments })}
        >
          Return for Correction
        </button>
        <button
          className="btn-danger"
          disabled={busy}
          onClick={() => post("approve", { action: "reject", comments })}
        >
          Reject
        </button>
      </div>
    </div>
  );
}

// ---------- Accounts: pay exact ----------
function PayPanel({
  request,
  post,
  busy,
  approveAndPay = false,
  canEscalate = false,
}: {
  request: EnrichedRequest;
  post: (p: string, b: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
  approveAndPay?: boolean;
  canEscalate?: boolean;
}) {
  const ctx = usePaymentAmountContext();
  const [localPaid, setLocalPaid] = useState(String(request.approved_amount ?? request.requested_amount));
  const paid = ctx?.mode === "pay" ? ctx.amount : localPaid;
  const setPaid = ctx?.mode === "pay" ? ctx.setAmount : setLocalPaid;
  const [allowNegative, setAllowNegative] = useState(false);
  return (
    <div className="card space-y-3 p-4">
      <p className="label">{approveAndPay ? "Approve & Pay" : "Mark as Paid"}</p>
      <input
        className="input"
        type="number"
        step="0.01"
        value={paid}
        onChange={(e) => setPaid(e.target.value)}
      />
      <label className="flex items-center gap-2 text-xs text-slate-500">
        <input type="checkbox" checked={allowNegative} onChange={(e) => setAllowNegative(e.target.checked)} />
        Override negative balance (Accounts Supervisor only)
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          className="btn-primary"
          disabled={busy}
          onClick={() => post("pay", { paid_amount: Number(paid), allow_negative: allowNegative })}
        >
          {approveAndPay ? "Approve & Confirm Payment" : "Confirm Payment"}
        </button>
        {canEscalate && (
          <button
            className="btn border-sky-300/60 bg-sky-500/15 text-sky-800 hover:bg-sky-500/25"
            disabled={busy}
            onClick={() => post("escalate-acc-sup", {})}
          >
            Send to Accounts Supervisor
          </button>
        )}
      </div>
      <AccountsReturnPanel post={post} busy={busy} />
    </div>
  );
}

// ---------- Accounts: issue suspense ----------
function IssuePanel({
  request,
  post,
  busy,
  canEscalate = false,
}: {
  request: EnrichedRequest;
  post: (p: string, b: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
  canEscalate?: boolean;
}) {
  const ctx = usePaymentAmountContext();
  const [localAmount, setLocalAmount] = useState(String(request.approved_amount ?? request.requested_amount));
  const amount = ctx?.mode === "issue" ? ctx.amount : localAmount;
  const setAmount = ctx?.mode === "issue" ? ctx.setAmount : setLocalAmount;
  const [allowNegative, setAllowNegative] = useState(false);
  return (
    <div className="card space-y-3 p-4">
      <p className="label">Issue Suspense Advance</p>
      <input
        className="input"
        type="number"
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <label className="flex items-center gap-2 text-xs text-slate-500">
        <input type="checkbox" checked={allowNegative} onChange={(e) => setAllowNegative(e.target.checked)} />
        Override negative balance (Accounts Supervisor only)
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          className="btn-primary"
          disabled={busy}
          onClick={() => post("issue", { amount: Number(amount), allow_negative: allowNegative })}
        >
          Issue Advance
        </button>
        {canEscalate && (
          <button
            className="btn border-sky-300/60 bg-sky-500/15 text-sky-800 hover:bg-sky-500/25"
            disabled={busy}
            onClick={() => post("escalate-acc-sup", {})}
          >
            Send to Accounts Supervisor
          </button>
        )}
      </div>
      <AccountsReturnPanel post={post} busy={busy} />
    </div>
  );
}

function AccSupApproveForPaymentPanel({
  post,
  busy,
}: {
  post: (p: string, b: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
}) {
  const [comments, setComments] = useState("");
  return (
    <div className="card space-y-3 p-4">
      <p className="label">Accounts Supervisor Approval</p>
      <p className="text-sm text-slate-600">
        Approve so Accounts can proceed with payment (or suspense issue). This does not pay the
        request.
      </p>
      <textarea
        className="input"
        rows={2}
        placeholder="Optional comment"
        value={comments}
        onChange={(e) => setComments(e.target.value)}
      />
      <button
        className="btn-primary"
        disabled={busy}
        onClick={() => post("acc-sup-approve", { comments })}
      >
        Approve for Payment
      </button>
      <AccountsReturnPanel post={post} busy={busy} />
    </div>
  );
}

// ---------- Accounts: return for correction ----------
function AccountsReturnPanel({
  post,
  busy,
}: {
  post: (p: string, b: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
}) {
  const [comments, setComments] = useState("");

  return (
    <div className="border-t border-slate-200 pt-3">
      <p className="label">Send Back for Correction</p>
      <textarea
        className="input"
        rows={2}
        placeholder="Explain what needs to be corrected (required)"
        value={comments}
        onChange={(e) => setComments(e.target.value)}
      />
      <button
        className="btn-warn mt-2"
        disabled={busy || !comments.trim()}
        onClick={() => post("return", { comments })}
      >
        Return for Correction
      </button>
    </div>
  );
}

// ---------- Submitter: resubmit after correction ----------
function ResubmitPanel({
  request,
  requestReceipts,
  initialJobNumbers,
  post,
  postForm,
  busy,
}: {
  request: EnrichedRequest;
  requestReceipts: RequestReceipt[];
  initialJobNumbers: string[];
  post: (p: string, b: Record<string, unknown>) => Promise<boolean>;
  postForm: (p: string, fd: FormData) => Promise<boolean>;
  busy: boolean;
}) {
  const [description, setDescription] = useState(request.description || "");
  const [amount, setAmount] = useState(String(request.requested_amount));
  const [note, setNote] = useState("");
  const [branches, setBranches] = useState<{ id: number; branch_name: string }[]>([]);
  const [branchId, setBranchId] = useState<number | "">(request.branch_id);
  const [jobNumbers, setJobNumbers] = useState<string[]>(
    initialJobNumbers.length > 0 ? initialJobNumbers : [""]
  );
  const [jobStatus, setJobStatus] = useState<JobNumbersStatus>({ valid: initialJobNumbers.length > 0 });
  const [handlerInfo, setHandlerInfo] = useState<{ branchName?: string; handlers: { name: string }[] }>({
    handlers: [],
  });
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [removedIds, setRemovedIds] = useState<number[]>([]);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptError, setReceiptError] = useState("");
  const router = useRouter();

  const visibleReceipts = requestReceipts.filter((r) => !removedIds.includes(r.id));
  const hasReceiptForResubmit = visibleReceipts.length > 0 || newFiles.length > 0;
  const isJob = request.charge_type === "job";
  const filledJobNumbers = jobNumbers.map((j) => j.trim()).filter(Boolean);
  const routingValid = isJob ? jobStatus.valid : Boolean(branchId);

  useEffect(() => {
    fetch("/api/meta/form")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setBranches(d.branches || []);
      });
  }, []);

  useEffect(() => {
    if (isJob || !branchId) {
      setHandlerInfo({ handlers: [] });
      return;
    }
    fetch(`/api/routing/handlers?branch_id=${branchId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setHandlerInfo({ branchName: d.branch?.name, handlers: d.handlers || [] });
      });
  }, [branchId, isJob]);

  async function uploadReceipts() {
    if (newFiles.length === 0) return;
    setReceiptBusy(true);
    setReceiptError("");
    try {
      const fd = new FormData();
      newFiles.forEach((f) => fd.append("receipts", f));
      const ok = await postForm("correction-receipts", fd);
      if (ok) setNewFiles([]);
    } finally {
      setReceiptBusy(false);
    }
  }

  async function removeReceipt(receiptId: number) {
    setReceiptBusy(true);
    setReceiptError("");
    setRemovedIds((prev) => [...prev, receiptId]);
    try {
      const res = await fetch(`/api/requests/${request.id}/correction-receipts/${receiptId}`, {
        method: "DELETE",
      });
      const d = await res.json();
      if (!d.ok) {
        setRemovedIds((prev) => prev.filter((id) => id !== receiptId));
        setReceiptError(d.error || "Could not remove receipt");
        return;
      }
      router.refresh();
    } catch {
      setRemovedIds((prev) => prev.filter((id) => id !== receiptId));
      setReceiptError("Network error");
    } finally {
      setReceiptBusy(false);
    }
  }

  const isExact = request.request_type === "exact";
  const actionBusy = busy || receiptBusy;

  return (
    <div className="card space-y-3 p-4">
      <p className="label">Correction Required</p>
      {request.reject_reason && (
        <p className="border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <b>Reason:</b> {request.reject_reason}
        </p>
      )}
      <p className="text-sm text-slate-600">
        {isStaffReimbursementRole(request.submitter_role)
          ? "Update details and receipts if needed, then resubmit for payment."
          : "Update details and receipts if needed, then resubmit. It will go to your supervisor for approval, then back to accounts."}
      </p>

      <div>
        <p className="label">Current Receipts</p>
        {visibleReceipts.length === 0 ? (
          <p className="text-sm text-amber-700">
            {isExact
              ? "No receipt attached. Take a new photo below before resubmitting."
              : "No receipts on file."}
          </p>
        ) : (
          <div className="space-y-3">
            {visibleReceipts.map((rc) => (
              <div key={rc.id} className="relative">
                <button
                  type="button"
                  onClick={() => removeReceipt(rc.id)}
                  disabled={actionBusy}
                  className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center border border-white/30 bg-black/55 text-white transition hover:bg-black/75 disabled:opacity-50"
                  aria-label={`Remove ${rc.file_name}`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M18 6L6 18M6 6l12 12"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                <ReceiptPreview
                  id={rc.id}
                  fileName={rc.file_name}
                  mimeType={rc.mime_type}
                />
              </div>
            ))}
          </div>
        )}
        {receiptError && (
          <p className="mt-2 border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{receiptError}</p>
        )}
      </div>

      <ReceiptFileInput
        id="correction-receipt-upload"
        files={newFiles}
        onChange={setNewFiles}
        capture="environment"
        label={isExact ? "New Receipt (required before resubmit)" : "Add Receipts (optional)"}
      />
      {newFiles.length > 0 && (
        <button
          type="button"
          className="btn-secondary w-full"
          disabled={actionBusy}
          onClick={uploadReceipts}
        >
          {receiptBusy ? "Uploading..." : `Upload ${newFiles.length} receipt${newFiles.length === 1 ? "" : "s"}`}
        </button>
      )}

      {isJob ? (
        <JobNumbersInput values={jobNumbers} onChange={setJobNumbers} onStatusChange={setJobStatus} />
      ) : (
        <div>
          <label className="label">Branch</label>
          <select
            className="input"
            value={branchId}
            onChange={(e) => setBranchId(Number(e.target.value) || "")}
          >
            <option value="">Select branch</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.branch_name}
              </option>
            ))}
          </select>
          {handlerInfo.branchName && (
            <p className="mt-2 border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-700">
              Goes to <b>{handlerInfo.branchName}</b> Accounts:{" "}
              {handlerInfo.handlers.map((h) => h.name).join(", ") || "Unassigned"}
            </p>
          )}
        </div>
      )}

      <div>
        <label className="label">Description</label>
        <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <label className="label">Amount</label>
        <input
          className="input"
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Note (optional)</label>
        <input
          className="input"
          placeholder="What you changed"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <button
        className="btn-primary"
        disabled={
          actionBusy ||
          !description.trim() ||
          !(Number(amount) > 0) ||
          !routingValid ||
          (isExact && !hasReceiptForResubmit)
        }
        onClick={async () => {
          if (newFiles.length > 0) {
            setReceiptBusy(true);
            const fd = new FormData();
            newFiles.forEach((f) => fd.append("receipts", f));
            const res = await fetch(`/api/requests/${request.id}/correction-receipts`, {
              method: "POST",
              body: fd,
            });
            const d = await res.json();
            setReceiptBusy(false);
            if (!d.ok) {
              setReceiptError(d.error || "Could not upload receipts");
              return;
            }
            setNewFiles([]);
          }
          await post("resubmit", {
            description: description.trim(),
            amount: Number(amount),
            note: note.trim() || undefined,
            ...(isJob ? { job_numbers: filledJobNumbers } : { branch_id: branchId }),
          });
        }}
      >
        Resubmit
        {isStaffReimbursementRole(request.submitter_role)
          ? " for Payment"
          : " for Supervisor Approval"}
      </button>
      {isExact && !hasReceiptForResubmit && (
        <p className="text-xs text-amber-700">Attach a new receipt before you can resubmit.</p>
      )}
      {!routingValid && (
        <p className="text-xs text-amber-700">
          {isJob ? jobStatus.error || "Fix job number routing before resubmitting." : "Select a branch."}
        </p>
      )}
    </div>
  );
}

// ---------- Final receipt upload ----------
function FinalReceiptPanel({
  postForm,
  busy,
}: {
  postForm: (p: string, fd: FormData) => Promise<boolean>;
  busy: boolean;
}) {
  const [files, setFiles] = useState<File[]>([]);
  return (
    <div className="card space-y-3 p-4">
      <ReceiptFileInput
        id="final-receipt-upload"
        files={files}
        onChange={setFiles}
        label="Upload Final Receipt (for settlement)"
      />
      <button
        className="btn-primary"
        disabled={busy || files.length === 0}
        onClick={() => {
          const fd = new FormData();
          files.forEach((f) => fd.append("receipts", f));
          postForm("settle-receipt", fd);
        }}
      >
        Submit Final Receipt
      </button>
    </div>
  );
}

// ---------- Accounts settlement ----------
function SettlePanel({
  request,
  charges,
  post,
  busy,
}: {
  request: EnrichedRequest;
  charges: RequestCharge[];
  post: (p: string, b: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
}) {
  const ctx = usePaymentAmountContext();
  const advance = Number(request.paid_amount || 0);
  const [localActual, setLocalActual] = useState("");
  const [chargeActuals, setChargeActuals] = useState<Record<number, string>>(() =>
    Object.fromEntries(charges.map((c) => [c.id, ""]))
  );
  const [allowNegative, setAllowNegative] = useState(false);

  const usePerCharge = charges.length > 0;
  const allChargesFilled =
    !usePerCharge || charges.every((c) => String(chargeActuals[c.id] ?? "").trim() !== "");
  const actualTotal = usePerCharge
    ? round2(charges.reduce((sum, c) => sum + Number(chargeActuals[c.id] || 0), 0))
    : Number((ctx?.mode === "settle" ? ctx.amount : localActual) || 0);
  const actualDisplay = usePerCharge
    ? allChargesFilled
      ? String(actualTotal)
      : ""
    : ctx?.mode === "settle"
      ? ctx.amount
      : localActual;

  const setCtxAmount = ctx?.mode === "settle" ? ctx.setAmount : null;

  useEffect(() => {
    if (!usePerCharge || !setCtxAmount) return;
    setCtxAmount(allChargesFilled ? String(actualTotal) : "");
  }, [usePerCharge, allChargesFilled, actualTotal, setCtxAmount]);

  const setActual = setCtxAmount ?? setLocalActual;
  const diff = advance - actualTotal; // positive -> returned, negative -> additional payable

  function updateChargeActual(chargeId: number, value: string) {
    setChargeActuals((prev) => ({ ...prev, [chargeId]: value }));
  }

  function submit() {
    if (usePerCharge) {
      return post("settle", {
        actual_expense_amount: actualTotal,
        charge_actuals: charges.map((c) => ({
          charge_id: c.id,
          actual_amount: Number(chargeActuals[c.id] || 0),
        })),
        allow_negative: allowNegative,
      });
    }
    return post("settle", {
      actual_expense_amount: actualTotal,
      allow_negative: allowNegative,
    });
  }

  return (
    <div className="card space-y-3 p-4">
      <p className="label">Settle Suspense</p>
      <p className="text-sm text-slate-600">Advance issued: {money(advance)}</p>

      {usePerCharge ? (
        <div className="space-y-3">
          {charges.map((c, i) => (
            <div key={c.id} className="rounded-lg border border-slate-200 p-3">
              {charges.length > 1 && (
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Charge {i + 1} of {charges.length}
                </p>
              )}
              <p className={`${charges.length > 1 ? "mt-1" : ""} text-sm font-medium text-slate-800`}>
                {c.description}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Requested: {money(c.amount, request.currency)}
                {c.job_number ? ` · Job ${c.job_number}` : ""}
                {c.category_name ? ` · ${c.category_name}` : ""}
              </p>
              <div className="mt-2">
                <label className="label">Actual Expense Amount</label>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={chargeActuals[c.id] ?? ""}
                  onChange={(e) => updateChargeActual(c.id, e.target.value)}
                />
              </div>
            </div>
          ))}
          {allChargesFilled && (
            <p className="text-sm font-medium text-slate-700">
              Total actual expense: {money(actualTotal, request.currency)}
            </p>
          )}
        </div>
      ) : (
        <div>
          <label className="label">Actual Expense Amount</label>
          <input
            className="input"
            type="number"
            step="0.01"
            value={actualDisplay}
            onChange={(e) => setActual(e.target.value)}
          />
        </div>
      )}

      {actualDisplay !== "" && (
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          {diff > 0 ? (
            <p className="text-emerald-700">
              Messenger returns <b>{money(diff)}</b> to accounts.
            </p>
          ) : diff < 0 ? (
            <p className="text-amber-700">
              Accounts pays additional <b>{money(-diff)}</b> to messenger.
            </p>
          ) : (
            <p className="text-slate-700">Fully settled. Nothing to return.</p>
          )}
        </div>
      )}
      {diff < 0 && actualDisplay !== "" && (
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <input type="checkbox" checked={allowNegative} onChange={(e) => setAllowNegative(e.target.checked)} />
          Override negative balance (Accounts Supervisor only)
        </label>
      )}
      <button
        className="btn-success"
        disabled={busy || actualDisplay === ""}
        onClick={() => submit()}
      >
        Record Settlement &amp; Close
      </button>
    </div>
  );
}
