import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { query, queryOne, withTransaction } from "@/lib/db";
import { PettyCashRequest, type Role } from "@/lib/types";
import { replaceRequestJobNumbers } from "@/lib/requests";
import { parseJobNumbers, resolveBranchFromJobNumbers, pickAccountsUser } from "@/lib/routing";
import { auditTx } from "@/lib/audit";
import { EXACT_STATUS, SUSPENSE_STATUS } from "@/lib/status";
import {
  createStateFromApprovalPath,
  getApprovalPath,
} from "@/lib/approvalPolicy";
import { resolveRoleForBranch } from "@/lib/branchMembership";

type CorrectionCharge = {
  charge_id: number;
  description: string;
  amount: number;
  job_number: string | null;
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession([
      "cash_requester",
      "messenger",
      "operations",
      "supervisor",
      "accounts",
      "accounts_supervisor",
      "admin",
    ]);
    const id = Number(params.id);
    const body = await req.json().catch(() => ({}));
    const chargeInputs: CorrectionCharge[] | null = Array.isArray(body.charges)
      ? body.charges.map((charge: any) => ({
          charge_id: Number(charge?.charge_id),
          description: String(charge?.description || "").trim(),
          amount: Number(charge?.amount),
          job_number:
            charge?.job_number != null ? String(charge.job_number).trim() || null : null,
        }))
      : null;
    const description = chargeInputs
      ? chargeInputs.map((charge) => charge.description).join("\n")
      : body.description != null
        ? String(body.description).trim()
        : null;
    const amount = chargeInputs
      ? chargeInputs.reduce((total, charge) => total + charge.amount, 0)
      : body.amount != null
        ? Number(body.amount)
        : null;
    const note = body.note != null ? String(body.note).trim() : null;
    const branchIdInput = body.branch_id != null ? Number(body.branch_id) : null;
    const jobNumbersInput = chargeInputs
      ? parseJobNumbers(
          chargeInputs
            .map((charge) => charge.job_number)
            .filter((jobNumber): jobNumber is string => Boolean(jobNumber))
        )
      : Array.isArray(body.job_numbers)
        ? parseJobNumbers(body.job_numbers.map(String))
        : null;

    const request = await queryOne<PettyCashRequest>("SELECT * FROM petty_cash_requests WHERE id = ?", [id]);
    if (!request) throw new ApiError(404, "Request not found");
    if (request.submitted_by_user_id !== session.id) {
      throw new ApiError(403, "Only the submitter can resubmit this request.");
    }

    const returnedStatus =
      request.request_type === "exact" ? EXACT_STATUS.RETURNED : SUSPENSE_STATUS.RETURNED;
    if (request.status !== returnedStatus) {
      throw new ApiError(409, "Request is not awaiting correction.");
    }

    const storedCharges = await query<{ id: number }>(
      "SELECT id FROM request_charges WHERE request_id = ? ORDER BY sort_order, id",
      [id]
    );
    if (chargeInputs) {
      if (chargeInputs.length === 0) throw new ApiError(400, "At least one charge is required.");
      if (
        storedCharges.length > 0 &&
        (chargeInputs.length !== storedCharges.length ||
          storedCharges.some(
            (stored) => !chargeInputs.some((charge) => charge.charge_id === stored.id)
          ))
      ) {
        throw new ApiError(400, "The submitted charges do not match this request.");
      }
      for (const charge of chargeInputs) {
        if (!charge.description) throw new ApiError(400, "Each charge needs a description.");
        if (!(charge.amount > 0)) {
          throw new ApiError(400, "Each charge amount must be greater than zero.");
        }
        if (request.charge_type === "job" && !charge.job_number) {
          throw new ApiError(400, "Each charge needs a job number.");
        }
      }
    }

    if (description !== null && !description) throw new ApiError(400, "Description cannot be empty.");
    if (amount != null && !(amount > 0)) throw new ApiError(400, "Amount must be greater than zero.");

    if (request.request_type === "exact") {
      const receiptRows = await query<{ charge_id: number | null }>(
        "SELECT charge_id FROM receipts WHERE request_id = ? AND receipt_type = 'request'",
        [id]
      );
      if (receiptRows.length === 0) {
        throw new ApiError(422, "Upload at least one clear receipt before resubmitting.");
      }
      // Every charge needs its own receipt, same as when the request was created.
      // Receipts saved before per-charge linking count towards the first charge.
      if (storedCharges.length > 0) {
        const linkedChargeIds = new Set(
          receiptRows
            .map((receipt) =>
              receipt.charge_id ?? (storedCharges[0] ? storedCharges[0].id : null)
            )
            .filter((chargeId): chargeId is number => chargeId != null)
        );
        const missing = storedCharges
          .map((charge, index) => ({ charge, index }))
          .filter(({ charge }) => !linkedChargeIds.has(charge.id));
        if (missing.length > 0) {
          throw new ApiError(
            422,
            storedCharges.length > 1
              ? `Upload a receipt for charge ${missing
                  .map(({ index }) => index + 1)
                  .join(", ")} before resubmitting.`
              : "Upload at least one clear receipt before resubmitting."
          );
        }
      }
    }

    let branchId = request.branch_id;
    let primaryJobNumber: string | null = request.job_number;
    let accountsUserId = request.accounts_user_id;

    if (request.charge_type === "job") {
      const jobNumbers = jobNumbersInput ?? [];
      if (jobNumbers.length === 0) {
        throw new ApiError(400, "At least one job number is required.");
      }
      const resolution = await resolveBranchFromJobNumbers(jobNumbers);
      if (!resolution.ok || !resolution.branch) {
        throw new ApiError(422, resolution.error || "Could not resolve branch from job number.");
      }
      branchId = resolution.branch.id;
      primaryJobNumber = jobNumbers[0];
      accountsUserId = await pickAccountsUser(branchId);
    } else if (branchIdInput) {
      const branch = await queryOne<{ id: number }>(
        "SELECT id FROM branches WHERE id = ? AND is_active = 1",
        [branchIdInput]
      );
      if (!branch) throw new ApiError(400, "Selected branch is invalid.");
      branchId = branch.id;
      primaryJobNumber = null;
      accountsUserId = await pickAccountsUser(branchId);
    }

    const submitterRole =
      (request.submitter_role as Role | null) ||
      (await resolveRoleForBranch(session.id, branchId, session.role));
    const approvalPath = await getApprovalPath(branchId, submitterRole, session.id);
    const resubmitAmount = amount ?? Number(request.requested_amount);
    const createState = createStateFromApprovalPath(
      approvalPath,
      request.request_type as "exact" | "suspense",
      resubmitAmount
    );
    const newStatus = createState.status;
    const approvedAmount = createState.approved_amount;

    await withTransaction(async (conn) => {
      await conn.execute(
        `UPDATE petty_cash_requests
            SET status = ?, reject_reason = NULL, processing_by_user_id = NULL,
                description = COALESCE(?, description),
                requested_amount = COALESCE(?, requested_amount),
                approved_amount = ?,
                approved_at = IF(? IS NOT NULL, NOW(), NULL),
                branch_id = ?, job_number = ?, accounts_user_id = ?
          WHERE id = ?`,
        [
          newStatus,
          description,
          amount,
          approvedAmount,
          approvedAmount,
          branchId,
          primaryJobNumber,
          accountsUserId,
          id,
        ]
      );

      if (chargeInputs && storedCharges.length > 0) {
        for (const charge of chargeInputs) {
          await conn.execute(
            `UPDATE request_charges
                SET description = ?, amount = ?, job_number = ?
              WHERE id = ? AND request_id = ?`,
            [
              charge.description,
              charge.amount,
              request.charge_type === "job" ? charge.job_number : null,
              charge.charge_id,
              id,
            ]
          );
        }
      }

      if (request.charge_type === "job" && jobNumbersInput) {
        await replaceRequestJobNumbers(conn, id, jobNumbersInput);

        // Backward compatibility for old clients that do not send per-charge data.
        if (!chargeInputs) {
          if (storedCharges.length === 1 || jobNumbersInput.length === 1) {
            await conn.execute(
              `UPDATE request_charges SET job_number = ? WHERE request_id = ?`,
              [jobNumbersInput[0], id]
            );
          } else {
            for (let i = 0; i < storedCharges.length; i++) {
              const job = jobNumbersInput[i] ?? jobNumbersInput[0];
              await conn.execute(`UPDATE request_charges SET job_number = ? WHERE id = ?`, [
                job,
                storedCharges[i].id,
              ]);
            }
          }
        }
      }

      await conn.execute(
        `INSERT INTO approvals (request_id, approver_user_id, approval_level, action, comments)
         VALUES (?,?,?,?,?)`,
        [id, session.id, "submitter", "resubmit", note || "Corrected and resubmitted"]
      );

      await auditTx(conn, {
        userId: session.id,
        action: "resubmit_request",
        entityType: "petty_cash_request",
        entityId: id,
        oldValue: { status: request.status, branch_id: request.branch_id },
        newValue: { status: newStatus, branch_id: branchId },
      });
    });

    return ok();
  } catch (err) {
    return fail(err);
  }
}
