export type AccountsNavBadges = {
  pendingZyboVoucher: number;
  pendingPcpJv: number;
};

export function accountsNavBadgeCount(href: string, badges: AccountsNavBadges | undefined): number {
  if (!badges) return 0;
  if (href === "/accounts/zybo-vc") return badges.pendingZyboVoucher;
  if (href === "/accounts/pcp-jv") return badges.pendingPcpJv;
  return 0;
}
