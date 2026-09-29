/** Payments — FinanceStaff.verifyPayments(); D4 Payment Records; SE-4 (only masked instrument data). */
import { useState } from 'react';
import { toast } from 'sonner';
import { BadgeCheck, IndianRupee, RotateCcw, Search, XCircle } from 'lucide-react';
import { Badge, Button, Input, LoadingBlock, PageHeader, Select, StatCard, StatusBadge, Table } from '../../components/ui/index.js';
import { TraceChips } from '../../components/viva/TraceChips.jsx';
import { useApi } from '../../lib/hooks.js';
import { api, qs } from '../../lib/api.js';
import { fmtDateTime, inr, inr2, title } from '../../lib/format.js';

export default function Payments() {
  const [f, setF] = useState({ status: '', method: '', unverified: '', search: '' });
  const [applied, setApplied] = useState(f);
  const { data, loading, reload } = useApi(`/payments${qs(applied)}`, { deps: [applied] });
  const verify = async (p) => {
    try { await api.post(`/payments/${p.id}/verify`, {}); toast.success(`Payment ${p.transactionRef} verified`); reload({ quiet: true }); } catch (e) { toast.error(e.message); }
  };
  const t = data?.totals || {};
  const captured = (t.CAPTURED?.amount || 0) + (t.REFUNDED?.amount || 0);
  const refunded = (t.CAPTURED?.refunded || 0) + (t.REFUNDED?.refunded || 0);
  const upd = (k) => (e) => { const n = { ...f, [k]: e.target.value }; setF(n); if (k !== 'search') setApplied(n); };
  return (
    <div>
      <PageHeader eyebrow="Finance" title="Payments" subtitle="Every payment transaction (SE-6 audited). Card data is never stored — only brand and last four digits." />
      <TraceChips screen="payments" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Captured (all time)" value={inr(captured)} icon={IndianRupee} tone="green" />
        <StatCard label="Refunded" value={inr(refunded)} icon={RotateCcw} tone="blue" />
        <StatCard label="Failed attempts" value={t.FAILED?.count || 0} icon={XCircle} tone="red" />
        <StatCard label="Transactions" value={Object.values(t).reduce((s, x) => s + x.count, 0)} icon={BadgeCheck} tone="ink" />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); setApplied(f); }} className="mb-4 grid gap-3 md:grid-cols-[1fr_170px_170px_190px]">
        <Input icon={Search} placeholder="Guest name or transaction reference" value={f.search} onChange={upd('search')} />
        <Select value={f.status} onChange={upd('status')}><option value="">All statuses</option>{['CAPTURED', 'REFUNDED', 'FAILED', 'VERIFIED', 'PROCESSING'].map((s) => <option key={s} value={s}>{title(s)}</option>)}</Select>
        <Select value={f.method} onChange={upd('method')}><option value="">All methods</option>{['CARD', 'UPI', 'NET_BANKING', 'WALLET'].map((s) => <option key={s} value={s}>{title(s)}</option>)}</Select>
        <Select value={f.unverified} onChange={upd('unverified')}><option value="">Verified + unverified</option><option value="true">Awaiting verification</option></Select>
      </form>
      {loading ? <LoadingBlock /> : (
        <Table dense rows={data.payments} columns={[
          { key: 'createdAt', header: 'Date', render: (p) => fmtDateTime(p.paidAt || p.createdAt) },
          { key: 'reference', header: 'Reservation', render: (p) => <><span className="font-mono text-[12px]">{p.reference || `#${p.reservationId}`}</span><div className="text-[11.5px] text-ink-500">{p.guest}</div></> },
          { key: 'purpose', header: 'Purpose', render: (p) => title(p.purpose) },
          { key: 'method', header: 'Method', render: (p) => <>{p.methodSummary}{p.originalCurrency && <div className="text-[11px] text-ink-500">{p.originalAmount} {p.originalCurrency}</div>}</> },
          { key: 'txn', header: 'Gateway ref', render: (p) => <span className="font-mono text-[11px] text-ink-500">{p.transactionRef}</span> },
          { key: 'status', header: 'Status', render: (p) => <><StatusBadge status={p.status} />{p.failureReason && <div className="mt-0.5 text-[11px] text-red-600">{p.failureReason}</div>}</> },
          { key: 'amount', header: 'Amount', align: 'right', render: (p) => <>{inr2(p.amount)}{p.refundedAmount > 0 && <div className="text-[11px] text-violet-600">−{inr2(p.refundedAmount)}</div>}</> },
          { key: 'verify', header: 'Verification', render: (p) => p.verifiedAt ? <Badge tone="green">✓ {p.verifiedBy || 'verified'}</Badge> : ['CAPTURED', 'REFUNDED'].includes(p.status) ? <Button size="sm" variant="secondary" onClick={() => verify(p)}>Verify</Button> : '—' },
        ]} />
      )}
    </div>
  );
}
