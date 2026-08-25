import { RequestActivityItem } from "@/lib/requests";
import { money, formatDate } from "@/lib/util";
import { ROLE_LABELS } from "@/lib/rbac";
import type { Role } from "@/lib/types";

const LEVEL_LABELS: Record<string, string> = {
  submitter: "Submitter",
  receiver: "Receiver",
};

function labelLevel(level: string) {
  if (level in ROLE_LABELS) return ROLE_LABELS[level as Role];
  return LEVEL_LABELS[level] || level.replace(/_/g, " ");
}

const ACTION_LABELS: Record<string, string> = {
  submitted: "Submitted request",
  approve: "Approved",
  approve_pay: "Approve pay",
  approve_for_payment: "Approved for payment",
  approve_on_behalf: "Approved on behalf of supervisor",
  return_on_behalf: "Returned on behalf of supervisor",
  reject_on_behalf: "Rejected on behalf of supervisor",
  escalate_accounts_supervisor: "Sent to Accounts Supervisor",
  reject: "Rejected",
  return: "Returned for correction",
  edit_amount: "Amount edited",
  edit_paid_amount: "Paid amount corrected",
  undo_payment: "Payment undone",
  delete_request: "Request deleted",
  branch_override: "Branch override",
  issue: "Suspense issued",
  pay: "Marked as paid",
  confirm_receipt: "Confirmed cash received",
  settle: "Suspense settled",
  partial_return: "Partial cash returned",
  close_fully_returned: "Closed as fully returned",
  amend: "Request amended",
  resubmit: "Resubmitted for approval",
};

function labelAction(action: string) {
  return ACTION_LABELS[action] || action.replace(/_/g, " ");
}

function dotStyles(action: string) {
  if (action === "reject" || action === "reject_on_behalf") return "border-rose-600 bg-rose-600";
  if (action === "return" || action === "return_on_behalf") return "border-amber-600 bg-amber-600";
  return "border-primary bg-primary";
}

export default function RequestActivity({ items }: { items: RequestActivityItem[] }) {
  return (
    <div className="card p-4 lg:sticky lg:top-24">
      <p className="label mb-3">Activity</p>
      <ul className="space-y-0">
        {items.map((item, i) => (
          <li key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < items.length - 1 && (
              <span
                className="absolute left-[7px] top-4 h-[calc(100%-4px)] w-px bg-primary/30"
                aria-hidden
              />
            )}
            <span
              className={`relative z-10 mt-1 h-3.5 w-3.5 shrink-0 border-2 ${dotStyles(item.action)}`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{labelAction(item.action)}</p>
              <p className="text-xs text-muted-foreground">
                {item.actor} · {labelLevel(item.level)}
              </p>
              {item.old_amount != null && item.new_amount != null ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {money(item.old_amount)} → {money(item.new_amount)}
                </p>
              ) : item.new_amount != null && item.action === "partial_return" ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{money(item.new_amount)}</p>
              ) : item.old_amount != null && item.action === "undo_payment" ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Reversed {money(item.old_amount)}
                </p>
              ) : null}
              {item.comments && <p className="mt-1 text-xs text-muted-foreground">{item.comments}</p>}
              <p className="mt-1 text-[11px] text-muted-foreground">{formatDate(item.created_at)}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
