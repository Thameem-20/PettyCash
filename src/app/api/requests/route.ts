import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { queryOne, withTransaction } from "@/lib/db";
import { resolveOrCreateCategory } from "@/lib/categories";
import { ChargeType } from "@/lib/types";
import { resolveBranchFromJobNumbers, pickAccountsUser, parseJobNumbers } from "@/lib/routing";
import { isElevated } from "@/lib/rbac";
import { saveReceiptFiles, deleteStoredFile } from "@/lib/files";
import { money, nextRequestNo } from "@/lib/util";
import { auditTx } from "@/lib/audit";
import { isStaffReimbursementRole } from "@/lib/status";
import {
  insertRequestJobNumbers,
  insertRequestCharges,
  findDuplicateMessengerJobRequest,
} from "@/lib/requests";
import { isCompassionChargeType } from "@/lib/compassion";
import {
  getBranchProfile,
  isCompassionMode,
  listBranchProfiles,
} from "@/lib/branchProfile";
import {
  resolveRoleForBranch,
  resolveRequestSupervisor,
} from "@/lib/branchMembership";
import {
  createStateFromApprovalPath,
  getApprovalPath,
  getSuspenseChargeScope,
} from "@/lib/approvalPolicy";
import {
  getCashReceiverOptions,
  isCashReceiverTypeAllowed,
} from "@/lib/cashReceiverOptions";
import {
  ROLE_SUPERVISOR_RECEIVER_LABEL,
  resolveSupervisorCashReceiverUserId,
} from "@/lib/supervisorCashReceiver";
import { resolveAllowedJobChargeTypes } from "@/lib/chargeTypePolicy";
import type { Role } from "@/lib/types";
import {
  notifyUsersAsync,
  resolveNewRequestNotifyUserIds,
} from "@/lib/push";
import { findActiveFleetVehicleByPlate } from "@/lib/fleetVehicles";

const FUEL_DESCRIPTION = "Fuel Charges";

type ParsedCharge = {
  description: string;
  amount: number;
  jobNumbers: string[];
  truckNumber: string | null;
  trailerNumber: string | null;
  driverId: number | null;
  vehicleNumber: string | null;
  vehicleLabel: string | null;
  fuelFromKm: number | null;
  fuelToKm: number | null;
  fuelLiters: number | null;
  files: File[];
};

