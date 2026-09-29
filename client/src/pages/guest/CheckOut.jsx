/**
 * Express check-out (guest) / front-desk check-out (Receptionist.checkOutGuest()).
 * Activity: Initiate Express Check-Out -> Calculate Final Charges -> Process Final Payment ->
 *   <Payment Successful?> (No: retry) -> Revoke Digital Key -> Generate Invoice -> Send Invoice / Checkout Confirmation
 * SRS: CheckOut.Express, Payment.Contactless.Process, Invoice.Generate, Room.Access.Revoke, BR-6 (loyalty after check-out)
 */
import { useCallback, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, Crown, FileDown, LogOut, ShieldX } from 'lucide-react';
import { Alert, Button, Card, CardHeader, ErrorState, LoadingBlock, PageHeader } from '../../components/ui/index.js';
import { PaymentForm } from '../../components/booking/PaymentForm.jsx';
import { TraceChips } from '../../components/viva/TraceChips.jsx';
import { useApi } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { inr2, title } from '../../lib/format.js';

export default function CheckOut() {
  const { id } = useParams();
  const location = useLocation();
  const base = location.pathname.split('/')[1];
  const { data: res } = useApi(`/reservations/${id}`);
  const { data: summary, error, loading, reload } = useApi(`/reservations/${id}/checkout-summary`);
  const [payment, setPayment] = useState(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState(null);
  const [done, setDone] = useState(null);
  const onPay = useCallback((p) => setPayment(p), []);

  const submit = async () => {
    setPending(true); setFailure(null);
    try {
      setDone(await api.post(`/reservations/${id}/check-out`, summary.balanceDue > 0 ? { payment } : {}, { label: 'Express check-out' }));
    } catch (e) { setFailure(e); } finally { setPending(false); }
  };

  if (done) {
    return (
      <div className="mx-auto max-w-2xl">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="text-center">
            <CheckCircle2 className="mx-auto size-14 text-emerald-500" />
            <h1 className="mt-4 font-display text-3xl font-semibold">Checked out — thank you!</h1>
            <p className="mt-2 text-ink-600">Invoice <b>{done.invoice.invoiceNumber}</b> ({inr2(done.invoice.totalAmount)}) has been e-mailed.</p>
            <ul className="mx-auto mt-5 max-w-sm space-y-2 text-left text-sm">
              <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-500" />All charges settled</li>
              <li className="flex items-center gap-2"><ShieldX className="size-4 text-emerald-500" />Digital key revoked</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-500" />Room sent to housekeeping</li>
              {done.loyalty?.points > 0 && <li className="flex items-center gap-2"><Crown className="size-4 text-brass-600" /><b>{done.loyalty.points} loyalty points</b> credited{done.loyalty.tierChanged && ` — welcome to ${done.loyalty.tier}!`}</li>}
            </ul>
            <div className="mt-6 flex justify-center gap-2">
              <Button icon={FileDown} onClick={() => api.openPdf(`/invoices/${done.invoice.id}/pdf`)}>View invoice</Button>
              <Link to={base === 'guest' ? '/guest' : `/${base}`}><Button variant="secondary">Done</Button></Link>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link to={`/${base}/reservations/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-ink-800"><ArrowLeft className="size-4" />Reservation</Link>
      <PageHeader eyebrow={res ? `${res.reservation.reference} · Room ${res.reservation.room.roomNumber}` : 'Check-out'} title={base === 'guest' ? 'Express check-out' : 'Check guest out'} subtitle="Review your final charges, settle the balance contactlessly and receive your invoice by e-mail." />
      <TraceChips screen="checkout" />
      {error ? <ErrorState error={error} onRetry={reload} /> : loading || !summary ? <LoadingBlock /> : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-5">
            {summary.balanceDue > 0 ? (
              <Card>
                <CardHeader title="Settle your balance" subtitle="Payment.Contactless.Process" />
                <PaymentForm amount={summary.balanceDue} onChange={onPay} />
              </Card>
            ) : <Alert tone="green" icon={CheckCircle2} title="Nothing more to pay">Your room was prepaid and there are no extra charges.</Alert>}
            {failure && <Alert tone="red" title={failure.code === 'PAYMENT_FAILED' ? 'Payment unsuccessful — please retry' : 'Check-out failed'}>{failure.message}</Alert>}
            <Button size="lg" variant="brass" icon={LogOut} onClick={submit} loading={pending}>{summary.balanceDue > 0 ? `Pay ${inr2(summary.balanceDue)} & check out` : 'Check out now'}</Button>
          </div>
          <Card>
            <CardHeader title="Final charges" subtitle="Calculate Final Charges" />
            <dl className="space-y-2 text-[13.5px]">
              <div className="flex justify-between"><dt>Room (incl. tax)</dt><dd className="tabular">{inr2(summary.roomTotal)}</dd></div>
              {summary.services.map((s) => <div key={s.id} className="flex justify-between text-ink-600"><dt className="truncate pr-2">{title(s.category)}</dt><dd className="tabular">{inr2(s.charge)}</dd></div>)}
              {summary.serviceTax > 0 && <div className="flex justify-between text-ink-600"><dt>Tax on services</dt><dd className="tabular">{inr2(summary.serviceTax)}</dd></div>}
              <div className="flex justify-between border-t border-ink-100 pt-2 font-semibold"><dt>Total</dt><dd className="tabular">{inr2(summary.grandTotal)}</dd></div>
              <div className="flex justify-between text-emerald-700"><dt>Already paid</dt><dd className="tabular">−{inr2(summary.netPaid)}</dd></div>
              <div className="flex justify-between border-t border-ink-100 pt-2 text-base font-semibold"><dt>Balance due</dt><dd className="tabular">{inr2(summary.balanceDue)}</dd></div>
            </dl>
          </Card>
        </div>
      )}
    </div>
  );
}
