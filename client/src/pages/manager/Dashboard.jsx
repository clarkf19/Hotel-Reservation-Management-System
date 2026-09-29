/**
 * Operational dashboard — HotelManager.viewDashboard(); SRS 4.7 Dashboard.Occupancy / .Revenue / .Cancellations,
 * 4.7.2 booking-trend widgets. Activity (Hotel Manager lane): View Operational Dashboard -> View Occupancy ->
 * View Booking Trends -> View Revenue Summary -> View Cancellation Statistics. All numbers come from the database.
 */
import { BedDouble, CalendarX2, ConciergeBell, IndianRupee, LogIn, LogOut, Network, Percent, TrendingUp, RefreshCw } from 'lucide-react';
import { Button, Card, CardHeader, ErrorState, LoadingBlock, PageHeader, StatCard, StatusBadge } from '../../components/ui/index.js';
import { BookingTrend, CategoryBars, DailyBars, HorizontalBars, OccupancyTrend } from '../../components/charts/Charts.jsx';
import { TraceChips } from '../../components/viva/TraceChips.jsx';
import { useApi } from '../../lib/hooks.js';
import { fmtDate, fmtDateTime, inr, today } from '../../lib/format.js';

export default function Dashboard() {
  const { data, error, loading, reload } = useApi('/dashboard', { poll: 60000 });
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !data) return <LoadingBlock rows={6} />;
  const k = data.kpis;
  return (
    <div>
      <PageHeader eyebrow={`${data.hotelName} · ${fmtDate(today(), { year: true })}`} title="Operations dashboard" subtitle={`Live figures computed from reservations, payments and rooms · updated ${fmtDateTime(data.generatedAt)}`} actions={<Button variant="secondary" icon={RefreshCw} onClick={() => reload()}>Refresh</Button>} />
      <TraceChips screen="dashboard" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Occupancy today" value={`${k.occupancyToday}%`} sub={`${k.roomsOccupied} of ${k.sellableRooms} sellable rooms`} icon={Percent} tone="ink" />
        <StatCard label="Revenue · last 30 days" value={inr(k.revenue30)} sub="captured payments, net of refunds" icon={IndianRupee} tone="green" />
        <StatCard label="ADR · RevPAR" value={inr(k.adr)} sub={`RevPAR ${inr(k.revpar)} (30 days)`} icon={TrendingUp} tone="blue" />
        <StatCard label="Cancellation rate" value={`${k.cancellationRate30}%`} sub={`${k.cancellations30} of ${k.bookings30} bookings (30 days)`} icon={CalendarX2} tone="amber" />
        <StatCard label="Arrivals today" value={k.arrivals} sub={`${k.arrivalsDone} checked in`} icon={LogIn} tone="blue" />
        <StatCard label="Departures today" value={k.departures} sub={`${k.departuresDone} checked out`} icon={LogOut} tone="brass" />
        <StatCard label="In-house guests" value={k.inHouseGuests} icon={BedDouble} tone="green" />
        <StatCard label="Open issues" value={k.openConflicts + k.openRequests} sub={`${k.openConflicts} OTA conflicts · ${k.openRequests} requests`} icon={k.openConflicts ? Network : ConciergeBell} tone={k.openConflicts ? 'red' : 'amber'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Occupancy" subtitle="Last 30 days and 14 days on the books (Dashboard.Occupancy)" />
          <OccupancyTrend data={data.occupancyTrend} todayKey={today()} />
        </Card>
        <Card>
          <CardHeader title="Occupancy by category · today" subtitle="Rooms occupied ÷ rooms in category" />
          <CategoryBars data={data.occupancyByCategory.map((c) => ({ ...c, short: c.category.replace('Presidential', 'Pres.') }))} dataKey="occupancy" nameKey="short" format={(v) => `${Math.round(v)}%`} />
        </Card>
        <Card>
          <CardHeader title="Revenue per day" subtitle="Net captured payments, last 30 days (Dashboard.Revenue)" />
          <DailyBars data={data.revenueTrend} dataKey="revenue" name="Revenue" format={(v) => inr(v)} />
        </Card>
        <Card>
          <CardHeader title="Revenue by booking channel" subtitle="Last 30 days — direct, front desk, AI concierge and each OTA" />
          <HorizontalBars data={data.revenueByChannel} dataKey="revenue" nameKey="channel" format={(v) => inr(v)} />
        </Card>
        <Card>
          <CardHeader title="Booking trends" subtitle="New bookings vs cancellations by booking date (Dashboard.Cancellations)" />
          <BookingTrend data={data.bookingTrend} />
        </Card>
        <Card>
          <CardHeader title="Room status now" subtitle="Room inventory (D2)" />
          <ul className="space-y-2.5">
            {data.roomStatus.sort((a, b) => b.count - a.count).map((s) => (
              <li key={s.status} className="flex items-center gap-3">
                <StatusBadge status={s.status} className="w-32 justify-center" />
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-ink-700" style={{ width: `${(s.count / k.totalRooms) * 100}%` }} /></div>
                <span className="w-8 text-right text-sm font-semibold tabular">{s.count}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
