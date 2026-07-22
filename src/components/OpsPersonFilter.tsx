"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export default function OpsPersonFilter({
  users,
  currentOpsId,
}: {
  users: { id: number; name: string }[];
  currentOpsId: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const sp = new URLSearchParams(searchParams.toString());
    const v = e.target.value;
    if (v) sp.set("ops", v);
    else sp.delete("ops");
    sp.delete("page");
    const q = sp.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  }

  return (
    <select
      className="input w-full sm:w-auto sm:min-w-[12rem]"
      value={currentOpsId != null ? String(currentOpsId) : ""}
      onChange={onChange}
      aria-label="Filter by operations user"
    >
      <option value="">All operations users</option>
      {users.map((u) => (
        <option key={u.id} value={String(u.id)}>
          {u.name}
        </option>
      ))}
    </select>
  );
}
