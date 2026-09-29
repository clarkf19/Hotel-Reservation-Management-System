/**
 * OTA channel manager & conflict centre — SRS 4.3; SD-3 / CD-3 "OTA Booking Synchronization + Conflict Resolution".
 *   syncReservations() -> pullBookings() -> detectConflicts() -> alt: updateBookingStatus() | flag for Receptionist
 *   Receptionist.resolveOTAConflicts() -> resolveConflicts() -> updateBookingStatus() -> pushAvailability()
 * The right-hand simulator acts as a guest booking on the (mock) OTA website.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeftRight, CheckCircle2, Globe, Hotel, RefreshCw, Swords, Wand2, Workflow, XCircle } from 'lucide-react';
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, LoadingBlock, PageHeader, Select, StatusBadge, Table, Tabs, Textarea } from '../../components/ui/index.js';
import { TraceChips } from '../../components/viva/TraceChips.jsx';
import { useViva } from '../../components/viva/VivaContext.jsx';
import { useApi } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { fmtDate, fmtDateTime, inr, reference, timeAgo, title, today, addDays } from '../../lib/format.js';

function ConflictCard({ c, onResolved, canResolve }) {
  const [opts, setOpts] = useState(null);
  const [resolution, setResolution] = useState('REASSIGN_ROOM');
  const [roomId, setRoomId] = useState('');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => { if (canResolve) api.get(`/channels/conflicts/${c.id}/options`).then((o) => { setOpts(o); setRoomId(o.candidateRooms[0]?.id ?? ''); }).catch(() => {}); }, [c.id, canResolve]);
  const b = c.otaBooking;
  const resolve = async () => {
    setPending(true);
    try {
      await api.post(`/channels/conflicts/${c.id}/resolve`, { resolution, targetRoomId: resolution === 'REJECT_OTA_BOOKING' ? undefined : Number(roomId), note: note || undefined }, { label: 'Resolve OTA conflict' });
      toast.success('Conflict resolved and OTA updated');
      onResolved();
    } catch (e) { toast.error(e.message); } finally { setPending(false); }
  };
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="border-red-200">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge tone="red"><Swords className="size-3" />{title(c.conflictType)}</Badge>
          <span className="font-mono text-[12px] text-ink-500">{c.channel} · {c.externalRef}</span>
          <span className="ml-auto text-[12px] text-ink-400">detected {timeAgo(c.detectedAt)}</span>
        </div>
        <div className="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
          <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
            <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-violet-700"><Globe className="size-3.5" />{c.channel} says</div>
            {b ? <>
              <div className="font-display text-2xl font-semibold">Room {b.roomNumber} booked</div>
              <div className="mt-1 text-sm text-ink-700">{b.guestName} · {b.numGuests} guest(s)</div>
              <div className="text-sm text-ink-600">{fmtDate(b.checkInDate)} → {fmtDate(b.checkOutDate)}</div>
              <div className="mt-1 text-sm font-semibold tabular">{inr(b.amount)} prepaid</div>
            </> : <div className="text-sm">{c.message}</div>}
          </div>
          <div className="grid place-items-center"><span className="grid size-11 place-items-center rounded-full bg-red-600 text-white shadow-lg"><AlertTriangle className="size-5" /></span></div>
          <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
            <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-sky-700"><Hotel className="size-3.5" />HRMS says</div>
            {opts?.conflictReservation ? <>
              <div className="font-display text-2xl font-semibold">Room {b?.roomNumber} is taken</div>
              <div className="mt-1 text-sm text-ink-700">{opts.conflictReservation.guest} · {reference(opts.conflictReservation.reservationNumber)}</div>
              <div className="text-sm text-ink-600">{fmtDate(opts.conflictReservation.checkInDate)} → {fmtDate(opts.conflictReservation.checkOutDate)}</div>
              <div className="mt-1"><StatusBadge status={opts.conflictReservation.status} /></div>
            </> : <div className="text-sm text-ink-700">{c.message}</div>}
          </div>
        </div>
        {canResolve && (
          <div className="mt-5 rounded-xl bg-ink-50 p-4">
            <div className="mb-3 text-sm font-semibold">Resolve (manual reconciliation — Channel.Sync.Conflict)</div>
            <div className="grid gap-2 md:grid-cols-3">
              {[
                ['REASSIGN_ROOM', ArrowLeftRight, 'Move OTA guest', 'Accept the OTA booking in another free room'],
                ['MOVE_EXISTING', Hotel, 'Move HRMS guest', 'Keep OTA room; relocate the existing reservation'],
                ['REJECT_OTA_BOOKING', XCircle, 'Reject OTA booking', 'Tell the OTA the room is not available'],
              ].filter(([k]) => k !== 'MOVE_EXISTING' || opts?.conflictReservation).map(([k, I, t, d]) => (
                <button key={k} onClick={() => setResolution(k)} className={clsx('rounded-lg border p-3 text-left transition', resolution === k ? 'border-ink-900 bg-white shadow' : 'border-ink-200 bg-white/60 hover:border-ink-300')}>
                  <div className="flex items-center gap-2 text-sm font-semibold"><I className="size-4" />{t}</div>
                  <div className="mt-0.5 text-[12px] text-ink-500">{d}</div>
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
              {resolution !== 'REJECT_OTA_BOOKING' ? (
                <Field label="Target room">
                  <Select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                    {(opts?.candidateRooms || []).map((r) => <option key={r.id} value={r.id}>{r.roomNumber} · {r.typeName}{r.sameType ? ' (same type)' : ''} · {inr(r.baseRate)}</option>)}
                  </Select>
                </Field>
              ) : <div className="text-[12.5px] text-ink-500">The OTA will be told “REJECTED”; the existing HRMS reservation stays unchanged.</div>}
              <Field label="Note (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. upgraded, guest informed" /></Field>
              <Button onClick={resolve} loading={pending} variant={resolution === 'REJECT_OTA_BOOKING' ? 'danger' : 'primary'} icon={CheckCircle2}>Resolve conflict</Button>
            </div>
          </div>
        )}
      </Card>
    </motion.div>
  );
}

function Simulator({ channels, onCreated }) {
  const { data: board } = useApi('/rooms-board');
  const [f, setF] = useState({ channelId: '', roomNumber: '', checkIn: today(5), checkOut: today(7), guestName: 'Sofia Rossi', guestEmail: 'sofia.rossi@example.com', numGuests: 2 });
  const [pending, setPending] = useState(false);
  useEffect(() => { if (channels?.length && !f.channelId) setF((x) => ({ ...x, channelId: channels[0].id })); }, [channels, f.channelId]);
  const rooms = board?.rooms || [];
  const presetConflict = () => {
    const r = rooms.find((x) => x.next) || rooms.find((x) => x.current);
    const stay = r?.next || r?.current;
    if (!r) return toast.error('No booked room found to collide with');
    setF({ ...f, roomNumber: r.roomNumber, checkIn: stay.checkInDate, checkOut: addDays(stay.checkInDate, 2), guestName: 'Lucas García', guestEmail: `lucas.garcia${Date.now() % 1000}@example.com` });
    toast.message(`Room ${r.roomNumber} is already held by ${stay.guest} — this OTA booking will collide.`);
  };
  const presetClean = () => {
    const r = rooms.find((x) => !x.next && !x.current && x.status === 'AVAILABLE');
    setF({ ...f, roomNumber: r?.roomNumber || '101', checkIn: today(25), checkOut: today(27), guestName: 'Emma Wang', guestEmail: `emma.wang${Date.now() % 1000}@example.com` });
  };
  const submit = async () => {
    setPending(true);
    try {
      const { booking } = await api.post(`/channels/${f.channelId}/simulate`, { ...f, numGuests: Number(f.numGuests) });
      toast.success(`Guest booked on the OTA (${booking.externalRef}). Now run "Sync now".`);
      onCreated();
    } catch (e) { toast.error(e.message); } finally { setPending(false); }
  };
  return (
    <Card className="border-dashed border-violet-300 bg-violet-50/30">
      <CardHeader icon={Globe} title="OTA website simulator" subtitle="Acts as a guest booking on a partner platform (external system)." />
      <div className="mb-3 flex gap-2"><Button size="sm" variant="secondary" icon={Swords} onClick={presetConflict}>Preset: conflict</Button><Button size="sm" variant="secondary" icon={Wand2} onClick={presetClean}>Preset: clean booking</Button></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="OTA"><Select value={f.channelId} onChange={(e) => setF({ ...f, channelId: e.target.value })}>{(channels || []).map((c) => <option key={c.id} value={c.id}>{c.channelName}</option>)}</Select></Field>
        <Field label="Room number"><Select value={f.roomNumber} onChange={(e) => setF({ ...f, roomNumber: e.target.value })}><option value="">Choose…</option>{rooms.map((r) => <option key={r.id} value={r.roomNumber}>{r.roomNumber} · {r.roomType.typeName}</option>)}</Select></Field>
        <Field label="Check-in"><Input type="date" value={f.checkIn} onChange={(e) => setF({ ...f, checkIn: e.target.value })} /></Field>
        <Field label="Check-out"><Input type="date" value={f.checkOut} onChange={(e) => setF({ ...f, checkOut: e.target.value })} /></Field>
        <Field label="Guest name"><Input value={f.guestName} onChange={(e) => setF({ ...f, guestName: e.target.value })} /></Field>
        <Field label="Guest e-mail"><Input value={f.guestEmail} onChange={(e) => setF({ ...f, guestEmail: e.target.value })} /></Field>
      </div>
      <Button className="mt-4 w-full" onClick={submit} loading={pending} disabled={!f.roomNumber || !f.channelId}>Guest books on OTA</Button>
    </Card>
  );
}

export default function ChannelConflicts() {
  const { can } = useAuth();
  const { openTrace } = useViva();
  const [tab, setTab] = useState('conflicts');
  const channels = useApi('/channels', { poll: 30000 });
  const conflicts = useApi(`/channels/conflicts${tab === 'history' ? '?status=RESOLVED' : ''}`, { deps: [tab], poll: 20000 });
  const log = useApi('/channels/sync-log', { poll: 30000 });
  const platform = useApi('/channels/platform-bookings');
  const [syncing, setSyncing] = useState(false);
  const canResolve = can('channel.conflict.resolve');
  const openCount = useMemo(() => (channels.data?.channels || []).reduce((n, c) => n + c.openConflicts, 0), [channels.data]);

  const reloadAll = () => { channels.reload({ quiet: true }); conflicts.reload({ quiet: true }); log.reload({ quiet: true }); platform.reload({ quiet: true }); };
  const syncNow = async () => {
    setSyncing(true);
    try {
      const { summary } = await api.post('/channels/sync', {}, { label: 'OTA sync' });
      const t = summary.reduce((a, s) => ({ created: a.created + s.created, cancelled: a.cancelled + s.cancelled, conflicts: a.conflicts + s.conflicts, errors: a.errors + s.errors }), { created: 0, cancelled: 0, conflicts: 0, errors: 0 });
      toast[t.conflicts ? 'warning' : 'success'](`Sync complete — ${t.created} imported, ${t.cancelled} cancelled, ${t.conflicts} conflict${t.conflicts === 1 ? '' : 's'}${t.errors ? `, ${t.errors} channel error(s)` : ''}`);
      reloadAll();
    } catch (e) { toast.error(e.message); } finally { setSyncing(false); }
  };

  return (
    <div>
      <PageHeader eyebrow="Multi-channel booking synchronization" title="Channel manager" subtitle="Bookings from OTA partners are pulled automatically (≤ 30 s). Conflicting bookings are never double-booked — they wait here for a receptionist."
        actions={<><Button variant="secondary" icon={Workflow} onClick={() => openTrace()}>Live UML</Button><Button icon={RefreshCw} loading={syncing} onClick={syncNow}>Sync now</Button></>} />
      <TraceChips screen="conflicts" />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {(channels.data?.channels || []).map((c) => (
          <Card key={c.id} className="relative overflow-hidden">
            <div className="flex items-start justify-between">
              <div><div className="font-semibold">{c.channelName}</div><div className="font-mono text-[11px] text-ink-400">{c.apiEndpoint}</div></div>
              <StatusBadge status={c.status} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div><div className="font-display text-xl font-semibold tabular">{c.bookings}</div><div className="text-[11px] text-ink-500">bookings</div></div>
              <div><div className={clsx('font-display text-xl font-semibold tabular', c.openConflicts && 'text-red-600')}>{c.openConflicts}</div><div className="text-[11px] text-ink-500">conflicts</div></div>
              <div><div className="font-display text-xl font-semibold tabular">{c.commissionPercent}%</div><div className="text-[11px] text-ink-500">commission</div></div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-3 text-[12px] text-ink-500">
              <span>Last sync {c.lastSyncAt ? timeAgo(c.lastSyncAt) : 'never'}</span>
              <span>{c.listing ? `${c.listing.roomTypes.length} room types listed` : 'listing pending'}</span>
            </div>
            {c.lastError && c.status === 'ERROR' && <div className="mt-2 text-[12px] text-red-600">{c.lastError}</div>}
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div>
          <div className="mb-4"><Tabs value={tab} onChange={setTab} tabs={[{ value: 'conflicts', label: 'Open conflicts', count: openCount }, { value: 'history', label: 'Resolved' }, { value: 'log', label: 'Sync log' }, { value: 'platform', label: 'OTA-side bookings' }]} /></div>
          {tab === 'conflicts' && (conflicts.loading ? <LoadingBlock /> : conflicts.data?.conflicts.length ? (
            <div className="space-y-4">{conflicts.data.conflicts.map((c) => <ConflictCard key={c.id} c={c} canResolve={canResolve} onResolved={reloadAll} />)}</div>
          ) : <EmptyState icon={CheckCircle2} title="No open conflicts" message="Every OTA booking is reconciled with HRMS inventory." />)}
          {tab === 'history' && <Table rows={conflicts.data?.conflicts || []} columns={[
            { key: 'externalRef', header: 'OTA booking', render: (c) => <span className="font-mono text-[12px]">{c.channel} · {c.externalRef}</span> },
            { key: 'conflictType', header: 'Conflict', render: (c) => title(c.conflictType) },
            { key: 'resolution', header: 'Resolution', render: (c) => <Badge tone="green">{title(c.resolution)}</Badge> },
            { key: 'resolvedBy', header: 'By', render: (c) => <>{c.resolvedBy}<div className="text-[11px] text-ink-400">{c.resolutionNote}</div></> },
            { key: 'resolvedAt', header: 'When', render: (c) => fmtDateTime(c.resolvedAt) },
          ]} />}
          {tab === 'log' && <Table dense rows={log.data?.syncs || []} columns={[
            { key: 'lastSyncAt', header: 'Time', render: (s) => fmtDateTime(s.lastSyncAt) },
            { key: 'channel', header: 'Channel' },
            { key: 'syncType', header: 'Type', render: (s) => title(s.syncType) },
            { key: 'syncStatus', header: 'Status', render: (s) => <StatusBadge status={s.syncStatus} /> },
            { key: 'detail', header: 'Detail', render: (s) => <span className="text-[12px] text-ink-500">{s.errorMessage || s.details?.reason || s.details?.event || s.externalRef || ''}</span> },
          ]} />}
          {tab === 'platform' && (
            <>
              <Alert tone="blue" className="mb-3" icon={Globe}>This is the OTA platforms' own view of their bookings (the simulated external system) and what the hotel last told them.</Alert>
              <Table dense rows={platform.data?.bookings || []} columns={[
                { key: 'externalRef', header: 'OTA ref', render: (b) => <span className="font-mono text-[12px]">{b.externalRef}</span> },
                { key: 'channel', header: 'Channel' },
                { key: 'roomNumber', header: 'Room' },
                { key: 'guestName', header: 'Guest' },
                { key: 'dates', header: 'Stay', render: (b) => `${fmtDate(b.checkInDate, { weekday: false })} → ${fmtDate(b.checkOutDate, { weekday: false })}` },
                { key: 'status', header: 'OTA status', render: (b) => <Badge tone={b.status === 'CANCELLED' ? 'red' : 'violet'}>{b.status.toLowerCase()}</Badge> },
                { key: 'hrmsStatus', header: 'Hotel reply', render: (b) => b.pendingSync ? <Badge tone="amber">awaiting sync</Badge> : <Badge tone={b.hrmsStatus === 'CONFIRMED' ? 'green' : b.hrmsStatus === 'REJECTED' ? 'red' : 'amber'}>{(b.hrmsStatus || '—').toLowerCase().replace('_', ' ')}</Badge> },
              ]} />
            </>
          )}
        </div>
        <Simulator channels={channels.data?.channels} onCreated={() => platform.reload({ quiet: true })} />
      </div>
    </div>
  );
}
