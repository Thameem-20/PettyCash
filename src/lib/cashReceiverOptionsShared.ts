export type CashReceiverType = "myself" | "messenger" | "supervisor";

export type CashReceiverOptions = {
  myself: boolean;
  messenger: boolean;
  supervisor: boolean;
};

export const DEFAULT_CASH_RECEIVER_OPTIONS: CashReceiverOptions = {
  myself: true,
  messenger: true,
  supervisor: true,
};

export function isCashReceiverTypeAllowed(
  options: CashReceiverOptions,
  type: string
): type is CashReceiverType {
  if (type === "myself") return options.myself;
  if (type === "messenger") return options.messenger;
  if (type === "supervisor") return options.supervisor;
  return false;
}

export function firstAllowedCashReceiverType(
  options: CashReceiverOptions
): CashReceiverType {
  if (options.myself) return "myself";
  if (options.messenger) return "messenger";
  if (options.supervisor) return "supervisor";
  return "myself";
}
