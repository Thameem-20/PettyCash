"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChargeType, Role } from "@/lib/types";
import DescriptionAutocomplete from "@/components/DescriptionAutocomplete";
import SuggestInput from "@/components/SuggestInput";
import JobNumbersInput, { JobNumbersStatus } from "@/components/JobNumbersInput";
import ReceiptFileInput from "@/components/ReceiptFileInput";
import {
  pickDefaultJobChargeType,
  resolveAllowedJobChargeTypes,
  type ChargeTypeScope,
  type JobChargeType,
  type SuspenseChargeScope,
} from "@/lib/chargeTypePolicy";
import {
  DEFAULT_CASH_RECEIVER_OPTIONS,
  firstAllowedCashReceiverType,
  type CashReceiverOptions,
  type CashReceiverType,
} from "@/lib/cashReceiverOptionsShared";

const FUEL_DESCRIPTION = "Fuel Charges";

interface Branch {
  id: number;
  branch_name: string;
  branch_code: string;
}
interface Receiver {
  id: number;
  name: string;
  role: string;
}
interface Driver {
  id: number;
  name: string;
}
interface FleetVehicle {
  id: number;
  plate_no: string;
  label: string;
}

type ChargeGroup = {
  key: string;
  jobNumber: string;
  jobStatus: JobNumbersStatus;
  truckNumber: string;
  trailerNumber: string;
  driverId: number | "";
  description: string;
  amount: string;
  files: File[];
};

