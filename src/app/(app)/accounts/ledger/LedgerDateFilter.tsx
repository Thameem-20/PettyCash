"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export type LedgerDayPeriod = "today" | "yesterday" | "custom";

export default function LedgerDateFilter({
  period,
  date,
  maxDate,
}: {
  period: LedgerDayPeriod;
  date: string;
  maxDate: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function push(next: { period?: LedgerDayPeriod; date?: string }) {
    const sp = new URLSearchParams(params.toString());
    const p = next.period ?? period;
    if (p === "today") {
      sp.delete("period");
      sp.delete("date");
    } else if (p === "yesterday") {
      sp.set("period", "yesterday");
      sp.delete("date");
    } else {
      sp.set("period", "custom");
      sp.set("date", next.date ?? date);
    }
    const q = sp.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  }

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <div>
        <label className="label" htmlFor="ledger-period">
          Day
        </label>
        <select
          id="ledger-period"
          className="input min-w-[10rem]"
          value={period}
          onChange={(e) => {
            const key = e.target.value as LedgerDayPeriod;
            push({ period: key, date: key === "custom" ? date || maxDate : undefined });
          }}
        >
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="custom">Custom date</option>
        </select>
      </div>
      {period === "custom" && (
        <div>
          <label className="label" htmlFor="ledger-date">
            Date
          </label>
          <input
            id="ledger-date"
            type="date"
            className="input"
            value={date}
            max={maxDate}
            onChange={(e) => {
              const v = e.target.value;
              if (v) push({ period: "custom", date: v });
            }}
          />
        </div>
      )}
    </div>
  );
}
