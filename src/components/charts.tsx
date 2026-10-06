"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";

export const CHART_COLORS = ["#1a6f9f", "#f9d014", "#4fa4d3", "#14577d", "#d9b300", "#84c3e5", "#10b981", "#f43f5e"];

type Datum = { name: string; value: number };

export function ChartCard({ title, subtitle, children, height = "h-64" }: { title: string; subtitle?: string; children: React.ReactNode; height?: string }) {
  return (
    <div className="card h-full animate-fade-up">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-navy-900">{title}</p>
          {subtitle && <p className="text-xs text-navy-400">{subtitle}</p>}
        </div>
        <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
      </div>
      <div className={`mt-4 ${height}`}>{children}</div>
    </div>
  );
}

const tooltipStyle = {
  contentStyle: { borderRadius: 16, border: "1px solid #d8eef9", boxShadow: "0 12px 30px -12px rgba(15,36,54,0.3)", fontSize: 12 },
  cursor: { fill: "rgba(26,111,159,0.06)" },
};

export function SimpleBarChart({ data, horizontal = false, color = CHART_COLORS[0] }: { data: Datum[]; horizontal?: boolean; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      {horizontal ? (
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 16 }}>
          <CartesianGrid stroke="#f1f6fa" strokeDasharray="4 4" horizontal={false} />
          <XAxis type="number" allowDecimals={false} fontSize={12} />
          <YAxis type="category" dataKey="name" width={120} fontSize={12} />
          <Tooltip {...tooltipStyle} />
          <Bar dataKey="value" name="Jumlah" fill={color} radius={[0, 8, 8, 0]} animationDuration={900} />
        </BarChart>
      ) : (
        <BarChart data={data} margin={{ right: 8 }}>
          <CartesianGrid stroke="#f1f6fa" strokeDasharray="4 4" vertical={false} />
          <XAxis dataKey="name" interval={0} tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={48} />
          <YAxis allowDecimals={false} fontSize={12} />
          <Tooltip {...tooltipStyle} />
          <Bar dataKey="value" name="Jumlah" radius={[8, 8, 0, 0]} animationDuration={900}>
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

export function DonutChart({ data }: { data: Datum[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="58%"
          outerRadius="85%"
          paddingAngle={3}
          cornerRadius={6}
          stroke="none"
          animationDuration={900}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function TrendChart({ data, series }: { data: Record<string, string | number>[]; series: { key: string; label: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ right: 8 }}>
        <CartesianGrid stroke="#f1f6fa" strokeDasharray="4 4" vertical={false} />
        <XAxis dataKey="label" fontSize={12} />
        <YAxis allowDecimals={false} fontSize={12} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5 }}
            animationDuration={1100}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

type Series = { key: string; label: string; color?: string }[];

export function GroupedBarChart({ data, series, xKey = "name" }: { data: Record<string, string | number>[]; series: Series; xKey?: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid stroke="#f1f6fa" strokeDasharray="4 4" vertical={false} />
        <XAxis dataKey={xKey} fontSize={12} />
        <YAxis allowDecimals={false} fontSize={12} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} itemSorter={null} />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
            radius={[6, 6, 0, 0]}
            animationDuration={900}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
/** Sumbu Rupiah ringkas: 1.500.000 → "1,5 jt", 250.000 → "250 rb" */
const rupiahShort = (n: number) =>
  n >= 1e9
    ? `${(n / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`
    : n >= 1e6
      ? `${(n / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`
      : n >= 1e3
        ? `${Math.round(n / 1e3)} rb`
        : String(n);

/** Tooltip batang bertumpuk: rincian per seri + total */
function StackTooltip({
  active,
  payload,
  label,
  currency = false,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  currency?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
  const fmt = (v: number) => (currency ? rupiah(v) : v);
  return (
    <div className="rounded-2xl border border-brand-100 bg-white px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-bold text-navy-900">{label}</p>
      {[...payload].reverse().map((p) => (
        <p key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} /> {p.name}
          </span>
          <b>{fmt(p.value)}</b>
        </p>
      ))}
      <p className="mt-1 flex justify-between gap-4 border-t border-navy-50 pt-1 font-bold text-navy-900">
        <span>Total</span>
        <span>{fmt(total)}</span>
      </p>
    </div>
  );
}

/** Batang bertumpuk: tinggi = total, warna = komposisi (mis. penjualan per sumber) */
export function StackedBarChart({
  data,
  series,
  xKey = "label",
  currency = false,
}: {
  data: Record<string, string | number>[];
  series: Series;
  xKey?: string;
  /** nilai dalam Rupiah (sumbu ringkas, tooltip lengkap) */
  currency?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid stroke="#f1f6fa" strokeDasharray="4 4" vertical={false} />
        <XAxis dataKey={xKey} fontSize={12} />
        <YAxis allowDecimals={false} fontSize={12} tickFormatter={currency ? rupiahShort : undefined} width={currency ? 64 : undefined} />
        <Tooltip content={<StackTooltip currency={currency} />} cursor={tooltipStyle.cursor} />
        <Legend wrapperStyle={{ fontSize: 12 }} itemSorter={null} />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stackId="total"
            fill={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
            radius={i === series.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
            animationDuration={900}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
