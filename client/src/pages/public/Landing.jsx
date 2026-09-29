/**
 * Public landing page. SE-2: publicly available room and rate information can be browsed
 * without logging in; booking requires sign-in.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, BedDouble, Bot, CalendarRange, KeyRound, LineChart, Network, ShieldCheck, Users, Crown, Search } from 'lucide-react';
import { Logo } from '../../components/layout/Logo.jsx';
import { Button, Field, Input, Select } from '../../components/ui/index.js';
import { useApi } from '../../lib/hooks.js';
import { inr, today, addDays } from '../../lib/format.js';

const HERO = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=2000&q=80';

const FEATURES = [
  { icon: CalendarRange, title: 'Reservation & smart allocation', text: 'Real-time availability, best-fit room ranking and guaranteed no double booking.' },
  { icon: ShieldCheck, title: 'Role-based access', text: 'Five roles, each with its own permission-scoped workspace.' },
  { icon: Network, title: 'Multi-channel sync', text: 'Inventory and rates stay consistent across OTA partners within 60 seconds.' },
  { icon: Bot, title: 'AI virtual concierge', text: 'Answers questions, books rooms and files requests — escalating to staff when needed.' },
  { icon: Crown, title: 'Preferences & loyalty', text: 'Profiles that shape recommendations and rewards that grow with every stay.' },
  { icon: KeyRound, title: 'Digital check-in & key', text: 'Skip the desk: verify identity, receive a QR/NFC key and pay contactlessly.' },
  { icon: LineChart, title: 'Analytics dashboard', text: 'Occupancy, revenue by channel and cancellations, live from the database.' },
];

export default function Landing() {
  const navigate = useNavigate();
  const { data } = useApi('/rooms/types');
  const { data: info } = useApi('/public/info');
  const [form, setForm] = useState({ checkIn: today(1), checkOut: today(3), guests: 2 });

  const go = (e) => {
    e.preventDefault();
    navigate(`/login`, { state: { from: `/guest/search?checkIn=${form.checkIn}&checkOut=${form.checkOut}&guests=${form.guests}` } });
  };

  return (
    <div className="min-h-full bg-paper">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8">
          <Logo dark />
          <div className="flex items-center gap-2">
            <Link to="/login" className="rounded-lg px-4 py-2 text-sm font-medium text-white/90 hover:text-white">Sign in</Link>
            <Link to="/register"><Button variant="brass" size="sm">Create account</Button></Link>
          </div>
        </div>
      </header>

      <section className="relative isolate overflow-hidden bg-ink-950">
        <img src={HERO} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-45" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-ink-950/70 via-ink-950/40 to-ink-950" />
        <div className="mx-auto max-w-7xl px-5 pb-20 pt-36 md:px-8 md:pb-28 md:pt-44">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brass-400/40 bg-brass-400/10 px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.16em] text-brass-300">Hotel Reservation Management System</div>
            <h1 className="font-display text-5xl leading-[1.05] font-semibold text-white md:text-7xl">Your stay, <em className="text-brass-300 not-italic">beautifully</em> handled.</h1>
            <p className="mt-6 max-w-xl text-lg text-ink-200">Book in seconds, check in from your phone, open your door with a digital key and let our AI concierge take care of the rest.</p>
          </motion.div>

          <motion.form onSubmit={go} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6 }}
            className="mt-10 grid gap-3 rounded-2xl bg-white/95 p-4 shadow-2xl backdrop-blur md:grid-cols-[1fr_1fr_140px_auto] md:items-end md:p-5">
            <Field label="Check-in"><Input type="date" min={today()} value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value, checkOut: e.target.value >= form.checkOut ? addDays(e.target.value, 1) : form.checkOut })} /></Field>
            <Field label="Check-out"><Input type="date" min={addDays(form.checkIn, 1)} value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} /></Field>
            <Field label="Guests"><Select value={form.guests} onChange={(e) => setForm({ ...form, guests: e.target.value })}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} guest{n > 1 ? 's' : ''}</option>)}</Select></Field>
            <Button size="lg" icon={Search} type="submit">Check availability</Button>
          </motion.form>
          <p className="mt-3 text-[13px] text-ink-300">Check-in from {info?.checkInTime ?? '14:00'} · Check-out by {info?.checkOutTime ?? '11:00'} · Free cancellation up to {info?.freeCancellationHours ?? 48} hours before arrival</p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 md:px-8">
        <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brass-600">Rooms & rates</div>
            <h2 className="mt-2 font-display text-4xl font-semibold">Find the room that fits you</h2>
          </div>
          <p className="max-w-md text-ink-500">Prices per night before tax. Our smart allocation ranks every available room against your preferences when you search.</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {(data?.roomTypes || Array.from({ length: 6 })).map((t, i) => t ? (
            <motion.article key={t.id} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
              className="group overflow-hidden rounded-2xl border border-ink-200/70 bg-white shadow-[var(--shadow-soft)] transition hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]">
              <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-ink-700 to-ink-900">
                {t.imageUrl && <img src={t.imageUrl} alt={t.typeName} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-800">{t.category.toLowerCase()}</span>
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-xl font-semibold">{t.typeName}</h3>
                  <div className="text-right"><div className="font-semibold tabular">{inr(t.baseRate)}</div><div className="text-[11px] text-ink-500">per night</div></div>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-ink-500">{t.description}</p>
                <div className="mt-4 flex items-center gap-4 text-[12.5px] text-ink-600">
                  <span className="inline-flex items-center gap-1"><Users className="size-3.5" />Up to {t.maxOccupancy}</span>
                  <span className="inline-flex items-center gap-1"><BedDouble className="size-3.5" />{t.bedType}</span>
                  {t.sizeSqm && <span>{t.sizeSqm} m²</span>}
                </div>
              </div>
            </motion.article>
          ) : <div key={i} className="skeleton h-80 rounded-2xl" />)}
        </div>
      </section>

      <section className="bg-ink-900 grain">
        <div className="mx-auto max-w-7xl px-5 py-20 md:px-8">
          <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brass-400">Release 1.0 capabilities</div>
          <h2 className="mt-2 max-w-2xl font-display text-4xl font-semibold text-white">Seven core capabilities in one role-aware workspace</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
                <span className="grid size-10 place-items-center rounded-lg bg-brass-400/15 text-brass-300"><f.icon className="size-5" /></span>
                <h3 className="mt-4 font-semibold text-white">{f.title}</h3>
                <p className="mt-1.5 text-sm text-ink-300">{f.text}</p>
              </div>
            ))}
            <Link to="/login" className="group flex flex-col justify-between rounded-xl bg-brass-400 p-5 text-ink-950">
              <span className="font-display text-2xl font-semibold">Try the live demo</span>
              <span className="mt-6 inline-flex items-center gap-2 font-semibold">One-click demo accounts for every role <ArrowRight className="size-4 transition group-hover:translate-x-1" /></span>
            </Link>
          </div>
        </div>
      </section>
      <footer className="border-t border-ink-200 bg-paper">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-2 px-5 py-8 text-[13px] text-ink-500 md:flex-row md:px-8">
          <span>Hotel Reservation Management System · Release 1.0 · Sardar Patel Institute of Technology</span>
          <span>Clark Fernandes (2024300055) · Sampada Daware (2024300040)</span>
        </div>
      </footer>
    </div>
  );
}
