"use client";

import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartPoint } from "@/lib/dashboardStats";
import { money } from "@/lib/util";
import { CHART_AXIS, CHART_COLORS, CHART_GRID, chartMargin } from "./chartTheme";

function ChartTooltip({
  active,
  payload,
  formatValue,
}: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
  formatValue: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">{item.label}</p>
      <p className="mt-0.5 font-semibold text-primary">{formatValue(item.value)}</p>
    </div>
  );
}

export function BarChart({
  data,
  horizontal = false,
  formatValue,
  height = 220,
}: {
  data: ChartPoint[];
  horizontal?: boolean;
  formatValue?: (n: number) => string;
  height?: number;
}) {
  const fmt = formatValue || ((n: number) => String(n));

  if (data.length === 0) {
    return <p className="text-sm text-slate-400">No data yet.</p>;
  }

  const chartData = data.map((d, i) => ({
    ...d,
    fill: d.color || CHART_COLORS[i % CHART_COLORS.length],
  }));

  if (horizontal) {
    const rowHeight = 36;
    const chartHeight = Math.max(height, chartData.length * rowHeight + 24);

    return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <RechartsBarChart
          data={chartData}
          layout="vertical"
          margin={{ ...chartMargin, left: 4, right: 16 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: CHART_AXIS }}
            axisLine={{ stroke: CHART_GRID }}
            tickLine={false}
            tickFormatter={(v) => fmt(Number(v))}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={88}
            tick={{ fontSize: 11, fill: CHART_AXIS }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ChartTooltip formatValue={fmt} />} cursor={{ fill: "rgba(74,94,120,0.06)" }} />
          <Bar dataKey="value" radius={0} maxBarSize={22}>
            {chartData.map((entry, i) => (
              <Cell key={`cell-${i}`} fill={entry.fill} />
            ))}
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart data={chartData} margin={{ ...chartMargin, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: CHART_AXIS }}
          axisLine={{ stroke: CHART_GRID }}
          tickLine={false}
          interval={0}
          angle={-25}
          textAnchor="end"
          height={48}
        />
        <YAxis
          tick={{ fontSize: 11, fill: CHART_AXIS }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => fmt(Number(v))}
        />
        <Tooltip content={<ChartTooltip formatValue={fmt} />} cursor={{ fill: "rgba(74,94,120,0.06)" }} />
        <Bar dataKey="value" radius={0} maxBarSize={40}>
          {chartData.map((entry, i) => (
            <Cell key={`cell-${i}`} fill={entry.fill} />
          ))}
        </Bar>
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}

export function moneyBarFormat(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return money(n).replace("AED ", "");
}
