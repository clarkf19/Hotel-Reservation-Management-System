/** Reconciliation — FinanceStaff.reconcileRevenue(): HRMS payment records (D4) vs the gateway settlement report. */
import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Play, Scale, ShieldAlert } from 'lucide-react';
import { Alert, Button, Card, EmptyState, PageHeader, StatCard, StatusBadge, Table, Tabs } from '../../components/ui/index.js';
import { TraceChips } from '../../components/viva/TraceChips.jsx';
import { api } from '../../lib/api.js';
import { fmtDateTime, inr, inr2 } from '../../lib/format.js';

export default function Reconciliation() {
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(false);
  const [tab, setTab] = useState('exceptions');
  const run = async (apply) => {
    setPending(true);
    try {
      const r = await api.post('/payments/reconcile', { apply }, { label: 'Reconcile revenue' });
      setResult(r);
      toast.success(apply ? `${r.summary.matched} matched payments marked reconciled` : `Reconciliation complete: ${r.summary.exceptions} exception(s)`);
    } catch (e) { toast.error(e.message); } finally { setPending(false); }
  };
  const exceptions = result?.items.filter((i) => i.reconStatus !== 'MATCHED') || [];
  const rows = tab === 'exceptions' ? exceptions : result?.items.filter((i) => i.reconStatus === 'MATCHED') || [];
  return (
    <div>
      <PageHeader eyebrow="Finance" title="Revenue reconciliation" subtitle="Compare every HRMS payment with the payment gateway's settlement report. OTA-collected payments are settled by the OTA and excluded."
        actions={<><Button variant="secondary" icon={Play} onClick={() => run(false)} loading={pending}>Run reconciliation</Button>{result && <Button icon={CheckCircle2} onClick={() => run(true)} loading={pending}>Mark matched as reconciled</Button>}</>} />
      <TraceChips screen="payments" />
      {!result ? <EmptyState icon={Scale} title="Run a reconciliation" message="The gateway settlement report is fetched and matched transaction-by-transaction." action={<Button icon={Play} onClick={() => run(false)} loading={pending}>Run now</Button>} /> : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Transactions checked" value={result.summary.checked} icon={Scale} tone="ink" />
            <StatCard label="Matched" value={result.summary.matched} icon={CheckCircle2} tone="green" />
            <StatCard label="Exceptions" value={result.summary.exceptions} icon={ShieldAlert} tone={result.summary.exceptions ? 'red' : 'green'} />
            <StatCard label="HRMS vs gateway net" value={inr(result.summary.hrmsNetTotal)} sub={`gateway ${inr(result.summary.gatewayNetTotal)} · diff ${inr2(result.summary.hrmsNetTotal - result.summary.gatewayNetTotal)}`} tone="blue" />
          </div>
          {exceptions.length > 0 && <Alert tone="amber" className="mb-4" title={`${exceptions.length} item(s) need follow-up`}>Mismatched amounts, transactions missing at the gateway, and gateway captures with no HRMS record are listed below.</Alert>}
          <div className="mb-3"><Tabs value={tab} onChange={setTab} tabs={[{ value: 'exceptions', label: 'Exceptions', count: exceptions.length }, { value: 'matched', label: 'Matched', count: result.summary.matched }]} /></div>
          <Table dense rows={rows.map((r, i) => ({ ...r, _k: `${r.transactionRef}-${i}` }))} rowKey="_k" columns={[
            { key: 'reconStatus', header: 'Result', render: (r) => <StatusBadge status={r.reconStatus} /> },
            { key: 'transactionRef', header: 'Gateway ref', render: (r) => <span className="font-mono text-[11.5px]">{r.transactionRef}</span> },
            { key: 'reference', header: 'Reservation', render: (r) => <>{r.reference || '—'}<div className="text-[11px] text-ink-500">{r.guest}</div></> },
            { key: 'date', header: 'Date', render: (r) => fmtDateTime(r.paidAt || r.createdAt) },
            { key: 'hrmsNet', header: 'HRMS net', align: 'right', render: (r) => (r.hrmsNet != null ? inr2(r.hrmsNet) : '—') },
            { key: 'gatewayNet', header: 'Gateway net', align: 'right', render: (r) => (r.gatewayNet != null ? inr2(r.gatewayNet) : '—') },
            { key: 'issue', header: 'Issue', render: (r) => <span className="text-[12px] text-red-700">{r.issue || ''}</span> },
          ]} />
          <p className="mt-3 text-[12px] text-ink-500">Run at {fmtDateTime(result.runAt)} · recorded in the audit log.</p>
        </>
      )}
    </div>
  );
}
