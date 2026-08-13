import type { ChargeType, Role } from "@/lib/types";
import type { CashReceiverType } from "@/lib/cashReceiverOptionsShared";

const DRAFT_VERSION = 1 as const;

export type NewRequestDraftCharge = {
  jobNumber: string;
  truckNumber: string;
  trailerNumber: string;
  driverId: number | "";
  description: string;
  amount: string;
  fuelVehicleNo: string;
  fuelVehicleLabel: string;
  fuelFromKm: string;
  fuelToKm: string;
  fuelLiters: string;
};

export type NewRequestDraft = {
  v: typeof DRAFT_VERSION;
  savedAt: string;
  role: Role;
  requestType: "exact" | "suspense";
  chargeType: ChargeType;
  branchId: number | "";
  receiverType: CashReceiverType;
  receiverUserId: number | "";
  receiverLabel: string;
  fuelCharges: boolean;
  charges: NewRequestDraftCharge[];
};

function storageKey(role: Role) {
  return `pettycash:new-request-draft:v${DRAFT_VERSION}:${role}`;
}

export function isNewRequestDraftMeaningful(draft: NewRequestDraft | null | undefined): boolean {
  if (!draft?.charges?.length) return false;
  return draft.charges.some(
    (c) =>
      Boolean(c.description?.trim()) ||
      Boolean(c.amount && Number(c.amount) > 0) ||
      Boolean(c.jobNumber?.trim()) ||
      Boolean(c.truckNumber?.trim()) ||
      Boolean(c.trailerNumber?.trim()) ||
      Boolean(c.driverId) ||
      Boolean(c.fuelVehicleNo?.trim()) ||
      Boolean(c.fuelLiters?.trim()) ||
      Boolean(c.fuelFromKm?.trim()) ||
      Boolean(c.fuelToKm?.trim())
  );
}

export function readNewRequestDraft(role: Role): NewRequestDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(role));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NewRequestDraft;
    if (!parsed || parsed.v !== DRAFT_VERSION || !Array.isArray(parsed.charges)) return null;
    if (parsed.role && parsed.role !== role) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeNewRequestDraft(role: Role, draft: Omit<NewRequestDraft, "v" | "savedAt" | "role">) {
  if (typeof window === "undefined") return;
  try {
    const payload: NewRequestDraft = {
      v: DRAFT_VERSION,
      savedAt: new Date().toISOString(),
      role,
      ...draft,
    };
    if (!isNewRequestDraftMeaningful(payload)) {
      window.localStorage.removeItem(storageKey(role));
      return;
    }
    window.localStorage.setItem(storageKey(role), JSON.stringify(payload));
  } catch {
    // Quota / private mode — ignore.
  }
}

export function clearNewRequestDraft(role: Role) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(role));
  } catch {
    // ignore
  }
}

export function formatDraftSavedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "earlier";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
