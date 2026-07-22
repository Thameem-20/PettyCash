"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton({
  tone = "light",
  className = "",
}: {
  tone?: "light" | "dark";
  className?: string;
}) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  const cls =
    tone === "dark"
      ? "text-brand-100 hover:text-white"
      : "text-slate-500 hover:text-rose-600";
  return (
    <button
      type="button"
      onClick={logout}
      className={`text-xs font-semibold md:text-sm ${cls} ${className}`.trim()}
    >
      Sign out
    </button>
  );
}
