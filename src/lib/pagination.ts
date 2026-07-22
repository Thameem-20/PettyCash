export const PAGE_SIZE = 25;

export function parsePage(raw: string | undefined | null): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export function pageOffset(page: number, pageSize = PAGE_SIZE): number {
  return (Math.max(1, page) - 1) * pageSize;
}

export function totalPages(total: number, pageSize = PAGE_SIZE): number {
  if (total <= 0) return 1;
  return Math.ceil(total / pageSize);
}

export function clampPage(page: number, total: number, pageSize = PAGE_SIZE): number {
  const pages = totalPages(total, pageSize);
  return Math.min(Math.max(1, page), pages);
}

export type PageSlice = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  from: number;
  to: number;
};

export function pageMeta(total: number, page: number, pageSize = PAGE_SIZE): PageSlice {
  const safePage = clampPage(page, total, pageSize);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);
  return {
    page: safePage,
    pageSize,
    total,
    totalPages: totalPages(total, pageSize),
    from,
    to,
  };
}
