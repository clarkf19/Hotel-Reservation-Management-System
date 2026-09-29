/**
 * Rates & inventory — HotelManager.manageRates(), manageInventory(); use case "Manage Channels & Rates".
 * SRS 4.3.2: Hotel Manager updates a room rate -> system pushes the new rate to every connected OTA (Channel.Sync.Rate, BR-10).
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Send, Tags } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Field, Input, LoadingBlock, Modal, PageHeader, Select, StatusBadge, Table, Toggle } from '../../components/ui/index.js';
import { TraceChips } from '../../components/viva/TraceChips.jsx';
import { useApi } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { inr } from '../../lib/format.js';

function RateRow({ t, onSaved }) {
  const [rate, setRate] = useState(t.baseRate);
  const [pending, setPending] = useState(false);
  const save = async () => {
    setPending(true);
    try {
      const res = await api.put(`/room-types/${t.id}/rate`, { baseRate: Number(rate) }, { label: 'Update rate' });
      const ok = res.pushedTo.filter((p) => p.ok).length;
      toast.success(`${t.typeName} now ${inr(rate)} — pushed to ${ok}/${res.pushedTo.length} OTA channels`);
      onSaved();
    } catch (e) { toast.error(e.message); } finally { setPending(false); }
  };
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-200 p-3">
      <div className="min-w-44 flex-1"><div className="font-semibold">{t.typeName}</div><div className="text-[12px] text-ink-500">{t.category.toLowerCase()} · {t.roomCount} rooms · sleeps {t.maxOccupancy}</div></div>
      <div className="flex items-center gap-2"><span className="text-sm text-ink-500">₹</span><Input type="number" min={500} step={100} value={rate} onChange={(e) => setRate(e.target.value)} className="w-32 text-right tabular" /></div>
      <Button size="sm" icon={Send} onClick={save} loading={pending} disabled={Number(rate) === t.baseRate}>Save & push to OTAs</Button>
    </div>
  );
}

export default function RatesInventory() {
  const types = useApi('/room-types');
  const board = useApi('/rooms-board');
  const [open, setOpen] = useState(false);
  const [room, setRoom] = useState({ roomNumber: '', roomTypeId: '', floor: 1, capacity: 2, view: 'City', accessible: false });
  const add = async () => {
    try {
      await api.post('/rooms', { ...room, roomTypeId: Number(room.roomTypeId), floor: Number(room.floor), capacity: Number(room.capacity) });
      toast.success(`Room ${room.roomNumber} added to inventory`);
      setOpen(false); board.reload({ quiet: true }); types.reload({ quiet: true });
    } catch (e) { toast.error(e.message); }
  };
  return (
    <div>
      <PageHeader eyebrow="Revenue & inventory" title="Rates & inventory" subtitle="Change a rate and it is applied to every room of that type and pushed to all OTA channels immediately." actions={<Button icon={Plus} onClick={() => setOpen(true)}>Add room</Button>} />
      <TraceChips screen="rates" />
      <Card className="mb-6">
        <CardHeader icon={Tags} title="Room-type rates" subtitle="Nightly rate before tax (RoomType.getBaseRate)" />
        {types.loading ? <LoadingBlock rows={3} /> : <div className="space-y-2">{types.data.roomTypes.map((t) => <RateRow key={t.id} t={t} onSaved={() => { types.reload({ quiet: true }); board.reload({ quiet: true }); }} />)}</div>}
      </Card>
      <h2 className="mb-3 font-semibold">Room inventory</h2>
      {board.loading ? <LoadingBlock /> : (
        <Table dense rows={board.data.rooms} columns={[
          { key: 'roomNumber', header: 'Room', render: (r) => <b>{r.roomNumber}</b> },
          { key: 'type', header: 'Type', render: (r) => r.roomType.typeName },
          { key: 'floor', header: 'Floor' },
          { key: 'capacity', header: 'Sleeps' },
          { key: 'view', header: 'View' },
          { key: 'accessible', header: 'Accessible', render: (r) => (r.accessible ? <Badge tone="blue">Yes</Badge> : '—') },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'baseRate', header: 'Rate', align: 'right', render: (r) => inr(r.baseRate) },
        ]} />
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Add room" subtitle="HotelManager.manageInventory()" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={add} disabled={!room.roomNumber || !room.roomTypeId}>Add room</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Room number"><Input value={room.roomNumber} onChange={(e) => setRoom({ ...room, roomNumber: e.target.value.toUpperCase() })} placeholder="e.g. 604" /></Field>
          <Field label="Room type"><Select value={room.roomTypeId} onChange={(e) => setRoom({ ...room, roomTypeId: e.target.value })}><option value="">Choose…</option>{(types.data?.roomTypes || []).map((t) => <option key={t.id} value={t.id}>{t.typeName}</option>)}</Select></Field>
          <Field label="Floor"><Input type="number" value={room.floor} onChange={(e) => setRoom({ ...room, floor: e.target.value })} /></Field>
          <Field label="Sleeps"><Input type="number" value={room.capacity} onChange={(e) => setRoom({ ...room, capacity: e.target.value })} /></Field>
          <Field label="View"><Select value={room.view} onChange={(e) => setRoom({ ...room, view: e.target.value })}>{['Sea', 'City', 'Garden', 'Pool'].map((v) => <option key={v}>{v}</option>)}</Select></Field>
          <div className="flex items-end pb-2"><Toggle checked={room.accessible} onChange={(v) => setRoom({ ...room, accessible: v })} label="Accessible room" /></div>
        </div>
      </Modal>
    </div>
  );
}
