/**
 * Book a stay — Reservation.Search, .Search.Filter, .Allocate.Smart.
 * Activity: Search Available Rooms -> Check Room Availability -> <Rooms Available?> ->
 *   No: Suggest Alternative Dates / Categories | Yes: Perform Smart Room Allocation -> Select Room
 */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarSearch, Filter, Search, SearchX, Sparkles } from 'lucide-react';
import { Alert, Button, Card, EmptyState, ErrorState, Field, Input, LoadingBlock, PageHeader, Select, Toggle } from '../../components/ui/index.js';
import { RoomCard } from '../../components/booking/RoomCard.jsx';
import { TraceChips } from '../../components/viva/TraceChips.jsx';
import { api, qs } from '../../lib/api.js';
import { addDays, fmtDate, today, title } from '../../lib/format.js';

export default function SearchRooms() {
  const basePath = `/${useLocation().pathname.split('/')[1]}`;
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    checkIn: params.get('checkIn') || today(),
    checkOut: params.get('checkOut') || today(2),
    guests: Number(params.get('guests') || 2),
    category: params.get('category') || '',
    maxPrice: params.get('maxPrice') || '',
    accessible: params.get('accessible') === 'true',
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const search = async (f = form) => {
    setLoading(true);
    setError(null);
    try {
      const q = { checkIn: f.checkIn, checkOut: f.checkOut, guests: f.guests, category: f.category, maxPrice: f.maxPrice, accessible: f.accessible ? 'true' : undefined };
      setParams(Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined && v !== '')), { replace: true });
      setResult(await api.get(`/rooms/search${qs(q)}`, { label: 'Search rooms' }));
    } catch (e) { setError(e); } finally { setLoading(false); }
  };
  useEffect(() => { search(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const select = (room) => navigate(`${basePath}/book${qs({ roomId: room.id, checkIn: result.checkIn, checkOut: result.checkOut, guests: result.guests })}`);
  const tryDates = (alt) => { const f = { ...form, checkIn: alt.checkIn, checkOut: alt.checkOut }; setForm(f); search(f); };

  return (
    <div>
      <PageHeader eyebrow="Reservations" title="Find your room" subtitle="Rooms are ranked by our smart allocation using your saved preferences, party size and accessibility needs." />
      <TraceChips screen="search" />
      <Card className="mb-6">
        <form onSubmit={(e) => { e.preventDefault(); search(); }} className="grid gap-3 md:grid-cols-[1fr_1fr_120px_160px_150px_auto] md:items-end">
          <Field label="Check-in"><Input type="date" min={today()} value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value, checkOut: e.target.value >= form.checkOut ? addDays(e.target.value, 1) : form.checkOut })} /></Field>
          <Field label="Check-out"><Input type="date" min={addDays(form.checkIn, 1)} value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} /></Field>
          <Field label="Guests"><Select value={form.guests} onChange={(e) => setForm({ ...form, guests: Number(e.target.value) })}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
          <Field label="Category"><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option value="">Any</option>{['STANDARD', 'DELUXE', 'SUITE', 'ACCESSIBLE'].map((c) => <option key={c} value={c}>{title(c)}</option>)}</Select></Field>
          <Field label="Max price / night"><Input type="number" min={0} step={500} placeholder="No limit" value={form.maxPrice} onChange={(e) => setForm({ ...form, maxPrice: e.target.value })} /></Field>
          <Button type="submit" icon={Search} loading={loading} className="md:mb-0">Search</Button>
        </form>
        <div className="mt-3 flex items-center gap-4 border-t border-ink-100 pt-3">
          <Filter className="size-4 text-ink-400" />
          <Toggle checked={form.accessible} onChange={(v) => setForm({ ...form, accessible: v })} label="Accessible rooms only" />
        </div>
      </Card>

      {error && <ErrorState error={error} onRetry={() => search()} />}
      {loading && !result && <LoadingBlock rows={3} />}
      {result && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink-600"><b className="text-ink-900">{result.rooms.length}</b> room{result.rooms.length === 1 ? '' : 's'} available · {fmtDate(result.checkIn)} → {fmtDate(result.checkOut)} · {result.nights} night{result.nights > 1 ? 's' : ''} · {result.guests} guest{result.guests > 1 ? 's' : ''}</p>
            {result.usedPreferences && <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brass-700"><Sparkles className="size-3.5" />Personalised with your saved preferences</span>}
          </div>
          {result.rooms.length === 0 ? (
            <div className="space-y-4">
              <EmptyState icon={SearchX} title="No rooms available for those dates" message="Rooms Available? — No. Here are the closest alternatives we found." />
              {result.alternatives && (
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <h3 className="mb-3 flex items-center gap-2 font-semibold"><CalendarSearch className="size-4 text-brass-600" />Alternative dates</h3>
                    {result.alternatives.dates.length ? result.alternatives.dates.map((a) => (
                      <button key={a.checkIn} onClick={() => tryDates(a)} className="mb-2 flex w-full items-center justify-between rounded-lg border border-ink-200 px-3 py-2 text-sm hover:border-brass-400 hover:bg-brass-50">
                        <span>{fmtDate(a.checkIn)} → {fmtDate(a.checkOut)}</span><span className="text-emerald-700">{a.availableRooms} rooms</span>
                      </button>
                    )) : <p className="text-sm text-ink-500">No nearby dates have availability.</p>}
                  </Card>
                  <Card>
                    <h3 className="mb-3 font-semibold">Other categories on your dates</h3>
                    {result.alternatives.categories.length ? result.alternatives.categories.map((c) => (
                      <button key={c.category} onClick={() => { const f = { ...form, category: c.category }; setForm(f); search(f); }} className="mb-2 flex w-full items-center justify-between rounded-lg border border-ink-200 px-3 py-2 text-sm hover:border-brass-400 hover:bg-brass-50">
                        <span>{title(c.category)}</span><span className="text-emerald-700">{c.availableRooms} rooms</span>
                      </button>
                    )) : <p className="text-sm text-ink-500">No other categories are free either.</p>}
                  </Card>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {!result.usedPreferences && <Alert tone="brass" icon={Sparkles}>Save your room preferences in your profile to get personalised recommendations.</Alert>}
              {result.rooms.map((r, i) => <RoomCard key={r.id} room={r} index={i} best={r.id === result.recommendedRoomId} onSelect={select} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
