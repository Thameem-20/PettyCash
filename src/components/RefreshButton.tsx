"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export default function RefreshButton({
  className,
  tone = "light",
}: {
  className?: string;
  tone?: "light" | "dark";
}) {
  const [spinning, setSpinning] = useState(false);

  function refresh() {
    setSpinning(true);
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={refresh}
      aria-label="Refresh page"
      title="Refresh"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md border transition",
        // Phone: icon only
        "h-8 w-8",
        // Desktop: Refresh + icon
        "md:h-auto md:w-auto md:gap-1.5 md:px-2.5 md:py-1.5 md:text-sm md:font-semibold",
        tone === "dark"
          ? "border-white/50 bg-white/10 text-white hover:bg-white/20"
          : "border-border bg-background text-foreground hover:bg-muted",
        className
      )}
    >
      <span className="hidden md:inline">Refresh</span>
      <RefreshCw
        className={cn("size-4 shrink-0", spinning && "animate-spin")}
        strokeWidth={2.25}
      />
    </button>
  );
}
