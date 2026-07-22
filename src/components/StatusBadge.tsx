import { statusTone } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
  warn: "border-amber-200 bg-amber-100 text-amber-800",
  good: "border-emerald-200 bg-emerald-100 text-emerald-800",
  bad: "border-rose-200 bg-rose-100 text-rose-800",
  info: "border-sky-200 bg-sky-100 text-sky-800",
};

export default function StatusBadge({ status }: { status: string }) {
  const tone = statusTone(status);
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full px-1.5 py-0 text-[10px] font-semibold md:px-2 md:text-xs", TONE[tone])}
    >
      {status}
    </Badge>
  );
}