function newChargeKey() {
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyCharge(): ChargeGroup {
  return {
    key: newChargeKey(),
    jobNumber: "",
    jobStatus: { valid: false },
    truckNumber: "",
    trailerNumber: "",
    driverId: "",
    description: "",
    amount: "",
    files: [],
  };
}


export default function NewRequestForm({
  role,
  branchKey,
}: {
  role: Role;
  /** Preferred / active branch from session — changes when workspace switcher saves. */
  branchKey: string;
}) {
  const isCashRequester = role === "cash_requester" || role === "messenger";
  const isOps = role === "operations";
  const isStaff =
    role === "supervisor" || role === "accounts" || role === "accounts_supervisor";
  const router = useRouter();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [receivers, setReceivers] = useState<Receiver[]>([]);
  const [supervisors, setSupervisors] = useState<Receiver[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [fleetVehicles, setFleetVehicles] = useState<FleetVehicle[]>([]);
  const [defaultBranchId, setDefaultBranchId] = useState<number | null>(null);
  const [isCompassion, setIsCompassion] = useState(false);
  const [compassionBranchName, setCompassionBranchName] = useState("Compassion");
  const [allowSuspense, setAllowSuspense] = useState(true);
  const [branchChargeScopes, setBranchChargeScopes] = useState<Record<number, ChargeTypeScope>>({});
  const [branchAllowSuspense, setBranchAllowSuspense] = useState<Record<number, boolean>>({});
  const [branchSuspenseScopes, setBranchSuspenseScopes] = useState<
    Record<number, SuspenseChargeScope>
  >({});
  const [cashReceiverOptionsByBranch, setCashReceiverOptionsByBranch] = useState<
    Record<number, CashReceiverOptions>
  >({});
  const [cashReceiverOptionsFallback, setCashReceiverOptionsFallback] = useState<CashReceiverOptions>(
    DEFAULT_CASH_RECEIVER_OPTIONS
  );

  const [requestType, setRequestType] = useState<"exact" | "suspense">("exact");
  const [chargeType, setChargeType] = useState<ChargeType>(isOps || isCashRequester ? "job" : "non_job");
  const [branchId, setBranchId] = useState<number | "">("");
  const [receiverType, setReceiverType] = useState<CashReceiverType>("myself");
  const [receiverUserId, setReceiverUserId] = useState<number | "">("");
  const [receiverLabel, setReceiverLabel] = useState("");
  const [handlerInfo, setHandlerInfo] = useState<{ branchName?: string; handlers: { name: string }[] }>({
    handlers: [],
  });

  const [charges, setCharges] = useState<ChargeGroup[]>([emptyCharge()]);
  const [fuelCharges, setFuelCharges] = useState(false);
  const [fuelVehicleNo, setFuelVehicleNo] = useState("");
  const [fuelVehicleLabel, setFuelVehicleLabel] = useState("");
  const [fuelFromKm, setFuelFromKm] = useState("");
  const [fuelToKm, setFuelToKm] = useState("");
  const [fuelLiters, setFuelLiters] = useState("");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const scopeBranchId =
    typeof branchId === "number" ? branchId : defaultBranchId != null ? defaultBranchId : null;
  const cashReceiverOptions: CashReceiverOptions =
    (scopeBranchId != null && cashReceiverOptionsByBranch[scopeBranchId]) ||
    cashReceiverOptionsFallback;
  const allowedReceiverCount = [
    cashReceiverOptions.myself,
    cashReceiverOptions.messenger,
    cashReceiverOptions.supervisor,
  ].filter(Boolean).length;
  const branchScope: ChargeTypeScope =
    (scopeBranchId != null && branchChargeScopes[scopeBranchId]) || "job_and_non_job";
  const suspenseScope: SuspenseChargeScope =
    (scopeBranchId != null && branchSuspenseScopes[scopeBranchId]) || "inherit";
  const allowedJobTypes = resolveAllowedJobChargeTypes(
    branchScope,
    suspenseScope,
    requestType
  );
  const showChargeTypePicker = !isCompassion && allowedJobTypes.length > 1 && !isOps;
  const lockedJobChargeType = allowedJobTypes.length === 1 ? allowedJobTypes[0] : null;
  const effectiveJobChargeType: JobChargeType = isCompassion
    ? "non_job"
    : lockedJobChargeType
      ? lockedJobChargeType
      : isOps && allowedJobTypes.includes("job")
        ? "job"
        : chargeType === "job" || chargeType === "non_job"
          ? chargeType
          : pickDefaultJobChargeType(allowedJobTypes);

  const canUseFuelCharges =
    isCashRequester && !isCompassion && effectiveJobChargeType === "non_job";
  const fuelActive = canUseFuelCharges && fuelCharges;

  useEffect(() => {
    if (canUseFuelCharges) return;
    setFuelCharges(false);
  }, [canUseFuelCharges]);

  useEffect(() => {
    if (!fuelActive) return;
    setCharges((prev) =>
      prev.map((c) => (c.description === FUEL_DESCRIPTION ? c : { ...c, description: FUEL_DESCRIPTION }))
    );
  }, [fuelActive, charges.length]);

  const updateCharge = useCallback((key: string, patch: Partial<ChargeGroup>) => {
    setCharges((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }, []);

  function onChargeDescriptionChange(key: string, desc: string) {
    if (fuelActive) return;
    updateCharge(key, { description: desc });
  }

  function toggleFuelCharges(on: boolean) {
    setFuelCharges(on);
    if (on) {
      setCharges((prev) => prev.map((c) => ({ ...c, description: FUEL_DESCRIPTION })));
    } else {
      setCharges((prev) =>
        prev.map((c) =>
          c.description === FUEL_DESCRIPTION ? { ...c, description: "" } : c
        )
      );
      setFuelVehicleNo("");
      setFuelVehicleLabel("");
      setFuelFromKm("");
      setFuelToKm("");
      setFuelLiters("");
    }
  }

  function selectFuelVehicle(plateNo: string) {
    setFuelVehicleNo(plateNo);
    const match = fleetVehicles.find(
      (v) => v.plate_no.toLowerCase() === plateNo.trim().toLowerCase()
    );
    setFuelVehicleLabel(match?.label || "");
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/meta/form")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d.ok) return;
        setBranches(d.branches);
        setReceivers(d.receivers);
        setSupervisors(d.supervisors || []);
        setDefaultBranchId(d.defaultBranchId);
        if (d.defaultBranchId) setBranchId(d.defaultBranchId);
        setAllowSuspense(d.allowSuspense !== false);
        setBranchChargeScopes(d.branchChargeScopes || {});
        setBranchAllowSuspense(d.branchAllowSuspense || {});
        setBranchSuspenseScopes(d.branchSuspenseScopes || {});
        setCashReceiverOptionsByBranch(d.cashReceiverOptionsByBranch || {});
        const fallback = d.cashReceiverOptions || DEFAULT_CASH_RECEIVER_OPTIONS;
        setCashReceiverOptionsFallback(fallback);
        setReceiverType(firstAllowedCashReceiverType(fallback));
        setReceiverUserId("");
        setReceiverLabel("");
        setCharges([emptyCharge()]);
        setFuelCharges(false);
        setFuelVehicleNo("");
        setFuelVehicleLabel("");
        setFuelFromKm("");
        setFuelToKm("");
        setFuelLiters("");
        setFleetVehicles(d.fleetVehicles || []);
        setError("");
        setConfirmOpen(false);

        if (d.isCompassion) {
          setIsCompassion(true);
          setChargeType("truck_trailer");
          setDrivers(d.compassionDrivers || []);
          if (d.compassionBranch?.id) setBranchId(d.compassionBranch.id);
          if (d.compassionBranch?.branch_name) {
            setCompassionBranchName(d.compassionBranch.branch_name);
          }
        } else {
          setIsCompassion(false);
          setDrivers([]);
          setCompassionBranchName("Compassion");
          setHandlerInfo({ handlers: [] });
          const scope = (d.chargeTypeScope || "job_and_non_job") as ChargeTypeScope;
          const suspense = (d.suspenseChargeScope || "inherit") as SuspenseChargeScope;
          const allowed = resolveAllowedJobChargeTypes(scope, suspense, "exact");
          const initial =
            isOps && allowed.includes("job")
              ? "job"
              : pickDefaultJobChargeType(allowed);
          setChargeType(initial);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOps, branchKey]);

  useEffect(() => {
    if (
      (receiverType === "myself" && cashReceiverOptions.myself) ||
      (receiverType === "messenger" && cashReceiverOptions.messenger) ||
      (receiverType === "supervisor" && cashReceiverOptions.supervisor)
    ) {
      return;
    }
    setReceiverType(firstAllowedCashReceiverType(cashReceiverOptions));
    setReceiverUserId("");
    setReceiverLabel("");
  }, [
    cashReceiverOptions.myself,
    cashReceiverOptions.messenger,
    cashReceiverOptions.supervisor,
    receiverType,
  ]);

  const allowedJobTypesKey = allowedJobTypes.join(",");

  useEffect(() => {
    if (isCompassion) return;
    const allowed = allowedJobTypesKey.split(",").filter(Boolean) as JobChargeType[];
    if (!allowed.length) return;
    if (!allowed.includes(effectiveJobChargeType as JobChargeType)) {
      setChargeType(pickDefaultJobChargeType(allowed));
    } else if (lockedJobChargeType && chargeType !== lockedJobChargeType) {
      setChargeType(lockedJobChargeType);
    }
  }, [allowedJobTypesKey, chargeType, effectiveJobChargeType, isCompassion, lockedJobChargeType]);

  useEffect(() => {
    if (!isCompassion && effectiveJobChargeType === "non_job" && defaultBranchId && !branchId) {
      setBranchId(defaultBranchId);
    }
  }, [effectiveJobChargeType, defaultBranchId, isCompassion, branchId]);

  useEffect(() => {
    if (isCompassion || typeof branchId !== "number") return;
    const branchAllows = branchAllowSuspense[branchId];
    if (branchAllows === false && requestType === "suspense") {
      setRequestType("exact");
    }
  }, [branchId, branchAllowSuspense, isCompassion, requestType]);

  useEffect(() => {
    if (isCompassion || effectiveJobChargeType !== "non_job" || !branchId) {
      if (!isCompassion) setHandlerInfo({ handlers: [] });
      return;
    }
    fetch(`/api/routing/handlers?branch_id=${branchId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setHandlerInfo({ branchName: d.branch?.name, handlers: d.handlers || [] });
      });
  }, [branchId, effectiveJobChargeType, isCompassion]);

  const firstValidJob = charges.find((c) => c.jobStatus.valid);
  const targetBranchName = isCompassion
    ? compassionBranchName
    : effectiveJobChargeType === "job"
      ? firstValidJob?.jobStatus.branch?.name
      : branches.find((b) => b.id === branchId)?.branch_name;
  const targetHandlers = isCompassion
    ? ["Compassion Accounts"]
    : effectiveJobChargeType === "job"
      ? firstValidJob?.jobStatus.handlers?.map((h) => h.name) || []
      : handlerInfo.handlers.map((h) => h.name);

  const suspenseEnabled =
    allowSuspense &&
    (typeof branchId !== "number" || branchAllowSuspense[branchId] !== false);

  const totalAmount = charges.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

  function validate(): string | null {
    if (charges.length === 0) return "Add at least one charge";

    if (!isCompassion && effectiveJobChargeType === "non_job" && !branchId) return "Select a branch";
    if (!isCompassion && !allowedJobTypes.includes(effectiveJobChargeType)) {
      return "Selected charge type is not allowed for this branch or request type";
    }

    if (fuelActive) {
      if (!fuelVehicleNo.trim()) return "Select a vehicle";
      if (!fuelVehicleLabel.trim()) return "Selected vehicle is not in the admin list";
      if (fuelFromKm.trim() === "" || Number(fuelFromKm) < 0 || Number.isNaN(Number(fuelFromKm))) {
        return "Enter a valid from km";
      }
      if (fuelToKm.trim() === "" || Number(fuelToKm) < 0 || Number.isNaN(Number(fuelToKm))) {
        return "Enter a valid to km";
      }
      if (Number(fuelToKm) < Number(fuelFromKm)) return "To km must be greater than or equal to from km";
      if (!fuelLiters.trim() || Number(fuelLiters) <= 0 || Number.isNaN(Number(fuelLiters))) {
        return "Enter liters greater than zero";
      }
    }

    for (let i = 0; i < charges.length; i++) {
      const c = charges[i];
      const n = i + 1;
      if (!c.description.trim()) return `Charge ${n}: enter a description`;
      if (!c.amount || Number(c.amount) <= 0) return `Charge ${n}: enter a valid amount`;
      if (isCompassion) {
        if (chargeType === "truck_trailer") {
          if (!c.truckNumber.trim()) return `Charge ${n}: enter a truck number`;
          if (!c.trailerNumber.trim()) return `Charge ${n}: enter a trailer number`;
          if (!c.driverId) return `Charge ${n}: select a driver`;
        }
      } else if (effectiveJobChargeType === "job") {
        if (!c.jobNumber.trim()) return `Charge ${n}: enter a job number`;
        if (!c.jobStatus.valid) return `Charge ${n}: ${c.jobStatus.error || "job number not identified"}`;
      }
      if (requestType === "exact" && c.files.length === 0) {
        return `Charge ${n}: at least one receipt is required for exact reimbursement`;
      }
    }

    if (!isCompassion && effectiveJobChargeType === "job") {
      const branchIds = new Set(
        charges.map((c) => c.jobStatus.branch?.id).filter((id): id is number => id != null)
      );
      if (branchIds.size > 1) {
        return "All charges must belong to the same branch";
      }
    }

    if (
      !isCashRequester &&
      !isCompassion &&
      receiverType === "messenger" &&
      !receiverUserId &&
      !receiverLabel.trim()
    )
      return "Select or name the cash receiver";
    if (!isCashRequester && !isCompassion && receiverType === "supervisor" && !receiverUserId)
      return "Select a supervisor as cash receiver";
    return null;
  }

  function openConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setConfirmOpen(true);
  }

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const fd = new FormData();
      const submitChargeType = isCompassion ? chargeType : effectiveJobChargeType;
      fd.set("request_type", requestType);
      fd.set("charge_type", submitChargeType);
      if (isCompassion || submitChargeType === "non_job") fd.set("branch_id", String(branchId));
      fd.set("cash_receiver_type", isCashRequester || isStaff || isCompassion ? "myself" : receiverType);
      if (receiverUserId) fd.set("cash_receiver_user_id", String(receiverUserId));
      if (receiverType === "messenger" && receiverLabel.trim()) {
        fd.set("cash_receiver_label", receiverLabel.trim());
      }

      if (fuelActive) {
        fd.set("is_fuel_charges", "true");
        fd.set("fuel_vehicle_no", fuelVehicleNo.trim());
        fd.set("fuel_from_km", String(Number(fuelFromKm)));
        fd.set("fuel_to_km", String(Number(fuelToKm)));
        fd.set("fuel_liters", String(Number(fuelLiters)));
      }

      fd.set(
        "charges_json",
        JSON.stringify(
          charges.map((c) => ({
            description: fuelActive ? FUEL_DESCRIPTION : c.description.trim(),
            amount: Number(c.amount),
            job_number: !isCompassion && submitChargeType === "job" ? c.jobNumber.trim() : null,
            job_numbers:
              !isCompassion && submitChargeType === "job"
                ? c.jobNumber.trim()
                  ? [c.jobNumber.trim()]
                  : []
                : [],
            truck_number: isCompassion ? c.truckNumber.trim() || null : null,
            trailer_number: isCompassion ? c.trailerNumber.trim() || null : null,
            driver_id: isCompassion && c.driverId ? c.driverId : null,
            vehicle_number: fuelActive ? fuelVehicleNo.trim() || null : null,
            vehicle_label: fuelActive ? fuelVehicleLabel.trim() || null : null,
            fuel_from_km: fuelActive ? Number(fuelFromKm) : null,
            fuel_to_km: fuelActive ? Number(fuelToKm) : null,
            fuel_liters: fuelActive ? Number(fuelLiters) : null,
          }))
        )
      );

      charges.forEach((c, i) => {
        c.files.forEach((f) => fd.append(`charge_${i}_receipts`, f));
      });

      const res = await fetch("/api/requests", { method: "POST", body: fd });
      const d = await res.json();
      if (!d.ok) {
        setError(d.error || "Submission failed");
        setConfirmOpen(false);
        return;
      }
      router.push(`/requests/${d.id}`);
      router.refresh();
    } catch {
      setError("Network error");
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={openConfirm} className="space-y-3">
      <div className="card space-y-2 p-3">
        <label className="label">Request Type</label>
        <div className={`grid gap-1.5 ${suspenseEnabled ? "grid-cols-2" : "grid-cols-1"}`}>
          <SegBtn active={requestType === "exact"} onClick={() => setRequestType("exact")}>
            Exact / Reimbursement
          </SegBtn>
          {suspenseEnabled && (
            <SegBtn active={requestType === "suspense"} onClick={() => setRequestType("suspense")}>
              Suspense / Advance
            </SegBtn>
          )}
        </div>
        <p className="text-[11px] leading-snug text-slate-500">
          {requestType === "exact"
            ? isStaff
              ? "Exact amount known. Receipt required now. Paid to you after approval."
              : "Exact amount known. Receipt required now."
            : isStaff
              ? "Advance first; settle later with receipt. Cash is issued to you."
              : "Advance first; settle later with receipt."}
        </p>
      </div>

      {isCompassion ? (
        <div className="card space-y-2 p-3">
          <label className="label">Charge Type</label>
          <div className="grid grid-cols-2 gap-1.5">
            <SegBtn
              active={chargeType === "truck_trailer"}
              onClick={() => setChargeType("truck_trailer")}
            >
              Truck / Trailer Related
            </SegBtn>
            <SegBtn active={chargeType === "general"} onClick={() => setChargeType("general")}>
              General Charges
            </SegBtn>
          </div>
          <p className="border border-sky-300 bg-sky-50 px-2 py-1.5 text-xs text-sky-700">
            Goes to <b>{compassionBranchName}</b> for Compassion supervisor approval, then Accounts.
          </p>
        </div>
      ) : showChargeTypePicker ? (
        <div className="card space-y-2 p-3">
          <label className="label">Charge Type</label>
          <div className="grid grid-cols-2 gap-1.5">
            {allowedJobTypes.includes("job") && (
              <SegBtn active={effectiveJobChargeType === "job"} onClick={() => setChargeType("job")}>
                Job Related
              </SegBtn>
            )}
            {allowedJobTypes.includes("non_job") && (
              <SegBtn
                active={effectiveJobChargeType === "non_job"}
                onClick={() => setChargeType("non_job")}
              >
                Non Job Related
              </SegBtn>
            )}
          </div>
          {requestType === "suspense" &&
            suspenseScope !== "inherit" &&
            !allowedJobTypes.includes("job") && (
              <p className="text-[11px] leading-snug text-slate-500">
                Suspense advances for your role are limited to non-job related charges.
              </p>
            )}
        </div>
      ) : (
        !isCompassion &&
        lockedJobChargeType && (
          <div className="card space-y-1 p-3">
            <p className="text-sm font-semibold text-slate-800">
              {lockedJobChargeType === "job" ? "Job Related" : "Non Job Related"}
            </p>
            <p className="text-[11px] leading-snug text-slate-500">
              {requestType === "suspense" && suspenseScope !== "inherit"
                ? "Charge type is fixed for suspense advances on this branch/role."
                : "This branch only allows this charge type."}
            </p>
          </div>
        )
      )}

      {!isCompassion && effectiveJobChargeType === "non_job" && (
        <div className="card space-y-2 p-3">
          <label className="label">Branch</label>
          <select className="input" value={branchId} onChange={(e) => setBranchId(Number(e.target.value) || "")}>
            <option value="">Select branch</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.branch_name}
              </option>
            ))}
          </select>
          {targetBranchName && (
            <p className="border border-sky-300 bg-sky-50 px-2 py-1.5 text-xs text-sky-700">
              Goes to <b>{targetBranchName}</b>: {targetHandlers.join(", ") || "Unassigned"}
            </p>
          )}
        </div>
      )}

      {canUseFuelCharges && (
        <div className="card space-y-2.5 p-3">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-semibold text-slate-800">Fuel charges</span>
              <span className="block text-[11px] leading-snug text-slate-500">
                Applies to this whole request. Description becomes Fuel Charges.
              </span>
            </span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={fuelCharges}
              onChange={(e) => toggleFuelCharges(e.target.checked)}
            />
          </label>
          {fuelActive && (
            <div className="space-y-2 border-t border-slate-200 pt-2.5">
              <div>
                <label className="label">Vehicle no *</label>
                <select
                  className="input"
                  value={fuelVehicleNo}
                  onChange={(e) => selectFuelVehicle(e.target.value)}
                >
                  <option value="">Select plate number</option>
                  {fleetVehicles.map((v) => (
                    <option key={v.id} value={v.plate_no}>
                      {v.plate_no}
                    </option>
                  ))}
                </select>
                {fuelVehicleLabel ? (
                  <p className="mt-1.5 border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-700">
                    Vehicle: <b>{fuelVehicleLabel}</b>
                  </p>
                ) : fleetVehicles.length === 0 ? (
                  <p className="mt-1.5 text-xs text-amber-700">
                    No vehicles configured. Ask an admin to add plate numbers under Vehicles.
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">From km *</label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={fuelFromKm}
                    onChange={(e) => setFuelFromKm(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="label">To km *</label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={fuelToKm}
                    onChange={(e) => setFuelToKm(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
              <div>
                <label className="label">Liters *</label>
                <input
                  className="input"
                  type="number"
                  step="0.001"
                  min="0"
                  inputMode="decimal"
                  value={fuelLiters}
                  onChange={(e) => setFuelLiters(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        {charges.map((charge, index) => (
          <ChargeCard
            key={charge.key}
            index={index}
            total={charges.length}
            charge={charge}
            requestType={requestType}
            showJob={!isCompassion && effectiveJobChargeType === "job"}
            showCompassion={isCompassion}
            requireCompassionVehicle={chargeType === "truck_trailer"}
            drivers={drivers}
            descriptionLocked={fuelActive}
            onUpdate={(patch) => updateCharge(charge.key, patch)}
            onDescriptionChange={(desc) => onChargeDescriptionChange(charge.key, desc)}
            onRemove={() => setCharges((prev) => prev.filter((c) => c.key !== charge.key))}
          />
        ))}

        <button
          type="button"
          className="flex w-full items-center justify-center gap-1.5 border border-dashed border-brand-400 bg-brand-50/50 px-3 py-2.5 text-sm font-medium text-brand-800 hover:bg-brand-50"
          onClick={() =>
            setCharges((prev) => [
              ...prev,
              fuelActive ? { ...emptyCharge(), description: FUEL_DESCRIPTION } : emptyCharge(),
            ])
          }
        >
          <span className="text-lg leading-none">+</span> Add new charge
        </button>
      </div>

      {!isCashRequester && !isStaff && (
        <div className="card space-y-2 p-3">
          <label className="label">Cash Receiver</label>
          <div
            className={`grid gap-1.5 ${
              allowedReceiverCount >= 3
                ? "grid-cols-3"
                : allowedReceiverCount === 2
                  ? "grid-cols-2"
                  : "grid-cols-1"
            }`}
          >
            {cashReceiverOptions.myself && (
              <SegBtn
                active={receiverType === "myself"}
                onClick={() => {
                  setReceiverType("myself");
                  setReceiverUserId("");
                  setReceiverLabel("");
                }}
              >
                Myself
              </SegBtn>
            )}
            {cashReceiverOptions.messenger && (
              <SegBtn
                active={receiverType === "messenger"}
                onClick={() => {
                  setReceiverType("messenger");
                  setReceiverUserId("");
                  setReceiverLabel("");
                }}
              >
                Messenger
              </SegBtn>
            )}
            {cashReceiverOptions.supervisor && (
              <SegBtn
                active={receiverType === "supervisor"}
                onClick={() => {
                  setReceiverType("supervisor");
                  setReceiverUserId("");
                  setReceiverLabel("");
                }}
              >
                Supervisor
              </SegBtn>
            )}
          </div>
          {receiverType === "messenger" && cashReceiverOptions.messenger && (
            <div className="space-y-2">
              <select
                className="input"
                value={receiverUserId}
                onChange={(e) => setReceiverUserId(Number(e.target.value) || "")}
              >
                <option value="">Select messenger</option>
                {receivers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <input
                className="input"
                placeholder="Or type a name (if not in list)"
                value={receiverLabel}
                onChange={(e) => setReceiverLabel(e.target.value)}
              />
            </div>
          )}
          {receiverType === "supervisor" && cashReceiverOptions.supervisor && (
            <select
              className="input"
              value={receiverUserId}
              onChange={(e) => setReceiverUserId(Number(e.target.value) || "")}
            >
              <option value="">Select supervisor</option>
              {supervisors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      {isStaff && (
        <p className="text-xs text-slate-500">
          Cash receiver: you (
          {requestType === "exact" ? "confirm after payment" : "confirm after cash is issued"}).
        </p>
      )}

      {error && <p className="border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <button className="btn-primary w-full" type="submit">
        Review &amp; Submit{charges.length > 1 ? ` (${charges.length})` : ""}
      </button>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 md:items-center">
          <div className="card max-h-[85vh] w-full max-w-md overflow-y-auto p-4">
            <h3 className="text-lg font-bold text-slate-800">Confirm submission</h3>
            <p className="mt-1.5 text-sm text-slate-600">
              {charges.length > 1
                ? `One request with ${charges.length} charges will be sent to `
                : "This request will be sent to "}
              <b>{targetBranchName || "selected branch"}</b> Accounts —{" "}
              <b>{targetHandlers.join(", ") || "Unassigned"}</b>.
            </p>
            <div className="mt-3 space-y-2">
              {charges.map((c, i) => (
                <div key={c.key} className="space-y-1 border border-slate-200 bg-slate-50 p-2.5 text-sm">
                  {charges.length > 1 && (
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Charge {i + 1}</p>
                  )}
                  <Row k="Type" v={requestType === "exact" ? "Exact Payment" : "Suspense Advance"} />
                  <Row k="Description" v={c.description.trim() || "-"} />
                  {!isCompassion && effectiveJobChargeType === "job" && (
                    <Row k="Job Number" v={c.jobNumber.trim() || "-"} />
                  )}
                  {fuelActive && i === 0 && (
                    <>
                      <Row k="Vehicle no" v={fuelVehicleNo.trim() || "-"} />
                      <Row k="Vehicle" v={fuelVehicleLabel.trim() || "-"} />
                      <Row k="From km" v={fuelFromKm || "-"} />
                      <Row k="To km" v={fuelToKm || "-"} />
                      <Row k="Liters" v={fuelLiters || "-"} />
                    </>
                  )}
                  {isCompassion && (
                    <>
                      <Row k="Truck" v={c.truckNumber.trim() || "-"} />
                      <Row k="Trailer" v={c.trailerNumber.trim() || "-"} />
                      <Row
                        k="Driver"
                        v={drivers.find((d) => d.id === c.driverId)?.name || "-"}
                      />
                    </>
                  )}
                  {c.files.length > 0 && (
                    <Row k="Receipts" v={`${c.files.length} file${c.files.length === 1 ? "" : "s"}`} />
                  )}
                  <Row k="Amount" v={`AED ${Number(c.amount || 0).toFixed(2)}`} />
                </div>
              ))}
              {charges.length > 1 && (
                <div className="flex justify-between border border-slate-300 bg-white px-2.5 py-2 text-sm font-semibold">
                  <span>Total</span>
                  <span>AED {totalAmount.toFixed(2)}</span>
                </div>
              )}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="btn-secondary flex-1"
                onClick={() => setConfirmOpen(false)}
                disabled={submitting}
              >
                Back
              </button>
              <button type="button" className="btn-primary flex-1" onClick={submit} disabled={submitting}>
                {submitting
                  ? "Submitting..."
                  : charges.length > 1
                    ? `Confirm ${charges.length}`
                    : "Confirm Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

function ChargeCard({
  index,
  total,
  charge,
  requestType,
  showJob,
  showCompassion,
  requireCompassionVehicle,
  drivers,
  descriptionLocked,
  onUpdate,
  onDescriptionChange,
  onRemove,
}: {
  index: number;
  total: number;
  charge: ChargeGroup;
  requestType: "exact" | "suspense";
  showJob: boolean;
  showCompassion?: boolean;
  requireCompassionVehicle?: boolean;
  drivers?: Driver[];
  descriptionLocked?: boolean;
  onUpdate: (patch: Partial<ChargeGroup>) => void;
  onDescriptionChange: (desc: string) => void;
  onRemove: () => void;
}) {
  const receiptId = useId();

  return (
    <div className="card space-y-2.5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Charge {index + 1}
          {total > 1 ? ` of ${total}` : ""}
        </p>
        {total > 1 && (
          <button
            type="button"
            className="text-xs font-medium text-rose-600 hover:underline"
            onClick={onRemove}
          >
            Remove
          </button>
        )}
      </div>

      {showJob && (
        <JobNumbersInput
          values={[charge.jobNumber]}
          onChange={(vals) => onUpdate({ jobNumber: vals[0] ?? "" })}
          onStatusChange={(status) => onUpdate({ jobStatus: status })}
          allowMultiple={false}
          compact
        />
      )}

      {showCompassion && (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="label">
                Truck Number{requireCompassionVehicle ? " *" : ""}
              </label>
              <SuggestInput
                value={charge.truckNumber}
                onChange={(v) => onUpdate({ truckNumber: v })}
                placeholder="Truck number"
                endpoint="/api/meta/compassion-suggest?field=truck"
              />
            </div>
            <div>
              <label className="label">
                Trailer Number{requireCompassionVehicle ? " *" : ""}
              </label>
              <SuggestInput
                value={charge.trailerNumber}
                onChange={(v) => onUpdate({ trailerNumber: v })}
                placeholder="Trailer number"
                endpoint="/api/meta/compassion-suggest?field=trailer"
              />
            </div>
          </div>
          <div>
            <label className="label">Driver{requireCompassionVehicle ? " *" : ""}</label>
            <select
              className="input"
              value={charge.driverId}
              onChange={(e) =>
                onUpdate({ driverId: e.target.value ? Number(e.target.value) : "" })
              }
            >
              <option value="">Select driver</option>
              {(drivers || []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <div>
        <label className="label">Description</label>
        {descriptionLocked ? (
          <input className="input bg-slate-50" value={charge.description} readOnly />
        ) : showCompassion ? (
          <SuggestInput
            value={charge.description}
            onChange={onDescriptionChange}
            placeholder="e.g. Toll / parking / diesel"
            endpoint="/api/meta/compassion-suggest?field=description"
          />
        ) : (
          <DescriptionAutocomplete
            value={charge.description}
            onChange={onDescriptionChange}
            placeholder="e.g. Labour Charges"
          />
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label className="label">Amount</label>
          <input
            className="input"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={charge.amount}
            onChange={(e) => onUpdate({ amount: e.target.value })}
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="label">Currency</label>
          <input className="input bg-slate-50" value="AED" readOnly />
        </div>
      </div>

      <ReceiptFileInput
        id={`${receiptId}-receipts`}
        files={charge.files}
        onChange={(files) => onUpdate({ files })}
        compact
        label={
          <>
            Receipts {requestType === "exact" ? "(required)" : "(optional)"}
          </>
        }
        hint="JPG, PNG, WEBP or PDF. Add multiple if needed."
      />
    </div>
  );
}

function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-2 text-xs font-semibold transition sm:px-3 sm:text-sm ${
        active
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-border bg-background text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="shrink-0 text-slate-500">{k}</span>
      <span className="truncate text-right font-medium text-slate-700">{v}</span>
    </div>
  );
}
