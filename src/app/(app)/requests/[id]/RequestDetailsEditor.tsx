"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EnrichedRequest, RequestCharge } from "@/lib/requests";
import { canAccSupAmendAmounts } from "@/lib/accSupAmend";
import { money, round2, formatDate } from "@/lib/util";
import RequestChargeTabs from "@/components/RequestChargeTabs";
import DescriptionAutocomplete from "@/components/DescriptionAutocomplete";
import SuggestInput from "@/components/SuggestInput";
import { useRequestEditTrigger } from "./RequestEditButton";

type ChargeReceipt = {
  id: number;
  charge_id: number | null;
  file_name: string;
  mime_type: string | null;
  receipt_type: string;
};

type ChargeDraft = {
  description: string;
  amount: string;
  job_number: string;
  truck_number: string;
  trailer_number: string;
  vehicle_number: string;
  vehicle_label: string;
  fuel_from_km: string;
  fuel_to_km: string;
  fuel_liters: string;
};

function chargeTypeLabel(chargeType: string) {
  if (chargeType === "job") return "Job Related";
  if (chargeType === "non_job") return "Non Job Related";
  if (chargeType === "truck_trailer") return "Truck / Trailer Related";
  if (chargeType === "general") return "General Charges";
  return chargeType;
}

function emptyDrafts(charges: RequestCharge[]): Record<number, ChargeDraft> {
  return Object.fromEntries(
    charges.map((c) => [
      c.id,
      {
        description: c.description,
        amount: String(c.amount),
        job_number: c.job_number || "",
        truck_number: c.truck_number || "",
        trailer_number: c.trailer_number || "",
        vehicle_number: c.vehicle_number || "",
        vehicle_label: c.vehicle_label || "",
        fuel_from_km: c.fuel_from_km != null ? String(c.fuel_from_km) : "",
        fuel_to_km: c.fuel_to_km != null ? String(c.fuel_to_km) : "",
        fuel_liters: c.fuel_liters != null ? String(c.fuel_liters) : "",
      },
    ])
  );
}

