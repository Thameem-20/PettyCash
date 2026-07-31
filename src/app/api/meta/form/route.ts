import { fail, ok, requireApiSession } from "@/lib/api";
import { query } from "@/lib/db";
import { resolveAccountsBranch, type AccountsBranch } from "@/lib/accountsBranch";
import { getBranchProfile, isCompassionMode, listBranchProfiles } from "@/lib/branchProfile";
import { listActiveCompassionDrivers } from "@/lib/compassion";
import { listActiveFleetVehicles } from "@/lib/fleetVehicles";
import { getSuspenseChargeScope } from "@/lib/approvalPolicy";
import { DEFAULT_CASH_RECEIVER_OPTIONS, getCashReceiverOptions } from "@/lib/cashReceiverOptions";
import { resolveRoleForBranch } from "@/lib/branchMembership";
import type { Role } from "@/lib/types";
import type { ChargeTypeScope, SuspenseChargeScope } from "@/lib/chargeTypePolicy";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireApiSession();
    const categories = await query(
      "SELECT id, category_name, charge_type, job_number_required FROM expense_categories WHERE is_active = 1 ORDER BY charge_type, category_name"
    );
    const branches = await query<AccountsBranch>(
      "SELECT id, branch_name, branch_code FROM branches WHERE is_active = 1 ORDER BY branch_name"
    );
    const receivers = await query(
      "SELECT id, name, role FROM users WHERE is_active = 1 AND role = 'messenger' ORDER BY name"
    );
    const supervisors = await query(
      "SELECT id, name, role FROM users WHERE is_active = 1 AND role = 'supervisor' ORDER BY name"
    );

    const preferred = session.preferred_branch_param;
    let defaultBranchId: number | null = null;
    if (preferred && preferred !== "all" && /^\d+$/.test(preferred)) {
      defaultBranchId = Number(preferred);
    } else {
      defaultBranchId =
        session.active_branch_id ??
        session.default_branch_id ??
        resolveAccountsBranch(undefined, branches);
    }

    const defaultBranch = branches.find((b) => b.id === defaultBranchId) || null;
    const profile = defaultBranchId ? await getBranchProfile(defaultBranchId) : null;
    const isCompassion = isCompassionMode(profile);
    const primaryRole = (session.primary_role || session.role) as Role;

    const allProfiles = await listBranchProfiles();
    const branchChargeScopes: Record<number, ChargeTypeScope> = {};
    const branchAllowSuspense: Record<number, boolean> = {};
    for (const p of allProfiles) {
      branchChargeScopes[p.branch_id] = p.charge_type_scope || "job_and_non_job";
      branchAllowSuspense[p.branch_id] = Boolean(p.allow_suspense);
    }

    const branchSuspenseScopes: Record<number, SuspenseChargeScope> = {};
    await Promise.all(
      branches.map(async (b) => {
        const roleForBranch = await resolveRoleForBranch(session.id, b.id, primaryRole);
        branchSuspenseScopes[b.id] = await getSuspenseChargeScope(b.id, roleForBranch);
      })
    );

    const suspenseChargeScope =
      (defaultBranchId && branchSuspenseScopes[defaultBranchId]) || "inherit";

    const cashReceiverOptionsByBranch: Record<number, typeof DEFAULT_CASH_RECEIVER_OPTIONS> = {};
    await Promise.all(
      branches.map(async (b) => {
        cashReceiverOptionsByBranch[b.id] = await getCashReceiverOptions(session.id, b.id);
      })
    );
    const cashReceiverOptions =
      (defaultBranchId && cashReceiverOptionsByBranch[defaultBranchId]) ||
      (await getCashReceiverOptions(session.id, defaultBranchId));

    return ok({
      categories,
      branches,
      receivers,
      supervisors,
      defaultBranchId,
      defaultBranchCode: defaultBranch?.branch_code ?? null,
      isCompassion,
      requestMode: profile?.request_mode ?? "job_based",
      allowSuspense: profile ? Boolean(profile.allow_suspense) : true,
      chargeTypeScope: profile?.charge_type_scope ?? "job_and_non_job",
      suspenseChargeScope,
      branchChargeScopes,
      branchAllowSuspense,
      branchSuspenseScopes,
      cashReceiverOptions,
      cashReceiverOptionsByBranch,
      compassionBranch: isCompassion && profile
        ? {
            id: profile.branch_id,
            branch_name: profile.branch_name,
            branch_code: profile.branch_code,
          }
        : null,
      compassionDrivers: isCompassion ? await listActiveCompassionDrivers() : [],
      fleetVehicles:
        primaryRole === "messenger" || primaryRole === "cash_requester"
          ? await listActiveFleetVehicles()
          : [],
    });
  } catch (err) {
    return fail(err);
  }
}
