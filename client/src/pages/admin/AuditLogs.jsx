/** Audit logs — AuditLog.record() / SystemAdministrator.viewAuditLogs(); SE-6; UC-4 step 4. */
import { useState } from 'react';
import { Search, ScrollText } from 'lucide-react';
import { Badge, Button, Drawer, Input, LoadingBlock, PageHeader, Select, Table } from '../../components/ui/index.js';
import { TraceChips } from '../../components/viva/TraceChips.jsx';
import { useApi } from '../../lib/hooks.js';
import { qs } from '../../lib/api.js';
import { fmtDateTime, title } from '../../lib/format.js';

const tone = (a) => (/FAIL|DENIED|LOCK|CANCEL|REVOK|CONFLICT/.test(a) ? 'red' : /PAYMENT|REFUND|RECONCIL/.test(a) ? 'green' : /ROLE|PERMISSION|SETTING|USER/.test(a) ? 'violet' : 'gray');

export default function AuditLogs() {
  const [f, setF] = useState({ action: '', entityType: '' });
  const [applied, setApplied] = useState(f);
  const [offset, setOffset] = useState(0);
  const { data, loading } = useApi(`/admin/audit-logs${qs({ ...applied, limit: 100, offset })}`, { deps: [applied, offset] });
  const [sel, setSel] = useState(null);
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Audit logs" subtitle="Security-sensitive actions, every booking and every payment transaction (SE-6)." />
      <TraceChips screen="audit" />
      <form onSubmit={(e) => { e.preventDefault(); setOffset(0); setApplied(f); }} className="mb-4 grid gap-3 md:grid-cols-[1fr_220px_auto]">
        <Input icon={Search} placeholder="Action contains… (e.g. PAYMENT, LOGIN, ROLE)" value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })} />
        <Select value={f.entityType} onChange={(e) => { const n = { ...f, entityType: e.target.value }; setF(n); setApplied(n); }}><option value="">All entities</option>{['Reservation', 'Payment', 'User', 'Role', 'Room', 'RoomType', 'ChannelSync', 'OTAChannel', 'ServiceRequest', 'SystemSetting', 'Report'].map((x) => <option key={x}>{x}</option>)}</Select>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      {data?.actions && <div className="mb-4 flex flex-wrap gap-1.5">{data.actions.slice(0, 16).map((a) => <button key={a.action} onClick={() => { const n = { ...f, action: a.action }; setF(n); setApplied(n); }}><Badge tone={tone(a.action)}>{title(a.action)} · {a.count}</Badge></button>)}</div>}
      {loading ? <LoadingBlock /> : (
        <>
          <Table dense rows={data.logs} onRowClick={setSel} columns={[
            { key: 'timestamp', header: 'Time', render: (l) => fmtDateTime(l.timestamp) },
            { key: 'action', header: 'Action', render: (l) => <Badge tone={tone(l.action)}>{l.action}</Badge> },
            { key: 'entity', header: 'Entity', render: (l) => <span className="font-mono text-[12px]">{l.entityType}{l.entityId ? ` #${l.entityId}` : ''}</span> },
            { key: 'performedBy', header: 'Performed by' },
            { key: 'details', header: 'Details', render: (l) => <span className="line-clamp-1 max-w-md font-mono text-[11px] text-ink-500">{JSON.stringify(l.details)}</span> },
          ]} empty={<p className="text-sm text-ink-500">No matching entries.</p>} />
          <div className="mt-3 flex items-center justify-between text-sm text-ink-500">
            <span>{data.total.toLocaleString('en-IN')} entries</span>
            <span className="flex gap-2"><Button size="sm" variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 100))}>Newer</Button><Button size="sm" variant="secondary" disabled={offset + 100 >= data.total} onClick={() => setOffset(offset + 100)}>Older</Button></span>
          </div>
        </>
      )}
      <Drawer open={Boolean(sel)} onClose={() => setSel(null)} title={sel?.action} subtitle={sel && fmtDateTime(sel.timestamp)}>
        {sel && <div className="space-y-3 p-6 text-sm"><div><b>Entity:</b> {sel.entityType} {sel.entityId}</div><div><b>By:</b> {sel.performedBy}</div><pre className="overflow-x-auto rounded-lg bg-ink-900 p-4 text-[12px] text-brass-200"><ScrollText className="mb-2 size-4" />{JSON.stringify(sel.details, null, 2)}</pre></div>}
      </Drawer>
    </div>
  );
}
