"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import type { NavItem } from "@/lib/rbac";
import type { AccountsNavBadges } from "@/lib/accountsNavBadges";
import type { FieldStaffNavBadges } from "@/lib/fieldStaffNav";

const ANIM_MS = 280;

export default function MobileSidebarDrawer({
  items,
  badges,
  fieldStaffBadges,
  roleLabel,
  userName,
  userEmail,
}: {
  items: NavItem[];
  badges?: AccountsNavBadges;
  fieldStaffBadges?: FieldStaffNavBadges;
  roleLabel: string;
  userName: string;
  userEmail: string;
}) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  function openPanel() {
    setMounted(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
  }

  function closePanel() {
    setVisible(false);
  }

  useEffect(() => {
    if (!mounted || visible) return;
    const t = window.setTimeout(() => setMounted(false), ANIM_MS);
    return () => window.clearTimeout(t);
  }, [mounted, visible]);

  useEffect(() => {
    if (!mounted) return;
    setVisible(false);
  }, [pathname, mounted]);

  useEffect(() => {
    if (!mounted) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setVisible(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  const panel =
    mounted && portalReady
      ? createPortal(
          <div className="fixed inset-0 z-[100] flex justify-start md:hidden">
            <button
              type="button"
              className={`absolute inset-0 bg-black/40 transition-opacity duration-[280ms] ease-out ${
                visible ? "opacity-100" : "opacity-0"
              }`}
              aria-label="Close menu"
              onClick={closePanel}
            />
            <aside
              className={`relative flex h-full w-[min(18rem,85vw)] flex-col bg-sidebar text-sidebar-foreground shadow-xl transition-transform duration-[280ms] ease-out ${
                visible ? "translate-x-0" : "-translate-x-full"
              }`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="mobile-sidebar-title"
            >
              <div className="bg-gradient-to-br from-brand-600 to-brand-700 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link
                      href="/dashboard"
                      id="mobile-sidebar-title"
                      className="text-lg font-bold tracking-tight text-white"
                      onClick={closePanel}
                    >
                      Petty Cash
                    </Link>
                    <p className="mt-0.5 text-xs text-brand-100">{roleLabel}</p>
                  </div>
                  <button
                    type="button"
                    className="rounded-md p-1 text-white/80 hover:bg-white/10 hover:text-white"
                    onClick={closePanel}
                    aria-label="Close menu"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-3" onClick={closePanel}>
                <Sidebar
                  items={items}
                  badges={badges}
                  fieldStaffBadges={fieldStaffBadges}
                />
              </div>
              <div className="border-t border-sidebar-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <p className="text-sm font-semibold text-sidebar-foreground">{userName}</p>
                <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
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
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-brand-400/60 text-white hover:bg-brand-600"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      {panel}
    </>
  );
}
