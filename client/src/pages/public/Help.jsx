/** UD-1: searchable in-app help centre covering all major features (UI-2 contextual help links here). */
import { useMemo, useState } from 'react';
import { Search, BookOpen } from 'lucide-react';
import { Card, Input, PageHeader, EmptyState } from '../../components/ui/index.js';
import { useAuth } from '../../lib/auth.jsx';

const ARTICLES = [
  ['Booking', 'Searching for rooms', 'Enter your dates and number of guests. Results only show rooms free for your whole stay. The “Best match” badge marks the room our smart allocation ranks highest for your saved preferences (floor, view, bed type, accessibility). Use the filters for category, price and accessibility.'],
  ['Booking', 'How payment and confirmation work', 'When you choose a room it is held for 10 minutes while you pay. Your reservation is confirmed — and receives its HRMS reservation number — only after the payment gateway verifies your payment. If a payment fails the hold is released and your booking is kept as a draft you can retry.'],
  ['Booking', 'Paying in another currency', 'Amounts are charged in Indian Rupees (INR). If you choose another currency we show the converted amount using a rate refreshed at least every 24 hours.'],
  ['Booking', 'Modifying or cancelling', 'Open the reservation and choose Modify or Cancel. Cancellation is free up to 48 hours before check-in; later cancellations are charged one night. You always see the exact fee and refund before confirming.'],
  ['Stay', 'Online check-in', 'From 14:00 on your arrival day, open the reservation and choose Check in online. Verify your identity with a passport, Aadhaar, driving licence or national ID and your digital key is issued immediately.'],
  ['Stay', 'Using your digital key', 'Open Digital key and hold your phone to the door (NFC) or show the QR code. The key only opens your room and only during your stay. If it does not work, the front desk can re-issue it — a physical master key is always available.'],
  ['Stay', 'AI Concierge', 'Ask about hotel facilities, local recommendations or availability, or ask for things like extra towels or a late check-out — the concierge files the request for you. If it cannot help, it passes your question to a receptionist.'],
  ['Stay', 'Express check-out', 'On your departure day choose Check out. Any extras (e.g. room service) are added, you pay the balance contactlessly, your key is revoked and your itemised invoice is e-mailed automatically.'],
  ['Account', 'Loyalty points', 'You earn points after every completed stay (5 per ₹100 of room charges, more at Gold and Platinum). Redeem them when booking: 1 point = ₹1, up to 50% of the room charges.'],
  ['Account', 'Security & sessions', 'After 5 failed sign-in attempts your account is locked for 15 minutes. Sessions end after 20 minutes of inactivity. You can enable two-step verification in your profile.'],
  ['Account', 'Your data', 'You can download all your reservations, invoices and loyalty history as a portable file from Profile → Export my data.'],
  ['Staff', 'Resolving OTA conflicts', 'When an OTA sells a room the hotel already holds, the sync flags a conflict instead of double booking. On OTA conflicts, compare both bookings and either move the OTA guest to another room, move the existing guest, or reject the OTA booking.'],
  ['Staff', 'Reports and exports', 'Managers and finance staff can generate occupancy, booking, cancellation and revenue reports for any date range and export them as PDF or CSV.'],
  ['Staff', 'Reconciliation', 'Finance staff compare HRMS payment records with the gateway settlement report. Mismatches, transactions missing at the gateway and gateway transactions missing in HRMS are listed for follow-up.'],
  ['Staff', 'Viva mode', 'Viva mode (top bar) shows how each screen traces back to the SRS, use cases, class diagram, sequence and activity diagrams and DFD, and adds the Live UML panel that replays the sequence of messages the server executed.'],
];

export default function Help() {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const list = useMemo(() => ARTICLES.filter(([cat, t, b]) => (user?.role !== 'Guest' || cat !== 'Staff') && (!q || `${t} ${b}`.toLowerCase().includes(q.toLowerCase()))), [q, user]);
  return (
    <div>
      <PageHeader eyebrow="Help centre" title="How can we help?" subtitle="Search guides for every part of the system." />
      <div className="mb-6 max-w-xl"><Input icon={Search} placeholder="Search help articles…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
      {list.length === 0 ? <EmptyState icon={BookOpen} title="No articles match" message="Try a different word, or ask the AI Concierge." /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map(([cat, t, body]) => (
            <Card key={t}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brass-600">{cat}</div>
              <h3 className="mt-1 font-semibold text-ink-900">{t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{body}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
