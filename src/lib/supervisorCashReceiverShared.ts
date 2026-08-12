/** Stored in cash_receiver_label when ops pick "Supervisor" as a role, not a person. */
export const ROLE_SUPERVISOR_RECEIVER_LABEL = "__role:supervisor__";

export function isRoleSupervisorReceiver(label: string | null | undefined): boolean {
  return label === ROLE_SUPERVISOR_RECEIVER_LABEL;
}

/** Display label for UI / PDFs when the receiver is the branch/personal supervisor role. */
export function formatCashReceiverDisplay(
  receiverName: string | null | undefined,
  cashReceiverLabel: string | null | undefined
): string {
  if (isRoleSupervisorReceiver(cashReceiverLabel)) {
    return receiverName?.trim() ? `Supervisor (${receiverName.trim()})` : "Supervisor";
  }
  return receiverName?.trim() || cashReceiverLabel?.trim() || "-";
}
