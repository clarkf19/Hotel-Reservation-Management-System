/** Front desk "Today" — arrivals, departures, in-house guests, OTA conflicts and escalations (Receptionist). */
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, BedDouble, CalendarPlus, ConciergeBell, DoorOpen, LogIn, LogOut, Network, Users } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, PageHeader, StatCard, StatusBadge, Badge } from '../../components/ui/index.js';
import { TraceChips } from '../../components/viva/TraceChips.jsx';
import { useApi } from '../../lib/hooks.js';
import { fmtDate, today, timeAgo } from '../../lib/format.js';

function GuestRow({ r, action }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-ink-900 font-display text-sm font-semibold text-brass-300">{r.room.roomNumber}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{r.guest.name}</div>
        <div className="truncate text-[12px] text-ink-500">{r.reference} · {r.room.roomType.typeName} · {r.numGuests} guest(s){r.otaChannel ? ` · ${r.otaChannel.channelName}` : ''}</div>
      </div>
      <StatusBadge status={r.status} />
      {action}
    </li>
  );
}

export default function FrontDeskHome() {
  const navigate = useNavigate();
  const t = today();
  const arrivals = useApi(`/reservations?arrivingOn=${t}&status=CONFIRMED,CHECKED_IN`, { poll: 30000 });
  const departures = useApi(`/reservations?departingOn=${t}&status=CHECKED_IN,CHECKED_OUT`, { poll: 30000 });
  const inHouse = useApi('/reservations?status=CHECKED_IN', { poll: 30000 });
  const conflicts = useApi('/channels/conflicts', { poll: 30000 });
  const requests = useApi('/service-requests?status=OPEN,IN_PROGRESS', { poll: 20000 });
  const a = arrivals.data?.reservations || [];
  const d = departures.data?.reservations || [];
  const c = conflicts.data?.conflicts || [];
  const s = requests.data?.requests || [];

  return (
    <div>
      <PageHeader eyebrow={fmtDate(t, { year: true })} title="Front desk" subtitle="Everything that needs your attention today." actions={<Button icon={CalendarPlus} onClick={() => navigate('/front-desk/search')}>New reservation</Button>} />
      <TraceChips screen="frontdesk" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Arrivals today" value={a.length} sub={`${a.filter((x) => x.status === 'CHECKED_IN').length} checked in`} icon={LogIn} tone="blue" />
        <StatCard label="Departures today" value={d.length} sub={`${d.filter((x) => x.status === 'CHECKED_OUT').length} checked out`} icon={LogOut} tone="brass" />
        <StatCard label="In-house guests" value={(inHouse.data?.reservations || []).reduce((n, r) => n + r.numGuests, 0)} sub={`${inHouse.data?.reservations?.length ?? 0} rooms`} icon={Users} tone="green" />
        <StatCard label="OTA conflicts" value={c.length} sub="need manual reconciliation" icon={Network} tone={c.length ? 'red' : 'green'} />
        <StatCard label="Open requests" value={s.length} sub={`${s.filter((x) => x.isEscalation).length} escalated from AI`} icon={ConciergeBell} tone="amber" />
      </div>

      {c.length > 0 && (
        <Card className="mb-6 border-red-200 bg-gradient-to-r from-red-50 to-white">
          <div className="flex flex-wrap items-center gap-3">
            <AlertTriangle className="size-5 text-red-600" />
            <div className="flex-1 text-sm"><b>{c.length} OTA booking conflict{c.length > 1 ? 's' : ''}</b> — {c[0].message}</div>
            <Button size="sm" variant="danger" onClick={() => navigate('/front-desk/channels')}>Resolve</Button>
          </div>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader icon={LogIn} title="Arrivals" subtitle="Assist Guest Check-in" />
          {a.length ? <ul className="divide-y divide-ink-100">{a.map((r) => <GuestRow key={r.id} r={r} action={r.status === 'CONFIRMED' && <Button size="sm" onClick={() => navigate(`/front-desk/reservations/${r.id}`)}>Check in</Button>} />)}</ul> : <EmptyState icon={DoorOpen} title="No arrivals left today" />}
        </Card>
        <Card>
          <CardHeader icon={LogOut} title="Departures" subtitle="Assist Guest Check-out" />
          {d.length ? <ul className="divide-y divide-ink-100">{d.map((r) => <GuestRow key={r.id} r={r} action={r.status === 'CHECKED_IN' && <Button size="sm" variant="secondary" onClick={() => navigate(`/front-desk/reservations/${r.id}/check-out`)}>Check out</Button>} />)}</ul> : <EmptyState icon={BedDouble} title="No departures today" />}
        </Card>
        <Card>
          <CardHeader icon={ConciergeBell} title="Service desk" subtitle="Requests & escalated AI queries" action={<Link to="/front-desk/requests" className="text-[13px] font-medium text-brass-700 hover:underline">All</Link>} />
          {s.length ? (
            <ul className="divide-y divide-ink-100">
              {s.slice(0, 7).map((x) => (
                <li key={x.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{x.label}{x.reservation?.roomNumber && ` · ${x.reservation.roomNumber}`}</span>{x.isEscalation ? <Badge tone="amber">AI escalation</Badge> : <StatusBadge status={x.status} />}</div>
                  <div className="truncate text-[12px] text-ink-500">{x.guest?.name} · {x.description} · {timeAgo(x.createdAt)}</div>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={ConciergeBell} title="All requests handled" />}
        </Card>
      </div>
    </div>
  );
}
