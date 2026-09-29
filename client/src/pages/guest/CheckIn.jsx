/**
 * Digital check-in — SD-2 / CD-2 messages 1-6.
 *   Guest: Complete Digital Check-In -> Verify Identity -> (HRMS) Verify Check-In Eligibility -> <Check-In Allowed?>
 *   -> Issue Time-Bound Digital Key -> "digital room key"
 *   alt [not confirmed or check-in date not arrived] -> "check-in rejected"
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, BadgeCheck, CalendarCheck2, IdCard, KeyRound, Nfc, QrCode, ShieldAlert } from 'lucide-react';
import clsx from 'clsx';
import { Alert, Button, Card, ErrorState, Field, Input, LoadingBlock, PageHeader, Select } from '../../components/ui/index.js';
import { TraceChips } from '../../components/viva/TraceChips.jsx';
import { useApi } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { fmtDate, fmtDateTime, today } from '../../lib/format.js';

export default function CheckIn() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, error, loading } = useApi(`/reservations/${id}`);
  const { data: docs } = useApi('/access/identity-documents');
  const [doc, setDoc] = useState({ documentType: 'PASSPORT', documentNumber: '' });
  const [keyType, setKeyType] = useState('NFC');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState(null);
  const [done, setDone] = useState(null);

  if (error) return <ErrorState error={error} />;
  if (loading || !data) return <LoadingBlock />;
  const r = data.reservation;
  const t = today();
  const eligible = r.status === 'CONFIRMED' && r.checkInDate <= t && r.checkOutDate > t;
  const example = docs?.documents.find((d) => d.key === doc.documentType)?.example;

  const submit = async () => {
    setPending(true); setFailure(null);
    try {
      setDone(await api.post(`/reservations/${id}/check-in`, { ...doc, keyType }, { label: 'Online check-in' }));
    } catch (e) { setFailure(e); } finally { setPending(false); }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link to={`/guest/reservations/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-ink-800"><ArrowLeft className="size-4" />Reservation</Link>
      <PageHeader eyebrow={`${r.reference} · Room ${r.room.roomNumber}`} title="Online check-in" subtitle="Skip the front desk — verify your identity and receive your digital room key." />
      <TraceChips screen="checkin" />

      <AnimatePresence mode="wait">
        {done ? (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
            <Card className="relative overflow-hidden bg-ink-900 text-white">
              <div className="absolute -right-10 -top-10 size-64 rounded-full bg-brass-400/10" />
              <div className="relative text-center">
                <motion.div initial={{ rotate: -20, scale: 0.6 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 160 }} className="mx-auto grid size-20 place-items-center rounded-3xl bg-brass-400 text-ink-950 shadow-lg">
                  <KeyRound className="size-10" />
                </motion.div>
                <h2 className="mt-5 font-display text-3xl font-semibold">Welcome — you're checked in</h2>
                <p className="mt-2 text-ink-300">Your {done.digitalKey.keyType} key for room <b className="text-white">{done.digitalKey.roomNumber}</b> is active until {fmtDateTime(done.digitalKey.validTo)}.</p>
                <p className="mt-1 text-[13px] text-ink-400">Identity verified: {done.reservation.identityDocument}</p>
                <Button variant="brass" size="lg" className="mt-6" icon={KeyRound} onClick={() => navigate('/guest/key')}>Open my digital key</Button>
              </div>
            </Card>
          </motion.div>
        ) : (
          <motion.div key="form" className="space-y-5">
            <Card>
              <div className="flex items-start gap-3">
                <span className={clsx('grid size-10 shrink-0 place-items-center rounded-xl', eligible ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600')}><CalendarCheck2 className="size-5" /></span>
                <div>
                  <h3 className="font-semibold">1 · Reservation & date</h3>
                  <p className="text-sm text-ink-600">{r.status === 'CONFIRMED' ? 'Confirmed' : r.status.replace('_', ' ').toLowerCase()} · arrival {fmtDate(r.checkInDate)} · departure {fmtDate(r.checkOutDate)}</p>
                  {!eligible && <p className="mt-1 text-sm font-medium text-amber-700">Online check-in opens on your arrival date. You can still try — the system will verify and explain.</p>}
                </div>
              </div>
            </Card>
            <Card>
              <div className="mb-4 flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-600"><IdCard className="size-5" /></span>
                <div><h3 className="font-semibold">2 · Verify your identity</h3><p className="text-sm text-ink-600">CheckIn.Verify.Identity — we store only the document type and last four characters.</p></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Document"><Select value={doc.documentType} onChange={(e) => setDoc({ ...doc, documentType: e.target.value })}>{(docs?.documents || []).map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</Select></Field>
                <Field label="Document number" hint={example && `Format example: ${example}`}><Input value={doc.documentNumber} onChange={(e) => setDoc({ ...doc, documentNumber: e.target.value.toUpperCase() })} className="font-mono tracking-wider" /></Field>
              </div>
            </Card>
            <Card>
              <div className="mb-4 flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brass-50 text-brass-600"><KeyRound className="size-5" /></span>
                <div><h3 className="font-semibold">3 · Choose your key</h3><p className="text-sm text-ink-600">Room.Access.Issue — a time-bound key valid only for room {r.room.roomNumber}.</p></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[['NFC', Nfc, 'Tap your phone on the lock'], ['QR', QrCode, 'Show a QR code to the reader']].map(([k, I, text]) => (
                  <button key={k} onClick={() => setKeyType(k)} className={clsx('flex items-center gap-3 rounded-xl border p-4 text-left transition', keyType === k ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 hover:border-ink-300')}>
                    <I className="size-6" /><span><span className="block font-semibold">{k} key</span><span className={clsx('text-[12.5px]', keyType === k ? 'text-ink-300' : 'text-ink-500')}>{text}</span></span>
                  </button>
                ))}
              </div>
            </Card>
            {failure && (
              <Alert tone="red" icon={ShieldAlert} title={failure.code === 'CHECKIN_NOT_ALLOWED' ? 'Check-in rejected' : failure.code === 'IDENTITY_NOT_VERIFIED' ? 'Identity could not be verified' : 'Check-in failed'}>{failure.message}</Alert>
            )}
            <Button size="lg" variant="brass" icon={BadgeCheck} onClick={submit} loading={pending} disabled={doc.documentNumber.length < 4}>Complete check-in</Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
