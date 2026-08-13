"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChargeType, Role } from "@/lib/types";
import DescriptionAutocomplete from "@/components/DescriptionAutocomplete";
import SuggestInput from "@/components/SuggestInput";
import JobNumbersInput, { JobNumbersStatus } from "@/components/JobNumbersInput";
import ReceiptFileInput from "@/components/ReceiptFileInput";
import SubmitBlockingOverlay, {
  postFormDataWithProgress,
} from "@/components/SubmitBlockingOverlay";
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
import {
  clearNewRequestDraft,
  formatDraftSavedAt,
  isNewRequestDraftMeaningful,
  readNewRequestDraft,
  writeNewRequestDraft,
  type NewRequestDraft,
  type NewRequestDraftCharge,
} from "@/lib/newRequestDraft";

const FUEL_DESCRIPTION = "Fuel Charges";
const NETWORK_ERROR_MSG =
  "Network error — your entries are still here. Don't refresh. Tap Retry when you're back online. Receipt files stay attached until you leave this page.";

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
  fuelVehicleNo: string;
  fuelVehicleLabel: string;
  fuelFromKm: string;
  fuelToKm: string;
  fuelLiters: string;
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
    fuelVehicleNo: "",
    fuelVehicleLabel: "",
    fuelFromKm: "",
    fuelToKm: "",
    fuelLiters: "",
  };
}

function chargeFromDraft(c: NewRequestDraftCharge): ChargeGroup {
  return {
    key: newChargeKey(),
    jobNumber: c.jobNumber || "",
    jobStatus: { valid: false },
    truckNumber: c.truckNumber || "",
    trailerNumber: c.trailerNumber || "",
    driverId: c.driverId === "" || c.driverId == null ? "" : c.driverId,
    description: c.description || "",
    amount: c.amount || "",
    files: [],
    fuelVehicleNo: c.fuelVehicleNo || "",
    fuelVehicleLabel: c.fuelVehicleLabel || "",
    fuelFromKm: c.fuelFromKm || "",
    fuelToKm: c.fuelToKm || "",
    fuelLiters: c.fuelLiters || "",
  };
}

