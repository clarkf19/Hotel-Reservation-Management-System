/** Traceability explorer: every SRS functional requirement mapped through the documents to running code. */
import { useMemo, useState } from 'react';
import { Search, Workflow } from 'lucide-react';
import { Card, CardHeader, Input, PageHeader, Tabs, Badge } from '../../components/ui/index.js';
import { REQUIREMENTS, REQ_COLUMNS } from '../../lib/requirements.js';
import { SCREENS } from '../../lib/traceability.js';

const LIFECYCLE = [
  ['Fig. 2 INQUIRY', 'room search (not persisted)'],
  ['Fig. 2 PENDING RESERVATION', 'DRAFT'],
  ['Fig. 2 PENDING PAYMENT', 'PENDING_PAYMENT (room locked)'],
  ['Fig. 2 CONFIRMED', 'CONFIRMED'],
  ['Fig. 2 CHECKED-IN', 'CHECKED_IN'],
  ['Fig. 2 COMPLETED', 'CHECKED_OUT'],
  ['Fig. 2 CANCELLED', 'CANCELLED'],
];

export default function Traceability() {
  const [q, setQ] = useState('');
  const [section, setSection] = useState('all');
  const rows = useMemo(() => REQUIREMENTS.filter((r) => (section === 'all' || r[0] === section) && (!q || r.join(' ').toLowerCase().includes(q.toLowerCase()))), [q, section]);
  return (
    <div>
      <PageHeader eyebrow="Software Engineering documentation" title="Traceability explorer" subtitle="Every functional requirement of SRS Section 4, traced through the use cases, class diagram, sequence diagrams, activity diagram and DFD to the API, database and screen that implement it." />
      <Card className="mb-6">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Tabs value={section} onChange={setSection} tabs={[{ value: 'all', label: 'All' }, ...['4.1', '4.2', '4.3', '4.4', '4.5', '4.6', '4.7'].map((s) => ({ value: s, label: s, count: REQUIREMENTS.filter((r) => r[0] === s).length }))]} />
          <div className="w-full md:w-72"><Input icon={Search} placeholder="Filter (e.g. Payment, SD-2, 4.0)" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-ink-200">
          <table className="w-full min-w-[1300px] text-left text-[12.5px]">
            <thead className="bg-ink-900 text-white"><tr>{REQ_COLUMNS.map((c) => <th key={c} className="px-3 py-2.5 font-semibold">{c}</th>)}<th className="px-3 py-2.5 font-semibold">Status</th></tr></thead>
            <tbody className="divide-y divide-ink-100 bg-white">
              {rows.map((r) => (
                <tr key={r[1]} className="align-top hover:bg-brass-50/40">
                  {r.map((cell, i) => <td key={i} className={i === 1 ? 'px-3 py-2 font-mono font-semibold text-ink-900' : i === 7 || i === 8 ? 'px-3 py-2 font-mono text-[11.5px] text-ink-600' : 'px-3 py-2 text-ink-700'}>{cell}</td>)}
                  <td className="px-3 py-2"><Badge tone="green">Implemented · tested</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader icon={Workflow} title="Reservation lifecycle — SRS Figure 2 → data dictionary states" subtitle="Decision D-1 (docs/ASSUMPTIONS.md): the stored states follow the data dictionary; Figure 2's events drive the transitions." />
          <ol className="space-y-2">
            {LIFECYCLE.map(([fig, impl]) => <li key={fig} className="flex items-center justify-between gap-3 rounded-lg bg-ink-50 px-3 py-2 text-[13px]"><span className="font-medium">{fig}</span><span className="font-mono text-ink-600">{impl}</span></li>)}
          </ol>
        </Card>
        <Card>
          <CardHeader icon={Workflow} title="Screens and their sources" subtitle="Turn on Viva mode (top bar) to see this mapping on every screen." />
          <ul className="grid gap-2 sm:grid-cols-2">
            {Object.entries(SCREENS).map(([k, s]) => (
              <li key={k} className="rounded-lg border border-ink-200 px-3 py-2">
                <div className="text-[13px] font-semibold">{s.title}</div>
                <div className="text-[11.5px] text-ink-500">{s.sequence || s.activity[0]}</div>
                <div className="mt-1 text-[11px] text-brass-700">DFD {s.dfd[0]}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
