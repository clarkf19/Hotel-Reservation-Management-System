/** Service desk — Receptionist handles service requests and escalated AI queries ("Handle Escalated Guest Request"). */
import { useState } from 'react';
import { toast } from 'sonner';
import { Bot, ConciergeBell } from 'lucide-react';
import { Badge, Button, EmptyState, Field, Input, LoadingBlock, Modal, PageHeader, Select, StatusBadge, Table, Tabs, Textarea } from '../../components/ui/index.js';
import { TraceChips } from '../../components/viva/TraceChips.jsx';
import { useApi } from '../../lib/hooks.js';
import { api, qs } from '../../lib/api.js';
import { inr, timeAgo } from '../../lib/format.js';

export default function ServiceDesk() {
  const [tab, setTab] = useState('open');
  const query = tab === 'open' ? { status: 'OPEN,IN_PROGRESS' } : tab === 'escalations' ? { escalations: 'true', status: 'OPEN,IN_PROGRESS' } : {};
  const { data, loading, reload } = useApi(`/service-requests${qs(query)}`, { deps: [tab], poll: 20000 });
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState({});
  const [pending, setPending] = useState(false);
  const open = (s) => { setSel(s); setForm({ status: s.status === 'OPEN' ? 'IN_PROGRESS' : s.status, staffNote: s.staffNote || '', charge: s.charge }); };
  const save = async () => {
    setPending(true);
    try { await api.patch(`/service-requests/${sel.id}`, { ...form, charge: Number(form.charge), assignToMe: true }); toast.success('Request updated — guest notified'); setSel(null); reload({ quiet: true }); } catch (e) { toast.error(e.message); } finally { setPending(false); }
  };
  return (
    <div>
      <PageHeader eyebrow="Guest services" title="Service desk" subtitle="Service requests from guests and questions the AI concierge escalated to a human." />
      <TraceChips screen="services" />
      <div className="mb-4"><Tabs value={tab} onChange={setTab} tabs={[{ value: 'open', label: 'Open' }, { value: 'escalations', label: 'AI escalations' }, { value: 'all', label: 'All' }]} /></div>
      {loading ? <LoadingBlock /> : !data?.requests.length ? <EmptyState icon={ConciergeBell} title="Nothing waiting" /> : (
        <Table rows={data.requests} onRowClick={open} columns={[
          { key: 'id', header: '#', render: (s) => <span className="text-ink-400">{s.id}</span> },
          { key: 'label', header: 'Request', render: (s) => <div className="flex items-center gap-2"><span className="font-medium">{s.label}</span>{s.isEscalation && <Badge tone="amber"><Bot className="size-3" />AI</Badge>}</div> },
          { key: 'guest', header: 'Guest', render: (s) => <>{s.guest?.name}{s.reservation?.roomNumber && <span className="text-ink-500"> · room {s.reservation.roomNumber}</span>}</> },
          { key: 'description', header: 'Details', render: (s) => <span className="line-clamp-1 max-w-sm text-ink-600">{s.description}</span> },
          { key: 'charge', header: 'Charge', align: 'right', render: (s) => (s.charge ? inr(s.charge) : '—') },
          { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
          { key: 'createdAt', header: 'Age', render: (s) => timeAgo(s.createdAt) },
        ]} />
      )}
      <Modal open={Boolean(sel)} onClose={() => setSel(null)} title={sel?.label} subtitle={sel && `${sel.guest?.name}${sel.reservation?.roomNumber ? ` · room ${sel.reservation.roomNumber}` : ''}`} footer={<><Button variant="secondary" onClick={() => setSel(null)}>Close</Button><Button onClick={save} loading={pending}>Save & notify guest</Button></>}>
        {sel && (
          <div className="space-y-4">
            <div className="rounded-lg bg-ink-50 p-3 text-sm">{sel.isEscalation ? <><b>Guest asked the AI concierge:</b> “{sel.description}”</> : sel.description}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Status"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((s) => <option key={s} value={s}>{s.replace('_', ' ').toLowerCase()}</option>)}</Select></Field>
              <Field label="Charge to final bill (₹)"><Input type="number" min={0} value={form.charge} onChange={(e) => setForm({ ...form, charge: e.target.value })} /></Field>
            </div>
            <Field label={sel.isEscalation ? 'Reply to guest' : 'Note to guest'}><Textarea value={form.staffNote} onChange={(e) => setForm({ ...form, staffNote: e.target.value })} placeholder="The guest sees this in the app and gets a notification." /></Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
