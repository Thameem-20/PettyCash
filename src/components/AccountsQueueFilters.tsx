"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const CHARGE_OPTIONS = [
  { value: "job", label: "Job" },
  { value: "non_job", label: "Non-job" },
  { value: "truck_trailer", label: "Truck / Trailer" },
  { value: "general", label: "General" },
] as const;

const labelCls = "mb-0.5 block text-[10px] font-medium text-slate-600";
const inputCls = "input !px-2 !py-1 md:!px-2 md:!py-1 md:!text-xs";
const btnCls = "!px-2.5 !py-1 !text-xs md:!px-2.5 md:!py-1 md:!text-xs";

export default function AccountsQueueFilters({
  users,
  current,
}: {
  users: { id: number; name: string }[];
  current: {
    q: string;
    userId: number | null;
    charge: "" | "job" | "non_job" | "truck_trailer" | "general";
    type: "" | "exact" | "suspense";
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(current.q);

  useEffect(() => {
    setQ(current.q);
  }, [current.q]);

  function push(patch: Record<string, string | null | undefined>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === "") sp.delete(key);
      else sp.set(key, value);
    }
    sp.delete("page");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    push({
      q: q.trim() || null,
      user: searchParams.get("user"),
      charge: searchParams.get("charge"),
      type: searchParams.get("type"),
    });
  }

  function clearAll() {
    setQ("");
    const sp = new URLSearchParams(searchParams.toString());
    for (const key of ["q", "user", "charge", "type", "page"]) sp.delete(key);
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const hasFilters = Boolean(
    current.q || current.userId || current.charge || current.type
  );

  return (
    <div className="mb-2.5 rounded-md border border-slate-200 bg-slate-50/60 px-2 py-1.5">
      <form
        className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-end"
        onSubmit={applySearch}
      >
        <div className="min-w-0 flex-1 sm:max-w-[13rem]">
          <label className={labelCls} htmlFor="acct-search">
            Search
          </label>
          <input
            id="acct-search"
            className={inputCls}
            type="search"
            placeholder="Request no, job…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="sm:w-32">
          <label className={labelCls} htmlFor="acct-user">
            Submitted by
          </label>
          <select
            id="acct-user"
            className={inputCls}
            value={current.userId != null ? String(current.userId) : ""}
            onChange={(e) =>
              push({
                user: e.target.value || null,
                q: current.q || null,
                charge: current.charge || null,
                type: current.type || null,
              })
            }
          >
            <option value="">All users</option>
            {users.map((u) => (
              <option key={u.id} value={String(u.id)}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:w-32">
          <label className={labelCls} htmlFor="acct-charge">
            Charge type
          </label>
          <select
            id="acct-charge"
            className={inputCls}
            value={current.charge}
            onChange={(e) =>
              push({
                charge: e.target.value || null,
                q: current.q || null,
                user: current.userId != null ? String(current.userId) : null,
                type: current.type || null,
              })
            }
          >
            <option value="">All</option>
            {CHARGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:w-28">
          <label className={labelCls} htmlFor="acct-type">
            Request type
          </label>
          <select
            id="acct-type"
            className={inputCls}
            value={current.type}
            onChange={(e) =>
              push({
                type: e.target.value || null,
                q: current.q || null,
                user: current.userId != null ? String(current.userId) : null,
                charge: current.charge || null,
              })
            }
          >
            <option value="">All</option>
            <option value="exact">Exact</option>
            <option value="suspense">Suspense</option>
          </select>
        </div>
        <div className="flex flex-wrap items-end gap-1.5">
          <button type="submit" className={`btn-primary ${btnCls}`}>
            Apply
          </button>
          {hasFilters && (
            <button type="button" className={`btn-secondary ${btnCls}`} onClick={clearAll}>
              Clear
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
