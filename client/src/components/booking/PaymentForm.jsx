/**
 * Payment details form (DFD 3.1 "Validate Payment Details": Card / UPI / Net Banking / Wallet).
 * Card numbers are sent once to the mock gateway over the API and never stored (SE-4).
 */
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { CreditCard, Smartphone, Landmark, Wallet, Lock, FlaskConical, BadgeIndianRupee } from 'lucide-react';
import { Field, Input, Select } from '../ui/index.js';
import { inr2 } from '../../lib/format.js';

const METHODS = [
  { value: 'CARD', label: 'Card', icon: CreditCard },
  { value: 'UPI', label: 'UPI', icon: Smartphone },
  { value: 'NET_BANKING', label: 'Net banking', icon: Landmark },
  { value: 'WALLET', label: 'Wallet', icon: Wallet },
];
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'JPY', 'AUD'];
const APPROX = { INR: 1, USD: 83.2, EUR: 90.4, GBP: 105.6, AED: 22.65, SGD: 61.8, JPY: 0.56, AUD: 54.9 };

export const TEST_CARDS = [
  ['4242 4242 4242 4242', 'Approved'],
  ['4000 0000 0000 0002', 'Declined — insufficient funds'],
  ['4000 0000 0009 0003', 'Gateway timeout'],
];

const fmtCard = (v) => v.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();

