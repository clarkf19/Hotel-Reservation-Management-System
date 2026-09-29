/** Reservation management (Receptionist / Hotel Manager) — UC-1 on behalf of guests; Activity "Manage Reservations (View / Modify)". */
import { useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarPlus, Search } from 'lucide-react';
import { Button, ErrorState, Input, LoadingBlock, PageHeader, Select, StatusBadge, Table, Badge } from '../../components/ui/index.js';
import { TraceChips } from '../../components/viva/TraceChips.jsx';
import { useApi } from '../../lib/hooks.js';
import { qs } from '../../lib/api.js';
import { fmtDate, inr, title } from '../../lib/format.js';

export default function Reservations() {
  const navigate = useNavigate();
  const base = useLocation().pathname.split('/')[1];
  const [params] = useSearchParams();
  const [filters, setFilters] = useState({ search: params.get('search') || '', status: params.get('search') ? '' : 'CONFIRMED,CHECKED_IN,PENDING_PAYMENT', source: '' });
  const [applied, setApplied] = useState(filters);
  const { data, error, loading, reload } = useApi(`/reservations${qs({ ...applied, limit: 300 })}`, { deps: [applied] });
  return (
    <div>
      <PageHeader eyebrow="Reservation management" title="Reservations" actions={<Button icon={CalendarPlus} onClick={() => navigate(`/${base}/search`)}>New reservation</Button>} />
      <TraceChips screen="frontdesk" />
      <form onSubmit={(e) => { e.preventDefault(); setApplied(filters); }} className="mb-5 grid gap-3 md:grid-cols-[1fr_220px_180px_auto]">
        <Input icon={Search} placeholder="Guest name, e-mail, guest ID, room, HRMS number or OTA ref" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
        <Select value={filters.status} onChange={(e) => { const f = { ...filters, status: e.target.value }; setFilters(f); setApplied(f); }}>
          <option value="CONFIRMED,CHECKED_IN,PENDING_PAYMENT">Active</option><option value="CONFIRMED">Confirmed</option><option value="CHECKED_IN">In house</option><option value="CHECKED_OUT">Checked out</option><option value="CANCELLED">Cancelled</option><option value="DRAFT,PENDING_PAYMENT">Drafts / pending</option><option value="">All statuses</option>
        </Select>
        <Select value={filters.source} onChange={(e) => { const f = { ...filters, source: e.target.value }; setFilters(f); setApplied(f); }}>
          <option value="">All channels</option>{['DIRECT', 'RECEPTIONIST', 'AI_CONCIERGE', 'OTA'].map((s) => <option key={s} value={s}>{title(s)}</option>)}
        </Select>
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <LoadingBlock /> : (
        <>
          <p className="mb-2 text-[13px] text-ink-500">{data.reservations.length} reservations</p>
          <Table rows={data.reservations} onRowClick={(r) => navigate(`/${base}/reservations/${r.id}`)} columns={[
            { key: 'reference', header: 'Reservation', render: (r) => <span className="font-mono text-[12px]">{r.reference || `#${r.id}`}</span> },
            { key: 'guest', header: 'Guest', render: (r) => <div><div className="font-medium">{r.guest.name}</div><div className="text-[11.5px] text-ink-500">{r.guest.guestId}</div></div> },
            { key: 'room', header: 'Room', render: (r) => <><b>{r.room.roomNumber}</b> <span className="text-ink-500">{r.room.roomType.typeName}</span></> },
            { key: 'dates', header: 'Stay', render: (r) => `${fmtDate(r.checkInDate)} → ${fmtDate(r.checkOutDate)}` },
            { key: 'source', header: 'Channel', render: (r) => r.otaChannel ? <Badge tone="violet">{r.otaChannel.channelName}</Badge> : <Badge>{title(r.source)}</Badge> },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'total', header: 'Total', align: 'right', render: (r) => inr(r.totalAmount) },
          ]} />
        </>
      )}
    </div>
  );
}
