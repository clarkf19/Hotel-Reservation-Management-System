/** Room board — live room inventory status (D2); Room.updateStatus() by front desk; D5 access logs. */
import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Accessibility, Lock, Unlock } from 'lucide-react';
import { Button, Card, CardHeader, Drawer, ErrorState, KeyValue, LoadingBlock, PageHeader, StatusBadge, Tabs } from '../../components/ui/index.js';
import { TraceChips } from '../../components/viva/TraceChips.jsx';
import { useApi } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { fmtDate, inr, timeAgo, title } from '../../lib/format.js';

const TILE = {
  AVAILABLE: 'border-emerald-200 bg-emerald-50/70',
  RESERVED: 'border-sky-200 bg-sky-50/70',
  OCCUPIED: 'border-brass-300 bg-brass-50',
  CLEANING: 'border-amber-200 bg-amber-50/80',
  MAINTENANCE: 'border-red-200 bg-red-50/70',
  OUT_OF_SERVICE: 'border-red-300 bg-red-100/60',
};

export default function RoomBoard() {
  const navigate = useNavigate();
  const base = useLocation().pathname.split('/')[1];
  const { data, error, loading, reload } = useApi('/rooms-board', { poll: 30000 });
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('ALL');
  const { data: logs } = useApi(selected ? `/access/logs?roomNumber=${selected.roomNumber}` : null, { deps: [selected?.id] });
  const rooms = data?.rooms || [];
  const counts = useMemo(() => rooms.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {}), [rooms]);
  const floors = useMemo(() => {
    const f = {};
    for (const r of rooms.filter((x) => filter === 'ALL' || x.status === filter)) (f[r.floor] ??= []).push(r);
    return Object.entries(f).sort((a, b) => b[0] - a[0]);
  }, [rooms, filter]);

  const setStatus = async (status) => {
    try {
      const { room } = await api.patch(`/rooms/${selected.id}/status`, { status });
      toast.success(`Room ${room.roomNumber} is now ${title(room.status)}`);
      setSelected(null);
      reload({ quiet: true });
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div>
      <PageHeader eyebrow="Room inventory" title="Room board" subtitle="Live status of every room. Click a room to update its status or see who is staying." />
      <TraceChips screen="frontdesk" />
      <div className="mb-5"><Tabs value={filter} onChange={setFilter} tabs={[{ value: 'ALL', label: 'All', count: rooms.length }, ...['AVAILABLE', 'RESERVED', 'OCCUPIED', 'CLEANING', 'MAINTENANCE'].map((s) => ({ value: s, label: title(s === 'RESERVED' ? 'Arriving' : s), count: counts[s] || 0 }))]} /></div>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <LoadingBlock /> : (
        <div className="space-y-5">
          {floors.map(([floor, list]) => (
            <div key={floor} className="grid grid-cols-[56px_1fr] gap-3">
              <div className="pt-3 text-right"><div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Floor</div><div className="font-display text-2xl font-semibold">{floor}</div></div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {list.map((r) => (
                  <button key={r.id} onClick={() => setSelected(r)} className={clsx('rounded-xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md', TILE[r.status])}>
                    <div className="flex items-center justify-between"><span className="font-display text-xl font-semibold">{r.roomNumber}</span>{r.accessible && <Accessibility className="size-4 text-sky-600" />}</div>
                    <div className="truncate text-[11.5px] text-ink-600">{r.roomType.typeName}</div>
                    <div className="mt-2"><StatusBadge status={r.status} /></div>
                    <div className="mt-2 min-h-8 text-[11.5px] leading-tight text-ink-600">
                      {r.current ? <><b>{r.current.guest}</b><br />until {fmtDate(r.current.checkOutDate, { weekday: false })}</> : r.next ? <>Next: {r.next.guest}<br />{fmtDate(r.next.checkInDate, { weekday: false })}</> : <span className="text-ink-400">No upcoming stay</span>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected ? `Room ${selected.roomNumber}` : ''} subtitle={selected && `${selected.roomType.typeName} · floor ${selected.floor} · ${selected.view} view`}>
        {selected && (
          <div className="space-y-6 p-6">
            <div className="grid grid-cols-2 gap-4">
              <KeyValue label="Status" value={<StatusBadge status={selected.status} />} />
              <KeyValue label="Rate" value={`${inr(selected.baseRate)} / night`} />
              <KeyValue label="Capacity" value={selected.capacity} />
              <KeyValue label="Features" value={selected.features.join(', ') || '—'} />
            </div>
            {selected.current && (
              <Card className="bg-brass-50/60">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-brass-700">{selected.current.status === 'CHECKED_IN' ? 'In house' : 'Arriving today'}</div>
                <div className="mt-1 font-semibold">{selected.current.guest}</div>
                <div className="text-sm text-ink-600">{fmtDate(selected.current.checkInDate)} → {fmtDate(selected.current.checkOutDate)} · {selected.current.numGuests} guest(s)</div>
                <Button size="sm" variant="secondary" className="mt-3" onClick={() => navigate(`/${base}/reservations/${selected.current.id}`)}>Open reservation</Button>
              </Card>
            )}
            <div>
              <h3 className="mb-2 text-sm font-semibold">Set room status (Room.updateStatus)</h3>
              <div className="flex flex-wrap gap-2">
                {['AVAILABLE', 'CLEANING', 'MAINTENANCE', 'OUT_OF_SERVICE'].map((s) => <Button key={s} size="sm" variant={s === 'AVAILABLE' ? 'success' : s === 'CLEANING' ? 'secondary' : 'danger'} disabled={selected.status === s || selected.status === 'OCCUPIED'} onClick={() => setStatus(s)}>{title(s)}</Button>)}
              </div>
              {selected.status === 'OCCUPIED' && <p className="mt-2 text-[12px] text-ink-500">Occupied rooms change status through check-out.</p>}
              <p className="mt-2 text-[12px] text-ink-500">Taking a room out of service removes it from sale and pushes updated availability to every OTA.</p>
            </div>
            <Card>
              <CardHeader title="Recent door access" subtitle="D5 Room Access Logs" />
              <ul className="divide-y divide-ink-100 text-[13px]">
                {(logs?.logs || []).slice(0, 10).map((l) => <li key={l.id} className="flex items-center justify-between py-2"><span className="flex items-center gap-2">{l.result === 'GRANTED' ? <Unlock className="size-4 text-emerald-600" /> : <Lock className="size-4 text-red-600" />}{l.guest || 'Unknown key'} — {l.reason}</span><span className="text-ink-400">{timeAgo(l.attemptedAt)}</span></li>)}
                {!logs?.logs?.length && <li className="py-3 text-ink-500">No access events.</li>}
              </ul>
            </Card>
          </div>
        )}
      </Drawer>
    </div>
  );
}
