import type { PettyCashRequest } from "./types";

/**
 * Accounts Supervisor pays staff reimbursements they own in the workflow
 * (accounts Approve & Pay, supervisor reimbursements). Field requests they
 * approve-for-payment are paid by Accounts, not claimed by Acc Sup.
 */
export function accountsSupervisorMayProcess(
  request: Pick<PettyCashRequest, "submitter_role" | "request_type">
): boolean {
  if (request.submitter_role === "supervisor") return true;
  return request.submitter_role === "accounts" && request.request_type === "exact";
}

const ACC_SUP_ROUND_ACTIONS = new Set([
  "escalate_accounts_supervisor",
  "approve_for_payment",
  "return",
  "return_on_behalf",
  "resubmit",
]);

/** True when Acc Sup already approved the current escalate round (Accounts should pay). */
export function accSupAlreadyApprovedForPayment(
  approvals: { action: string }[]
): boolean {
  for (let i = approvals.length - 1; i >= 0; i--) {
    const action = approvals[i].action;
    if (!ACC_SUP_ROUND_ACTIONS.has(action)) continue;
    return action === "approve_for_payment";
  }
  return false;
}
