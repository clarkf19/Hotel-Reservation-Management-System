/** Guest service requests — Activity "Submit Service Request"; DFD D6 Service Requests. */
import { useState } from 'react';
import { toast } from 'sonner';
import { ConciergeBell, Plus } from 'lucide-react';
import { Alert, Button, Card, EmptyState, ErrorState, Field, LoadingBlock, Modal, PageHeader, Select, StatusBadge, Textarea, Badge } from '../../components/ui/index.js';
import { TraceChips } from '../../components/viva/TraceChips.jsx';
import { useApi } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { inr, timeAgo, today } from '../../lib/format.js';

export default function ServiceRequests() {
  const { data, error, loading, reload } = useApi('/service-requests', { poll: 20000 });
  const { data: catalog } = useApi('/service-requests/catalog');
  const { data: res } = useApi('/reservations?status=CONFIRMED,CHECKED_IN');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category: 'AMENITIES', description: '' });
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState(null);
  const stay = (res?.reservations || []).filter((r) => r.checkOutDate >= today()).sort((a, b) => (a.status === 'CHECKED_IN' ? -1 : 1))[0];
  const spec = catalog?.catalog.find((c) => c.key === form.category);

  const submit = async () => {
    setPending(true); setErr(null);
    try {
      await api.post('/service-requests', { ...form, reservationId: stay?.id }, { label: 'Submit service request' });
      toast.success('Request sent to our team');
      setOpen(false); setForm({ category: 'AMENITIES', description: '' }); reload();
    } catch (e) { setErr(e); } finally { setPending(false); }
  };
  const cancel = async (id) => { try { await api.patch(`/service-requests/${id}`, { status: 'CANCELLED' }); reload(); } catch (e) { toast.error(e.message); } };

  return (
    <div>
      <PageHeader eyebrow="Guest services" title="Service requests" subtitle="Housekeeping, amenities, transfers and more — tracked until done." actions={<Button icon={Plus} onClick={() => setOpen(true)} disabled={!stay}>New request</Button>} />
      <TraceChips screen="services" />
      {!stay && <Alert tone="blue" className="mb-4">Service requests are available for confirmed or current stays.</Alert>}
      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <LoadingBlock /> : !data.requests.length ? <EmptyState icon={ConciergeBell} title="No requests yet" message="Ask the AI Concierge or create a request here." /> : (
        <div className="grid gap-3">
          {data.requests.map((s) => (
            <Card key={s.id} className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{s.label}</span><StatusBadge status={s.status} />{s.isEscalation && <Badge tone="amber">Escalated from AI</Badge>}{s.charge > 0 && <Badge tone="brass">{inr(s.charge)}</Badge>}</div>
                <p className="mt-1 text-sm text-ink-600">{s.description}</p>
                {s.staffNote && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800"><b>Front desk:</b> {s.staffNote}</p>}
              </div>
              <div className="flex items-center gap-3 text-[12px] text-ink-500">#{s.id} · {timeAgo(s.createdAt)}{s.status === 'OPEN' && <Button size="sm" variant="ghost" onClick={() => cancel(s.id)}>Cancel</Button>}</div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="New service request" subtitle={stay ? `For room ${stay.room.roomNumber} · ${stay.reference}` : ''} footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={submit} loading={pending} disabled={form.description.length < 3}>Send request</Button></>}>
        {err && <Alert tone="red" className="mb-3">{err.message}</Alert>}
        <div className="space-y-3">
          <Field label="What do you need?"><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{(catalog?.catalog || []).map((c) => <option key={c.key} value={c.key}>{c.label}{c.charge ? ` — ${inr(c.charge)}` : ''}</option>)}</Select></Field>
          <Field label="Details"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Two extra pillows, please" /></Field>
          {spec && <p className="text-[12.5px] text-ink-500">{spec.eta}{spec.charge ? ` Charged ${inr(spec.charge)} to your final bill.` : ' No charge.'}</p>}
        </div>
      </Modal>
    </div>
  );
}
