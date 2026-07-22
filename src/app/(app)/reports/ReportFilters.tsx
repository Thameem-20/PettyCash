"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { REPORT_TYPES } from "@/lib/reportTypes";
import { REPORT_DATE_PERIODS, defaultReportPeriod, normalizeReportPeriod, toYmd } from "@/lib/reportDateRange";
import { REPORTS_WITHOUT_DATE_FILTER, REPORTS_WITHOUT_MESSENGER_FILTER } from "@/lib/reportFilters";

export default function ReportFilters({
  messengers = [],
  exportBranch = "all",
}: {
  messengers?: { id: number; name: string }[];
  /** Active workspace branch from Settings (used for Excel export). */
  exportBranch?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function pushParams(sp: URLSearchParams) {
    sp.delete("page");
    const q = sp.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  }

  function update(key: string, value: string) {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    pushParams(sp);
  }

  function updateMessenger(value: string) {
    const sp = new URLSearchParams(params.toString());
    if (value === "all") sp.delete("messenger");
    else sp.set("messenger", value);
    pushParams(sp);
  }

  function updateType(value: string) {
    const sp = new URLSearchParams(params.toString());
    sp.set("type", value);
    sp.set("period", defaultReportPeriod(value));
    sp.delete("from");
    sp.delete("to");
    sp.delete("tab");
    if (value !== "request_list") sp.delete("detailed");
    if (REPORTS_WITHOUT_MESSENGER_FILTER.has(value)) {
      sp.delete("messenger");
    }
    if (value === "request_list") {
      sp.set("tab", "petty_cash_paid");
    }
    pushParams(sp);
  }

  function updatePeriod(value: string) {
    const sp = new URLSearchParams(params.toString());
    sp.set("period", value);
    if (value === "custom") {
      const today = toYmd(new Date());
      if (!sp.get("from")) sp.set("from", today);
      if (!sp.get("to")) sp.set("to", today);
    } else {
      sp.delete("from");
      sp.delete("to");
    }
    pushParams(sp);
  }

  function toggleDetailed() {
    const sp = new URLSearchParams(params.toString());
    if (sp.get("detailed") === "1") sp.delete("detailed");
    else sp.set("detailed", "1");
    pushParams(sp);
  }

  const type = params.get("type") || "request_list";
  const detailed = params.get("detailed") === "1";
  const periodParam = params.get("period");
  const period = periodParam ? normalizeReportPeriod(periodParam) : defaultReportPeriod(type);
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  const showDateFilter = !REPORTS_WITHOUT_DATE_FILTER.has(type);
  const showMessengerFilter = !REPORTS_WITHOUT_MESSENGER_FILTER.has(type);
  const showDetailedToggle = type === "request_list";

  const messengerParam = params.get("messenger");
  const messengerList = messengers ?? [];
  const messenger =
    messengerParam && messengerList.some((m) => String(m.id) === messengerParam)
      ? messengerParam
      : "all";

  const exportParams = new URLSearchParams(params.toString());
  exportParams.set("type", type);
  if (showDateFilter) {
    exportParams.set("period", periodParam || period);
  } else {
    exportParams.delete("period");
    exportParams.delete("from");
    exportParams.delete("to");
  }
  exportParams.set("branch", exportBranch);
  if (showMessengerFilter && messenger !== "all") {
    exportParams.set("messenger", messenger);
  } else {
    exportParams.delete("messenger");
  }
  if (period !== "custom") {
    exportParams.delete("from");
    exportParams.delete("to");
  }
  if (type === "request_list") {
    exportParams.set("tab", params.get("tab") || "petty_cash_paid");
    if (detailed) exportParams.set("detailed", "1");
    else exportParams.delete("detailed");
  } else {
    exportParams.delete("tab");
    exportParams.delete("detailed");
  }
  const exportHref = `/api/reports/export?${exportParams.toString()}`;

  return (
    <div className="card mb-4 flex flex-wrap items-end gap-3 p-4 no-print">
      <div>
        <label className="label">Report</label>
        <select className="input w-auto" value={type} onChange={(e) => updateType(e.target.value)}>
          {REPORT_TYPES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Cash Requester / Ops</label>
        <select
          className="input w-auto min-w-[10rem] disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
          value={messenger}
          onChange={(e) => updateMessenger(e.target.value)}
          disabled={!showMessengerFilter}
          title={!showMessengerFilter ? "Not available for this report" : undefined}
        >
          <option value="all">All</option>
          {(messengers ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      {showDateFilter && (
        <>
          <div>
            <label className="label">Date</label>
            <select className="input w-auto" value={period} onChange={(e) => updatePeriod(e.target.value)}>
              {REPORT_DATE_PERIODS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          {period === "custom" && (
            <>
              <div>
                <label className="label">From</label>
                <input
                  className="input w-auto"
                  type="date"
                  value={from}
                  onChange={(e) => update("from", e.target.value)}
                />
              </div>
              <div>
                <label className="label">To</label>
                <input
                  className="input w-auto"
                  type="date"
                  value={to}
                  onChange={(e) => update("to", e.target.value)}
                />
              </div>
            </>
          )}
        </>
      )}
      <a className="btn-secondary" href={exportHref}>
        Export Excel
      </a>
      {showDetailedToggle && (
        <button
          type="button"
          onClick={toggleDetailed}
          className={`ml-auto inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition ${
            detailed
              ? "border-brand-600 bg-brand-600 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
          title={
            detailed
              ? "Showing charge / job / amount breakdown in each request row"
              : "Showing one combined row per request"
          }
        >
          <span
            className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition ${
              detailed ? "bg-white/30" : "bg-slate-300"
            }`}
            aria-hidden
          >
            <span
              className={`absolute size-3 rounded-full bg-white shadow transition ${
                detailed ? "left-3.5" : "left-0.5"
              }`}
            />
          </span>
          Detailed View
        </button>
      )}
    </div>
  );
}
