"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, X } from "lucide-react";
import { ROLE_LABELS } from "@/lib/rbac";
import type { Role } from "@/lib/types";
import LogoutButton from "@/components/LogoutButton";

type Branch = { id: number; branch_name: string; branch_code?: string };

const ANIM_MS = 280;

export default function WorkspaceSwitcher({
  branches,
  current,
  allowAll,
  userName,
  userEmail,
  userRole,
  tone = "light",
}: {
  branches: Branch[];
  current: number | "all";
  allowAll: boolean;
  userName: string;
  userEmail: string;
  userRole: Role;
  tone?: "light" | "dark";
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<number | "all">(current);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    setSelected(current);
  }, [current]);

  function openPanel() {
    setError("");
    setMounted(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
  }

  function closePanel() {
    if (busy) return;
    setVisible(false);
  }

  useEffect(() => {
    if (!mounted || visible) return;
    const t = window.setTimeout(() => setMounted(false), ANIM_MS);
    return () => window.clearTimeout(t);
  }, [mounted, visible]);

  useEffect(() => {
    if (!mounted) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) setVisible(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, busy]);

  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  const currentLabel =
    selected === "all"
      ? "All Branches"
      : branches.find((b) => b.id === selected)?.branch_name || "Branch";

  async function save(next: number | "all") {
    if (next === selected) {
      closePanel();
      return;
    }
    setSelected(next);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/settings/branch", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch: next }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Could not save branch");
        setSelected(current);
        return;
      }
      closePanel();
      router.refresh();
    } catch {
      setError("Could not save branch");
      setSelected(current);
    } finally {
      setBusy(false);
    }
  }

  const triggerClass =
    tone === "dark"
      ? "border-brand-400/60 text-white hover:bg-brand-600"
      : "border-border text-foreground hover:bg-muted";

  const panel =
    mounted && portalReady
      ? createPortal(
          <div className="fixed inset-0 z-[100] flex justify-end">
            <button
              type="button"
              className={`absolute inset-0 bg-black/40 transition-opacity duration-[280ms] ease-out ${
                visible ? "opacity-100" : "opacity-0"
              }`}
              aria-label="Close workspace menu"
              onClick={closePanel}
            />
            <aside
              className={`relative flex h-full w-full max-w-sm flex-col bg-white shadow-xl transition-transform duration-[280ms] ease-out ${
                visible ? "translate-x-0" : "translate-x-full"
              }`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="workspace-panel-title"
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
                <div>
                  <h2 id="workspace-panel-title" className="text-base font-bold text-slate-900">
                    Workspace
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Switch branch. Your role and menus follow that branch.
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  onClick={closePanel}
                  aria-label="Close"
                >
                  <X className="size-5" />
                </button>
              </div>

              <div className="border-b border-slate-100 px-4 py-3">
                <p className="text-sm font-semibold text-slate-800">{userName}</p>
                <p className="truncate text-xs text-slate-500">{userEmail}</p>
                <p className="mt-1 text-[11px] font-medium text-brand-700">{ROLE_LABELS[userRole]}</p>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Assigned branches
                </p>
                {branches.length === 0 ? (
                  <p className="text-sm text-slate-500">No branches assigned yet.</p>
                ) : (
                  <div className="space-y-2">
                    {branches.map((b) => {
                      const active = selected === b.id;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          disabled={busy}
                          onClick={() => save(b.id)}
                          className={`w-full rounded-xl border px-3.5 py-3 text-left transition ${
                            active
                              ? "border-brand-500 bg-brand-50 shadow-sm ring-1 ring-brand-400/40"
                              : "border-slate-200 bg-white hover:border-brand-300 hover:bg-slate-50"
                          }`}
                        >
                          <p
                            className={`text-sm font-semibold ${
                              active ? "text-brand-800" : "text-slate-800"
                            }`}
                          >
                            {b.branch_name}
                          </p>
                          {b.branch_code && (
                            <p className="mt-0.5 text-xs text-slate-500">{b.branch_code}</p>
                          )}
                          {active && (
                            <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-600">
                              Active
                            </p>
                          )}
                        </button>
                      );
                    })}
                    {allowAll && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => save("all")}
                        className={`w-full rounded-xl border px-3.5 py-3 text-left transition ${
                          selected === "all"
                            ? "border-brand-500 bg-brand-50 shadow-sm ring-1 ring-brand-400/40"
                            : "border-slate-200 bg-white hover:border-brand-300 hover:bg-slate-50"
                        }`}
                      >
                        <p
                          className={`text-sm font-semibold ${
                            selected === "all" ? "text-brand-800" : "text-slate-800"
                          }`}
                        >
                          All Branches
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Combined view across every branch you can access
                        </p>
                        {selected === "all" && (
                          <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-600">
                            Active
                          </p>
                        )}
                      </button>
                    )}
                  </div>
                )}
                {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
              </div>

              <div className="border-t border-slate-200 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <LogoutButton />
              </div>
            </aside>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-semibold transition sm:gap-2 sm:px-2.5 sm:text-sm ${triggerClass}`}
        aria-label="Switch workspace branch"
        title={currentLabel}
      >
        <ArrowLeftRight className="size-3.5 shrink-0 sm:size-4" />
        <span className="max-w-[7rem] truncate sm:max-w-[10rem]">{currentLabel}</span>
      </button>
      {panel}
    </>
  );
}
