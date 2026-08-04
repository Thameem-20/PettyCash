export type AccountsNavBadges = {
  pendingZyboVoucher: number;
  pendingPcpJv: number;
  pendingSupervisorCover?: number;
};

export function accountsNavBadgeCount(href: string, badges: AccountsNavBadges | undefined): number {
  if (!badges) return 0;
  if (href === "/accounts/zybo-vc") return badges.pendingZyboVoucher;
  if (href === "/accounts/pcp-jv") return badges.pendingPcpJv;
  if (href === "/accounts-supervisor/supervisor-cover") return badges.pendingSupervisorCover || 0;
  return 0;
}
