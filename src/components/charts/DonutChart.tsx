"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartPoint } from "@/lib/dashboardStats";
import { CHART_COLORS } from "./chartTheme";

function DonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number }[];
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">{item.name}</p>
      <p className="mt-0.5 font-semibold text-primary">{item.value}</p>
    </div>
  );
}

export function DonutChart({ data, height = 200 }: { data: ChartPoint[]; height?: number }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400">No data yet.</p>;
  }

  const total = data.reduce((s, d) => s + d.value, 0);
  const chartData = data.map((d, i) => ({
    name: d.label,
    value: d.value,
    fill: d.color || CHART_COLORS[i % CHART_COLORS.length],
  }));

  return (
    <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative mx-auto w-full sm:mx-0 sm:w-[52%]" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius="58%"
              outerRadius="82%"
              paddingAngle={2}
              dataKey="value"
              stroke="#fff"
              strokeWidth={2}
            >
              {chartData.map((entry, i) => (
                <Cell key={`cell-${i}`} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-slate-800">{total}</span>
          <span className="text-[10px] uppercase tracking-wide text-slate-400">total</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2">
        {chartData.map((d, i) => (
          <li key={`${d.name}-${i}`} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0" style={{ backgroundColor: d.fill }} />
            <span className="min-w-0 flex-1 truncate text-slate-600">{d.name}</span>
            <span className="shrink-0 font-semibold text-slate-700">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
