/** Job-based charge type restrictions (branch + suspense-by-role). */

export type ChargeTypeScope = "job_and_non_job" | "job_only" | "non_job_only";
export type SuspenseChargeScope = "inherit" | ChargeTypeScope;
export type JobChargeType = "job" | "non_job";

export const CHARGE_TYPE_SCOPE_LABELS: Record<ChargeTypeScope, string> = {
  job_and_non_job: "Job + Non-job",
  job_only: "Job related only",
  non_job_only: "Non-job related only",
};

export const SUSPENSE_CHARGE_SCOPE_LABELS: Record<SuspenseChargeScope, string> = {
  inherit: "Same as branch",
  job_and_non_job: "Job + Non-job",
  job_only: "Job related only",
  non_job_only: "Non-job related only",
};

export function isChargeTypeScope(v: unknown): v is ChargeTypeScope {
  return v === "job_and_non_job" || v === "job_only" || v === "non_job_only";
}

export function isSuspenseChargeScope(v: unknown): v is SuspenseChargeScope {
  return v === "inherit" || isChargeTypeScope(v);
}

export function chargeTypesFromScope(scope: ChargeTypeScope): JobChargeType[] {
  switch (scope) {
    case "job_only":
      return ["job"];
    case "non_job_only":
      return ["non_job"];
    default:
      return ["job", "non_job"];
  }
}

/** Effective allowed job/non_job types for a request. */
export function resolveAllowedJobChargeTypes(
  branchScope: ChargeTypeScope,
  suspenseScope: SuspenseChargeScope,
  requestType: "exact" | "suspense"
): JobChargeType[] {
  const branchAllowed = chargeTypesFromScope(branchScope);
  if (requestType !== "suspense" || suspenseScope === "inherit") {
    return branchAllowed;
  }
  const suspenseAllowed = new Set(chargeTypesFromScope(suspenseScope));
  return branchAllowed.filter((t) => suspenseAllowed.has(t));
}

export function pickDefaultJobChargeType(allowed: JobChargeType[]): JobChargeType {
  if (allowed.includes("job") && !allowed.includes("non_job")) return "job";
  if (allowed.includes("non_job") && !allowed.includes("job")) return "non_job";
  return allowed[0] ?? "non_job";
}