export default function RequestDetailsEditor({
  request,
  charges,
  jobNumbers,
  receipts,
  canEdit,
  isCorrectionBySubmitter,
}: {
  request: EnrichedRequest;
  charges: RequestCharge[];
  jobNumbers: string[];
  receipts: ChargeReceipt[];
  canEdit: boolean;
  isCorrectionBySubmitter: boolean;
}) {
  const router = useRouter();
  const allowAmounts = canAccSupAmendAmounts(request.status);
  const hasChargeTabs = charges.length > 0 && !isCorrectionBySubmitter;
  const fuelInfo = useMemo(
    () =>
      charges.find(
        (c) =>
          c.vehicle_number != null ||
          c.fuel_from_km != null ||
          c.fuel_to_km != null ||
          c.fuel_liters != null
      ),
    [charges]
  );

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState(request.description || "");
  const [requestedAmount, setRequestedAmount] = useState(String(request.requested_amount));
  const [jobNumbersText, setJobNumbersText] = useState(jobNumbers.join(", "));
  const [truckNumber, setTruckNumber] = useState(request.truck_numbers || "");
  const [trailerNumber, setTrailerNumber] = useState(request.trailer_numbers || "");
  const [vehicleNumber, setVehicleNumber] = useState(
    fuelInfo?.vehicle_number || fuelInfo?.truck_number || ""
  );
  const [vehicleLabel, setVehicleLabel] = useState(fuelInfo?.vehicle_label || "");
  const [fuelFromKm, setFuelFromKm] = useState(
    fuelInfo?.fuel_from_km != null ? String(fuelInfo.fuel_from_km) : ""
  );
  const [fuelToKm, setFuelToKm] = useState(
    fuelInfo?.fuel_to_km != null ? String(fuelInfo.fuel_to_km) : ""
  );
  const [fuelLiters, setFuelLiters] = useState(
    fuelInfo?.fuel_liters != null ? String(fuelInfo.fuel_liters) : ""
  );
  const [chargeDrafts, setChargeDrafts] = useState(() => emptyDrafts(charges));

  const startEdit = useCallback(() => {
    setError("");
    setReason("");
    setDescription(request.description || "");
    setRequestedAmount(String(request.requested_amount));
    setJobNumbersText(jobNumbers.join(", "));
    setTruckNumber(request.truck_numbers || "");
    setTrailerNumber(request.trailer_numbers || "");
    setVehicleNumber(fuelInfo?.vehicle_number || fuelInfo?.truck_number || "");
    setVehicleLabel(fuelInfo?.vehicle_label || "");
    setFuelFromKm(fuelInfo?.fuel_from_km != null ? String(fuelInfo.fuel_from_km) : "");
    setFuelToKm(fuelInfo?.fuel_to_km != null ? String(fuelInfo.fuel_to_km) : "");
    setFuelLiters(fuelInfo?.fuel_liters != null ? String(fuelInfo.fuel_liters) : "");
    setChargeDrafts(emptyDrafts(charges));
    setEditing(true);
  }, [request, jobNumbers, fuelInfo, charges]);

  useRequestEditTrigger(startEdit);

  function cancelEdit() {
    setEditing(false);
    setError("");
    setReason("");
  }

  function updateCharge(id: number, key: keyof ChargeDraft, value: string) {
    setChargeDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], [key]: value },
    }));
  }

  const draftRequestedTotal =
    charges.length > 0
      ? round2(charges.reduce((sum, c) => sum + Number(chargeDrafts[c.id]?.amount || 0), 0))
      : round2(Number(requestedAmount || 0));

  async function save() {
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        reason: reason.trim(),
      };
      // Header description only when there are no per-charge descriptions to edit.
      if (!hasChargeTabs) {
        body.description = description.trim();
      }
      if (allowAmounts) {
        // Approved follows requested / charge total — not edited separately.
        body.approved_amount = draftRequestedTotal;
      }

      if (charges.length > 0) {
        body.charges = charges.map((c) => {
          const d = chargeDrafts[c.id];
          // Only send optional fields the requester already filled — never invent fuel/truck rows.
          const row: Record<string, unknown> = {
            charge_id: c.id,
            description: d.description.trim(),
          };
          if (allowAmounts) row.amount = Number(d.amount);
          if (c.job_number) row.job_number = d.job_number.trim() || null;
          if (c.truck_number) row.truck_number = d.truck_number.trim() || null;
          if (c.trailer_number) row.trailer_number = d.trailer_number.trim() || null;
          if (c.vehicle_number) row.vehicle_number = d.vehicle_number.trim() || null;
          if (c.vehicle_label) row.vehicle_label = d.vehicle_label.trim() || null;
          if (c.fuel_from_km != null) {
            row.fuel_from_km = d.fuel_from_km.trim() === "" ? null : Number(d.fuel_from_km);
          }
          if (c.fuel_to_km != null) {
            row.fuel_to_km = d.fuel_to_km.trim() === "" ? null : Number(d.fuel_to_km);
          }
          if (c.fuel_liters != null) {
            row.fuel_liters = d.fuel_liters.trim() === "" ? null : Number(d.fuel_liters);
          }
          return row;
        });
      } else if (request.charge_type === "job" && jobNumbers.length > 0) {
        body.job_numbers = jobNumbersText
          .split(",")
          .map((j) => j.trim())
          .filter(Boolean);
      }

      // Header-level edits for a single charge shown without charge tabs.
      if (charges.length === 1 && !hasChargeTabs) {
        const only = (body.charges as Record<string, unknown>[])[0];
        const c = charges[0];
        if (c.truck_number) only.truck_number = truckNumber.trim() || null;
        if (c.trailer_number) only.trailer_number = trailerNumber.trim() || null;
        if (c.vehicle_number || c.truck_number) {
          only.vehicle_number = vehicleNumber.trim() || null;
        }
        if (c.vehicle_label) only.vehicle_label = vehicleLabel.trim() || null;
        if (c.fuel_from_km != null) {
          only.fuel_from_km = fuelFromKm.trim() === "" ? null : Number(fuelFromKm);
        }
        if (c.fuel_to_km != null) {
          only.fuel_to_km = fuelToKm.trim() === "" ? null : Number(fuelToKm);
        }
        if (c.fuel_liters != null) {
          only.fuel_liters = fuelLiters.trim() === "" ? null : Number(fuelLiters);
        }
        if (c.job_number) {
          only.job_number = jobNumbersText.split(",")[0]?.trim() || null;
          body.job_numbers = jobNumbersText
            .split(",")
            .map((j) => j.trim())
            .filter(Boolean);
        }
      }

      const res = await fetch(`/api/requests/${request.id}/amend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!d.ok) {
        setError(d.error || "Could not save edits");
        return;
      }
      setEditing(false);
      setReason("");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  const isJob = request.charge_type === "job";
  const isTruck = request.charge_type === "truck_trailer";
  const isCompassion = request.branch_code === "COMP";

  return (
    <div className="relative">
      {editing && (
        <div className="mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-sky-200 bg-sky-50/60 p-3">
          <div className="min-w-[16rem] flex-1">
            <label className="label">Reason for edit (required — shown in activity)</label>
            <input
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why are you changing this request?"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={cancelEdit}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={
                busy ||
                !reason.trim() ||
                (hasChargeTabs
                  ? charges.some((c) => !chargeDrafts[c.id]?.description?.trim())
                  : !description.trim())
              }
              onClick={() => save()}
            >
              Save
            </button>
          </div>
          {error && <p className="w-full text-sm text-rose-700">{error}</p>}
          {!allowAmounts && (
            <p className="w-full text-xs text-slate-500">
              Cash already moved — amounts stay locked; you can edit details only.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Detail label="Charge Type" value={chargeTypeLabel(request.charge_type)} />
        {!isCorrectionBySubmitter && (
          <>
            <Detail
              label="Branch"
              value={request.branch_name + (request.branch_override ? " (override)" : "")}
            />
            {!hasChargeTabs && jobNumbers.length > 0 && (
              <EditableDetail
                label={jobNumbers.length > 1 || jobNumbersText.includes(",") ? "Job Numbers" : "Job Number"}
                editing={editing && isJob}
                value={jobNumbers.join(", ")}
                input={jobNumbersText}
                onChange={setJobNumbersText}
              />
            )}
            {!hasChargeTabs && request.truck_numbers && !fuelInfo && (
              <EditableDetail
                label="Truck Number"
                editing={editing && isTruck}
                value={request.truck_numbers}
                input={truckNumber}
                onChange={setTruckNumber}
              />
            )}
            {!hasChargeTabs && request.trailer_numbers && (
              <EditableDetail
                label="Trailer Number"
                editing={editing && isTruck}
                value={request.trailer_numbers}
                input={trailerNumber}
                onChange={setTrailerNumber}
              />
            )}
            {!hasChargeTabs && request.driver_names && (
              <Detail label="Driver" value={request.driver_names} />
            )}
            {!hasChargeTabs && fuelInfo && (
              <>
                {(fuelInfo.vehicle_number || fuelInfo.truck_number) && (
                  <EditableDetail
                    label="Vehicle No"
                    editing={editing}
                    value={fuelInfo.vehicle_number || fuelInfo.truck_number || "-"}
                    input={vehicleNumber}
                    onChange={setVehicleNumber}
                  />
                )}
                {fuelInfo.vehicle_label && (
                  <EditableDetail
                    label="Vehicle label"
                    editing={editing}
                    value={fuelInfo.vehicle_label}
                    input={vehicleLabel}
                    onChange={setVehicleLabel}
                  />
                )}
                {fuelInfo.fuel_from_km != null && (
                  <EditableDetail
                    label="From km"
                    editing={editing}
                    value={String(Number(fuelInfo.fuel_from_km))}
                    input={fuelFromKm}
                    onChange={setFuelFromKm}
                    type="number"
                  />
                )}
                {fuelInfo.fuel_to_km != null && (
                  <EditableDetail
                    label="To km"
                    editing={editing}
                    value={String(Number(fuelInfo.fuel_to_km))}
                    input={fuelToKm}
                    onChange={setFuelToKm}
                    type="number"
                  />
                )}
                {fuelInfo.fuel_liters != null && (
                  <EditableDetail
                    label="Liters"
                    editing={editing}
                    value={String(Number(fuelInfo.fuel_liters))}
                    input={fuelLiters}
                    onChange={setFuelLiters}
                    type="number"
                  />
                )}
              </>
            )}
            {charges.length > 1 && <Detail label="Charges" value={String(charges.length)} />}
          </>
        )}
        <Detail label="Submitted By" value={request.submitted_by_name} />
        <Detail
          label="Cash Receiver"
          value={request.receiver_name || request.cash_receiver_label || "-"}
        />
        <Detail label="Submitted On" value={formatDate(request.created_at)} />
        {!isCorrectionBySubmitter && (
          <EditableDetail
            label={charges.length > 1 ? "Total Requested" : "Requested Amount"}
            editing={editing && allowAmounts && charges.length === 0}
            value={
              editing && allowAmounts && charges.length > 0
                ? money(draftRequestedTotal, request.currency)
                : money(request.requested_amount, request.currency)
            }
            input={requestedAmount}
            onChange={setRequestedAmount}
            type="number"
          />
        )}
        {request.approved_amount != null && (
          <Detail
            label="Approved Amount"
            value={
              editing && allowAmounts
                ? money(draftRequestedTotal, request.currency)
                : money(request.approved_amount, request.currency)
            }
          />
        )}
        {request.paid_amount != null && (
          <Detail label="Paid Amount" value={money(request.paid_amount, request.currency)} />
        )}
        {request.closed_request_no && (
          <Detail label="Closed Suspense No" value={request.closed_request_no} />
        )}
        {request.actual_expense_amount != null && (
          <Detail
            label="Actual Expense"
            value={money(request.actual_expense_amount, request.currency)}
          />
        )}
        {request.returned_amount != null && (
          <Detail
            label="Returned Amount"
            value={money(request.returned_amount, request.currency)}
          />
        )}
        {request.additional_paid_amount != null && Number(request.additional_paid_amount) > 0 && (
          <Detail
            label="Additional Paid"
            value={money(request.additional_paid_amount, request.currency)}
          />
        )}
        {request.processing_by_name && (
          <Detail label="Processing By" value={request.processing_by_name} />
        )}
      </div>

      {fuelInfo &&
        !editing &&
        (fuelInfo.vehicle_label || fuelInfo.vehicle_number || fuelInfo.truck_number) && (
          <p className="mt-4 border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Vehicle
            {(fuelInfo.vehicle_number || fuelInfo.truck_number) && (
              <>
                : <b>{fuelInfo.vehicle_number || fuelInfo.truck_number}</b>
              </>
            )}
            {fuelInfo.vehicle_label && (
              <>
                {fuelInfo.vehicle_number || fuelInfo.truck_number ? " · " : ": "}
                <b>{fuelInfo.vehicle_label}</b>
              </>
            )}
          </p>
        )}

      {hasChargeTabs ? (
        editing ? (
          <div className="mt-4 space-y-3">
            {charges.map((c, i) => {
              const d = chargeDrafts[c.id];
              return (
                <div key={c.id} className="card space-y-2 p-4">
                  {charges.length > 1 && (
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Charge {i + 1} of {charges.length}
                    </p>
                  )}
                  <div>
                    <label className="label">Description</label>
                    <DescriptionSuggest
                      value={d.description}
                      onChange={(v) => updateCharge(c.id, "description", v)}
                      compassion={isCompassion}
                      placeholder="e.g. Labour Charges"
                    />
                  </div>
                  {allowAmounts && (
                    <Field
                      label="Amount"
                      value={d.amount}
                      onChange={(v) => updateCharge(c.id, "amount", v)}
                      type="number"
                    />
                  )}
                  {c.job_number && (
                    <Field
                      label="Job number"
                      value={d.job_number}
                      onChange={(v) => updateCharge(c.id, "job_number", v)}
                    />
                  )}
                  {(c.truck_number || c.trailer_number) && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {c.truck_number && (
                        <Field
                          label="Truck number"
                          value={d.truck_number}
                          onChange={(v) => updateCharge(c.id, "truck_number", v)}
                        />
                      )}
                      {c.trailer_number && (
                        <Field
                          label="Trailer number"
                          value={d.trailer_number}
                          onChange={(v) => updateCharge(c.id, "trailer_number", v)}
                        />
                      )}
                    </div>
                  )}
                  {(c.vehicle_number ||
                    c.vehicle_label ||
                    c.fuel_from_km != null ||
                    c.fuel_to_km != null ||
                    c.fuel_liters != null) && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {c.vehicle_number && (
                        <Field
                          label="Vehicle number"
                          value={d.vehicle_number}
                          onChange={(v) => updateCharge(c.id, "vehicle_number", v)}
                        />
                      )}
                      {c.vehicle_label && (
                        <Field
                          label="Vehicle label"
                          value={d.vehicle_label}
                          onChange={(v) => updateCharge(c.id, "vehicle_label", v)}
                        />
                      )}
                      {c.fuel_from_km != null && (
                        <Field
                          label="From km"
                          value={d.fuel_from_km}
                          onChange={(v) => updateCharge(c.id, "fuel_from_km", v)}
                          type="number"
                        />
                      )}
                      {c.fuel_to_km != null && (
                        <Field
                          label="To km"
                          value={d.fuel_to_km}
                          onChange={(v) => updateCharge(c.id, "fuel_to_km", v)}
                          type="number"
                        />
                      )}
                      {c.fuel_liters != null && (
                        <Field
                          label="Liters"
                          value={d.fuel_liters}
                          onChange={(v) => updateCharge(c.id, "fuel_liters", v)}
                          type="number"
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <RequestChargeTabs
            charges={charges}
            receipts={receipts}
            currency={request.currency}
            showJob={request.charge_type === "job"}
          />
        )
      ) : (
        !isCorrectionBySubmitter &&
        (request.description || editing) && (
          <div className="card mt-4 p-4">
            <p className="label">Description</p>
            {editing ? (
              <div className="mt-1">
                <DescriptionSuggest
                  value={description}
                  onChange={setDescription}
                  compassion={isCompassion}
                  placeholder="e.g. Labour Charges"
                />
              </div>
            ) : (
              <p className="text-sm whitespace-pre-line text-slate-700">{request.description}</p>
            )}
          </div>
        )
      )}

    </div>
  );
}

function DescriptionSuggest({
  value,
  onChange,
  compassion,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  compassion: boolean;
  placeholder?: string;
}) {
  if (compassion) {
    return (
      <SuggestInput
        value={value}
        onChange={onChange}
        placeholder={placeholder || "e.g. Toll / parking / diesel"}
        endpoint="/api/meta/compassion-suggest?field=description"
      />
    );
  }
  return (
    <DescriptionAutocomplete
      value={value}
      onChange={onChange}
      placeholder={placeholder || "e.g. Labour Charges"}
    />
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-700">{value}</p>
    </div>
  );
}

function EditableDetail({
  label,
  editing,
  value,
  input,
  onChange,
  type = "text",
}: {
  label: string;
  editing: boolean;
  value: string;
  input: string;
  onChange: (v: string) => void;
  type?: "text" | "number";
}) {
  if (!editing) return <Detail label={label} value={value} />;
  return (
    <div className="card p-3 ring-1 ring-sky-300">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <input
        className="input mt-1"
        type={type}
        step={type === "number" ? "0.01" : undefined}
        value={input}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "number";
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="input"
        type={type}
        step={type === "number" ? "0.01" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
