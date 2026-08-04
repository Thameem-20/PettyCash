import { Role } from "./types";

// Top-level navigation entries with the roles allowed to see them.
export interface NavItem {
  href: string;
  label: string;
  roles: Role[];
  mobile?: boolean; // surfaced in the mobile bottom nav
  mobileOnlyRoles?: Role[]; // limit mobile tab to specific roles (sidebar unchanged)
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    roles: [
      "cash_requester",
      "messenger",
      "operations",
      "supervisor",
      "accounts",
      "accounts_supervisor",
      "treasury",
      "admin",
    ],
    mobile: true,
    mobileOnlyRoles: ["supervisor"],
  },
  {
    href: "/requests/new",
    label: "New Request",
    roles: ["cash_requester", "messenger", "operations"],
    mobile: true,
  },
  {
    href: "/requests",
    label: "My Requests",
    roles: ["cash_requester", "messenger", "operations"],
    mobile: true,
    mobileOnlyRoles: ["cash_requester", "messenger"],
  },
  {
    href: "/requests/ops",
    label: "Ops Requests",
    roles: ["messenger", "cash_requester"],
    mobile: true,
    mobileOnlyRoles: ["messenger"],
  },
  { href: "/approvals", label: "Approvals", roles: ["supervisor"], mobile: true },
  { href: "/accounts", label: "Accounts", roles: ["accounts", "accounts_supervisor", "admin"] },
  { href: "/accounts/payments", label: "Payment Records", roles: ["accounts", "accounts_supervisor", "admin"] },
  { href: "/accounts/ledger", label: "Ledger", roles: ["accounts", "accounts_supervisor", "admin"] },
  { href: "/accounts/zybo-vc", label: "Zybo VC", roles: ["accounts", "accounts_supervisor", "admin"] },
  { href: "/accounts/pcp-jv", label: "PCP and JV", roles: ["accounts", "accounts_supervisor", "admin"] },
  { href: "/accounts/topup", label: "Top-Up Requests", roles: ["accounts", "accounts_supervisor", "admin"] },
  { href: "/accounts-supervisor", label: "Accounts Overview", roles: ["accounts_supervisor", "admin"] },
  {
    href: "/accounts-supervisor/supervisor-cover",
    label: "Supervisor Cover",
    roles: ["accounts_supervisor", "admin"],
  },
  { href: "/accounts-supervisor/topup", label: "Top-Up Approvals", roles: ["accounts_supervisor", "admin"] },
  { href: "/treasury", label: "Treasury", roles: ["treasury"] },
  { href: "/reports", label: "Reports", roles: ["accounts", "accounts_supervisor", "treasury", "admin"] },
  { href: "/admin/control-panel", label: "Control Panel", roles: ["admin"] },
  { href: "/admin/flow", label: "Flow", roles: ["admin"] },
  { href: "/admin/branches", label: "Branches", roles: ["admin"] },
  { href: "/admin/categories", label: "Categories", roles: ["admin"] },
  { href: "/admin/job-codes", label: "Job Codes", roles: ["admin"] },
  { href: "/admin/banks", label: "Bank Accounts", roles: ["admin"] },
  { href: "/admin/compassion", label: "Compassion", roles: ["admin"] },
  { href: "/admin/vehicles", label: "Vehicles", roles: ["admin"] },
  { href: "/admin/settings", label: "Appearance", roles: ["admin"] },
  {
    href: "/requests",
    label: "My Requests",
    roles: ["supervisor", "accounts", "accounts_supervisor"],
    mobile: true,
    mobileOnlyRoles: ["supervisor"],
  },
  {
    href: "/requests/ops",
    label: "Ops Requests",
    roles: ["supervisor"],
    mobile: true,
    mobileOnlyRoles: ["supervisor"],
  },
  {
    href: "/suspense",
    label: "Open Suspense",
    roles: ["cash_requester", "messenger", "operations", "supervisor"],
    mobile: true,
  },
  {
    href: "/confirm",
    label: "Confirm Cash",
    roles: ["cash_requester", "messenger", "operations", "supervisor"],
    mobile: true,
  },
  {
    href: "/settings",
    label: "Settings",
    roles: [
      "cash_requester",
      "messenger",
      "operations",
      "supervisor",
      "accounts",
      "accounts_supervisor",
      "treasury",
      "admin",
    ],
    mobile: true,
    mobileOnlyRoles: ["supervisor"],
  },
];

export function navForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((n) => n.roles.includes(role));
}

export function canAccess(role: Role, pathname: string): boolean {
  // Everyone signed-in can hit shared detail pages and the dashboard root.
  if (pathname === "/dashboard" || pathname.startsWith("/requests/")) return true;
  const match = NAV_ITEMS.filter((n) => pathname === n.href || pathname.startsWith(n.href + "/"));
  if (match.length === 0) return true; // unguarded helper routes
  return match.some((n) => n.roles.includes(role));
}

// Roles allowed to override branch / negative balance, edit paid requests, etc.
export const ELEVATED_ROLES: Role[] = ["admin", "accounts_supervisor"];

export function isElevated(role: Role): boolean {
  return ELEVATED_ROLES.includes(role);
}

export const ROLE_LABELS: Record<Role, string> = {
  cash_requester: "Cash Requester",
  messenger: "Messenger",
  operations: "Operations User",
  supervisor: "Supervisor",
  accounts: "Accounts User",
  accounts_supervisor: "Accounts Supervisor",
  treasury: "Treasury",
  admin: "Admin",
};
