"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartPoint } from "@/lib/dashboardStats";
import { money } from "@/lib/util";
import { CHART_AXIS, CHART_BRAND, CHART_GRID, chartMargin } from "./chartTheme";

function TrendTooltip({
  active,
  payload,
  label,
  formatValue,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  formatValue: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold text-primary">{formatValue(payload[0].value)}</p>
    </div>
  );
}

export function TrendChart({
  data,
  formatValue,
  height = 200,
  isCurrency = false,
}: {
  data: ChartPoint[];
  formatValue?: (n: number) => string;
  height?: number;
  isCurrency?: boolean;
}) {
  const fmt = formatValue || ((n: number) => (isCurrency ? money(n) : String(n)));

  if (data.length === 0 || data.every((d) => d.value === 0)) {
    return <p className="text-sm text-slate-400">No activity in this period.</p>;
  }

  const chartData = data.map((d) => ({ name: d.label, value: d.value }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ ...chartMargin, bottom: 4, left: -8 }}>
        <defs>
          <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_BRAND} stopOpacity={0.35} />
            <stop offset="100%" stopColor={CHART_BRAND} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: CHART_AXIS }}
          axisLine={{ stroke: CHART_GRID }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: CHART_AXIS }}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={(v) => {
            const n = Number(v);
            if (isCurrency && n >= 1000) return `${(n / 1000).toFixed(0)}k`;
            return isCurrency ? String(Math.round(n)) : String(n);
          }}
        />
        <Tooltip content={<TrendTooltip formatValue={fmt} />} />
        <Area
          type="monotone"
          dataKey="value"
          stroke={CHART_BRAND}
          strokeWidth={2}
          fill="url(#trendGradient)"
          dot={{ r: 4, fill: CHART_BRAND, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: CHART_BRAND, stroke: "#fff", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
