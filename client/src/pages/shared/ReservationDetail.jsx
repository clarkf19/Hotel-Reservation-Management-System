/**
 * Reservation detail — shared by Guest (own, SE-5) and staff (reservation.manage).
 * Reservation.Modify, Reservation.Cancel + Reservation.Cancel.Confirm (BR-8), front-desk check-in/out
 * (Receptionist.checkInGuest / checkOutGuest), invoice (Invoice.generatePDF), key revoke/re-issue.
 */
import { useCallback, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Ban, CalendarClock, FileDown, KeyRound, LogIn, LogOut, RefreshCw, ShieldX, History, Receipt, Network } from 'lucide-react';
import { Alert, Button, Card, CardHeader, ConfirmDialog, ErrorState, Field, Input, KeyValue, LoadingBlock, Modal, PageHeader, Select, StatusBadge, Table } from '../../components/ui/index.js';
import { PaymentForm } from '../../components/booking/PaymentForm.jsx';
import { RoomImage } from '../../components/booking/RoomCard.jsx';
import { TraceChips } from '../../components/viva/TraceChips.jsx';
import { useApi } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { fmtDate, fmtDateTime, inr2, title, today, addDays } from '../../lib/format.js';

function ModifyModal({ r, open, onClose, onDone }) {
  const [checkIn, setCheckIn] = useState(r.checkInDate);
  const [checkOut, setCheckOut] = useState(r.checkOutDate);
  const [quote, setQuote] = useState(null);
  const [payment, setPayment] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const onPay = useCallback((p) => setPayment(p), []);
  const submit = async () => {
    setPending(true); setError(null);
    try {
      const res = await api.patch(`/reservations/${r.id}`, { checkIn, checkOut, ...(quote ? { payment } : {}) }, { label: 'Modify reservation' });
      if (res.requiresPayment) { setQuote(res); return; }
      toast.success(res.priceDifference < 0 ? `Updated · ${inr2(-res.priceDifference)} refunded` : res.priceDifference > 0 ? `Updated · ${inr2(res.priceDifference)} charged` : 'Reservation updated');
      onDone();
    } catch (e) { setError(e); } finally { setPending(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Modify reservation" subtitle="Subject to availability (Reservation.Modify). Price differences are charged or refunded automatically."
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button onClick={submit} loading={pending}>{quote ? `Pay ${inr2(quote.amountDue)} & update` : 'Check & update'}</Button></>}>
      {error && <Alert tone="red" className="mb-4">{error.message}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Check-in"><Input type="date" min={addDays(today(), 1)} value={checkIn} onChange={(e) => { setCheckIn(e.target.value); setQuote(null); }} /></Field>
        <Field label="Check-out"><Input type="date" min={addDays(checkIn, 1)} value={checkOut} onChange={(e) => { setCheckOut(e.target.value); setQuote(null); }} /></Field>
      </div>
      {quote && (
        <div className="mt-5 space-y-4">
          <Alert tone="brass" title={`New total ${inr2(quote.newTotal)}`}>The longer stay costs {inr2(quote.amountDue)} more. Pay the difference to confirm the change.</Alert>
          <PaymentForm amount={quote.amountDue} onChange={onPay} showCurrency={false} />
        </div>
      )}
    </Modal>
  );
}

function DeskCheckInModal({ r, open, onClose, onDone }) {
  const [doc, setDoc] = useState({ documentType: 'PASSPORT', documentNumber: '', keyType: 'NFC' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const submit = async () => {
    setPending(true); setError(null);
    try { await api.post(`/reservations/${r.id}/check-in`, doc, { label: 'Front-desk check-in' }); toast.success(`${r.guest.name} checked in to room ${r.room.roomNumber}`); onDone(); } catch (e) { setError(e); } finally { setPending(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Check guest in" subtitle="Receptionist.checkInGuest() — same verification as online check-in (SD-2)." size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={LogIn} onClick={submit} loading={pending}>Verify & issue key</Button></>}>
      {error && <Alert tone="red" className="mb-4">{error.message}</Alert>}
      <div className="space-y-3">
        <Field label="Identity document"><Select value={doc.documentType} onChange={(e) => setDoc({ ...doc, documentType: e.target.value })}><option value="PASSPORT">Passport</option><option value="AADHAAR">Aadhaar</option><option value="DRIVING_LICENCE">Driving licence</option><option value="NATIONAL_ID">National ID</option></Select></Field>
        <Field label="Document number" hint="e.g. passport K1234567"><Input value={doc.documentNumber} onChange={(e) => setDoc({ ...doc, documentNumber: e.target.value.toUpperCase() })} /></Field>
        <Field label="Key type"><Select value={doc.keyType} onChange={(e) => setDoc({ ...doc, keyType: e.target.value })}><option value="NFC">NFC (phone)</option><option value="QR">QR code</option></Select></Field>
      </div>
    </Modal>
  );
}

export default function ReservationDetail() {
  const { id } = useParams();
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const base = location.pathname.split('/')[1];
  const { data, error, loading, reload } = useApi(`/reservations/${id}`);
  const [modify, setModify] = useState(false);
  const [cancel, setCancel] = useState(null);
  const [deskIn, setDeskIn] = useState(false);
  const [busy, setBusy] = useState(false);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !data) return <LoadingBlock rows={4} />;
  const r = data.reservation;
  const isGuest = user.role === 'Guest';
  const staff = can('reservation.manage');
  const t = today();
  const canModify = r.status === 'CONFIRMED' && r.checkInDate > t;
  const canCancel = ['CONFIRMED', 'DRAFT', 'PENDING_PAYMENT'].includes(r.status);
  const canCheckIn = r.status === 'CONFIRMED' && r.checkInDate <= t && r.checkOutDate > t;

  const openCancel = async () => {
    try { setCancel(await api.get(`/reservations/${r.id}/cancellation-terms`)); } catch (e) { toast.error(e.message); }
  };
  const doCancel = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/reservations/${r.id}/cancel`, { confirm: true }, { label: 'Cancel reservation' });
      toast.success(res.refunded ? `Cancelled · ${inr2(res.refunded)} refunded` : 'Reservation cancelled');
      setCancel(null);
      reload();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const keyAction = async (action) => {
    try { await api.post(`/reservations/${r.id}/digital-key/${action}`, {}); toast.success(action === 'revoke' ? 'Digital key revoked' : 'New digital key issued'); reload(); } catch (e) { toast.error(e.message); }
  };

  return (
    <div>
      <Link to={isGuest ? '/guest/reservations' : `/${base}/reservations`} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-ink-800"><ArrowLeft className="size-4" />All reservations</Link>
      <PageHeader eyebrow={r.reference || `Booking #${r.id}`} title={`${r.room.roomType.typeName} · Room ${r.room.roomNumber}`}
        actions={<>
          {isGuest && canCheckIn && <Button variant="brass" icon={LogIn} onClick={() => navigate(`/guest/reservations/${r.id}/check-in`)}>Check in online</Button>}
          {!isGuest && canCheckIn && can('frontdesk.checkin') && <Button variant="brass" icon={LogIn} onClick={() => setDeskIn(true)}>Check in guest</Button>}
          {r.status === 'CHECKED_IN' && (isGuest ? <><Button icon={KeyRound} variant="secondary" onClick={() => navigate('/guest/key')}>Digital key</Button><Button icon={LogOut} onClick={() => navigate(`/guest/reservations/${r.id}/check-out`)}>Express check-out</Button></> : can('frontdesk.checkin') && <Button icon={LogOut} onClick={() => navigate(`/guest/reservations/${r.id}/check-out`.replace('/guest', `/${base}`))}>Check out</Button>)}
          {canModify && (isGuest || staff) && <Button variant="secondary" icon={CalendarClock} onClick={() => setModify(true)}>Modify</Button>}
          {canCancel && (isGuest || staff) && <Button variant="secondary" icon={Ban} onClick={openCancel}>Cancel</Button>}
        </>}>
        <div className="mt-3"><StatusBadge status={r.status} /></div>
      </PageHeader>
      <TraceChips screen="reservations" />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card>
            <div className="grid gap-5 sm:grid-cols-3">
              <KeyValue label="Check-in" value={fmtDate(r.checkInDate, { year: true })} />
              <KeyValue label="Check-out" value={fmtDate(r.checkOutDate, { year: true })} />
              <KeyValue label="Nights · guests" value={`${r.nights} · ${r.numGuests}`} />
              <KeyValue label="Guest" value={`${r.guest.name} (${r.guest.guestId})`} />
              <KeyValue label="Source" value={r.otaChannel ? `${r.otaChannel.channelName} · ${r.externalRef}` : title(r.source)} />
              <KeyValue label="Total" value={inr2(r.totalAmount)} />
              {r.identityDocument && <KeyValue label="Identity verified" value={r.identityDocument} />}
              {r.checkedInAt && <KeyValue label="Checked in" value={fmtDateTime(r.checkedInAt)} />}
              {r.checkedOutAt && <KeyValue label="Checked out" value={fmtDateTime(r.checkedOutAt)} />}
              {r.cancelledAt && <KeyValue label="Cancelled" value={`${fmtDateTime(r.cancelledAt)} · fee ${inr2(r.cancellationFee)}`} />}
            </div>
            {r.specialRequests && <div className="mt-5 rounded-lg bg-ink-50 px-4 py-3 text-sm text-ink-700"><b>Special requests:</b> {r.specialRequests}</div>}
          </Card>

          <Card>
            <CardHeader icon={Receipt} title="Payments" subtitle={`Net paid ${inr2(r.amountPaid)} of ${inr2(r.totalAmount)}`} />
            <Table dense rows={r.payments} columns={[
              { key: 'createdAt', header: 'Date', render: (p) => fmtDateTime(p.paidAt || p.createdAt) },
              { key: 'purpose', header: 'Purpose', render: (p) => title(p.purpose) },
              { key: 'methodSummary', header: 'Method', render: (p) => p.methodSummary || title(p.paymentMethod) },
              { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
              { key: 'amount', header: 'Amount', align: 'right', render: (p) => <>{inr2(p.amount)}{p.refundedAmount > 0 && <div className="text-[11px] text-violet-600">−{inr2(p.refundedAmount)} refunded</div>}{p.failureReason && <div className="text-[11px] text-red-600">{p.failureReason}</div>}</> },
            ]} />
            {r.invoice && (
              <div className="mt-4 flex items-center justify-between rounded-lg border border-ink-200 px-4 py-3">
                <div className="text-sm"><b>{r.invoice.invoiceNumber}</b> · {inr2(r.invoice.totalAmount)} · issued {fmtDateTime(r.invoice.issueDate)}</div>
                <Button size="sm" variant="secondary" icon={FileDown} onClick={() => api.openPdf(`/invoices/${r.invoice.id}/pdf`)}>Invoice PDF</Button>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader icon={History} title="Timeline" subtitle="From the audit log (SE-6)" />
            <ol className="relative ml-2 space-y-4 border-l border-ink-200 pl-5">
              {r.timeline.map((e, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[26px] top-1 size-2.5 rounded-full bg-brass-500 ring-4 ring-white" />
                  <div className="text-[13px] font-medium text-ink-800">{title(e.action)}</div>
                  <div className="text-[12px] text-ink-500">{fmtDateTime(e.timestamp)}</div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card padded={false} className="overflow-hidden">
            <RoomImage src={r.room.roomType.imageUrl} alt="" className="aspect-[16/9]" />
            <div className="p-5 text-sm text-ink-600">Floor {r.room.floor} · {r.room.view} view · sleeps {r.room.capacity}<div className="mt-2 flex flex-wrap gap-1.5">{r.room.roomType.amenities.map((a) => <span key={a} className="rounded bg-ink-50 px-1.5 py-0.5 text-[11.5px]">{a}</span>)}</div></div>
          </Card>
          {r.digitalKey && (
            <Card>
              <CardHeader icon={KeyRound} title="Digital key" action={<StatusBadge status={r.digitalKey.status} />} />
              <div className="text-sm text-ink-600">{r.digitalKey.keyType} · valid {fmtDateTime(r.digitalKey.issueDate)} → {fmtDateTime(r.digitalKey.expiryDate)}</div>
              {!isGuest && r.status === 'CHECKED_IN' && can('frontdesk.checkin') && (
                <div className="mt-3 flex gap-2">
                  {r.digitalKey.status === 'ACTIVE' ? <Button size="sm" variant="danger" icon={ShieldX} onClick={() => keyAction('revoke')}>Revoke</Button> : <Button size="sm" icon={RefreshCw} onClick={() => keyAction('reissue')}>Re-issue key</Button>}
                </div>
              )}
            </Card>
          )}
          {r.channelSyncs?.length > 0 && (
            <Card>
              <CardHeader icon={Network} title="Channel synchronisation" subtitle="ChannelSync records for this reservation" />
              <ul className="space-y-2 text-[13px]">{r.channelSyncs.map((s) => <li key={s.id} className="flex items-center justify-between"><span>{s.channel} · {title(s.syncType)}</span><StatusBadge status={s.syncStatus} /></li>)}</ul>
            </Card>
          )}
          {r.serviceRequests?.length > 0 && (
            <Card>
              <CardHeader title="Service requests" />
              <ul className="space-y-2 text-[13px]">{r.serviceRequests.map((s) => <li key={s.id} className="flex items-center justify-between gap-2"><span className="truncate">{title(s.category)} · {s.description}</span><StatusBadge status={s.status} /></li>)}</ul>
            </Card>
          )}
        </div>
      </div>

      {modify && <ModifyModal r={r} open={modify} onClose={() => setModify(false)} onDone={() => { setModify(false); reload(); }} />}
      {deskIn && <DeskCheckInModal r={r} open={deskIn} onClose={() => setDeskIn(false)} onDone={() => { setDeskIn(false); reload(); }} />}
      <ConfirmDialog open={Boolean(cancel)} onClose={() => setCancel(null)} onConfirm={doCancel} loading={busy} title="Cancel this reservation?" confirmLabel="Yes, cancel reservation">
        {cancel && (
          <div className="space-y-2">
            <p>{cancel.policy}</p>
            <p>Check-in is <b>{cancel.hoursBeforeCheckIn} hours</b> away — {cancel.freeCancellation ? <b className="text-emerald-700">this cancellation is free.</b> : <b className="text-red-700">a one-night charge of {inr2(cancel.cancellationFee)} applies.</b>}</p>
            {cancel.refundAmount > 0 && <p>You will be refunded <b>{inr2(cancel.refundAmount)}</b> to your original payment method.</p>}
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