function parseOptionalNumber(value: unknown): number | null {
  if (value == null || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseChargesFromForm(form: FormData): ParsedCharge[] | null {
  const raw = form.get("charges_json");
  if (!raw || typeof raw !== "string") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError(400, "Invalid charges payload");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new ApiError(400, "At least one charge is required");
  }

  return parsed.map((item, index) => {
    const row = item as Record<string, unknown>;
    const description = String(row.description || "").trim();
    const amount = Number(row.amount || 0);
    const jobNumbers = parseJobNumbers(
      Array.isArray(row.job_numbers)
        ? row.job_numbers.map(String)
        : row.job_number
          ? [String(row.job_number)]
          : []
    );
    const truckNumber = String(row.truck_number || "").trim() || null;
    const trailerNumber = String(row.trailer_number || "").trim() || null;
    const vehicleNumber = String(row.vehicle_number || "").trim() || null;
    const vehicleLabel = String(row.vehicle_label || "").trim() || null;
    const driverRaw = row.driver_id;
    const driverId =
      driverRaw != null && String(driverRaw).trim() !== "" ? Number(driverRaw) : null;
    const files = form
      .getAll(`charge_${index}_receipts`)
      .filter((f): f is File => f instanceof File && f.size > 0);
    return {
      description,
      amount,
      jobNumbers,
      truckNumber,
      trailerNumber,
      driverId: Number.isFinite(driverId) && driverId! > 0 ? driverId : null,
      vehicleNumber,
      vehicleLabel,
      fuelFromKm: parseOptionalNumber(row.fuel_from_km),
      fuelToKm: parseOptionalNumber(row.fuel_to_km),
      fuelLiters: parseOptionalNumber(row.fuel_liters),
      files,
    };
  });
}

function parseLegacySingleCharge(form: FormData): ParsedCharge {
  const jobNumbers = parseJobNumbers(form.getAll("job_numbers").map((v) => String(v)));
  const legacyJobNumber = parseJobNumbers([String(form.get("job_number") || "")]);
  const allJobNumbers = jobNumbers.length > 0 ? jobNumbers : legacyJobNumber;
  const files = form.getAll("receipts").filter((f): f is File => f instanceof File && f.size > 0);
  return {
    description: String(form.get("description") || "").trim(),
    amount: Number(form.get("amount") || 0),
    jobNumbers: allJobNumbers,
    truckNumber: null,
    trailerNumber: null,
    driverId: null,
    vehicleNumber: null,
    vehicleLabel: null,
    fuelFromKm: null,
    fuelToKm: null,
    fuelLiters: null,
    files,
  };
}

export async function POST(req: NextRequest) {
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
    const form = await req.formData();

    let requestType = String(form.get("request_type") || "");
    const chargeType = String(form.get("charge_type") || "");
    const categoryIdFromForm = Number(form.get("category_id") || 0);
    let branchId = Number(form.get("branch_id") || 0);
    const currency = String(form.get("currency") || "AED");
    const receiverType = String(form.get("cash_receiver_type") || "myself");
    const receiverUserId = form.get("cash_receiver_user_id")
      ? Number(form.get("cash_receiver_user_id"))
      : null;
    const receiverLabel = String(form.get("cash_receiver_label") || "").trim() || null;
    const branchOverride = String(form.get("branch_override") || "") === "true";
    const overrideReason = String(form.get("override_reason") || "").trim();
    const primaryRole = (session.primary_role || session.role) as Role;

    if (!["exact", "suspense"].includes(requestType)) throw new ApiError(400, "Invalid request type");
    const compassion = isCompassionChargeType(chargeType);
    if (!["job", "non_job", "truck_trailer", "general"].includes(chargeType)) {
      throw new ApiError(400, "Invalid charge type");
    }

    const multi = parseChargesFromForm(form);
    const charges = multi ?? [parseLegacySingleCharge(form)];
    const fuelRequested =
      String(form.get("is_fuel_charges") || "") === "true" ||
      charges.some((c) => c.fuelFromKm != null || c.fuelToKm != null || c.fuelLiters != null);

    for (let i = 0; i < charges.length; i++) {
      const c = charges[i];
      const n = i + 1;
      if (!fuelRequested && !c.description) {
        throw new ApiError(400, `Charge ${n}: description is required`);
      }
      if (!(c.amount > 0)) throw new ApiError(400, `Charge ${n}: amount must be greater than zero`);
      if (chargeType === "job" && c.jobNumbers.length === 0) {
        throw new ApiError(400, `Charge ${n}: job number is required`);
      }
      if (compassion) {
        if (chargeType === "truck_trailer") {
          // Truck / trailer numbers are optional; driver is still required.
          if (!c.driverId) throw new ApiError(400, `Charge ${n}: driver is required`);
        }
      }
    }

    const totalAmount = charges.reduce((sum, c) => sum + c.amount, 0);
    const allJobNumbers = parseJobNumbers(charges.flatMap((c) => c.jobNumbers));
    const primaryJobNumber = allJobNumbers[0] || "";

    let branchOverrideFlag = 0;

    if (compassion) {
      const profiles = await listBranchProfiles();
      const compassionProfiles = profiles.filter((p) => isCompassionMode(p));
      if (compassionProfiles.length === 0) {
        throw new ApiError(500, "No compassion-mode branch is configured in Control Panel");
      }
      const preferred =
        branchId && compassionProfiles.some((p) => p.branch_id === branchId)
          ? branchId
          : compassionProfiles[0].branch_id;
      branchId = preferred;
    } else if (chargeType === "job") {
      if (allJobNumbers.length === 0) {
        throw new ApiError(400, "At least one job number is required for job-related charges");
      }
      const resolution = await resolveBranchFromJobNumbers(allJobNumbers);
      if (resolution.ok && resolution.branch) {
        branchId = resolution.branch.id;
      } else {
        if (branchOverride && isElevated(primaryRole) && branchId) {
          if (!overrideReason) throw new ApiError(400, "Override reason is required");
          branchOverrideFlag = 1;
        } else {
          throw new ApiError(
            422,
            resolution.error ||
              "Branch could not be identified from job number. Please contact supervisor/admin."
          );
        }
      }
    } else {
      if (!branchId) throw new ApiError(400, "Branch is required");
    }

    const branch = await queryOne<{ id: number; currency: string }>(
      "SELECT id, currency FROM branches WHERE id = ? AND is_active = 1",
      [branchId]
    );
    if (!branch) throw new ApiError(400, "Selected branch is invalid");

    const profile = await getBranchProfile(branchId);
    if (compassion && !isCompassionMode(profile)) {
      throw new ApiError(422, "Selected branch is not configured for Compassion requests");
    }
    if (requestType === "suspense" && profile && !profile.allow_suspense) {
      throw new ApiError(422, "Suspense advances are not allowed for this branch");
    }

    const submitterRole = await resolveRoleForBranch(session.id, branchId, primaryRole);

    let fuelVehicleNo: string | null = null;
    let fuelVehicleLabel: string | null = null;
    let fuelFromKm: number | null = null;
    let fuelToKm: number | null = null;
    let fuelLiters: number | null = null;
    if (fuelRequested) {
      if (submitterRole !== "messenger" && submitterRole !== "cash_requester") {
        throw new ApiError(403, "Fuel charges are only available for messengers and cash requesters");
      }
      if (compassion || chargeType !== "non_job") {
        throw new ApiError(400, "Fuel charges are only allowed for non-job related requests");
      }
      fuelVehicleNo =
        String(form.get("fuel_vehicle_no") || "").trim() ||
        charges.find((c) => c.vehicleNumber)?.vehicleNumber ||
        null;
      if (!fuelVehicleNo) throw new ApiError(400, "Vehicle number is required for fuel charges");

      const fleet = await findActiveFleetVehicleByPlate(fuelVehicleNo);
      if (!fleet) {
        throw new ApiError(
          400,
          "Select a vehicle from the admin vehicle list (plate number not found)"
        );
      }
      fuelVehicleNo = fleet.plate_no;
      fuelVehicleLabel = fleet.label;

      fuelFromKm =
        parseOptionalNumber(form.get("fuel_from_km")) ??
        charges.find((c) => c.fuelFromKm != null)?.fuelFromKm ??
        null;
      fuelToKm =
        parseOptionalNumber(form.get("fuel_to_km")) ??
        charges.find((c) => c.fuelToKm != null)?.fuelToKm ??
        null;
      fuelLiters =
        parseOptionalNumber(form.get("fuel_liters")) ??
        charges.find((c) => c.fuelLiters != null)?.fuelLiters ??
        null;
      if (fuelFromKm != null && fuelFromKm < 0) {
        throw new ApiError(400, "From km cannot be negative");
      }
      if (fuelToKm != null && fuelToKm < 0) {
        throw new ApiError(400, "To km cannot be negative");
      }
      if (fuelFromKm != null && fuelToKm != null && fuelToKm < fuelFromKm) {
        throw new ApiError(400, "To km must be greater than or equal to from km");
      }
      if (fuelLiters == null || fuelLiters <= 0) {
        throw new ApiError(400, "Liters must be greater than zero for fuel charges");
      }
      for (const c of charges) {
        c.description = FUEL_DESCRIPTION;
        c.vehicleNumber = fuelVehicleNo;
        c.vehicleLabel = fuelVehicleLabel;
        c.fuelFromKm = fuelFromKm;
        c.fuelToKm = fuelToKm;
        c.fuelLiters = fuelLiters;
      }
    }

    const summaryDescription = fuelRequested
      ? FUEL_DESCRIPTION
      : charges.length === 1
        ? charges[0].description
        : charges.map((c) => c.description).join("\n");

    if (!compassion && (chargeType === "job" || chargeType === "non_job")) {
      const suspenseScope = await getSuspenseChargeScope(branchId, submitterRole);
      const allowed = resolveAllowedJobChargeTypes(
        profile?.charge_type_scope ?? "job_and_non_job",
        suspenseScope,
        requestType as "exact" | "suspense"
      );
      if (!allowed.includes(chargeType)) {
        throw new ApiError(
          422,
          requestType === "suspense"
            ? "This charge type is not allowed for suspense advances on this branch/role."
            : "This charge type is not allowed for this branch."
        );
      }
      if (submitterRole === "operations" && chargeType !== "job" && allowed.includes("job")) {
        throw new ApiError(400, "Operations requests must be job related.");
      }
    }

    const isStaff = isStaffReimbursementRole(submitterRole);
    if (isStaff && compassion) {
      throw new ApiError(400, "Staff requests cannot use Compassion charge types.");
    }
    if (requestType === "exact") {
      for (let i = 0; i < charges.length; i++) {
        if (charges[i].files.length === 0) {
          throw new ApiError(
            422,
            `Charge ${i + 1}: at least one receipt is required for exact reimbursement`
          );
        }
      }
    }

    const showsCashReceiverPicker =
      !isStaff && submitterRole !== "cash_requester" && submitterRole !== "messenger";
    if (showsCashReceiverPicker) {
      const receiverOptions = await getCashReceiverOptions(session.id, branchId);
      if (!isCashReceiverTypeAllowed(receiverOptions, receiverType)) {
        throw new ApiError(
          422,
          "That cash receiver option is not allowed for your account on this branch."
        );
      }
    }

    const { supervisorId } = await resolveRequestSupervisor(
      session.id,
      branchId,
      profile?.default_supervisor_user_id ?? null
    );
    const accountsUserId = await pickAccountsUser(branchId);

    const approvalPath = await getApprovalPath(branchId, submitterRole, session.id);
    const createState = createStateFromApprovalPath(
      approvalPath,
      requestType as "exact" | "suspense",
      totalAmount
    );
    const status = createState.status;
    const approvedAmount = createState.approved_amount;

    let cashReceiverUserId: number | null = null;
    let cashReceiverLabel: string | null = null;
    if (isStaff || receiverType === "myself") {
      cashReceiverUserId = session.id;
    } else if (receiverType === "supervisor") {
      // Role-based: confirm goes to whoever is personal/default supervisor at pay/confirm time.
      cashReceiverLabel = ROLE_SUPERVISOR_RECEIVER_LABEL;
      cashReceiverUserId =
        (await resolveSupervisorCashReceiverUserId(session.id, branchId)) ?? supervisorId;
      if (!cashReceiverUserId) {
        throw new ApiError(422, "No supervisor is configured for this branch.");
      }
    } else if (receiverType === "messenger") {
      if (receiverUserId) cashReceiverUserId = receiverUserId;
      else cashReceiverLabel = receiverLabel;
      if (!cashReceiverUserId && !cashReceiverLabel)
        throw new ApiError(400, "Select or name the cash receiver");
      if (cashReceiverUserId) {
        const receiver = await queryOne<{ role: string }>(
          "SELECT role FROM users WHERE id = ? AND is_active = 1",
          [cashReceiverUserId]
        );
        if (!receiver || receiver.role !== "messenger") {
          throw new ApiError(400, "Cash receiver must be a Messenger");
        }
      }
    } else if (receiverType === "other") {
      // Legacy free-text receiver (kept for older clients).
      if (receiverUserId) cashReceiverUserId = receiverUserId;
      else cashReceiverLabel = receiverLabel;
      if (!cashReceiverUserId && !cashReceiverLabel)
        throw new ApiError(400, "Select or name the cash receiver");
    }

    // Process / upload receipt PDFs outside the DB transaction so the connection
    // is not held open during sharp + Azure I/O (especially multi-charge submits).
    type SavedReceipt = Awaited<ReturnType<typeof saveReceiptFiles>>;
    const savedReceipts: (SavedReceipt | null)[] = charges.map(() => null);
    let requestId: number;
    try {
      await Promise.all(
        charges.map(async (c, i) => {
          if (c.files.length === 0) return;
          savedReceipts[i] = await saveReceiptFiles(c.files);
        })
      );

      requestId = await withTransaction(async (conn) => {
      const chargeRows: {
        description: string;
        amount: number;
        job_number: string | null;
        category_id: number;
        truck_number: string | null;
        trailer_number: string | null;
        driver_id: number | null;
        fuel_from_km: number | null;
        fuel_to_km: number | null;
        fuel_liters: number | null;
        vehicle_number: string | null;
        vehicle_label: string | null;
      }[] = [];

      for (const c of charges) {
        if (c.driverId) {
          const [drv] = await conn.query<any[]>(
            "SELECT id FROM compassion_drivers WHERE id = ? AND is_active = 1",
            [c.driverId]
          );
          if (!drv.length) throw new ApiError(400, "Selected driver is invalid");
        }

        const categoryId =
          categoryIdFromForm ||
          (await resolveOrCreateCategory(c.description, chargeType as ChargeType, conn));

        const [catRows] = await conn.query<any[]>(
          "SELECT * FROM expense_categories WHERE id = ? AND is_active = 1",
          [categoryId]
        );
        if (!catRows.length) throw new ApiError(400, "Category not found");
        const category = catRows[0];
        if (category.charge_type !== chargeType) {
          throw new ApiError(400, `Description "${c.description}" does not match the selected charge type.`);
        }

        if (
          (submitterRole === "cash_requester" || submitterRole === "messenger") &&
          chargeType === "job"
        ) {
          const duplicate = await findDuplicateMessengerJobRequest(
            conn,
            session.id,
            categoryId,
            c.jobNumbers
          );
          if (duplicate) {
            throw new ApiError(
              409,
              `The same request already exists (${duplicate.request_no}).`
            );
          }
        }

        chargeRows.push({
          description: c.description,
          amount: c.amount,
          job_number: chargeType === "job" ? c.jobNumbers[0] || null : null,
          category_id: categoryId,
          truck_number: compassion ? c.truckNumber : null,
          trailer_number: compassion ? c.trailerNumber : null,
          driver_id: compassion ? c.driverId : null,
          fuel_from_km: fuelRequested ? fuelFromKm : null,
          fuel_to_km: fuelRequested ? fuelToKm : null,
          fuel_liters: fuelRequested ? fuelLiters : null,
          vehicle_number: fuelRequested ? fuelVehicleNo : null,
          vehicle_label: fuelRequested ? fuelVehicleLabel : null,
        });
      }

      const primaryCategoryId = chargeRows[0].category_id;

      const requestNo = await nextRequestNo(
        conn,
        requestType === "exact" ? "exact" : "open_suspense"
      );
      const [res] = await conn.execute<any>(
        `INSERT INTO petty_cash_requests
          (request_no, request_type, charge_type, category_id, submitted_by_user_id, submitter_role,
           cash_receiver_user_id, cash_receiver_label, branch_id, job_number, description,
           requested_amount, approved_amount, currency, status, supervisor_id, accounts_user_id, branch_override,
           approved_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          requestNo,
          requestType,
          chargeType,
          primaryCategoryId,
          session.id,
          submitterRole,
          cashReceiverUserId,
          cashReceiverLabel,
          branchId,
          chargeType === "job" ? primaryJobNumber : null,
          summaryDescription || null,
          totalAmount,
          approvedAmount,
          currency,
          status,
          supervisorId,
          accountsUserId,
          branchOverrideFlag,
          approvedAmount != null ? new Date() : null,
        ]
      );
      const newId = res.insertId as number;

      if (chargeType === "job" && allJobNumbers.length > 0) {
        await insertRequestJobNumbers(conn, newId, allJobNumbers);
      }

      const chargeIds = await insertRequestCharges(conn, newId, chargeRows);

      for (let i = 0; i < savedReceipts.length; i++) {
        const saved = savedReceipts[i];
        if (!saved) continue;
        await conn.execute(
          `INSERT INTO receipts
             (request_id, charge_id, file_url, file_name, mime_type, uploaded_by_user_id, receipt_type)
           VALUES (?,?,?,?,?,?, 'request')`,
          [newId, chargeIds[i], saved.relPath, saved.originalName, saved.mimeType, session.id]
        );
      }

      if (branchOverrideFlag) {
        await conn.execute(
          `INSERT INTO approvals (request_id, approver_user_id, approval_level, action, comments)
           VALUES (?,?,?,?,?)`,
          [newId, session.id, "submitter", "branch_override", overrideReason]
        );
      }

      await auditTx(conn, {
        userId: session.id,
        action: "create_request",
        entityType: "petty_cash_request",
        entityId: newId,
        newValue: {
          requestNo,
          requestType,
          chargeType,
          branchId,
          amount: totalAmount,
          chargeCount: charges.length,
          status,
        },
      });

      return newId;
    });
    } catch (err) {
      for (const saved of savedReceipts) {
        if (!saved) continue;
        try {
          await deleteStoredFile(saved.relPath);
        } catch {
          // Best-effort cleanup of orphaned uploads.
        }
      }
      throw err;
    }

    // Notify the first person who needs to act (supervisor or accounts), if they opted in.
    const notifyIds = await resolveNewRequestNotifyUserIds({
      approvalPath,
      needsSupervisor: createState.needsSupervisor,
      supervisorId,
      accountsUserId,
      branchId,
    });
    const amountLabel = money(totalAmount);
    notifyUsersAsync(
      notifyIds.filter((id) => id !== session.id),
      {
        title: createState.needsSupervisor
          ? "Approval needed"
          : "New request for accounts",
        body: `${session.name} · ${amountLabel} · ${status}`,
        url: `/requests/${requestId}`,
        tag: `request-${requestId}`,
      }
    );

    return ok({ id: requestId });
  } catch (err) {
    return fail(err);
  }
}
