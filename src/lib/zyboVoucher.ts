/** First segment of a job number, e.g. 101/SIMP/26/225 → 101 */
export function jobNumberBranchSegment(jobNumber: string | null | undefined): string | null {
  if (!jobNumber?.trim()) return null;
  const first = jobNumber.trim().split("/")[0]?.trim();
  return first || null;
}

export function normalizeZyboSuffix(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 0) return null;
  return digits;
}

export function buildZyboVoucherCode(
  branchSegment: string,
  suffix: string,
  date: Date = new Date()
): string {
  const year = String(date.getFullYear()).slice(-2);
  return `PC-${branchSegment}-${year}-${suffix}`;
}

export function zyboVoucherPreview(branchSegment: string, suffix: string): string {
  const year = String(new Date().getFullYear()).slice(-2);
  const tail = suffix.trim() || "••••";
  return `PC-${branchSegment}-${year}-${tail}`;
}

/** Days since payment date (0 = paid today). */
export function zyboVoucherDueLabel(dueDays: number): string {
  const days = Math.max(0, dueDays);
  if (days === 0) return "Due";
  return `Due ${days} day${days === 1 ? "" : "s"}`;
}

export function zyboVoucherDueTone(dueDays: number): "due-today" | "due-soon" | "overdue" {
  const days = Math.max(0, dueDays);
  if (days === 0) return "due-today";
  if (days === 1) return "due-soon";
  return "overdue";
}