export function PaymentForm({ amount, onChange, showCurrency = true, razorpay }) {
  const [gateway, setGateway] = useState('MOCK');
  const [method, setMethod] = useState('CARD');
  const [d, setD] = useState({ cardNumber: '', expiry: '', cvv: '', cardholder: '', upiId: '', bank: 'HDFC Bank', wallet: 'Paytm' });
  const [payCurrency, setPayCurrency] = useState('INR');

  useEffect(() => {
    if (gateway === 'RAZORPAY') { onChange({ method: 'RAZORPAY' }); return; }
    const details = method === 'CARD' ? { cardNumber: d.cardNumber, expiry: d.expiry, cvv: d.cvv, cardholder: d.cardholder } : method === 'UPI' ? { upiId: d.upiId } : method === 'NET_BANKING' ? { bank: d.bank } : { wallet: d.wallet };
    onChange({ method, details, payCurrency: payCurrency === 'INR' ? undefined : payCurrency });
  }, [gateway, method, d, payCurrency, onChange]);

  const set = (k, f = (x) => x) => (e) => setD({ ...d, [k]: f(e.target.value) });

  const useRazorpay = razorpay?.enabled && gateway === 'RAZORPAY';
  return (
    <div className="space-y-4">
      {razorpay?.enabled && (
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ['RAZORPAY', BadgeIndianRupee, `Razorpay${razorpay.mode === 'live' ? '' : ' (test mode)'}`, razorpay.mode === 'live' ? 'Real payment via UPI, card or net banking' : 'Razorpay sandbox — no real money'],
            ['MOCK', FlaskConical, 'Sandbox gateway', 'Built-in simulator with test cards'],
          ].map(([key, Icon, label, sub]) => (
            <button type="button" key={key} onClick={() => setGateway(key)} className={clsx('flex items-center gap-3 rounded-xl border p-3 text-left transition', gateway === key ? 'border-ink-900 bg-ink-900 text-white shadow' : 'border-ink-200 bg-white hover:border-ink-300')}>
              <Icon className="size-6 shrink-0" />
              <span><span className="block text-sm font-semibold">{label}</span><span className={clsx('block text-[12px]', gateway === key ? 'text-ink-300' : 'text-ink-500')}>{sub}</span></span>
            </button>
          ))}
        </div>
      )}
      {useRazorpay ? (
        <div className="space-y-2 rounded-xl border border-ink-200 bg-ink-50/70 p-4 text-[13px] text-ink-700">
          <p>You'll complete payment in Razorpay's secure window (UPI, cards, net banking, wallets). Your details go directly to Razorpay and never reach the hotel's system.</p>
          {razorpay.demoChargeAmount ? (
            <p className="rounded-lg bg-brass-50 px-3 py-2 text-ink-800">
              <b>Demo charge:</b> Razorpay will charge only <b>{inr2(razorpay.demoChargeAmount)}</b>{razorpay.mode === 'live' ? ' (real money)' : ''}, not the full {inr2(amount)}. The booking is recorded at its full value and the payment is labelled as a demo charge.
            </p>
          ) : (
            <p>Razorpay will charge the full <b>{inr2(amount)}</b>{razorpay.mode === 'live' ? ' (real money)' : ''}.</p>
          )}
          {razorpay.mode !== 'live' && <p className="text-[12px] text-ink-500">Test mode: use UPI ID <span className="font-mono">success@razorpay</span> or a Razorpay test card. No money moves.</p>}
        </div>
      ) : (
      <>
      <div className="grid grid-cols-4 gap-2">
        {METHODS.map((m) => (
          <button type="button" key={m.value} onClick={() => setMethod(m.value)} className={clsx('flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-[12.5px] font-medium transition', method === m.value ? 'border-ink-900 bg-ink-900 text-white shadow' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300')}>
            <m.icon className="size-5" />{m.label}
          </button>
        ))}
      </div>

      {method === 'CARD' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Card number" className="sm:col-span-2"><Input inputMode="numeric" autoComplete="cc-number" placeholder="4242 4242 4242 4242" value={d.cardNumber} onChange={set('cardNumber', fmtCard)} className="font-mono" /></Field>
          <Field label="Name on card" className="sm:col-span-2"><Input autoComplete="cc-name" value={d.cardholder} onChange={set('cardholder')} /></Field>
          <Field label="Expiry (MM/YY)"><Input placeholder="12/30" autoComplete="cc-exp" value={d.expiry} onChange={set('expiry', (v) => v.replace(/[^\d/]/g, '').replace(/^(\d{2})(\d)/, '$1/$2').slice(0, 5))} /></Field>
          <Field label="CVV"><Input type="password" inputMode="numeric" autoComplete="cc-csc" placeholder="•••" value={d.cvv} onChange={set('cvv', (v) => v.replace(/\D/g, '').slice(0, 4))} /></Field>
          <div className="rounded-lg border border-dashed border-ink-300 bg-ink-50/70 p-3 sm:col-span-2">
            <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-ink-600"><FlaskConical className="size-3.5" />Sandbox test cards (mock payment gateway)</div>
            <div className="flex flex-wrap gap-1.5">
              {TEST_CARDS.map(([n, label]) => (
                <button type="button" key={n} onClick={() => setD({ ...d, cardNumber: n, expiry: '12/30', cvv: '123', cardholder: d.cardholder || 'Demo Guest' })} className="rounded-md bg-white px-2 py-1 text-[11.5px] ring-1 ring-ink-200 hover:ring-brass-400">
                  <span className="font-mono">•••• {n.slice(-4)}</span> <span className="text-ink-500">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {method === 'UPI' && <Field label="UPI ID" hint="Use fail@upi to simulate a declined UPI payment."><Input placeholder="name@okhdfc" value={d.upiId} onChange={set('upiId')} /></Field>}
      {method === 'NET_BANKING' && <Field label="Bank"><Select value={d.bank} onChange={set('bank')}>{['HDFC Bank', 'State Bank of India', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra Bank'].map((b) => <option key={b}>{b}</option>)}</Select></Field>}
      {method === 'WALLET' && <Field label="Wallet"><Select value={d.wallet} onChange={set('wallet')}>{['Paytm', 'PhonePe', 'Amazon Pay', 'Google Pay'].map((b) => <option key={b}>{b}</option>)}</Select></Field>}

      {showCurrency && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-ink-50 px-3 py-2.5 text-[13px]">
          <label className="flex items-center gap-2">Pay in
            <Select value={payCurrency} onChange={(e) => setPayCurrency(e.target.value)} className="h-8 w-24">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select>
          </label>
          <span className="text-ink-600">
            Charged <b className="tabular text-ink-900">{inr2(amount)}</b>
            {payCurrency !== 'INR' && <> ≈ <b className="tabular">{(amount / APPROX[payCurrency]).toFixed(2)} {payCurrency}</b> <span className="text-ink-400">(indicative; final rate applied by the gateway)</span></>}
          </span>
        </div>
      )}
      </>
      )}
      <p className="flex items-center gap-1.5 text-[12px] text-ink-500"><Lock className="size-3.5" />Processed by a PCI-DSS gateway. We never store your card number — only the brand and last four digits.</p>
    </div>
  );
}
