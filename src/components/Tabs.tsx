"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export default function Tabs({
  tabs,
  current,
}: {
  tabs: { key: string; label: string; count?: number }[];
  current: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  function href(key: string) {
    const sp = new URLSearchParams(params.toString());
    sp.set("tab", key);
    sp.delete("page"); // reset pagination when switching tabs
    return `${pathname}?${sp.toString()}`;
  }

  return (
    <div className="mb-4 md:mb-5">
      <div
        role="tablist"
        className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-muted/70 p-1 shadow-sm"
      >
        {tabs.map((t) => {
          const active = current === t.key;
          return (
            <Link
              key={t.key}
              href={href(t.key)}
              role="tab"
              aria-selected={active}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-all md:px-3.5 md:py-2.5 md:text-sm",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background hover:text-foreground"
              )}
            >
              {t.label}
              {t.count != null && t.count > 0 && (
                <span
                  className={cn(
                    "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none md:text-xs",
                    active
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-primary/15 text-primary"
                  )}
                >
                  {t.count}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
