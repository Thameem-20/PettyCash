"use client";

import { usePathname } from "next/navigation";
import { NavItem } from "@/lib/rbac";
import type { Role } from "@/lib/types";
import type { FieldStaffNavBadges } from "@/lib/fieldStaffNav";

function isNavActive(href: string, pathname: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/approvals") return pathname === "/approvals" || pathname.startsWith("/approvals/");
  if (href === "/settings") return pathname === "/settings" || pathname.startsWith("/settings/");
  if (href === "/requests/new") return pathname === "/requests/new";
  if (href === "/requests/ops") return pathname === "/requests/ops";
  if (href === "/requests") {
    return (
      pathname === "/requests" ||
      (pathname.startsWith("/requests/") &&
        pathname !== "/requests/new" &&
        pathname !== "/requests/ops")
    );
  }
  return pathname === href || pathname.startsWith(href + "/");
}

function NavIcon({ href, active }: { href: string; active: boolean }) {
  const cls = active ? "text-white" : "text-muted-foreground";
  const sw = "stroke-current";
  const size = 20;

  if (href === "/dashboard") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cls}>
        <path
          className={sw}
          strokeWidth="2"
          d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3m10-11v10a1 1 0 01-1 1h-3m-6 0h6"
        />
      </svg>
    );
  }
  if (href === "/approvals") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cls}>
        <path
          className={sw}
          strokeWidth="2"
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
        />
      </svg>
    );
  }
  if (href === "/settings") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cls}>
        <path
          className={sw}
          strokeWidth="2"
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path className={sw} strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    );
  }
  if (href === "/requests/new") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cls}>
        <path className={sw} strokeWidth="2.5" d="M12 5v14M5 12h14" />
      </svg>
    );
  }
  if (href === "/requests") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cls}>
        <path className={sw} strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    );
  }
  if (href === "/requests/ops") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cls}>
        <path
          className={sw}
          strokeWidth="2"
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      </svg>
    );
  }
  if (href === "/confirm") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cls}>
        <path className={sw} strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  if (href === "/suspense") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cls}>
        <path className={sw} strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cls}>
      <path className={sw} strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function shortLabel(label: string, href: string): string {
  if (href === "/dashboard") return "Home";
  if (href === "/requests/new") return "New";
  if (href === "/approvals") return "Approve";
  if (href === "/requests") return "My Requests";
  if (href === "/suspense") return "Open Suspense";
  if (label === "Confirm Cash") return "Confirm";
  if (label === "Ops Requests") return "Ops";
  return label;
}

function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white">
      {label}
    </span>
  );
}

/** Hard navigate so messenger bottom tabs always load fresh server data. */
function navigateFresh(href: string, pathname: string) {
  if (pathname === href) {
    window.location.reload();
    return;
  }
  window.location.href = href;
}

export default function MobileNav({
  items,
  role,
  badges,
}: {
  items: NavItem[];
  role: Role;
  badges?: FieldStaffNavBadges;
}) {
  const pathname = usePathname();
  const mobileItems = items
    .filter((i) => i.mobile && (!i.mobileOnlyRoles || i.mobileOnlyRoles.includes(role)))
    .slice(0, 6);
  if (mobileItems.length === 0) return null;

  function badgeCount(href: string): number {
    if (!badges) return 0;
    if (href === "/confirm") return badges.confirmPending;
    if (href === "/suspense") return badges.openSuspense;
    if (href === "/requests/ops") return badges.opsAssigned;
    if (href === "/approvals") return badges.pendingApprovals ?? 0;
    return 0;
  }

  function iconWrap(href: string, active: boolean, children: React.ReactNode) {
    const count = badgeCount(href);
    return (
      <span
        className={`relative flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
          active ? "bg-primary" : "bg-transparent"
        }`}
      >
        {children}
        <NavBadge count={count} />
      </span>
    );
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 bg-background shadow-[0_-4px_16px_rgba(15,23,42,0.07)] md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="h-px w-full bg-border" aria-hidden />
      <div className="flex items-stretch justify-around px-1 py-0">
        {mobileItems.map((item) => {
          const active = isNavActive(item.href, pathname);

          return (
            <button
              key={item.href}
              type="button"
              onClick={() => navigateFresh(item.href, pathname)}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 transition-colors ${
                active ? "bg-accent" : "bg-transparent"
              }`}
            >
              {iconWrap(item.href, active, <NavIcon href={item.href} active={active} />)}
              <span
                className={`max-w-full truncate text-[9px] leading-tight ${
                  active ? "font-semibold text-primary" : "font-medium text-muted-foreground"
                }`}
              >
                {shortLabel(item.label, item.href)}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
