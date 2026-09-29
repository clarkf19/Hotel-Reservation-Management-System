/** Guest home: upcoming stay, quick actions, loyalty snapshot, UD-2 guided walkthrough. */
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, BedDouble, CalendarDays, Crown, KeyRound, LogIn, MessageCircleHeart, Search, Sparkles, ConciergeBell, LogOut as LogOutIcon } from 'lucide-react';
import { Button, Card, Modal, StatusBadge, Skeleton } from '../../components/ui/index.js';
import { RoomImage } from '../../components/booking/RoomCard.jsx';
import { useApi } from '../../lib/hooks.js';
import { useAuth } from '../../lib/auth.jsx';
import { api } from '../../lib/api.js';
import { fmtDate, today, timeAgo } from '../../lib/format.js';

const WALKTHROUGH = [
  { icon: Search, title: 'Search & smart allocation', text: 'Tell us your dates — we rank every free room against your preferences and show why it fits.' },
  { icon: BedDouble, title: 'Book & pay securely', text: 'Your room is held while you pay; it is confirmed only after the payment is verified.' },
  { icon: KeyRound, title: 'Digital check-in', text: 'On arrival day, verify your ID in the app and your phone becomes your room key.' },
];

export default function GuestHome() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { data, loading } = useApi('/reservations');
  const { data: loyalty } = useApi('/me/loyalty');
  const { data: notes } = useApi('/notifications?channel=IN_APP');
  const { data: profile } = useApi('/me/profile');
  const [tour, setTour] = useState(false);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    if (location.state?.onboarding || (profile && !profile.profile.preferences?.onboardingDone)) setTour(true);
  }, [location.state, profile]);
  const finishTour = async () => {
    setTour(false);
    try { await api.put('/me/profile', { preferences: { ...(profile?.profile.preferences || {}), onboardingDone: true } }); } catch { /* optional */ }
  };

  const list = data?.reservations || [];
  const t = today();
  const current = list.find((r) => r.status === 'CHECKED_IN');
  const upcoming = current || list.filter((r) => r.status === 'CONFIRMED' && r.checkOutDate > t).sort((a, b) => a.checkInDate.localeCompare(b.checkInDate))[0];
  const draft = list.find((r) => r.status === 'DRAFT' || r.status === 'PENDING_PAYMENT');
  const canCheckIn = upcoming?.status === 'CONFIRMED' && upcoming.checkInDate <= t;
  const canCheckOut = upcoming?.status === 'CHECKED_IN';
  const daysAway = upcoming ? Math.round((new Date(`${upcoming.checkInDate}T00:00:00Z`) - new Date(`${t}T00:00:00Z`)) / 86400000) : null;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brass-600">Welcome back</div>
        <h1 className="font-display text-4xl font-semibold">Hello, {user.name.split(' ')[0]}.</h1>
      </div>

      {loading ? <Skeleton className="h-64 rounded-2xl" /> : upcoming ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-3xl bg-ink-900 text-white shadow-[var(--shadow-lift)]">
          <div className="grid md:grid-cols-[1.1fr_1fr]">
            <div className="relative z-10 p-7 md:p-9">
              <div className="flex items-center gap-2"><StatusBadge status={upcoming.status} /><span className="font-mono text-[12px] text-ink-300">{upcoming.reference}</span></div>
              <h2 className="mt-4 font-display text-3xl font-semibold md:text-4xl">{current ? `You're staying in room ${current.room.roomNumber}` : daysAway === 0 ? 'Your stay starts today' : `Your stay starts in ${daysAway} day${daysAway === 1 ? '' : 's'}`}</h2>
              <p className="mt-2 text-ink-300">{upcoming.room.roomType.typeName} · {fmtDate(upcoming.checkInDate)} → {fmtDate(upcoming.checkOutDate)} · {upcoming.numGuests} guest(s)</p>
              <div className="mt-6 flex flex-wrap gap-2">
                {canCheckIn && <Button variant="brass" icon={LogIn} onClick={() => navigate(`/guest/reservations/${upcoming.id}/check-in`)}>Check in online</Button>}
                {current && <Button variant="brass" icon={KeyRound} onClick={() => navigate('/guest/key')}>Open digital key</Button>}
                {canCheckOut && <Button variant="secondary" icon={LogOutIcon} onClick={() => navigate(`/guest/reservations/${upcoming.id}/check-out`)}>Express check-out</Button>}
                <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => navigate(`/guest/reservations/${upcoming.id}`)}>Details <ArrowRight className="size-4" /></Button>
              </div>
              {!canCheckIn && !current && <p className="mt-4 text-[13px] text-ink-400">Online check-in opens on {fmtDate(upcoming.checkInDate)} from 14:00.</p>}
            </div>
            <RoomImage src={upcoming.room.roomType.imageUrl} alt="" className="min-h-56 opacity-90" />
          </div>
        </motion.div>
      ) : (
        <Card className="flex flex-col items-start justify-between gap-4 bg-gradient-to-r from-ink-900 to-ink-800 text-white md:flex-row md:items-center">
          <div><h2 className="font-display text-2xl font-semibold">Plan your next escape</h2><p className="mt-1 text-ink-300">You have no upcoming stays. Our smart allocation will find your perfect room.</p></div>
          <Button variant="brass" icon={Search} onClick={() => navigate('/guest/search')}>Book a stay</Button>
        </Card>
      )}

      {draft && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50">
          <div className="text-sm"><b>You have an unfinished booking</b> — room {draft.room.roomNumber}, {fmtDate(draft.checkInDate)} → {fmtDate(draft.checkOutDate)}. It was saved so you can finish paying.</div>
          <Button size="sm" onClick={() => navigate(`/guest/book?reservationId=${draft.id}`)}>Resume booking</Button>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { to: '/guest/search', icon: Search, title: 'Book a stay', text: 'Smart room recommendations' },
          { to: '/guest/concierge', icon: MessageCircleHeart, title: 'AI Concierge', text: 'Ask anything, 24/7' },
          { to: '/guest/requests', icon: ConciergeBell, title: 'Service requests', text: 'Towels, transfers, spa…' },
          { to: '/guest/reservations', icon: CalendarDays, title: 'My reservations', text: `${list.filter((r) => r.status !== 'CANCELLED').length} stays on record` },
        ].map((a) => (
          <Link key={a.to} to={a.to} className="group rounded-2xl border border-ink-200/70 bg-white p-5 shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:border-brass-300">
            <span className="grid size-10 place-items-center rounded-xl bg-brass-50 text-brass-600 transition group-hover:bg-brass-400 group-hover:text-ink-950"><a.icon className="size-5" /></span>
            <div className="mt-3 font-semibold">{a.title}</div>
            <div className="text-[13px] text-ink-500">{a.text}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card className="bg-gradient-to-br from-brass-50 to-white">
          <div className="flex items-center justify-between"><span className="inline-flex items-center gap-2 text-sm font-semibold text-brass-700"><Crown className="size-4" />{loyalty?.tier ?? '…'} member</span><Link to="/guest/loyalty" className="text-[13px] font-medium text-ink-600 hover:underline">View</Link></div>
          <div className="mt-3 font-display text-4xl font-semibold tabular">{loyalty ? loyalty.balance.toLocaleString('en-IN') : '—'}<span className="ml-1 text-base font-normal text-ink-500">points</span></div>
          {loyalty?.nextTier && (
            <>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-brass-500" style={{ width: `${Math.min(100, (loyalty.lifetimePoints / loyalty.nextTier.minLifetimePoints) * 100)}%` }} /></div>
              <p className="mt-2 text-[12.5px] text-ink-500">{loyalty.nextTier.pointsNeeded.toLocaleString('en-IN')} points to {loyalty.nextTier.name}</p>
            </>
          )}
        </Card>
        <Card>
          <h3 className="mb-3 font-semibold">Recent updates</h3>
          <ul className="divide-y divide-ink-100">
            {(notes?.notifications || []).slice(0, 4).map((n) => (
              <li key={n.id} className="py-2.5"><div className="flex justify-between gap-2 text-[13px]"><span className="font-medium">{n.subject}</span><span className="shrink-0 text-ink-400">{timeAgo(n.createdAt)}</span></div><p className="text-[12.5px] text-ink-500">{n.body}</p></li>
            ))}
            {!notes?.notifications?.length && <li className="py-6 text-center text-sm text-ink-500">No updates yet.</li>}
          </ul>
        </Card>
      </div>

      <Modal open={tour} onClose={finishTour} title="Welcome to Solstice Bay" subtitle={`Step ${slide + 1} of ${WALKTHROUGH.length} · a quick tour`} size="sm"
        footer={<><Button variant="ghost" onClick={finishTour}>Skip</Button>{slide < WALKTHROUGH.length - 1 ? <Button onClick={() => setSlide(slide + 1)}>Next</Button> : <Button variant="brass" icon={Sparkles} onClick={() => { finishTour(); navigate('/guest/search'); }}>Find a room</Button>}</>}>
        {(() => { const s = WALKTHROUGH[slide]; return (
          <div className="py-4 text-center">
            <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-brass-50 text-brass-600"><s.icon className="size-8" /></span>
            <h3 className="mt-4 font-display text-2xl font-semibold">{s.title}</h3>
            <p className="mt-2 text-ink-600">{s.text}</p>
            <div className="mt-5 flex justify-center gap-1.5">{WALKTHROUGH.map((_, i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === slide ? 'w-6 bg-ink-900' : 'w-1.5 bg-ink-300'}`} />)}</div>
          </div>
        ); })()}
      </Modal>
    </div>
  );
}
