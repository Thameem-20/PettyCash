import Link from "next/link";
import BackButton from "./BackButton";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  actions,
  backHref,
  backLabel,
  hideBackOnMobile,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  hideBackOnMobile?: boolean;
}) {
  return (
    <div className="mb-3 md:mb-5">
      {backHref && (
        <BackButton
          fallbackHref={backHref}
          label={backLabel}
          className={hideBackOnMobile ? "hidden md:inline-flex" : undefined}
        />
      )}
      <div className="flex flex-wrap items-end justify-between gap-2 md:gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground md:text-2xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-1.5 md:gap-2">{actions}</div>
        )}
      </div>
    </div>
  );
}

type StatTone = "neutral" | "good" | "warn" | "bad" | "info";

const STAT_TONES: Record<StatTone, { value: string; chip: string }> = {
  neutral: { value: "text-foreground", chip: "bg-muted text-muted-foreground" },
  good: { value: "text-emerald-600", chip: "bg-emerald-100 text-emerald-700" },
  warn: { value: "text-amber-600", chip: "bg-amber-100 text-amber-700" },
  bad: { value: "text-rose-600", chip: "bg-rose-100 text-rose-700" },
  info: { value: "text-sky-600", chip: "bg-sky-100 text-sky-700" },
};

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  href,
  icon,
  compact = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: StatTone;
  href?: string;
  icon?: React.ReactNode;
  /** Shorter padding and smaller value text (e.g. stacked opening tiles). */
  compact?: boolean;
}) {
  const t = STAT_TONES[tone];
  const body = (
    <Card
      className={cn(
        "@container gap-0 overflow-hidden",
        compact
          ? "h-auto rounded-md px-2 py-1 md:rounded-lg"
          : "h-full p-2.5 @[10rem]:p-3 @[14rem]:p-4"
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <p
          className={cn(
            "min-w-0 flex-1 truncate font-medium uppercase tracking-wide text-muted-foreground",
            compact
              ? "text-[9px] leading-none @[14rem]:text-[10px]"
              : "text-[10px] @[12rem]:text-[11px] @[16rem]:text-xs"
          )}
        >
          {label}
        </p>
        {icon && (
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-md [&_svg]:size-3 @[12rem]:size-7 @[12rem]:[&_svg]:size-3.5 @[16rem]:size-9 @[16rem]:rounded-lg @[16rem]:[&_svg]:size-5",
              t.chip
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p
        className={cn(
          "truncate whitespace-nowrap font-bold tabular-nums leading-none",
          compact
            ? "mt-0.5 text-sm @[14rem]:text-base"
            : "mt-1 leading-tight text-sm @[10rem]:text-base @[14rem]:text-lg @[18rem]:text-xl @[22rem]:text-2xl",
          t.value
        )}
        title={String(value)}
      >
        {value}
      </p>
      {hint && (
        <p
          className={cn(
            "truncate text-muted-foreground",
            compact
              ? "mt-0.5 text-[9px] leading-none"
              : "mt-0.5 text-[10px] @[14rem]:mt-1 @[14rem]:text-xs"
          )}
        >
          {hint}
        </p>
      )}
    </Card>
  );
  return href ? (
    <Link
      href={href}
      className="block h-full transition-transform hover:-translate-y-0.5"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <Card className="flex flex-col items-center justify-center p-6 text-center text-xs text-muted-foreground md:p-10 md:text-sm">
      {message}
    </Card>
  );
}
