"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function PaymentRecordsFilters({
  users,
  current,
}: {
  users: { id: number; name: string }[];
  current: {
    q: string;
    userId: number | null;
    type: "" | "exact" | "suspense";
    from: string;
    to: string;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(current.q);
  const [from, setFrom] = useState(current.from);
  const [to, setTo] = useState(current.to);

  useEffect(() => {
    setQ(current.q);
    setFrom(current.from);
    setTo(current.to);
  }, [current.q, current.from, current.to]);

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
      from: from || null,
      to: to || null,
      type: searchParams.get("type"),
      user: searchParams.get("user"),
    });
  }

  function clearAll() {
    setQ("");
    setFrom("");
    setTo("");
    const sp = new URLSearchParams(searchParams.toString());
    for (const key of ["q", "user", "type", "from", "to", "page"]) sp.delete(key);
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const hasFilters = Boolean(
    current.q || current.userId || current.type || current.from || current.to
  );

  const labelCls = "mb-0.5 block text-[10px] font-medium text-slate-600";
  const inputCls = "input !px-2 !py-1 md:!px-2 md:!py-1 md:!text-xs";
  const btnCls = "!px-2.5 !py-1 !text-xs md:!px-2.5 md:!py-1 md:!text-xs";

  return (
    <div className="mb-2.5 rounded-md border border-slate-200 bg-slate-50/60 px-2 py-1.5">
      <form
        className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-6"
        onSubmit={applySearch}
      >
        <div className="sm:col-span-2 lg:col-span-2">
          <label className={labelCls} htmlFor="pay-search">
            Search
          </label>
          <input
            id="pay-search"
            className={inputCls}
            type="search"
            placeholder="Request no, job, submitter…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="pay-type">
            Type
          </label>
          <select
            id="pay-type"
            className={inputCls}
            value={current.type}
            onChange={(e) =>
              push({
                type: e.target.value || null,
                q: current.q || null,
                user: current.userId != null ? String(current.userId) : null,
                from: current.from || null,
                to: current.to || null,
              })
            }
          >
            <option value="">All types</option>
            <option value="exact">Exact payment</option>
            <option value="suspense">Suspense</option>
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="pay-user">
            Submitted by
          </label>
          <select
            id="pay-user"
            className={inputCls}
            value={current.userId != null ? String(current.userId) : ""}
            onChange={(e) =>
              push({
                user: e.target.value || null,
                q: current.q || null,
                type: current.type || null,
                from: current.from || null,
                to: current.to || null,
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
        <div>
          <label className={labelCls} htmlFor="pay-from">
            Paid from
          </label>
          <input
            id="pay-from"
            className={inputCls}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="pay-to">
            Paid to
          </label>
          <input
            id="pay-to"
            className={inputCls}
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-end gap-1.5 sm:col-span-2 lg:col-span-6">
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
