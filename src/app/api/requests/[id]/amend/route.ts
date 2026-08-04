import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { query, queryOne, withTransaction } from "@/lib/db";
import { PettyCashRequest } from "@/lib/types";
import { auditTx } from "@/lib/audit";
import { resolveOrCreateCategory } from "@/lib/categories";
import { replaceRequestJobNumbers } from "@/lib/requests";
import { postLedger } from "@/lib/ledger";
import { isElevated } from "@/lib/rbac";
import { money, round2 } from "@/lib/util";
import { canAccSupAmend, canAccSupAmendAmounts, canAccSupCorrectPaidAmount } from "@/lib/accSupAmend";

type ChargeAmend = {
  charge_id: number;
  description?: string;
  amount?: number;
  job_number?: string | null;
  truck_number?: string | null;
  trailer_number?: string | null;
  vehicle_number?: string | null;
  vehicle_label?: string | null;
  fuel_from_km?: number | null;
  fuel_to_km?: number | null;
  fuel_liters?: number | null;
};

/**
 * Accounts Supervisor (or admin) amend of an open request.
 * Amounts only before pay/issue; metadata allowed while still open after cash moved.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["accounts_supervisor", "admin"]);
    const id = Number(params.id);
    const body = await req.json();
    const reason = String(body.reason || "").trim();
    if (!reason) throw new ApiError(400, "A reason is required for every edit.");

    const request = await queryOne<PettyCashRequest>(
      "SELECT * FROM petty_cash_requests WHERE id = ?",
      [id]
    );
    if (!request) throw new ApiError(404, "Request not found");
    if (!canAccSupAmend(request.status)) {
      throw new ApiError(409, `This request cannot be edited in status: ${request.status}.`);
    }

    const allowAmounts = canAccSupAmendAmounts(request.status);
    const description =
      body.description != null ? String(body.description).trim() : null;
    if (description !== null && !description) {
      throw new ApiError(400, "Description cannot be empty.");
    }

    let approvedAmount: number | null = null;
    if (body.approved_amount != null && body.approved_amount !== "") {
      if (!allowAmounts) {
        throw new ApiError(422, "Amounts cannot be changed after cash has been issued or paid.");
      }
      approvedAmount = round2(Number(body.approved_amount));
      if (!(approvedAmount > 0)) {
        throw new ApiError(400, "Approved amount must be greater than zero.");
      }
    }

    // Correct the actual paid/issued amount after cash has already moved (e.g. a
    // mistyped payment). This adjusts the branch cash ledger by the difference.
    let paidAmountCorrection: number | null = null;
    if (body.paid_amount != null && body.paid_amount !== "") {
      if (!canAccSupCorrectPaidAmount(request.status, request.paid_amount)) {
        throw new ApiError(
          422,
          "The paid amount can only be corrected while the request is open and cash has already moved."
        );
      }
      paidAmountCorrection = round2(Number(body.paid_amount));
      if (!(paidAmountCorrection > 0)) {
        throw new ApiError(400, "Paid amount must be greater than zero.");
      }
    }

    const chargeInputs: ChargeAmend[] = Array.isArray(body.charges)
      ? body.charges.map((row: Record<string, unknown>) => ({
          charge_id: Number(row.charge_id),
          description: row.description != null ? String(row.description).trim() : undefined,
          amount: row.amount != null && row.amount !== "" ? Number(row.amount) : undefined,
          job_number:
            row.job_number !== undefined
              ? row.job_number == null || String(row.job_number).trim() === ""
                ? null
                : String(row.job_number).trim()
              : undefined,
          truck_number:
            row.truck_number !== undefined
              ? row.truck_number == null || String(row.truck_number).trim() === ""
                ? null
                : String(row.truck_number).trim()
              : undefined,
          trailer_number:
            row.trailer_number !== undefined
              ? row.trailer_number == null || String(row.trailer_number).trim() === ""
                ? null
                : String(row.trailer_number).trim()
              : undefined,
          vehicle_number:
            row.vehicle_number !== undefined
              ? row.vehicle_number == null || String(row.vehicle_number).trim() === ""
                ? null
                : String(row.vehicle_number).trim()
              : undefined,
          vehicle_label:
            row.vehicle_label !== undefined
              ? row.vehicle_label == null || String(row.vehicle_label).trim() === ""
                ? null
                : String(row.vehicle_label).trim()
              : undefined,
          fuel_from_km:
            row.fuel_from_km !== undefined
              ? row.fuel_from_km == null || row.fuel_from_km === ""
                ? null
                : Number(row.fuel_from_km)
              : undefined,
          fuel_to_km:
            row.fuel_to_km !== undefined
              ? row.fuel_to_km == null || row.fuel_to_km === ""
                ? null
                : Number(row.fuel_to_km)
              : undefined,
          fuel_liters:
            row.fuel_liters !== undefined
              ? row.fuel_liters == null || row.fuel_liters === ""
                ? null
                : Number(row.fuel_liters)
              : undefined,
        }))
      : [];

    const existingCharges = await query<{
      id: number;
      description: string;
      amount: number;
      category_id: number | null;
      job_number: string | null;
    }>("SELECT id, description, amount, category_id, job_number FROM request_charges WHERE request_id = ?", [
      id,
    ]);

    if (chargeInputs.length > 0) {
      const byId = new Map(existingCharges.map((c) => [c.id, c]));
      for (const ch of chargeInputs) {
        if (!byId.has(ch.charge_id)) {
          throw new ApiError(400, `Unknown charge id ${ch.charge_id}.`);
        }
        if (ch.amount != null) {
          if (!allowAmounts) {
            throw new ApiError(422, "Charge amounts cannot be changed after cash has moved.");
          }
          if (!(ch.amount > 0) || !Number.isFinite(ch.amount)) {
            throw new ApiError(400, "Each charge amount must be greater than zero.");
          }
        }
        if (ch.description !== undefined && !ch.description) {
          throw new ApiError(400, "Charge description cannot be empty.");
        }
      }
    }

    const oldAmount = Number(request.approved_amount ?? request.requested_amount);
    let newApproved = approvedAmount;
    let amountChanged = false;

    await withTransaction(async (conn) => {
      const amountByCharge = new Map(existingCharges.map((c) => [c.id, Number(c.amount)]));
      for (const ch of chargeInputs) {
        if (ch.amount != null) amountByCharge.set(ch.charge_id, round2(ch.amount));
      }

      if (allowAmounts && (approvedAmount != null || chargeInputs.some((c) => c.amount != null))) {
        const totalFromCharges =
          existingCharges.length > 0
            ? round2([...amountByCharge.values()].reduce((s, n) => s + n, 0))
            : null;
        if (newApproved == null && totalFromCharges != null) {
          newApproved = totalFromCharges;
        }
        if (newApproved != null) {
          amountChanged = round2(newApproved) !== round2(oldAmount);
          await conn.execute(
            `UPDATE petty_cash_requests
                SET approved_amount = ?, requested_amount = ?
              WHERE id = ?`,
            [newApproved, newApproved, id]
          );
        }
      }

      const oldPaidAmount = Number(request.paid_amount || 0);
      let paidAmountChanged = false;
      if (paidAmountCorrection != null) {
        const delta = round2(paidAmountCorrection - oldPaidAmount);
        if (delta !== 0) {
          paidAmountChanged = true;
          const allowNeg = Boolean(body.allow_negative) && isElevated(session.role);
          await postLedger(conn, {
            branchId: request.branch_id,
            transactionType: "adjustment",
            debit: delta > 0 ? delta : 0,
            credit: delta < 0 ? -delta : 0,
            requestId: id,
            createdByUserId: session.id,
            remarks: `Paid amount corrected for ${request.request_no}: ${money(oldPaidAmount)} → ${money(
              paidAmountCorrection
            )} — ${reason}`,
            allowNegative: allowNeg,
          });
          await conn.execute(
            `UPDATE petty_cash_requests SET paid_amount = ?, approved_amount = ? WHERE id = ?`,
            [paidAmountCorrection, paidAmountCorrection, id]
          );
        }
      }

      let headerDescription = description;
      if (headerDescription) {
        const categoryId = await resolveOrCreateCategory(
          headerDescription,
          request.charge_type as "job" | "non_job" | "truck_trailer" | "general",
          conn
        );
        await conn.execute(
          `UPDATE petty_cash_requests SET description = ?, category_id = ? WHERE id = ?`,
          [headerDescription, categoryId, id]
        );
      }

      const mergedJobs: string[] = [];

      for (const current of existingCharges) {
        const ch = chargeInputs.find((c) => c.charge_id === current.id);
        if (!ch) {
          if (current.job_number) mergedJobs.push(current.job_number);
          continue;
        }

        let categoryId = current.category_id;
        const nextDesc = ch.description ?? current.description;
        if (ch.description != null && ch.description !== current.description) {
          categoryId = await resolveOrCreateCategory(
            ch.description,
            request.charge_type as "job" | "non_job" | "truck_trailer" | "general",
            conn
          );
        }

        const nextAmount = ch.amount != null ? round2(ch.amount) : Number(current.amount);
        const nextJob =
          ch.job_number !== undefined ? ch.job_number : current.job_number;

        await conn.execute(
          `UPDATE request_charges SET
              description = ?,
              amount = ?,
              category_id = ?,
              job_number = IF(? = 1, ?, job_number),
              truck_number = IF(? = 1, ?, truck_number),
              trailer_number = IF(? = 1, ?, trailer_number),
              vehicle_number = IF(? = 1, ?, vehicle_number),
              vehicle_label = IF(? = 1, ?, vehicle_label),
              fuel_from_km = IF(? = 1, ?, fuel_from_km),
              fuel_to_km = IF(? = 1, ?, fuel_to_km),
              fuel_liters = IF(? = 1, ?, fuel_liters)
            WHERE id = ? AND request_id = ?`,
          [
            nextDesc,
            nextAmount,
            categoryId,
            ch.job_number !== undefined ? 1 : 0,
            nextJob,
            ch.truck_number !== undefined ? 1 : 0,
            ch.truck_number ?? null,
            ch.trailer_number !== undefined ? 1 : 0,
            ch.trailer_number ?? null,
            ch.vehicle_number !== undefined ? 1 : 0,
            ch.vehicle_number ?? null,
            ch.vehicle_label !== undefined ? 1 : 0,
            ch.vehicle_label ?? null,
            ch.fuel_from_km !== undefined ? 1 : 0,
            ch.fuel_from_km ?? null,
            ch.fuel_to_km !== undefined ? 1 : 0,
            ch.fuel_to_km ?? null,
            ch.fuel_liters !== undefined ? 1 : 0,
            ch.fuel_liters ?? null,
            ch.charge_id,
            id,
          ]
        );

        if (nextJob) mergedJobs.push(nextJob);
      }

      if (request.charge_type === "job" && chargeInputs.some((c) => c.job_number !== undefined)) {
        const uniqueJobs = [...new Set(mergedJobs.filter(Boolean))];
        await replaceRequestJobNumbers(conn, id, uniqueJobs);
        await conn.execute(`UPDATE petty_cash_requests SET job_number = ? WHERE id = ?`, [
          uniqueJobs[0] ?? null,
          id,
        ]);
      } else if (
        request.charge_type === "job" &&
        existingCharges.length === 0 &&
        Array.isArray(body.job_numbers)
      ) {
        const jobs = body.job_numbers.map((j: unknown) => String(j).trim()).filter(Boolean);
        await replaceRequestJobNumbers(conn, id, jobs);
        await conn.execute(`UPDATE petty_cash_requests SET job_number = ? WHERE id = ?`, [
          jobs[0] ?? null,
          id,
        ]);
      }

      const commentParts = [reason];
      if (amountChanged && newApproved != null) {
        commentParts.push(`Amount ${money(oldAmount)} → ${money(newApproved)}`);
      }
      if (paidAmountChanged) {
        commentParts.push(`Paid amount ${money(oldPaidAmount)} → ${money(paidAmountCorrection!)}`);
      }
      if (headerDescription) commentParts.push("Description updated");
      if (chargeInputs.length) commentParts.push(`Charges updated (${chargeInputs.length})`);

      const approvalAction = amountChanged
        ? "edit_amount"
        : paidAmountChanged
          ? "edit_paid_amount"
          : "amend";

      await conn.execute(
        `INSERT INTO approvals (request_id, approver_user_id, approval_level, action, comments, old_amount, new_amount)
         VALUES (?,?,?,?,?,?,?)`,
        [
          id,
          session.id,
          "accounts_supervisor",
          approvalAction,
          commentParts.join(" · "),
          amountChanged ? oldAmount : paidAmountChanged ? oldPaidAmount : null,
          amountChanged ? newApproved : paidAmountChanged ? paidAmountCorrection : null,
        ]
      );

      await auditTx(conn, {
        userId: session.id,
        action: "acc_sup_amend_request",
        entityType: "petty_cash_request",
        entityId: id,
        oldValue: {
          status: request.status,
          description: request.description,
          approved_amount: request.approved_amount,
          requested_amount: request.requested_amount,
          paid_amount: request.paid_amount,
        },
        newValue: {
          reason,
          description: headerDescription,
          approved_amount: newApproved,
          charges: chargeInputs,
          allow_amounts: allowAmounts,
          paid_amount: paidAmountChanged ? paidAmountCorrection : undefined,
        },
      });
    });

    return ok();
  } catch (err) {
    return fail(err);
  }
}
