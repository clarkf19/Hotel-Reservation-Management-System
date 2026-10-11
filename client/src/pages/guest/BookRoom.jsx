/**
 * Booking & payment — SD-1 "Making Room Reservation" end to end.
 *   Step 1 Review:   makeReservation() -> checkAvailability() -> calculateAmount() -> Lock Room Inventory
 *   Step 2 Payment:  initiate() -> authorize(amount) -> verify() -> confirm() -> updateStatus() -> FORK(sync, notify)
 *   Step 3 Done:     "Reservation confirmed" + reservation number (Reservation.Book.Confirm)
 * Receptionists and managers use the same screen to book on behalf of a guest (Receptionist.createReservation()).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, BedDouble, CalendarDays, CheckCircle2, Crown, Timer, Users, Workflow, Search } from 'lucide-react';
import { Alert, Button, Card, ErrorState, Field, Input, LoadingBlock, PageHeader, Textarea } from '../../components/ui/index.js';
import { PaymentForm } from '../../components/booking/PaymentForm.jsx';
import { RoomImage } from '../../components/booking/RoomCard.jsx';
import { TraceChips } from '../../components/viva/TraceChips.jsx';
import { useViva } from '../../components/viva/VivaContext.jsx';
import { api, qs } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useCountdown } from '../../lib/hooks.js';
import { openRazorpayCheckout } from '../../lib/razorpay.js';
import { fmtDate, inr, inr2, nights as countNights, reference } from '../../lib/format.js';

function Steps({ step }) {
  const labels = ['Review stay', 'Payment', 'Confirmed'];
  return (
    <ol className="mb-6 flex items-center gap-2 text-[13px]">
      {labels.map((l, i) => (
        <li key={l} className="flex items-center gap-2">
          <span className={`grid size-6 place-items-center rounded-full text-[12px] font-bold ${i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-ink-900 text-white' : 'bg-ink-200 text-ink-500'}`}>{i < step ? '✓' : i + 1}</span>
          <span className={i === step ? 'font-semibold text-ink-900' : 'text-ink-500'}>{l}</span>
          {i < labels.length - 1 && <span className="mx-1 h-px w-8 bg-ink-300" />}
        </li>
      ))}
    </ol>
  );
}

function GuestPicker({ value, onChange }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  useEffect(() => { const t = setTimeout(() => api.get(`/guests${qs({ search: q })}`).then((d) => setList(d.guests)).catch(() => {}), 250); return () => clearTimeout(t); }, [q]);
  return (
    <Card>
      <h3 className="mb-3 font-semibold">Guest (reservation holder — BR-1)</h3>
      {value ? (
        <div className="flex items-center justify-between rounded-lg bg-brass-50 px-3 py-2 text-sm"><span><b>{value.name}</b> · {value.email} · {value.guestId}</span><Button size="sm" variant="ghost" onClick={() => onChange(null)}>Change</Button></div>
      ) : (
        <>
          <Input icon={Search} placeholder="Search by name, e-mail, phone or guest ID" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="mt-2 max-h-56 divide-y divide-ink-100 overflow-y-auto rounded-lg border border-ink-100">
            {list.map((g) => <li key={g.id}><button onClick={() => onChange(g)} className="w-full px-3 py-2 text-left text-sm hover:bg-brass-50"><b>{g.name}</b> <span className="text-ink-500">· {g.email} · {g.guestId}</span></button></li>)}
          </ul>
        </>
      )}
    </Card>
  );
}

export default function BookRoom() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { openTrace } = useViva();
  const navigate = useNavigate();
  const location = useLocation();
  const base = location.pathname.split('/')[1];
  const isGuest = user.role === 'Guest';

  const roomId = Number(params.get('roomId'));
  const checkIn = params.get('checkIn');
  const checkOut = params.get('checkOut');
  const [guests, setGuests] = useState(Number(params.get('guests') || 2));
  const [room, setRoom] = useState(null);
  const [loyalty, setLoyalty] = useState(null);
  const [info, setInfo] = useState(null);
  const [specialRequests, setSpecialRequests] = useState('');
  const [redeem, setRedeem] = useState(0);
  const [holder, setHolder] = useState(null);
  const [reservation, setReservation] = useState(null);
  const [payment, setPayment] = useState(null);
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [payError, setPayError] = useState(null);
  const [confirmed, setConfirmed] = useState(null);
  const onPaymentChange = useCallback((p) => setPayment(p), []);
  const [razorpay, setRazorpay] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setInfo(await api.get('/public/info'));
        api.get('/payments/razorpay/config').then(setRazorpay).catch(() => setRazorpay(null));
        const resumeId = params.get('reservationId');
        if (resumeId) {
          const { reservation: r } = await api.get(`/reservations/${resumeId}`);
          setReservation(r);
          setRoom(r.room);
          setStep(['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'].includes(r.status) ? 2 : 1);
          if (r.status === 'CONFIRMED') setConfirmed({ reservation: r });
        } else if (roomId) {
          setRoom((await api.get(`/rooms/${roomId}`)).room);
          if (isGuest) setLoyalty(await api.get('/me/loyalty'));
        }
      } catch (e) { setError(e); }
    })();
  }, [roomId, params, isGuest]);

  const n = checkIn && checkOut ? countNights(checkIn, checkOut) : reservation?.nights ?? 0;
  const tax = info?.taxRatePercent ?? 12;
  const roomCharges = (room?.baseRate ?? 0) * n;
  const maxRedeem = useMemo(() => (loyalty ? Math.min(loyalty.balance, Math.floor((roomCharges * loyalty.rules.maxRedeemPercent) / 100 / loyalty.rules.pointValue)) : 0), [loyalty, roomCharges]);
  const discount = redeem * (loyalty?.rules.pointValue ?? 1);
  const estTotal = Math.round((roomCharges - discount) * (1 + tax / 100) * 100) / 100;
  const holdLeft = useCountdown(reservation?.status === 'PENDING_PAYMENT' ? reservation.holdExpiresAt : null);

  const reserve = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await api.post('/reservations', { roomId, checkIn, checkOut, numGuests: guests, specialRequests: specialRequests || undefined, redeemPoints: redeem, guestId: holder?.id }, { label: 'Make reservation' });
      setReservation(res.reservation);
      setStep(1);
      toast.success(`Room ${room.roomNumber} is held for you for ${res.holdMinutes} minutes.`);
    } catch (e) {
      setError(e);
      if (e.code === 'ROOM_UNAVAILABLE') toast.error(e.message);
    } finally { setPending(false); }
  };

  /** Real Razorpay: create order (server) -> Checkout (browser) -> verify signature + payment (server) -> confirm. */
  const payWithRazorpay = async () => {
    const order = await api.post(`/reservations/${reservation.id}/razorpay/order`, {}, { label: 'Razorpay order' });
    setReservation((r) => ({ ...r, status: 'PENDING_PAYMENT', holdExpiresAt: order.holdExpiresAt }));
    let result;
    try {
      result = await openRazorpayCheckout({
        keyId: order.keyId, orderId: order.orderId, amountPaise: order.amountPaise, prefill: order.prefill, reference: `Booking #${reservation.id}`,
        description: `Room ${room.roomNumber} · ${order.demoCharge ? 'demo charge' : 'booking'}`,
      });
    } catch (e) {
      if (e?.dismissed) {
        await api.post(`/reservations/${reservation.id}/razorpay/cancel`, { orderId: order.orderId, reason: window.__hrmsLastRazorpayError || 'Payment window closed' }).catch(() => {});
        setReservation((r) => ({ ...r, status: 'DRAFT', holdExpiresAt: null }));
        setPayError({ message: window.__hrmsLastRazorpayError ? `Razorpay: ${window.__hrmsLastRazorpayError}` : 'You closed the Razorpay window before paying.' });
        window.__hrmsLastRazorpayError = undefined;
        return null;
      }
      throw e;
    }
    return api.post(`/reservations/${reservation.id}/razorpay/verify`, { orderId: result.razorpay_order_id, paymentId: result.razorpay_payment_id, signature: result.razorpay_signature }, { label: 'Razorpay verify & confirm' });
  };

  const pay = async () => {
    setPending(true);
    setPayError(null);
    try {
      const res = payment?.method === 'RAZORPAY' ? await payWithRazorpay() : await api.post(`/reservations/${reservation.id}/pay`, payment, { label: 'Pay & confirm' });
      if (!res) return; // guest closed Razorpay Checkout
      setConfirmed(res);
      setReservation(res.reservation);
      setStep(2);
      toast.success(`Booking confirmed · ${res.reservation.reference}`);
    } catch (e) {
      setPayError(e);
      if (e.code === 'PAYMENT_FAILED') setReservation((r) => ({ ...r, status: 'DRAFT', holdExpiresAt: null }));
    } finally { setPending(false); }
  };

  if (error && !room) return <ErrorState error={error} />;
  if (!room) return <LoadingBlock rows={3} />;
  const ci = reservation?.checkInDate ?? checkIn;
  const co = reservation?.checkOutDate ?? checkOut;

  return (
    <div>
      <Link to={`/${base}/${isGuest ? 'search' : 'reservations'}`} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-ink-800"><ArrowLeft className="size-4" />Back</Link>
      <PageHeader eyebrow="Making room reservation" title={step === 2 ? 'You’re all set' : `Book room ${room.roomNumber}`} />
      <TraceChips screen="book" />
      <Steps step={step} />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          {step === 0 && (
            <>
              {!isGuest && <GuestPicker value={holder} onChange={setHolder} />}
              <Card>
                <h3 className="mb-4 font-semibold">Stay details</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Guests in the room"><Input type="number" min={1} max={room.capacity} value={guests} onChange={(e) => setGuests(Math.max(1, Math.min(room.capacity, Number(e.target.value))))} /></Field>
                  <Field label="Arrival">{<div className="flex h-10 items-center rounded-lg bg-ink-50 px-3 text-sm">{fmtDate(ci, { year: true })} from {info?.checkInTime}</div>}</Field>
                  <Field label="Special requests (optional)" className="sm:col-span-2"><Textarea value={specialRequests} maxLength={500} onChange={(e) => setSpecialRequests(e.target.value)} placeholder="Early arrival, celebrating an occasion, dietary needs…" /></Field>
                </div>
              </Card>
              {isGuest && loyalty && loyalty.balance > 0 && maxRedeem > 0 && (
                <Card>
                  <div className="flex items-start justify-between gap-4">
                    <div><h3 className="flex items-center gap-2 font-semibold"><Crown className="size-4 text-brass-600" />Redeem loyalty points</h3><p className="mt-0.5 text-[13px] text-ink-500">{loyalty.balance.toLocaleString('en-IN')} points available · {loyalty.rules.redeem}</p></div>
                    <div className="text-right"><div className="font-display text-2xl font-semibold tabular">−{inr(discount)}</div><div className="text-[11px] text-ink-500">{redeem.toLocaleString('en-IN')} pts</div></div>
                  </div>
                  <input type="range" min={0} max={maxRedeem} step={Math.max(1, Math.round(maxRedeem / 50))} value={redeem} onChange={(e) => setRedeem(Number(e.target.value))} className="mt-4 w-full accent-[#a57c34]" aria-label="Points to redeem" />
                  <p className="mt-1 text-[12px] text-ink-500">Points are only deducted once your payment is verified.</p>
                </Card>
              )}
              {error && <Alert tone="red" icon={AlertTriangle} title={error.code === 'ROOM_UNAVAILABLE' ? 'Room no longer available' : 'Could not reserve'}>{error.message} {error.code === 'ROOM_UNAVAILABLE' && <Link className="font-semibold underline" to={`/${base}/search?checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}`}>Search again</Link>}</Alert>}
              <Button size="lg" className="w-full sm:w-auto" onClick={reserve} loading={pending} disabled={!isGuest && !holder}>Reserve & continue to payment</Button>
            </>
          )}

          {step === 1 && reservation && (
            <>
              {reservation.status === 'PENDING_PAYMENT' && holdLeft > 0 ? (
                <Alert tone="brass" icon={Timer} title={`Room ${room.roomNumber} is locked for you`}>Complete payment within <b className="tabular">{Math.floor(holdLeft / 60000)}:{String(Math.floor((holdLeft % 60000) / 1000)).padStart(2, '0')}</b>. No reservation number is issued until your payment is verified.</Alert>
              ) : (
                <Alert tone="amber" icon={Timer} title="Your booking is saved as a draft">The temporary hold was released. We'll check the room is still free and lock it again when you pay.</Alert>
              )}
              {payError && <Alert tone="red" icon={AlertTriangle} title="Payment unsuccessful — reservation not confirmed">{payError.message} {payError.code === 'PAYMENT_FAILED' || !payError.code ? 'The room lock was released; you can retry with another method.' : 'Your room is still held — you can try another method.'}</Alert>}
              <Card>
                <h3 className="mb-4 font-semibold">Payment details</h3>
                <PaymentForm amount={reservation.totalAmount} onChange={onPaymentChange} razorpay={razorpay} />
              </Card>
              <Button size="lg" variant="brass" onClick={pay} loading={pending} className="w-full sm:w-auto">{payment?.method === 'RAZORPAY' ? `Pay ${inr2(razorpay?.demoChargeAmount ?? reservation.totalAmount)} with Razorpay` : `Pay ${inr2(reservation.totalAmount)} & confirm`}</Button>
            </>
          )}

          {step === 2 && confirmed && (
            <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
              <Card className="relative overflow-hidden">
                <div className="absolute -right-16 -top-16 size-56 rounded-full bg-emerald-100/60" />
                <div className="relative">
                  <CheckCircle2 className="size-12 text-emerald-500" />
                  <h2 className="mt-3 font-display text-3xl font-semibold">Reservation confirmed</h2>
                  <p className="mt-1 text-ink-600">Reservation number <b className="font-mono text-ink-900">{confirmed.reservation.reference}</b>{confirmed.payment && <> · paid with {confirmed.payment.methodSummary}</>}</p>
                  <ul className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
                    {['Payment verified by the gateway', 'Room inventory updated', 'Availability pushed to all OTA channels', 'Confirmation sent by e-mail & SMS'].map((t) => <li key={t} className="flex items-center gap-2 text-ink-700"><CheckCircle2 className="size-4 text-emerald-500" />{t}</li>)}
                  </ul>
                  <div className="mt-6 flex flex-wrap gap-2">
                    <Button onClick={() => navigate(`/${base}/reservations/${confirmed.reservation.id}`)}>View reservation</Button>
                    <Button variant="secondary" icon={Workflow} onClick={() => openTrace()}>See it as a sequence diagram</Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}
        </div>

        <aside>
          <Card padded={false} className="sticky top-24 overflow-hidden">
            <RoomImage src={room.roomType.imageUrl} alt={room.roomType.typeName} className="aspect-[16/9]" />
            <div className="p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brass-600">Room {room.roomNumber} · floor {room.floor}</div>
              <h3 className="font-display text-xl font-semibold">{room.roomType.typeName}</h3>
              <div className="mt-3 space-y-1.5 text-[13px] text-ink-600">
                <div className="flex items-center gap-2"><CalendarDays className="size-4 text-ink-400" />{fmtDate(ci)} → {fmtDate(co)} · {n} night{n > 1 ? 's' : ''}</div>
                <div className="flex items-center gap-2"><Users className="size-4 text-ink-400" />{reservation?.numGuests ?? guests} guest(s)</div>
                <div className="flex items-center gap-2"><BedDouble className="size-4 text-ink-400" />{room.roomType.bedType} bed{room.view ? ` · ${room.view} view` : ''}</div>
              </div>
              <dl className="mt-4 space-y-1.5 border-t border-ink-100 pt-4 text-[13.5px]">
                <div className="flex justify-between"><dt className="text-ink-500">{inr(room.baseRate)} × {n} night{n > 1 ? 's' : ''}</dt><dd className="tabular">{inr2(roomCharges)}</dd></div>
                {(reservation?.discountAmount || discount) > 0 && <div className="flex justify-between text-emerald-700"><dt>Loyalty discount</dt><dd className="tabular">−{inr2(reservation?.discountAmount ?? discount)}</dd></div>}
                <div className="flex justify-between"><dt className="text-ink-500">Tax ({tax}%)</dt><dd className="tabular">{inr2((reservation?.totalAmount ?? estTotal) - roomCharges + (reservation?.discountAmount ?? discount))}</dd></div>
                <div className="flex justify-between border-t border-ink-100 pt-2 text-base font-semibold"><dt>Total</dt><dd className="tabular">{inr2(reservation?.totalAmount ?? estTotal)}</dd></div>
              </dl>
              {reservation && <p className="mt-3 text-[12px] text-ink-500">Booking ID #{reservation.id} · {reservation.reference === 'Draft' || !reservation.reference ? 'awaiting payment' : reservation.reference}</p>}
              <p className="mt-3 text-[12px] leading-relaxed text-ink-500">Free cancellation until {info?.freeCancellationHours ?? 48} h before check-in; afterwards one night is charged (BR-8).</p>
            </div>
          </Card>
        </aside>
      </div>
      {step === 2 && <p className="mt-6 text-center text-sm text-ink-500">Your reservation number is <span className="font-mono">{reference(confirmed?.reservation?.reservationNumber)}</span>.</p>}
    </div>
  );
}
