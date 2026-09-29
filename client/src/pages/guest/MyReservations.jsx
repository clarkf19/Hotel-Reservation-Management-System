import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, Search } from 'lucide-react';
import { Button, EmptyState, ErrorState, LoadingBlock, PageHeader, Tabs } from '../../components/ui/index.js';
import { ReservationCard } from '../../components/booking/ReservationCard.jsx';
import { TraceChips } from '../../components/viva/TraceChips.jsx';
import { useApi } from '../../lib/hooks.js';
import { today } from '../../lib/format.js';

export default function MyReservations() {
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApi('/reservations');
  const [tab, setTab] = useState('upcoming');
  const t = today();
  const groups = useMemo(() => {
    const all = data?.reservations || [];
    return {
      upcoming: all.filter((r) => ['CONFIRMED', 'CHECKED_IN', 'PENDING_PAYMENT', 'DRAFT'].includes(r.status) && r.checkOutDate >= t).sort((a, b) => a.checkInDate.localeCompare(b.checkInDate)),
      past: all.filter((r) => r.status === 'CHECKED_OUT'),
      cancelled: all.filter((r) => r.status === 'CANCELLED'),
    };
  }, [data, t]);
  const list = groups[tab];
  return (
    <div>
      <PageHeader eyebrow="Reservations" title="My reservations" actions={<Button icon={Search} onClick={() => navigate('/guest/search')}>New booking</Button>} />
      <TraceChips screen="reservations" />
      <div className="mb-5"><Tabs value={tab} onChange={setTab} tabs={[{ value: 'upcoming', label: 'Upcoming', count: groups.upcoming.length }, { value: 'past', label: 'Past stays', count: groups.past.length }, { value: 'cancelled', label: 'Cancelled', count: groups.cancelled.length }]} /></div>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <LoadingBlock /> : list.length === 0 ? (
        <EmptyState icon={CalendarCheck} title={`No ${tab} reservations`} action={tab === 'upcoming' && <Button onClick={() => navigate('/guest/search')}>Find a room</Button>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">{list.map((r) => <ReservationCard key={r.id} r={r} to={r.status === 'DRAFT' || r.status === 'PENDING_PAYMENT' ? `/guest/book?reservationId=${r.id}` : `/guest/reservations/${r.id}`} />)}</div>
      )}
    </div>
  );
}
