"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export default function BackButton({
  fallbackHref,
  label = "Back",
  className,
}: {
  fallbackHref: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
      className={cn(
        "mb-2 inline-flex items-center gap-1 text-xs font-medium text-brand-700 transition hover:text-brand-900 md:mb-3 md:gap-1.5 md:text-sm",
        className
      )}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M15 18l-6-6 6-6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label}
    </button>
  );
}
