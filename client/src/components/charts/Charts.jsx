/**
 * Chart components (Recharts). Palette: validated reference categorical palette in fixed order
 * (series-1 blue, series-2 orange); single-measure charts use one hue; thin 2px lines,
 * 4px rounded bar ends, recessive grid, hover tooltips on every chart.
 */
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList } from 'recharts';

export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a'];
const AXIS = { fontSize: 11, fill: '#5b6680' };
const GRID = '#eceef2';
const shortDate = (d) => { const x = new Date(`${d}T00:00:00Z`); return `${x.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][x.getUTCMonth()]}`; };

function TooltipBox({ active, payload, label, format = (v) => v, labelFormat = (l) => l }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-[12px] shadow-lg">
      <div className="mb-1 font-semibold text-ink-800">{labelFormat(label)}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-ink-600">
          <span className="size-2 rounded-full" style={{ background: p.color }} />{p.name}: <b className="tabular text-ink-900">{format(p.value)}</b>
        </div>
      ))}
    </div>
  );
}

export function OccupancyTrend({ data, todayKey }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
        <defs><linearGradient id="occ" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.22} /><stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} /></linearGradient></defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={AXIS} tickLine={false} axisLine={false} />
        <Tooltip content={<TooltipBox format={(v) => `${v}%`} labelFormat={shortDate} />} cursor={{ stroke: '#b7bdca', strokeDasharray: '3 3' }} />
        {todayKey && <ReferenceLine x={todayKey} stroke="#0f1629" strokeDasharray="4 3" label={{ value: 'Today', position: 'insideTopRight', fontSize: 11, fill: '#0f1629' }} />}
        <Area type="monotone" dataKey="occupancy" name="Occupancy" stroke={SERIES[0]} strokeWidth={2} fill="url(#occ)" activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function HorizontalBars({ data, dataKey, nameKey, format, height }) {
  return (
    <ResponsiveContainer width="100%" height={height || Math.max(160, data.length * 42)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 64, left: 0, bottom: 0 }} barCategoryGap={8}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" hide />
        <YAxis type="category" dataKey={nameKey} tick={{ ...AXIS, fill: '#18223b' }} width={130} tickLine={false} axisLine={false} />
        <Tooltip content={<TooltipBox format={format} />} cursor={{ fill: '#f5f6f8' }} />
        <Bar dataKey={dataKey} name="Value" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={24}>
          <LabelList dataKey={dataKey} position="right" formatter={format} style={{ fontSize: 11, fill: '#18223b', fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function BookingTrend({ data }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
        <Tooltip content={<TooltipBox labelFormat={shortDate} />} cursor={{ stroke: '#b7bdca', strokeDasharray: '3 3' }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="bookings" name="New bookings" stroke={SERIES[0]} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
        <Line type="monotone" dataKey="cancellations" name="Cancellations" stroke={SERIES[1]} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DailyBars({ data, dataKey, format, name = 'Value' }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 10, right: 8, left: -4, bottom: 0 }} barCategoryGap={3}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tickFormatter={(v) => (v >= 100000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} tick={AXIS} tickLine={false} axisLine={false} />
        <Tooltip content={<TooltipBox format={format} labelFormat={shortDate} />} cursor={{ fill: '#f5f6f8' }} />
        <Bar dataKey={dataKey} name={name} fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CategoryBars({ data, dataKey, nameKey, format }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 18, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={nameKey} tick={AXIS} tickLine={false} axisLine={false} interval={0} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={format} />
        <Tooltip content={<TooltipBox format={format} />} cursor={{ fill: '#f5f6f8' }} />
        <Bar dataKey={dataKey} name="Value" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={44}>
          <LabelList dataKey={dataKey} position="top" formatter={format} style={{ fontSize: 11, fill: '#18223b', fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
