"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavItem } from "@/lib/rbac";
import { accountsNavBadgeCount, type AccountsNavBadges } from "@/lib/accountsNavBadges";
import type { FieldStaffNavBadges } from "@/lib/fieldStaffNav";

function isNavActive(href: string, pathname: string): boolean {
  if (href === "/accounts") return pathname === "/accounts";
  if (href === "/accounts-supervisor") return pathname === "/accounts-supervisor";
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

function SidebarBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1.5 text-[11px] font-bold leading-none text-white">
      {label}
    </span>
  );
}

function fieldStaffNavBadgeCount(
  href: string,
  badges: FieldStaffNavBadges | undefined
): number {
  if (!badges) return 0;
  if (href === "/confirm") return badges.confirmPending;
  if (href === "/suspense") return badges.openSuspense;
  if (href === "/requests/ops") return badges.opsAssigned;
  if (href === "/approvals") return badges.pendingApprovals ?? 0;
  return 0;
}

export default function Sidebar({
  items,
  badges,
  fieldStaffBadges,
}: {
  items: NavItem[];
  badges?: AccountsNavBadges;
  fieldStaffBadges?: FieldStaffNavBadges;
}) {
  const pathname = usePathname();
  return (
    <nav className="space-y-0.5">
      {items.map((item) => {
        const active = isNavActive(item.href, pathname);
        const badgeCount =
          accountsNavBadgeCount(item.href, badges) ||
          fieldStaffNavBadgeCount(item.href, fieldStaffBadges);
        const emphasized = item.href === "/admin/control-panel";
        return (
          <Link
            key={`${item.href}::${item.label}`}
            href={item.href}
            className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "bg-primary font-semibold text-primary-foreground shadow-sm"
                : emphasized
                  ? "border border-brand-300 bg-brand-50 font-semibold text-brand-800 hover:bg-brand-100"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            }`}
          >
            <span>{item.label}</span>
            <SidebarBadge count={badgeCount} />
          </Link>
        );
      })}
    </nav>
  );
}
