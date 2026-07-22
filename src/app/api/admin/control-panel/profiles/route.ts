import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import {
  listBranchProfiles,
  updateBranchProfile,
  type BranchCodingType,
  type BranchRequestMode,
} from "@/lib/branchProfile";
import { isChargeTypeScope } from "@/lib/chargeTypePolicy";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireApiSession(["admin"]);
    const profiles = await listBranchProfiles();
    return ok({ profiles });
  } catch (err) {
    return fail(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireApiSession(["admin"]);
    const body = await req.json();
    const branchId = Number(body.branch_id);
    if (!Number.isFinite(branchId) || branchId <= 0) {
      throw new ApiError(422, "branch_id is required");
    }

    const request_mode = body.request_mode as BranchRequestMode | undefined;
    const coding_type = body.coding_type as BranchCodingType | undefined;
    if (request_mode && request_mode !== "job_based" && request_mode !== "compassion") {
      throw new ApiError(422, "Invalid request_mode");
    }
    if (coding_type && !["zybo", "pcp_jv", "none"].includes(coding_type)) {
      throw new ApiError(422, "Invalid coding_type");
    }

    let default_supervisor_user_id: number | null | undefined = undefined;
    if (body.default_supervisor_user_id !== undefined) {
      if (body.default_supervisor_user_id === null || body.default_supervisor_user_id === "") {
        default_supervisor_user_id = null;
      } else {
        default_supervisor_user_id = Number(body.default_supervisor_user_id);
        if (!Number.isFinite(default_supervisor_user_id)) {
          throw new ApiError(422, "Invalid default_supervisor_user_id");
        }
      }
    }

    if (body.charge_type_scope != null && !isChargeTypeScope(body.charge_type_scope)) {
      throw new ApiError(422, "Invalid charge_type_scope");
    }

    await updateBranchProfile(branchId, {
      request_mode,
      coding_type,
      default_supervisor_user_id,
      allow_suspense:
        body.allow_suspense === undefined ? undefined : Boolean(body.allow_suspense),
      charge_type_scope: body.charge_type_scope,
    });

    return ok({ profiles: await listBranchProfiles() });
  } catch (err) {
    return fail(err);
  }
}
