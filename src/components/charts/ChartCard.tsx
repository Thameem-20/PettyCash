export function ChartCard({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`card flex flex-col overflow-hidden ${className}`}>
      <div className="border-b border-border px-3 py-2 md:px-4 md:py-3">
        <h3 className="text-xs font-semibold text-foreground md:text-sm">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[10px] text-muted-foreground md:text-xs">{subtitle}</p>}
      </div>
      <div className="min-h-[160px] flex-1 p-2.5 md:min-h-[200px] md:p-4">{children}</div>
    </div>
  );
}
