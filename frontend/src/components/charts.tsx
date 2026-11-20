import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCHF, formatCompactCHF, formatPercent, formatPeriodLabel, formatPeriodLong } from "@/lib/format";
import type { CategoryReport, CategoryReportItem, TimeBucket } from "@/lib/types";

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12 };
const GRID_STROKE = "var(--border)";
const INCOME = "var(--income)";
const EXPENSE = "var(--expense)";
const NET = "var(--chart-3)";

interface TooltipEntry {
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
  dataKey?: string | number | ((obj: unknown) => unknown);
  payload?: Record<string, unknown>;
}

/** Tooltip body shared by all charts. Values are Rappen. */
function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter = formatPeriodLong,
}: {
  active?: boolean;
  payload?: readonly TooltipEntry[];
  label?: string | number;
  labelFormatter?: (label: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover text-popover-foreground min-w-44 rounded-lg border px-3 py-2 text-xs shadow-md">
      {label !== undefined && label !== "" && <p className="mb-1.5 font-medium">{labelFormatter(String(label))}</p>}
      <div className="flex flex-col gap-1">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ backgroundColor: entry.color ?? String(entry.payload?.fill ?? "") }} />
              {entry.name}
            </span>
            <span className="font-medium tabular-nums">{formatCHF(Number(entry.value ?? 0))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function axisProps(granularity: "day" | "month") {
  return {
    dataKey: "period",
    tick: AXIS_TICK,
    tickLine: false,
    axisLine: false,
    tickFormatter: formatPeriodLabel,
    minTickGap: granularity === "day" ? 16 : 4,
  } as const;
}

const yAxisProps = {
  tick: AXIS_TICK,
  tickLine: false,
  axisLine: false,
  width: 64,
  tickFormatter: (value: number) => formatCompactCHF(value),
} as const;

export function IncomeExpenseChart({ data, granularity, height = 280 }: { data: TimeBucket[]; granularity: "day" | "month"; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barGap={2} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeDasharray="3 3" />
        <XAxis {...axisProps(granularity)} />
        <YAxis {...yAxisProps} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="income_cents" name="Einnahmen" fill={INCOME} radius={[4, 4, 0, 0]} maxBarSize={36} />
        <Bar dataKey="expenses_cents" name="Ausgaben" fill={EXPENSE} radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Daily data is shown cumulatively (spending so far), monthly data per month. */
export function SpendingTrendChart({ data, granularity, height = 280 }: { data: TimeBucket[]; granularity: "day" | "month"; height?: number }) {
  let running = 0;
  const points = data.map((bucket) => {
    running += bucket.expenses_cents;
    return { period: bucket.period, value: granularity === "day" ? running : bucket.expenses_cents };
  });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="spendingFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={EXPENSE} stopOpacity={0.3} />
            <stop offset="100%" stopColor={EXPENSE} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeDasharray="3 3" />
        <XAxis {...axisProps(granularity)} />
        <YAxis {...yAxisProps} />
        <Tooltip content={<ChartTooltip />} />
        <Area
          type="monotone"
          dataKey="value"
          name={granularity === "day" ? "Ausgaben kumuliert" : "Ausgaben"}
          stroke={EXPENSE}
          strokeWidth={2}
          fill="url(#spendingFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CategoryDonut({ report, height = 260 }: { report: CategoryReport; height?: number }) {
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={report.items}
            dataKey="total_cents"
            nameKey="name"
            innerRadius="62%"
            outerRadius="90%"
            paddingAngle={report.items.length > 1 ? 2 : 0}
            strokeWidth={0}
          >
            {report.items.map((item) => (
              <Cell key={item.category_id} fill={item.color} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-muted-foreground text-xs">Total</span>
        <span className="text-lg font-semibold tabular-nums">{formatCHF(report.total_cents)}</span>
      </div>
    </div>
  );
}

export function CategoryLegend({ items }: { items: CategoryReportItem[] }) {
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {items.map((item) => (
        <li key={item.category_id} className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="truncate">{item.name}</span>
          </span>
          <span className="text-muted-foreground shrink-0 tabular-nums">
            {formatCHF(item.total_cents)} · {formatPercent(item.share)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TopCategoriesChart({ items, height = 260 }: { items: CategoryReportItem[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={items} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke={GRID_STROKE} strokeDasharray="3 3" />
        <XAxis type="number" {...yAxisProps} width={undefined} />
        <YAxis type="category" dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={false} width={110} />
        <Tooltip content={<ChartTooltip labelFormatter={(l) => l} />} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
        <Bar dataKey="total_cents" name="Ausgaben" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {items.map((item) => (
            <Cell key={item.category_id} fill={item.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CashflowChart({ data, height = 300 }: { data: TimeBucket[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeDasharray="3 3" />
        <XAxis {...axisProps("month")} />
        <YAxis {...yAxisProps} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <ReferenceLine y={0} stroke={GRID_STROKE} />
        <Bar dataKey="income_cents" name="Einnahmen" fill={INCOME} radius={[4, 4, 0, 0]} maxBarSize={32} />
        <Bar dataKey="expenses_cents" name="Ausgaben" fill={EXPENSE} radius={[4, 4, 0, 0]} maxBarSize={32} />
        <Line type="monotone" dataKey="net_cents" name="Netto-Cashflow" stroke={NET} strokeWidth={2.5} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function CumulativeNetChart({ data, height = 260 }: { data: TimeBucket[]; height?: number }) {
  let running = 0;
  const points = data.map((bucket) => {
    running += bucket.net_cents;
    return { period: bucket.period, value: running };
  });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="netFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={NET} stopOpacity={0.3} />
            <stop offset="100%" stopColor={NET} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeDasharray="3 3" />
        <XAxis {...axisProps("month")} />
        <YAxis {...yAxisProps} />
        <Tooltip content={<ChartTooltip />} />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
        <Area type="monotone" dataKey="value" name="Kumulierter Cashflow" stroke={NET} strokeWidth={2} fill="url(#netFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Stacked monthly bars for the top categories; the rest is grouped as "Übrige". */
export function CategoryTrendChart({ report, maxCategories = 6, height = 300 }: { report: CategoryReport; maxCategories?: number; height?: number }) {
  const top = report.items.slice(0, maxCategories);
  const topIds = new Set(top.map((item) => String(item.category_id)));
  const hasOther = report.items.length > maxCategories;
  const data = (report.monthly ?? []).map((month) => {
    const row: Record<string, string | number> = { period: month.period };
    let other = 0;
    for (const [id, value] of Object.entries(month.values)) {
      if (topIds.has(id)) row[id] = value;
      else other += value;
    }
    if (hasOther) row.other = other;
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeDasharray="3 3" />
        <XAxis {...axisProps("month")} />
        <YAxis {...yAxisProps} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        {top.map((item) => (
          <Bar key={item.category_id} dataKey={String(item.category_id)} name={item.name} stackId="a" fill={item.color} maxBarSize={40} />
        ))}
        {hasOther && <Bar dataKey="other" name="Übrige" stackId="a" fill="var(--muted-foreground)" maxBarSize={40} />}
      </BarChart>
    </ResponsiveContainer>
  );
}
