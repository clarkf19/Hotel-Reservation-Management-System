/**
 * Reports — Report.generate(), Report.exportPDF(), Report.exportCSV() (Dashboard.Export).
 * Hotel Manager: occupancy, bookings, cancellations, revenue. Finance Staff: revenue (financial) reports.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { FileDown, FileSpreadsheet, FileText, Play } from 'lucide-react';
import { Button, Card, CardHeader, Field, Input, PageHeader, Select, Table, EmptyState } from '../../components/ui/index.js';
import { CategoryBars, DailyBars, HorizontalBars } from '../../components/charts/Charts.jsx';
import { TraceChips } from '../../components/viva/TraceChips.jsx';
import { useApi } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { fmtDateTime, inr, today } from '../../lib/format.js';

const MONEY = new Set(['gross', 'refunds', 'net', 'commission', 'fees', 'value']);

const TYPES = [
  { value: 'occupancy', label: 'Occupancy report', perm: 'report.operational' },
  { value: 'bookings', label: 'Booking trends report', perm: 'report.operational' },
  { value: 'cancellations', label: 'Cancellation report', perm: 'report.operational' },
  { value: 'revenue', label: 'Revenue report (by channel)', perm: 'report.financial' },
];

function ReportChart({ chart }) {
  if (!chart?.data?.length) return null;
  if (chart.key === 'occupancy') return <DailyBars data={chart.data} dataKey="occupancy" name="Occupancy" format={(v) => `${v}%`} />;
  if (chart.key === 'bookings') return <DailyBars data={chart.data} dataKey="bookings" name="Bookings" />;
  if (chart.key === 'net') return <HorizontalBars data={chart.data} dataKey="net" nameKey="channel" format={(v) => inr(v)} />;
  return <CategoryBars data={chart.data} dataKey="cancellations" nameKey="channel" format={(v) => v} />;
}

export default function Reports({ financial = false }) {
  const { can } = useAuth();
  const types = TYPES.filter((t) => can(t.perm) && (!financial || t.value === 'revenue'));
  const [form, setForm] = useState({ type: types[0]?.value, from: today(-30), to: today() });
  const [report, setReport] = useState(null);
  const [pending, setPending] = useState(false);
  const history = useApi('/reports');

  const generate = async () => {
    setPending(true);
    try {
      const res = await api.post('/reports', form, { label: 'Generate report' });
      setReport(res.report);
      history.reload({ quiet: true });
      toast.success(`${res.report.title} generated`);
    } catch (e) { toast.error(e.message); } finally { setPending(false); }
  };
  const exportAs = (format, id = report.id) => api.download(`/reports/${id}/export?format=${format}`, `report.${format}`).catch((e) => toast.error(e.message));

  return (
    <div>
      <PageHeader eyebrow={financial ? 'Finance' : 'Analytics'} title={financial ? 'Financial reports' : 'Reports'} subtitle="Generate a report for any date range, review it here and export it as PDF or CSV." />
      <TraceChips screen="reports" />
      <Card className="mb-6">
        <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-end">
          <Field label="Report"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></Field>
          <Field label="From"><Input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></Field>
          <Field label="To"><Input type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></Field>
          <Button icon={Play} onClick={generate} loading={pending}>Generate</Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
          {[['Last 7 days', -7], ['Last 30 days', -30], ['Last 60 days', -60]].map(([l, d]) => <button key={l} onClick={() => setForm({ ...form, from: today(d), to: today() })} className="rounded-full border border-ink-200 px-2.5 py-1 hover:border-brass-400">{l}</button>)}
          <button onClick={() => setForm({ ...form, from: today(), to: today(30) })} className="rounded-full border border-ink-200 px-2.5 py-1 hover:border-brass-400">Next 30 days (on the books)</button>
        </div>
      </Card>

      {report ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="font-display text-2xl font-semibold">{report.title}</h2><p className="text-sm text-ink-500">{report.parameters.from} → {report.parameters.to} · generated {fmtDateTime(report.generatedAt)}</p></div>
            {can('report.export') && <div className="flex gap-2"><Button variant="secondary" icon={FileSpreadsheet} onClick={() => exportAs('csv')}>Export CSV</Button><Button icon={FileDown} onClick={() => exportAs('pdf')}>Export PDF</Button></div>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {report.summary.map((s) => <Card key={s.label}><div className="text-[13px] text-ink-500">{s.label}</div><div className="mt-1 font-display text-2xl font-semibold tabular">{s.value}</div></Card>)}
          </div>
          <Card><ReportChart chart={report.chart} /></Card>
          {report.tables.map((t) => (
            <div key={t.title}>
              <h3 className="mb-2 font-semibold">{t.title}</h3>
              <Table dense rows={t.rows.map((r, i) => ({ ...r, _k: i }))} rowKey="_k" columns={t.columns.map((c) => ({ key: c.key, header: c.label, align: c.numeric ? 'right' : undefined, render: (r) => (MONEY.has(c.key) && typeof r[c.key] === 'number' ? inr(r[c.key]) : r[c.key]) }))} />
            </div>
          ))}
        </div>
      ) : <EmptyState icon={FileText} title="No report yet" message="Choose a report and a date range, then Generate." />}

      <Card className="mt-8">
        <CardHeader title="Report history" subtitle="Saved in D7 Reports & Analytics" />
        <Table dense rows={history.data?.reports || []} columns={[
          { key: 'title', header: 'Report' },
          { key: 'range', header: 'Range', render: (r) => `${r.parameters.from} → ${r.parameters.to}` },
          { key: 'generatedBy', header: 'By' },
          { key: 'generatedAt', header: 'Generated', render: (r) => fmtDateTime(r.generatedAt) },
          { key: 'x', header: '', align: 'right', render: (r) => can('report.export') && <span className="inline-flex gap-1"><Button size="sm" variant="ghost" onClick={() => exportAs('csv', r.id)}>CSV</Button><Button size="sm" variant="ghost" onClick={() => exportAs('pdf', r.id)}>PDF</Button></span> },
        ]} empty={<p className="text-sm text-ink-500">No saved reports.</p>} />
      </Card>
    </div>
  );
}
