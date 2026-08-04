"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function SupervisorCoverFilters({
  users,
  currentUserId,
  currentQ,
}: {
  users: { id: number; name: string }[];
  currentUserId: number | null;
  currentQ: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(currentQ);

  useEffect(() => {
    setQ(currentQ);
  }, [currentQ]);

  function push(next: { q?: string; user?: string | null }) {
    const sp = new URLSearchParams(searchParams.toString());
    const nextQ = next.q !== undefined ? next.q : sp.get("q") || "";
    const nextUser = next.user !== undefined ? next.user : sp.get("user");

    if (nextQ.trim()) sp.set("q", nextQ.trim());
    else sp.delete("q");

    if (nextUser) sp.set("user", nextUser);
    else sp.delete("user");

    sp.delete("page");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <label className="label" htmlFor="cover-search">
          Search
        </label>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            push({ q });
          }}
        >
          <input
            id="cover-search"
            className="input"
            type="search"
            placeholder="Request no, description, submitter, supervisor…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="submit" className="btn-secondary shrink-0">
            Search
          </button>
        </form>
      </div>
      <div className="sm:w-64">
        <label className="label" htmlFor="cover-user">
          Submitted by
        </label>
        <select
          id="cover-user"
          className="input"
          value={currentUserId != null ? String(currentUserId) : ""}
          onChange={(e) => push({ user: e.target.value || null })}
        >
          <option value="">All users</option>
          {users.map((u) => (
            <option key={u.id} value={String(u.id)}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
