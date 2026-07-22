import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import {
  APPROVAL_PATH_LABELS,
  deleteUserApprovalException,
  listUserApprovalExceptions,
  upsertUserApprovalException,
  type ApprovalPath,
} from "@/lib/approvalPolicy";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

const VALID_PATHS = new Set(Object.keys(APPROVAL_PATH_LABELS) as ApprovalPath[]);

export async function GET() {
  try {
    await requireApiSession(["admin"]);
    return ok({ exceptions: await listUserApprovalExceptions() });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireApiSession(["admin"]);
    const body = await req.json();
    const userId = Number(body.user_id);
    const branchId =
      body.branch_id == null || body.branch_id === "" || body.branch_id === "all"
        ? null
        : Number(body.branch_id);
    const approvalPath = String(body.approval_path || "") as ApprovalPath;
    const note = body.note != null ? String(body.note).trim() || null : null;

    if (!Number.isFinite(userId) || userId <= 0) {
      throw new ApiError(422, "user_id is required");
    }
    if (!VALID_PATHS.has(approvalPath)) {
      throw new ApiError(422, `Invalid approval_path: ${approvalPath}`);
    }
    if (branchId != null && (!Number.isFinite(branchId) || branchId <= 0)) {
      throw new ApiError(422, "Invalid branch_id");
    }

    const user = await queryOne<{ id: number }>(
      "SELECT id FROM users WHERE id = ? AND is_active = 1",
      [userId]
    );
    if (!user) throw new ApiError(404, "User not found");

    if (branchId != null) {
      const branch = await queryOne<{ id: number }>(
        "SELECT id FROM branches WHERE id = ? AND is_active = 1",
        [branchId]
      );
      if (!branch) throw new ApiError(404, "Branch not found");
    }

    await upsertUserApprovalException({
      userId,
      branchId,
      approvalPath,
      note,
    });

    return ok({ exceptions: await listUserApprovalExceptions() });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireApiSession(["admin"]);
    const body = await req.json().catch(() => ({}));
    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) {
      throw new ApiError(422, "id is required");
    }
    const removed = await deleteUserApprovalException(id);
    if (!removed) throw new ApiError(404, "Exception not found");
    return ok({ exceptions: await listUserApprovalExceptions() });
  } catch (err) {
    return fail(err);
  }
}
