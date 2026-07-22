"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavItem } from "@/lib/rbac";
import { accountsNavBadgeCount, type AccountsNavBadges } from "@/lib/accountsNavBadges";

function isNavActive(href: string, pathname: string): boolean {
  if (href === "/accounts") return pathname === "/accounts";
  if (href === "/accounts-supervisor") return pathname === "/accounts-supervisor";
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

export default function Sidebar({
  items,
  badges,
}: {
  items: NavItem[];
  badges?: AccountsNavBadges;
}) {
  const pathname = usePathname();
  return (
    <nav className="space-y-0.5">
      {items.map((item) => {
        const active = isNavActive(item.href, pathname);
        const badgeCount = accountsNavBadgeCount(item.href, badges);
        const emphasized = item.href === "/admin/control-panel";
        return (
          <Link
            key={item.href}
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
