"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { EnrichedRequest, RequestCharge } from "@/lib/requests";
import type { SessionUser } from "@/lib/types";
import { EXACT_STATUS, SUSPENSE_STATUS, OPEN_SUSPENSE_STATUSES, CLOSED_STATUSES, isStaffReimbursementRole } from "@/lib/status";
import { money, round2, formatDate } from "@/lib/util";
import type { SuspenseReturnRow } from "@/lib/suspenseReturns";
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
  charge_id: number | null;
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
  suspenseReturns = [],
  hasOrphanPaymentLedger = false,
}: {
  request: EnrichedRequest;
  session: SessionUser;
  accountsBranchIds: number[];
  requestReceipts?: RequestReceipt[];
  initialJobNumbers?: string[];
  charges?: RequestCharge[];
  suspenseReturns?: SuspenseReturnRow[];
  /** Ledger still has pay/issue row after a prior undo that only posted an adjustment. */
  hasOrphanPaymentLedger?: boolean;
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

  const primary = session.primary_role || session.role;
  const isSupervisor = session.role === "supervisor" || session.role === "admin";
  const isAccSup =
    session.role === "accounts_supervisor" ||
    primary === "accounts_supervisor" ||
    session.role === "admin" ||
    primary === "admin";
  const isAccounts =
    session.role === "admin" ||
    primary === "admin" ||
    session.role === "accounts_supervisor" ||
    primary === "accounts_supervisor" ||
    (session.role === "accounts" && accountsBranchIds.includes(request.branch_id));
  const isReceiver = request.cash_receiver_user_id === session.id;
  const isOwnerOrReceiver =
    request.submitted_by_user_id === session.id || request.cash_receiver_user_id === session.id;
  const isOwnRequest = request.submitted_by_user_id === session.id;
  const canPayExact = sessionCanPayRequest(session, request, accountsBranchIds);
  const isApproveAndPay =
    request.submitter_role === "accounts" &&
    request.request_type === "exact" &&
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

  // ---- Acc Sup: undo pay / issue (one step back, before receiver confirms) ----
  // Also offered when a prior undo left the original ledger payment row behind.
  const canUndoLivePayment =
    request.paid_amount != null &&
    (s === EXACT_STATUS.AWAITING_RECEIVER || s === SUSPENSE_STATUS.AWAITING_CASH_RECEIPT);
  const canClearOrphanLedger =
    hasOrphanPaymentLedger &&
    request.paid_amount == null &&
    (s === EXACT_STATUS.PENDING_PAYMENT ||
      s === EXACT_STATUS.PENDING_ACC_SUP ||
      s === SUSPENSE_STATUS.PENDING_ACCOUNTS_ISSUE);
  if (isAccSup && (canUndoLivePayment || canClearOrphanLedger)) {
    panels.push(
      <UndoPaymentPanel
        key="undo-payment"
        request={request}
        post={post}
        busy={busy}
        orphanCleanup={canClearOrphanLedger}
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
        charges={charges}
        post={post}
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

  // ---- Acc Sup: approve on behalf of absent supervisor ----
  if (
    isAccSup &&
    !isSupervisor &&
    (s === EXACT_STATUS.PENDING_SUPERVISOR || s === SUSPENSE_STATUS.PENDING_SUPERVISOR) &&
    !isStaffReimbursementRole(request.submitter_role)
  ) {
    if (isOwnRequest) {
      panels.push(
        <Note key="own-behalf">You cannot approve your own request on behalf of a supervisor.</Note>
      );
    } else {
      panels.push(
        <ApproveOnBehalfPanel key="on-behalf" request={request} post={post} busy={busy} />
      );
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

  // Accounts exact reimbursements use Approve & Pay; everything else at Acc Sup queue uses approve-for-pay/issue.
  const isStaffAccountsExact =
    request.submitter_role === "accounts" && request.request_type === "exact";
  const isEscalatedAccSupQueue =
    s === EXACT_STATUS.PENDING_ACC_SUP && !isStaffAccountsExact;

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
            canEditAmount={isAccSup}
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
            canEditAmount={isAccSup}
          />
        );
      }
    }
  }

  // ---- Suspense: upload final receipt (owner/receiver) ----
  if (isOwnerOrReceiver && s === SUSPENSE_STATUS.OPEN_SUSPENSE) {
    panels.push(<FinalReceiptPanel key="final" postForm={postForm} busy={busy} />);
  }

  // ---- Accounts: partial cash return / close when fully returned ----
  // Stays available through receipt submission / settlement review too, so accounts can
  // record cash handed back at the same time the final receipt comes in, before settling.
  const partialReturnEligible =
    isAccounts &&
    request.request_type === "suspense" &&
    (s === SUSPENSE_STATUS.OPEN_SUSPENSE ||
      s === SUSPENSE_STATUS.RECEIPT_SUBMITTED ||
      s === SUSPENSE_STATUS.PENDING_SETTLEMENT_REVIEW);
  if (partialReturnEligible) {
    const openOutstanding = round2(
      Math.max(
        0,
        Number(request.paid_amount || 0) -
          Number(request.returned_amount || 0) -
          Number(request.actual_expense_amount || 0)
      )
    );
    if (
      s === SUSPENSE_STATUS.OPEN_SUSPENSE &&
      openOutstanding === 0 &&
      Number(request.returned_amount || 0) > 0
    ) {
      panels.push(
        <CloseFullyReturnedPanel key="close-fully-returned" post={post} busy={busy} />
      );
    } else {
      panels.push(
        <PartialReturnPanel key="partial-return" request={request} post={post} busy={busy} />
      );
    }
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
  if (OPEN_SUSPENSE_STATUSES.includes(s) || suspenseReturns.length > 0) {
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
        {suspenseReturns.length > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              Return history
            </p>
            <ul className="space-y-2">
              {suspenseReturns.map((r) => (
                <li key={r.id} className="text-xs text-slate-600">
                  <span className="font-medium text-slate-800">{money(r.amount)}</span>
                  {" · "}
                  {r.recorded_by_name}
                  {" · "}
                  {formatDate(r.created_at)}
                  {r.note ? ` · ${r.note}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
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

// ---------- Acc Sup: approve on behalf of supervisor ----------
function ApproveOnBehalfPanel({
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
  const supervisorLabel = request.supervisor_name?.trim() || "the assigned supervisor";

  function act(action: "approve" | "reject" | "return") {
    return post("approve-on-behalf", {
      action,
      comments,
      approved_amount: action === "approve" && editAmount ? Number(approvedAmount) : undefined,
      reason: action === "approve" && editAmount ? reason : undefined,
    });
  }

  return (
    <div className="card space-y-3 border border-sky-300 bg-sky-50/40 p-4">
      <p className="label">Act on behalf of supervisor</p>
      <p className="text-sm text-slate-600">
        Cover for <b>{supervisorLabel}</b> while they are unavailable. Approve sends the request to
        Accounts; return/reject work the same as a normal supervisor decision. Activity will show
        you acted on their behalf.
      </p>
      <textarea
        className="input"
        rows={2}
        placeholder="Comments (optional for approve, required for reject/return)"
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
          disabled={busy || (editAmount && !reason.trim())}
          onClick={() => act("approve")}
        >
          Approve on behalf of {supervisorLabel}
        </button>
        <button
          className="btn-warn"
          disabled={busy || !comments.trim()}
          onClick={() => act("return")}
        >
          Return for Correction
        </button>
        <button
          className="btn-danger"
          disabled={busy || !comments.trim()}
          onClick={() => act("reject")}
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
  canEditAmount = false,
}: {
  request: EnrichedRequest;
  post: (p: string, b: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
  approveAndPay?: boolean;
  canEscalate?: boolean;
  canEditAmount?: boolean;
}) {
  const ctx = usePaymentAmountContext();
  const baseline = String(request.approved_amount ?? request.requested_amount);
  const [localPaid, setLocalPaid] = useState(baseline);
  const paid = canEditAmount && ctx?.mode === "pay" ? ctx.amount : canEditAmount ? localPaid : baseline;
  const setPaid = canEditAmount && ctx?.mode === "pay" ? ctx.setAmount : setLocalPaid;
  const [allowNegative, setAllowNegative] = useState(false);
  const [amountReason, setAmountReason] = useState("");
  const amountChanged = canEditAmount && round2(Number(paid)) !== round2(Number(baseline));
  return (
    <div className="card space-y-3 p-4">
      <p className="label">{approveAndPay ? "Approve & Pay" : "Mark as Paid"}</p>
      <input
        className="input"
        type="number"
        step="0.01"
        value={paid}
        disabled={!canEditAmount}
        onChange={(e) => canEditAmount && setPaid(e.target.value)}
      />
      {!canEditAmount && (
        <p className="text-xs text-slate-500">
          Amount is locked to the approved value. Only Accounts Supervisor can change it.
        </p>
      )}
      {amountChanged && (
        <div>
          <label className="label">Reason for amount change (required)</label>
          <input
            className="input"
            value={amountReason}
            onChange={(e) => setAmountReason(e.target.value)}
            placeholder="Why is the paid amount different?"
          />
        </div>
      )}
      {canEditAmount && (
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <input type="checkbox" checked={allowNegative} onChange={(e) => setAllowNegative(e.target.checked)} />
          Override negative balance (Accounts Supervisor only)
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className="btn-primary"
          disabled={busy || (amountChanged && !amountReason.trim())}
          onClick={() =>
            post("pay", {
              paid_amount: Number(paid),
              allow_negative: allowNegative,
              amount_reason: amountChanged ? amountReason.trim() : undefined,
            })
          }
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
  canEditAmount = false,
}: {
  request: EnrichedRequest;
  post: (p: string, b: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
  canEscalate?: boolean;
  canEditAmount?: boolean;
}) {
  const ctx = usePaymentAmountContext();
  const baseline = String(request.approved_amount ?? request.requested_amount);
  const [localAmount, setLocalAmount] = useState(baseline);
  const amount =
    canEditAmount && ctx?.mode === "issue" ? ctx.amount : canEditAmount ? localAmount : baseline;
  const setAmount = canEditAmount && ctx?.mode === "issue" ? ctx.setAmount : setLocalAmount;
  const [allowNegative, setAllowNegative] = useState(false);
  const [amountReason, setAmountReason] = useState("");
  const amountChanged = canEditAmount && round2(Number(amount)) !== round2(Number(baseline));
  return (
    <div className="card space-y-3 p-4">
      <p className="label">Issue Suspense Advance</p>
      <input
        className="input"
        type="number"
        step="0.01"
        value={amount}
        disabled={!canEditAmount}
        onChange={(e) => canEditAmount && setAmount(e.target.value)}
      />
      {!canEditAmount && (
        <p className="text-xs text-slate-500">
          Amount is locked to the approved value. Only Accounts Supervisor can change it.
        </p>
      )}
      {amountChanged && (
        <div>
          <label className="label">Reason for amount change (required)</label>
          <input
            className="input"
            value={amountReason}
            onChange={(e) => setAmountReason(e.target.value)}
            placeholder="Why is the advance amount different?"
          />
        </div>
      )}
      {canEditAmount && (
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <input type="checkbox" checked={allowNegative} onChange={(e) => setAllowNegative(e.target.checked)} />
          Override negative balance (Accounts Supervisor only)
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className="btn-primary"
          disabled={busy || (amountChanged && !amountReason.trim())}
          onClick={() =>
            post("issue", {
              amount: Number(amount),
              allow_negative: allowNegative,
              amount_reason: amountChanged ? amountReason.trim() : undefined,
            })
          }
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
type CorrectionChargeDraft = {
  charge_id: number;
  description: string;
  amount: string;
  job_number: string;
  files: File[];
};

function ResubmitPanel({
  request,
  requestReceipts,
  initialJobNumbers,
  charges,
  post,
  busy,
}: {
  request: EnrichedRequest;
  requestReceipts: RequestReceipt[];
  initialJobNumbers: string[];
  charges: RequestCharge[];
  post: (p: string, b: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
}) {
  const initialCharges: CorrectionChargeDraft[] =
    charges.length > 0
      ? charges.map((charge, index) => ({
          charge_id: charge.id,
          description: charge.description || "",
          amount: String(charge.amount),
          job_number:
            charge.job_number?.trim() || initialJobNumbers[index]?.trim() || "",
          files: [],
        }))
      : [
          {
            charge_id: 0,
            description: request.description || "",
            amount: String(request.requested_amount),
            job_number: initialJobNumbers[0]?.trim() || request.job_number?.trim() || "",
            files: [],
          },
        ];
  const [chargeDrafts, setChargeDrafts] =
    useState<CorrectionChargeDraft[]>(initialCharges);
  const [note, setNote] = useState("");
  const [branches, setBranches] = useState<{ id: number; branch_name: string }[]>([]);
  const [branchId, setBranchId] = useState<number | "">(request.branch_id);
  const [jobStatuses, setJobStatuses] = useState<Record<number, JobNumbersStatus>>(
    Object.fromEntries(
      initialCharges.map((charge) => [
        charge.charge_id,
        { valid: false },
      ])
    )
  );
  const [handlerInfo, setHandlerInfo] = useState<{ branchName?: string; handlers: { name: string }[] }>({
    handlers: [],
  });
  const [removedIds, setRemovedIds] = useState<number[]>([]);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptError, setReceiptError] = useState("");
  const router = useRouter();

  const visibleReceipts = requestReceipts.filter((r) => !removedIds.includes(r.id));
  // Legacy receipts saved before per-charge linking belong to the first charge.
  const receiptsForCharge = (chargeId: number, index: number) =>
    visibleReceipts.filter(
      (receipt) => receipt.charge_id === chargeId || (index === 0 && receipt.charge_id == null)
    );
  const chargesMissingReceipts = chargeDrafts
    .map((charge, index) => ({ charge, index }))
    .filter(
      ({ charge, index }) =>
        receiptsForCharge(charge.charge_id, index).length === 0 && charge.files.length === 0
    );
  const isJob = request.charge_type === "job";
  const resolvedJobBranches = new Set(
    Object.values(jobStatuses)
      .map((status) => status.branch?.id)
      .filter((branchId): branchId is number => branchId != null)
  );
  const routingValid = isJob
    ? chargeDrafts.every((charge) => jobStatuses[charge.charge_id]?.valid) &&
      resolvedJobBranches.size <= 1
    : Boolean(branchId);
  const chargesValid = chargeDrafts.every(
    (charge) => charge.description.trim() && Number(charge.amount) > 0
  );

  function updateCharge(
    chargeId: number,
    patch: Partial<CorrectionChargeDraft>
  ) {
    setChargeDrafts((current) =>
      current.map((charge) =>
        charge.charge_id === chargeId ? { ...charge, ...patch } : charge
      )
    );
  }

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

  async function uploadChargeReceipts(charge: CorrectionChargeDraft): Promise<boolean> {
    if (charge.files.length === 0) return true;
    setReceiptBusy(true);
    setReceiptError("");
    try {
      const fd = new FormData();
      if (charge.charge_id > 0) {
        fd.set("charge_id", String(charge.charge_id));
      }
      charge.files.forEach((file) => fd.append("receipts", file));
      const res = await fetch(`/api/requests/${request.id}/correction-receipts`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!data.ok) {
        setReceiptError(data.error || "Could not upload receipts");
        return false;
      }
      updateCharge(charge.charge_id, { files: [] });
      return true;
    } catch {
      setReceiptError("Network error");
      return false;
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

      <div className="space-y-4">
        {chargeDrafts.map((charge, index) => {
          const chargeReceipts = receiptsForCharge(charge.charge_id, index);
          const receiptMissing =
            isExact && chargeReceipts.length === 0 && charge.files.length === 0;
          return (
            <section
              key={charge.charge_id}
              className="space-y-3 border border-slate-200 bg-slate-50/60 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-slate-900">
                  Charge {index + 1}
                </p>
                <span className="text-xs text-slate-500">
                  {money(Number(charge.amount) || 0, request.currency)}
                </span>
              </div>

              {isJob && (
                <JobNumbersInput
                  values={[charge.job_number]}
                  allowMultiple={false}
                  onChange={(values) =>
                    updateCharge(charge.charge_id, { job_number: values[0] || "" })
                  }
                  onStatusChange={(status) =>
                    setJobStatuses((current) => ({
                      ...current,
                      [charge.charge_id]: status,
                    }))
                  }
                />
              )}

              <div>
                <label className="label">Description</label>
                <textarea
                  className="input"
                  rows={2}
                  value={charge.description}
                  onChange={(event) =>
                    updateCharge(charge.charge_id, { description: event.target.value })
                  }
                />
              </div>

              <div>
                <label className="label">Amount</label>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={charge.amount}
                  onChange={(event) =>
                    updateCharge(charge.charge_id, { amount: event.target.value })
                  }
                />
              </div>

              <div>
                <p className="label">Attachments</p>
                {chargeReceipts.length === 0 ? (
                  <p className={`text-sm ${receiptMissing ? "text-amber-700" : "text-slate-500"}`}>
                    {receiptMissing
                      ? "Receipt required — attach one for this charge before resubmitting."
                      : "No attachments for this charge."}
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {chargeReceipts.map((receipt) => (
                      <div key={receipt.id} className="relative">
                        <button
                          type="button"
                          onClick={() => removeReceipt(receipt.id)}
                          disabled={actionBusy}
                          className="absolute right-2 top-2 z-30 flex h-9 w-9 items-center justify-center border border-white/30 bg-black/55 text-white transition hover:bg-black/75 disabled:opacity-50"
                          aria-label={`Remove ${receipt.file_name}`}
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
                          id={receipt.id}
                          fileName={receipt.file_name}
                          mimeType={receipt.mime_type}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <ReceiptFileInput
                id={`correction-receipt-upload-${charge.charge_id}`}
                files={charge.files}
                onChange={(files) => updateCharge(charge.charge_id, { files })}
                capture="environment"
                label="Add or replace attachments"
              />
              {charge.files.length > 0 && (
                <button
                  type="button"
                  className="btn-secondary w-full"
                  disabled={actionBusy}
                  onClick={() => uploadChargeReceipts(charge)}
                >
                  {receiptBusy
                    ? "Uploading..."
                    : `Upload ${charge.files.length} attachment${charge.files.length === 1 ? "" : "s"}`}
                </button>
              )}
            </section>
          );
        })}
      </div>

      {receiptError && (
        <p className="border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {receiptError}
        </p>
      )}

      {!isJob && (
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
          !chargesValid ||
          !routingValid ||
          (isExact && chargesMissingReceipts.length > 0)
        }
        onClick={async () => {
          for (const charge of chargeDrafts) {
            if (charge.files.length > 0 && !(await uploadChargeReceipts(charge))) {
              return;
            }
          }
          await post("resubmit", {
            charges: chargeDrafts.map((charge) => ({
              charge_id: charge.charge_id,
              description: charge.description.trim(),
              amount: Number(charge.amount),
              job_number: isJob ? charge.job_number.trim() : null,
            })),
            note: note.trim() || undefined,
            ...(!isJob ? { branch_id: branchId } : {}),
          });
        }}
      >
        Resubmit
        {isStaffReimbursementRole(request.submitter_role)
          ? " for Payment"
          : " for Supervisor Approval"}
      </button>
      {isExact && chargesMissingReceipts.length > 0 && (
        <p className="text-xs text-amber-700">
          {chargeDrafts.length > 1
            ? `Attach a receipt for charge ${chargesMissingReceipts
                .map(({ index }) => index + 1)
                .join(", ")} before you can resubmit.`
            : "Attach a receipt before you can resubmit."}
        </p>
      )}
      {!routingValid && (
        <p className="text-xs text-amber-700">
          {isJob
            ? Object.values(jobStatuses).find((status) => status.error)?.error ||
              "Fix each job number before resubmitting."
            : "Select a branch."}
        </p>
      )}
    </div>
  );
}

// ---------- Acc Sup: undo pay / issue advance ----------
function UndoPaymentPanel({
  request,
  post,
  busy,
  orphanCleanup = false,
}: {
  request: EnrichedRequest;
  post: (p: string, b: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
  orphanCleanup?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const isSuspense = request.request_type === "suspense";
  const amount = request.paid_amount != null ? money(request.paid_amount) : null;
  const label = orphanCleanup
    ? "Clear leftover ledger payment"
    : isSuspense
      ? "Undo Advance"
      : "Undo Payment";

  return (
    <div className="card space-y-3 border border-amber-300 bg-amber-50/40 p-4">
      <p className="label">{label}</p>
      <p className="text-sm text-slate-600">
        {orphanCleanup ? (
          <>
            A previous undo left the original {isSuspense ? "advance" : "payment"} row in the cash
            ledger. Clearing it removes that paid row (and any old undo adjustment), restores cash
            in hand, and keeps the request in the accounts queue. Paid Today will no longer include
            it.
          </>
        ) : (
          <>
            Accounts Supervisor fallback: undo the{" "}
            {isSuspense ? "advance issue" : "payment"}
            {amount ? <> of <b>{amount}</b></> : null} one step. The paid row is{" "}
            <b>removed from the ledger</b> (not reversed with an adjustment), cash returns to the
            branch balance, and the request goes back to the accounts queue. Only available before
            the receiver confirms cash.
          </>
        )}
      </p>
      {!confirm ? (
        <button type="button" className="btn-warn" disabled={busy} onClick={() => setConfirm(true)}>
          {label}
        </button>
      ) : (
        <>
          <div>
            <label className="label">Reason (required — shown in activity)</label>
            <input
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Paid wrong amount / paid wrong request"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-danger"
              disabled={busy || !reason.trim()}
              onClick={() => post("undo-payment", { reason: reason.trim() })}
            >
              Confirm {label}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() => {
                setConfirm(false);
                setReason("");
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

// ---------- Close when advance fully returned (no receipt) ----------
function CloseFullyReturnedPanel({
  post,
  busy,
}: {
  post: (p: string, b: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
}) {
  return (
    <div className="card space-y-3 p-4">
      <p className="label">Close suspense</p>
      <p className="text-sm text-slate-600">
        Outstanding balance is <b>{money(0)}</b>. The full advance has been returned. You can close
        this suspense with no expense and without a final receipt.
      </p>
      <button
        className="btn-success"
        disabled={busy}
        onClick={() => post("close-fully-returned", {})}
      >
        Close as Fully Returned
      </button>
    </div>
  );
}

// ---------- Partial cash return (open suspense) ----------
function PartialReturnPanel({
  request,
  post,
  busy,
}: {
  request: EnrichedRequest;
  post: (p: string, b: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const outstanding = round2(
    Math.max(
      0,
      Number(request.paid_amount || 0) -
        Number(request.returned_amount || 0) -
        Number(request.actual_expense_amount || 0)
    )
  );
  const value = Number(amount);
  const valid = value > 0 && value <= outstanding;

  if (outstanding <= 0) return null;

  return (
    <div className="card space-y-3 p-4">
      <p className="label">Partial cash return</p>
      <p className="text-sm text-slate-600">
        Outstanding advance: <b>{money(outstanding)}</b>. Record cash returned now; the suspense
        stays open until final settlement (or close when the balance reaches zero).
      </p>
      <div>
        <label className="label">Amount returned</label>
        <input
          className="input"
          type="number"
          step="0.01"
          min="0.01"
          max={outstanding}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Note (optional)</label>
        <input
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. first installment"
        />
      </div>
      <button
        className="btn-primary"
        disabled={busy || !valid}
        onClick={async () => {
          const ok = await post("partial-return", {
            amount: value,
            note: note.trim() || undefined,
          });
          if (ok) {
            setAmount("");
            setNote("");
          }
        }}
      >
        Record Partial Return
      </button>
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
  const alreadyReturned = Number(request.returned_amount || 0);
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
  // remaining after prior partial returns: positive -> return now, negative -> additional payable
  const remaining = round2(advance - actualTotal - alreadyReturned);

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
      <p className="text-sm text-slate-600">
        Advance issued: {money(advance)}
        {alreadyReturned > 0 && (
          <>
            {" · "}Already returned: {money(alreadyReturned)}
          </>
        )}
      </p>

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
          {remaining > 0 ? (
            <p className="text-emerald-700">
              Messenger returns <b>{money(remaining)}</b> to accounts
              {alreadyReturned > 0 ? " (after prior returns)" : ""}.
            </p>
          ) : remaining < 0 ? (
            <p className="text-amber-700">
              Accounts pays additional <b>{money(-remaining)}</b> to messenger.
            </p>
          ) : (
            <p className="text-slate-700">
              Fully settled
              {alreadyReturned > 0 ? " with prior returns" : ""}. Nothing further to return.
            </p>
          )}
        </div>
      )}
      {remaining < 0 && actualDisplay !== "" && (
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
