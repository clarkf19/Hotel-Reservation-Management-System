/**
 * Digital key & smart lock simulator — SD-2 / CD-2 messages 7-10; Activity Smart Lock lane.
 *   Guest presents key -> DigitalKey.verifyKey() -> SmartLockController.unlock(keyCode) -> <Key Valid?> -> Unlock Room | Deny Access
 * This is a SIMULATION: no physical lock is controlled. Every attempt is written to D5 Room Access Logs.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import clsx from 'clsx';
import { DoorClosed, DoorOpen, KeyRound, Lock, Nfc, Unlock, XCircle, FlaskConical } from 'lucide-react';
import { Alert, Button, Card, CardHeader, EmptyState, LoadingBlock, PageHeader, Select, StatusBadge } from '../../components/ui/index.js';
import { TraceChips } from '../../components/viva/TraceChips.jsx';
import { useApi } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { fmtDateTime, timeAgo } from '../../lib/format.js';

function Door({ state, roomNumber }) {
  const open = state === 'granted';
  const denied = state === 'denied';
  return (
    <div className="relative mx-auto h-72 w-48 [perspective:900px]">
      <div className="absolute inset-0 rounded-t-[90px] rounded-b-md border-[10px] border-ink-800 bg-gradient-to-b from-amber-100/70 to-amber-50 shadow-inner" />
      <motion.div
        className="absolute inset-[10px] origin-left rounded-t-[80px] rounded-b-sm bg-gradient-to-br from-[#6b4a2b] to-[#4a3220] shadow-xl"
        animate={{ rotateY: open ? -68 : 0 }} transition={{ type: 'spring', stiffness: 70, damping: 14 }}
      >
        <div className="absolute left-1/2 top-10 -translate-x-1/2 rounded bg-brass-300/90 px-2 py-0.5 font-display text-sm font-semibold text-ink-900">{roomNumber}</div>
        <div className="absolute inset-x-6 top-20 bottom-10 rounded-md border border-black/15" />
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col items-center gap-1.5">
          <div className={clsx('grid size-9 place-items-center rounded-lg border-2 bg-ink-900 transition-colors', open ? 'border-emerald-400' : denied ? 'border-red-500' : 'border-ink-600')}>
            <span className={clsx('size-2.5 rounded-full transition-colors', open ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]' : denied ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' : 'bg-ink-500')} />
          </div>
          <div className="h-2 w-6 rounded-full bg-brass-400" />
        </div>
      </motion.div>
    </div>
  );
}

export default function DigitalKeyPage() {
  const { data, loading } = useApi('/reservations?status=CHECKED_IN,CHECKED_OUT');
  const stays = useMemo(() => (data?.reservations || []).filter((r) => r.digitalKey).sort((a, b) => (a.status === 'CHECKED_IN' ? -1 : 1) - (b.status === 'CHECKED_IN' ? -1 : 1)), [data]);
  const [selected, setSelected] = useState(null);
  const res = stays.find((s) => s.id === selected) || stays[0];
  const { data: keyData, reload } = useApi(res ? `/reservations/${res.id}/digital-key` : null, { deps: [res?.id] });
  const key = keyData?.digitalKey;
  const [door, setDoor] = useState(res?.room.roomNumber || '');
  const [state, setState] = useState('idle');
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(false);
  const rooms = ['101', '203', '305', '401', '502']; // other doors to try (should be denied)

  useEffect(() => { if (res) setDoor(res.room.roomNumber); }, [res]);

  const present = async () => {
    setPending(true); setState('reading'); setResult(null);
    await new Promise((r) => setTimeout(r, 650));
    try {
      const out = await api.post('/access/unlock', { roomNumber: door, keyCode: key.keyCode }, { label: 'Present key at door' });
      setResult(out);
      setState(out.granted ? 'granted' : 'denied');
      reload({ quiet: true });
      if (out.granted) setTimeout(() => setState('idle'), out.relockInMs || 6000);
    } catch (e) { setResult({ granted: false, reason: e.message }); setState('denied'); } finally { setPending(false); }
  };

  if (loading) return <LoadingBlock />;
  if (!res) return (
    <div>
      <PageHeader eyebrow="Digital key" title="Your digital key" />
      <EmptyState icon={KeyRound} title="No digital key yet" message="Your key is issued when you complete online check-in on your arrival day." action={<Link to="/guest/reservations"><Button>My reservations</Button></Link>} />
    </div>
  );
  const doorChoices = [...new Set([res.room.roomNumber, ...rooms])];

  return (
    <div>
      <PageHeader eyebrow="Digital key · smart lock" title={`Room ${res.room.roomNumber}`} subtitle="Hold your phone to the lock. This screen simulates the room's smart lock controller."
        actions={stays.length > 1 && <Select value={res.id} onChange={(e) => setSelected(Number(e.target.value))} className="w-60">{stays.map((s) => <option key={s.id} value={s.id}>{s.reference} · room {s.room.roomNumber}</option>)}</Select>} />
      <TraceChips screen="key" />
      {!key ? <LoadingBlock /> : (
        <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
          <Card className="relative overflow-hidden bg-gradient-to-br from-ink-900 via-ink-800 to-ink-950 text-white">
            <div className="absolute -right-16 -top-16 size-56 rounded-full bg-brass-400/10" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <span className="font-display text-lg font-semibold text-brass-300">Solstice Bay</span>
                <StatusBadge status={key.status} />
              </div>
              <div className="mt-6 grid place-items-center">
                {key.keyType === 'QR' ? (
                  <div className={clsx('rounded-2xl bg-white p-4 transition', key.status !== 'ACTIVE' && 'opacity-30 blur-[2px]')}><QRCodeSVG value={key.keyCode} size={180} fgColor="#0f1629" level="M" /></div>
                ) : (
                  <div className={clsx('relative grid size-44 place-items-center rounded-full bg-white/5 text-brass-300', key.status === 'ACTIVE' && 'pulse-ring')}><Nfc className="size-20" /></div>
                )}
              </div>
              <div className="mt-6 text-center">
                <div className="text-[12px] uppercase tracking-[0.2em] text-ink-400">Room</div>
                <div className="font-display text-5xl font-semibold">{key.roomNumber}</div>
                <div className="mt-2 text-[12.5px] text-ink-300">Valid {fmtDateTime(key.validFrom)} → {fmtDateTime(key.validTo)}</div>
                <div className="mt-1 font-mono text-[10.5px] text-ink-500">{key.keyCode.slice(0, 14)}…</div>
              </div>
            </div>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader icon={Lock} title="Smart lock simulator" subtitle="SmartLockController.unlock(keyCode) — try your own door, then another room or after check-out." />
              <div className="grid items-center gap-6 md:grid-cols-[220px_1fr]">
                <Door state={state} roomNumber={door} />
                <div className="space-y-4">
                  <label className="block text-[13px] font-medium text-ink-700">Door
                    <Select value={door} onChange={(e) => { setDoor(e.target.value); setState('idle'); setResult(null); }} className="mt-1.5">{doorChoices.map((d) => <option key={d} value={d}>Room {d}{d === res.room.roomNumber ? ' (your room)' : ''}</option>)}</Select>
                  </label>
                  <Button size="lg" variant="brass" className="w-full" icon={key.keyType === 'NFC' ? Nfc : KeyRound} onClick={present} loading={pending}>{key.keyType === 'NFC' ? 'Tap phone on lock' : 'Show QR to reader'}</Button>
                  <AnimatePresence mode="wait">
                    {state === 'reading' && <motion.div key="r" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center text-sm text-ink-500">Validating digital key…</motion.div>}
                    {result && state !== 'reading' && (
                      <motion.div key="res" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                        {result.granted ? <Alert tone="green" icon={DoorOpen} title="Access granted — room unlocked">Key verified. The door re-locks automatically in {Math.round((result.relockInMs || 6000) / 1000)} s.</Alert>
                          : <Alert tone="red" icon={XCircle} title="Access denied">{result.reason}</Alert>}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <p className="flex items-start gap-1.5 text-[12px] text-ink-500"><FlaskConical className="mt-0.5 size-3.5 shrink-0" />Simulation only — the software does not control a physical lock. A physical master key remains available at the front desk (SRS 5.2).</p>
                </div>
              </div>
            </Card>
            <Card>
              <CardHeader icon={DoorClosed} title="Room access log" subtitle="D5 Room Access Logs — every attempt with this key" />
              <ul className="divide-y divide-ink-100 text-[13px]">
                {(key.accessLog || []).map((l) => (
                  <li key={l.id} className="flex items-center justify-between py-2">
                    <span className="flex items-center gap-2">{l.result === 'GRANTED' ? <Unlock className="size-4 text-emerald-600" /> : <Lock className="size-4 text-red-600" />}{l.reason}</span>
                    <span className="text-ink-400">{timeAgo(l.attemptedAt)}</span>
                  </li>
                ))}
                {!key.accessLog?.length && <li className="py-4 text-center text-ink-500">No attempts yet.</li>}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