function chargesToDraft(charges: ChargeGroup[]): NewRequestDraftCharge[] {
  return charges.map((c) => ({
    jobNumber: c.jobNumber,
    truckNumber: c.truckNumber,
    trailerNumber: c.trailerNumber,
    driverId: c.driverId,
    description: c.description,
    amount: c.amount,
    fuelVehicleNo: c.fuelVehicleNo,
    fuelVehicleLabel: c.fuelVehicleLabel,
    fuelFromKm: c.fuelFromKm,
    fuelToKm: c.fuelToKm,
    fuelLiters: c.fuelLiters,
  }));
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

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  /** 0–100 while uploading; null while server processes after upload. */
  const [uploadProgress, setUploadProgress] = useState<number | null>(0);
  const [pendingDraft, setPendingDraft] = useState<NewRequestDraft | null>(null);
  const [allowAutosave, setAllowAutosave] = useState(false);
  const [formMetaReady, setFormMetaReady] = useState(false);

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
          c.description === FUEL_DESCRIPTION
            ? {
                ...c,
                description: "",
                fuelVehicleNo: "",
                fuelVehicleLabel: "",
                fuelFromKm: "",
                fuelToKm: "",
                fuelLiters: "",
              }
            : c
        )
      );
    }
  }

  function selectFuelVehicle(key: string, plateNo: string) {
    const match = fleetVehicles.find(
      (v) => v.plate_no.toLowerCase() === plateNo.trim().toLowerCase()
    );
    updateCharge(key, {
      fuelVehicleNo: plateNo,
      fuelVehicleLabel: match?.label || "",
    });
  }

  useEffect(() => {
    let cancelled = false;
    setFormMetaReady(false);
    setAllowAutosave(false);
    fetch("/api/meta/form")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d.ok) return;
        setBranches(d.branches);
        setReceivers(d.receivers);
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

        const draft = readNewRequestDraft(role);
        if (isNewRequestDraftMeaningful(draft)) {
          setPendingDraft(draft);
          setAllowAutosave(false);
        } else {
          setPendingDraft(null);
          setAllowAutosave(true);
        }
        setFormMetaReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isOps, branchKey, role]);

  useEffect(() => {
    if (!formMetaReady || !allowAutosave) return;
    const timer = window.setTimeout(() => {
      writeNewRequestDraft(role, {
        requestType,
        chargeType,
        branchId,
        receiverType,
        receiverUserId,
        receiverLabel,
        fuelCharges,
        charges: chargesToDraft(charges),
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    formMetaReady,
    allowAutosave,
    role,
    requestType,
    chargeType,
    branchId,
    receiverType,
    receiverUserId,
    receiverLabel,
    fuelCharges,
    charges,
  ]);

  useEffect(() => {
    const hasDraftContent =
      (allowAutosave &&
        isNewRequestDraftMeaningful({
          v: 1,
          savedAt: "",
          role,
          requestType,
          chargeType,
          branchId,
          receiverType,
          receiverUserId,
          receiverLabel,
          fuelCharges,
          charges: chargesToDraft(charges),
        })) ||
      isNewRequestDraftMeaningful(pendingDraft);
    if (!hasDraftContent) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [
    allowAutosave,
    pendingDraft,
    role,
    requestType,
    chargeType,
    branchId,
    receiverType,
    receiverUserId,
    receiverLabel,
    fuelCharges,
    charges,
  ]);

  function restorePendingDraft() {
    if (!pendingDraft) return;
    setRequestType(pendingDraft.requestType);
    setChargeType(pendingDraft.chargeType);
    setBranchId(pendingDraft.branchId);
    setReceiverType(pendingDraft.receiverType);
    setReceiverUserId(pendingDraft.receiverUserId);
    setReceiverLabel(pendingDraft.receiverLabel);
    setFuelCharges(pendingDraft.fuelCharges);
    setCharges(
      pendingDraft.charges.length
        ? pendingDraft.charges.map(chargeFromDraft)
        : [emptyCharge()]
    );
    setPendingDraft(null);
    setAllowAutosave(true);
    setError("");
  }

  function discardPendingDraft() {
    clearNewRequestDraft(role);
    setPendingDraft(null);
    setAllowAutosave(true);
  }

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

    for (let i = 0; i < charges.length; i++) {
      const c = charges[i];
      const n = i + 1;
      if (!c.description.trim()) return `Charge ${n}: enter a description`;
      if (!c.amount || Number(c.amount) <= 0) return `Charge ${n}: enter a valid amount`;
      if (fuelActive) {
        if (!c.fuelVehicleNo.trim()) return `Charge ${n}: select a vehicle`;
        if (!c.fuelVehicleLabel.trim()) {
          return `Charge ${n}: selected vehicle is not in the admin list`;
        }
        if (c.fuelFromKm.trim() !== "") {
          if (Number(c.fuelFromKm) < 0 || Number.isNaN(Number(c.fuelFromKm))) {
            return `Charge ${n}: enter a valid from km`;
          }
        }
        if (c.fuelToKm.trim() !== "") {
          if (Number(c.fuelToKm) < 0 || Number.isNaN(Number(c.fuelToKm))) {
            return `Charge ${n}: enter a valid to km`;
          }
        }
        if (
          c.fuelFromKm.trim() !== "" &&
          c.fuelToKm.trim() !== "" &&
          Number(c.fuelToKm) < Number(c.fuelFromKm)
        ) {
          return `Charge ${n}: to km must be greater than or equal to from km`;
        }
        if (
          !c.fuelLiters.trim() ||
          Number(c.fuelLiters) <= 0 ||
          Number.isNaN(Number(c.fuelLiters))
        ) {
          return `Charge ${n}: enter liters greater than zero`;
        }
      }
      if (isCompassion) {
        if (chargeType === "truck_trailer") {
          // Truck / trailer optional; driver required for truck/trailer shipments.
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
    setUploadProgress(0);
    setError("");
    try {
      const fd = new FormData();
      const submitChargeType = isCompassion ? chargeType : effectiveJobChargeType;
      fd.set("request_type", requestType);
      fd.set("charge_type", submitChargeType);
      if (isCompassion || submitChargeType === "non_job") fd.set("branch_id", String(branchId));
      fd.set("cash_receiver_type", isCashRequester || isStaff || isCompassion ? "myself" : receiverType);
      if (receiverType === "messenger") {
        if (receiverUserId) fd.set("cash_receiver_user_id", String(receiverUserId));
        if (receiverLabel.trim()) fd.set("cash_receiver_label", receiverLabel.trim());
      }

      if (fuelActive) {
        fd.set("is_fuel_charges", "true");
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
            vehicle_number: fuelActive ? c.fuelVehicleNo.trim() || null : null,
            vehicle_label: fuelActive ? c.fuelVehicleLabel.trim() || null : null,
            fuel_from_km:
              fuelActive && c.fuelFromKm.trim() !== "" ? Number(c.fuelFromKm) : null,
            fuel_to_km:
              fuelActive && c.fuelToKm.trim() !== "" ? Number(c.fuelToKm) : null,
            fuel_liters: fuelActive ? Number(c.fuelLiters) : null,
          }))
        )
      );

      charges.forEach((c, i) => {
        c.files.forEach((f) => fd.append(`charge_${i}_receipts`, f));
      });

      const d = await postFormDataWithProgress<{ ok: boolean; error?: string; id?: number }>(
        "/api/requests",
        fd,
        (pct) => {
          setUploadProgress(pct);
          if (pct >= 100) setUploadProgress(null);
        }
      );
      if (!d.ok) {
        setError(d.error || "Submission failed");
        return;
      }
      clearNewRequestDraft(role);
      setAllowAutosave(false);
      setPendingDraft(null);
      router.push(`/requests/${d.id}`);
      router.refresh();
    } catch {
      setError(NETWORK_ERROR_MSG);
    } finally {
      setSubmitting(false);
      setUploadProgress(0);
    }
  }

  const isNetworkError = error === NETWORK_ERROR_MSG;

  return (
    <form onSubmit={openConfirm} className="space-y-3">
      <SubmitBlockingOverlay
        open={submitting}
        progress={uploadProgress}
        title="Submitting request…"
        detail={
          uploadProgress == null
            ? "Upload finished — saving your request on the server."
            : charges.length > 1
              ? `Uploading ${charges.length} charges with receipts…`
              : "Uploading receipts…"
        }
      />
      {pendingDraft && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 border-l-2 border-sky-500 bg-sky-50/80 py-1.5 pl-2.5 pr-2 text-[11px] leading-snug text-slate-600"
        >
          <span>
            Saved work from {formatDraftSavedAt(pendingDraft.savedAt)}
            {pendingDraft.charges.length > 1
              ? ` (${pendingDraft.charges.length} charges)`
              : ""}
            . Add receipts again after loading.
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={restorePendingDraft}
              className="font-semibold text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
            >
              Load it
            </button>
            <span className="text-slate-300" aria-hidden>
              |
            </span>
            <button
              type="button"
              onClick={discardPendingDraft}
              className="text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-700"
            >
              Clear
            </button>
          </span>
        </div>
      )}
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
        <div className="card p-3">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-semibold text-slate-800">Fuel charges</span>
              <span className="block text-[11px] leading-snug text-slate-500">
                Description becomes Fuel Charges. Fill plate number, km and liters on each charge.
              </span>
            </span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={fuelCharges}
              onChange={(e) => toggleFuelCharges(e.target.checked)}
            />
          </label>
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
            requireCompassionDriver={chargeType === "truck_trailer"}
            drivers={drivers}
            showFuel={fuelActive}
            fleetVehicles={fleetVehicles}
            descriptionLocked={fuelActive}
            excludeDescriptions={charges
              .filter((c) => c.key !== charge.key)
              .map((c) => c.description.trim())
              .filter(Boolean)}
            onUpdate={(patch) => updateCharge(charge.key, patch)}
            onDescriptionChange={(desc) => onChargeDescriptionChange(charge.key, desc)}
            onSelectFuelVehicle={(plateNo) => selectFuelVehicle(charge.key, plateNo)}
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
            <p className="border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
              Cash receipt confirmation will go to the assigned supervisor.
            </p>
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
                  {fuelActive && (
                    <>
                      <Row k="Vehicle no" v={c.fuelVehicleNo.trim() || "-"} />
                      <Row k="Vehicle" v={c.fuelVehicleLabel.trim() || "-"} />
                      <Row k="From km" v={c.fuelFromKm || "-"} />
                      <Row k="To km" v={c.fuelToKm || "-"} />
                      <Row k="Liters" v={c.fuelLiters || "-"} />
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
            {error && (
              <p className="mt-3 border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="btn-secondary flex-1"
                onClick={() => {
                  setConfirmOpen(false);
                  if (!isNetworkError) setError("");
                }}
                disabled={submitting}
              >
                Back
              </button>
              <button type="button" className="btn-primary flex-1" onClick={submit} disabled={submitting}>
                {submitting
                  ? "Submitting..."
                  : isNetworkError
                    ? "Retry Submit"
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
  requireCompassionDriver,
  drivers,
  showFuel,
  fleetVehicles = [],
  descriptionLocked,
  excludeDescriptions = [],
  onUpdate,
  onDescriptionChange,
  onSelectFuelVehicle,
  onRemove,
}: {
  index: number;
  total: number;
  charge: ChargeGroup;
  requestType: "exact" | "suspense";
  showJob: boolean;
  showCompassion?: boolean;
  requireCompassionDriver?: boolean;
  drivers?: Driver[];
  showFuel?: boolean;
  fleetVehicles?: FleetVehicle[];
  descriptionLocked?: boolean;
  excludeDescriptions?: string[];
  onUpdate: (patch: Partial<ChargeGroup>) => void;
  onDescriptionChange: (desc: string) => void;
  onSelectFuelVehicle?: (plateNo: string) => void;
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
              <label className="label">Truck Number</label>
              <SuggestInput
                value={charge.truckNumber}
                onChange={(v) => onUpdate({ truckNumber: v })}
                placeholder="Truck number (optional)"
                endpoint="/api/meta/compassion-suggest?field=truck"
              />
            </div>
            <div>
              <label className="label">Trailer Number</label>
              <SuggestInput
                value={charge.trailerNumber}
                onChange={(v) => onUpdate({ trailerNumber: v })}
                placeholder="Trailer number (optional)"
                endpoint="/api/meta/compassion-suggest?field=trailer"
              />
            </div>
          </div>
          <div>
            <label className="label">Driver{requireCompassionDriver ? " *" : ""}</label>
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

      {showFuel && (
        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50/70 p-2.5">
          <div>
            <label className="label">Vehicle no *</label>
            <select
              className="input"
              value={charge.fuelVehicleNo}
              onChange={(e) => onSelectFuelVehicle?.(e.target.value)}
            >
              <option value="">Select plate number</option>
              {fleetVehicles.map((v) => (
                <option key={v.id} value={v.plate_no}>
                  {v.plate_no}
                </option>
              ))}
            </select>
            {charge.fuelVehicleLabel ? (
              <p className="mt-1.5 border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-700">
                Vehicle: <b>{charge.fuelVehicleLabel}</b>
              </p>
            ) : fleetVehicles.length === 0 ? (
              <p className="mt-1.5 text-xs text-amber-700">
                No vehicles configured. Ask an admin to add plate numbers under Vehicles.
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">From km</label>
              <input
                className="input"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={charge.fuelFromKm}
                onChange={(e) => onUpdate({ fuelFromKm: e.target.value })}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="label">To km</label>
              <input
                className="input"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={charge.fuelToKm}
                onChange={(e) => onUpdate({ fuelToKm: e.target.value })}
                placeholder="Optional"
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
              value={charge.fuelLiters}
              onChange={(e) => onUpdate({ fuelLiters: e.target.value })}
              placeholder="0"
            />
          </div>
        </div>
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
            exclude={excludeDescriptions}
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
