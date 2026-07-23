import Link from "next/link";
import { requireSession } from "@/lib/session";
import { navForRole, ROLE_LABELS } from "@/lib/rbac";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import MainContent from "@/components/MainContent";
import WorkspaceSwitcher from "@/components/WorkspaceSwitcher";
import { getFieldStaffNavBadges } from "@/lib/fieldStaffNav";
import { getAccountsNavBadges } from "@/lib/accountsNav";
import { getBranchProfile, codingType } from "@/lib/branchProfile";
import {
  allowAllBranchesForRole,
  resolveTopBarBranch,
  type AccountsBranch,
} from "@/lib/accountsBranch";
import { listWorkspaceBranchesForUser } from "@/lib/branchMembership";
import { query } from "@/lib/db";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  // Nav uses effective role; coding links from active branch profile.
  let activeCoding: "zybo" | "pcp_jv" | "none" = "zybo";
  if (session.active_branch_id) {
    const profile = await getBranchProfile(session.active_branch_id);
    activeCoding = codingType(profile);
  }

  const navRole = session.primary_role &&
    (session.primary_role === "admin" || session.primary_role === "accounts_supervisor")
      ? session.primary_role
      : session.role;

  const nav = navForRole(navRole).filter((item) => {
    if (item.href === "/accounts/pcp-jv") return activeCoding === "pcp_jv";
    if (item.href === "/accounts/zybo-vc") return activeCoding === "zybo";
    return true;
  });

  const mobileBadges =
    session.role === "cash_requester" ||
    session.role === "messenger" ||
    session.role === "operations" ||
    session.role === "supervisor" ||
    session.role === "accounts" ||
    session.role === "accounts_supervisor" ||
    session.primary_role === "cash_requester" ||
    session.primary_role === "messenger" ||
    session.primary_role === "operations" ||
    session.primary_role === "supervisor" ||
    session.primary_role === "accounts" ||
    session.primary_role === "accounts_supervisor"
      ? await getFieldStaffNavBadges(session.id)
      : undefined;

  const accountsBadges = await getAccountsNavBadges(session);

  const primary = session.primary_role || session.role;
  const allowAll = allowAllBranchesForRole(primary);
  const memberships = await listWorkspaceBranchesForUser(session.id);
  const pickList: AccountsBranch[] = allowAll
    ? await query(
        "SELECT id, branch_name, branch_code FROM branches WHERE is_active = 1 ORDER BY branch_name"
      )
    : memberships.map((b) => ({
        id: b.id,
        branch_name: b.branch_name,
        branch_code: b.branch_code,
      }));
  const activeBranch =
    pickList.length > 0
      ? resolveTopBarBranch(session.preferred_branch_param, pickList, allowAll)
      : null;

  const switcher = (
    <WorkspaceSwitcher
      branches={JSON.parse(JSON.stringify(pickList))}
      current={activeBranch ?? (pickList[0]?.id ?? "all")}
      allowAll={allowAll}
      userName={session.name}
      userEmail={session.email}
      userRole={session.role}
    />
  );

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:flex md:h-screen md:self-start">
        <div className="bg-gradient-to-br from-brand-600 to-brand-700 px-5 py-4">
          <Link href="/dashboard" className="text-lg font-bold tracking-tight text-white">
            Petty Cash
          </Link>
          <p className="mt-0.5 text-xs text-brand-100">{ROLE_LABELS[session.role]}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <Sidebar
            items={nav}
            badges={accountsBadges ?? undefined}
            fieldStaffBadges={mobileBadges}
          />
        </div>
        <div className="border-t border-sidebar-border px-5 py-4">
          <p className="text-sm font-semibold text-sidebar-foreground">{session.name}</p>
          <p className="truncate text-xs text-muted-foreground">{session.email}</p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 bg-gradient-to-br from-brand-600 to-brand-700 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:hidden">
          <Link href="/dashboard" className="shrink-0 text-sm font-bold text-white">
            Petty Cash
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <WorkspaceSwitcher
              branches={JSON.parse(JSON.stringify(pickList))}
              current={activeBranch ?? (pickList[0]?.id ?? "all")}
              allowAll={allowAll}
              userName={session.name}
              userEmail={session.email}
              userRole={session.role}
              tone="dark"
            />
          </div>
        </header>

        {/* Desktop top bar */}
        <header className="sticky top-0 z-30 hidden items-center justify-between border-b border-border bg-background px-8 py-3 md:flex">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-foreground">Petty Cash Management</span>
            <span className="text-muted-foreground/50">/</span>
            <span className="text-muted-foreground">{ROLE_LABELS[session.role]}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
              {session.name
                .split(" ")
                .map((p) => p[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-foreground">{session.name}</p>
              <p className="text-xs text-muted-foreground">{session.email}</p>
            </div>
            <span className="mx-1 h-6 w-px bg-border" />
            {switcher}
          </div>
        </header>

        <MainContent>{children}</MainContent>
      </div>

      <MobileNav items={nav} role={navRole} badges={mobileBadges} />
    </div>
  );
}
