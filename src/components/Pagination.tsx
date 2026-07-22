"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PageSlice } from "@/lib/pagination";

export default function Pagination({ meta }: { meta: PageSlice }) {
  const pathname = usePathname();
  const params = useSearchParams();

  if (meta.total <= meta.pageSize) return null;

  function hrefFor(page: number) {
    const sp = new URLSearchParams(params.toString());
    if (page <= 1) sp.delete("page");
    else sp.set("page", String(page));
    const q = sp.toString();
    return q ? `${pathname}?${q}` : pathname;
  }

  const prev = meta.page > 1 ? meta.page - 1 : null;
  const next = meta.page < meta.totalPages ? meta.page + 1 : null;

  // Show a compact window of page numbers around the current page.
  const windowSize = 5;
  let start = Math.max(1, meta.page - Math.floor(windowSize / 2));
  let end = Math.min(meta.totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  return (
    <div className="mt-3 flex flex-col items-center justify-between gap-2 sm:flex-row md:mt-4">
      <p className="text-[11px] text-muted-foreground md:text-xs">
        Showing {meta.from}–{meta.to} of {meta.total}
      </p>
      <nav className="flex items-center gap-1" aria-label="Pagination">
        <Link
          href={prev ? hrefFor(prev) : "#"}
          aria-disabled={!prev}
          className={cn(
            "inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors",
            prev
              ? "border-border bg-background text-foreground hover:bg-muted"
              : "pointer-events-none border-border/60 text-muted-foreground/50"
          )}
        >
          <ChevronLeft className="size-3.5" />
          Prev
        </Link>

        {start > 1 && (
          <>
            <PageLink href={hrefFor(1)} active={false}>
              1
            </PageLink>
            {start > 2 && <span className="px-1 text-xs text-muted-foreground">…</span>}
          </>
        )}

        {pages.map((p) => (
          <PageLink key={p} href={hrefFor(p)} active={p === meta.page}>
            {p}
          </PageLink>
        ))}

        {end < meta.totalPages && (
          <>
            {end < meta.totalPages - 1 && (
              <span className="px-1 text-xs text-muted-foreground">…</span>
            )}
            <PageLink href={hrefFor(meta.totalPages)} active={false}>
              {meta.totalPages}
            </PageLink>
          </>
        )}

        <Link
          href={next ? hrefFor(next) : "#"}
          aria-disabled={!next}
          className={cn(
            "inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors",
            next
              ? "border-border bg-background text-foreground hover:bg-muted"
              : "pointer-events-none border-border/60 text-muted-foreground/50"
          )}
        >
          Next
          <ChevronRight className="size-3.5" />
        </Link>
      </nav>
    </div>
  );
}

function PageLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:bg-muted"
      )}
    >
      {children}
    </Link>
  );
}
