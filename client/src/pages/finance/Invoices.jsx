/** Invoices — Invoice.generatePDF(); FinanceStaff.generateInvoice(); Invoice.Generate (issued at check-out). */
import { useState } from 'react';
import { FileDown, Search } from 'lucide-react';
import { Button, Input, LoadingBlock, PageHeader, StatusBadge, Table } from '../../components/ui/index.js';
import { TraceChips } from '../../components/viva/TraceChips.jsx';
import { useApi } from '../../lib/hooks.js';
import { api, qs } from '../../lib/api.js';
import { fmtDateTime, inr2 } from '../../lib/format.js';

export default function Invoices() {
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const { data, loading } = useApi(`/invoices${qs({ search: applied })}`, { deps: [applied] });
  return (
    <div>
      <PageHeader eyebrow="Finance" title="Invoices" subtitle="Itemised invoices generated and e-mailed automatically after check-out." />
      <TraceChips screen="invoices" />
      <form onSubmit={(e) => { e.preventDefault(); setApplied(q); }} className="mb-4 max-w-lg"><Input icon={Search} placeholder="Invoice number or guest" value={q} onChange={(e) => setQ(e.target.value)} /></form>
      {loading ? <LoadingBlock /> : (
        <Table dense rows={data.invoices} columns={[
          { key: 'invoiceNumber', header: 'Invoice', render: (i) => <span className="font-mono text-[12px] font-semibold">{i.invoiceNumber}</span> },
          { key: 'guest', header: 'Guest', render: (i) => <>{i.guest}<div className="text-[11px] text-ink-500">{i.reference} · room {i.roomNumber}</div></> },
          { key: 'issueDate', header: 'Issued', render: (i) => fmtDateTime(i.issueDate) },
          { key: 'emailed', header: 'E-mailed', render: (i) => (i.emailedAt ? '✓' : '—') },
          { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
          { key: 'totalAmount', header: 'Total', align: 'right', render: (i) => inr2(i.totalAmount) },
          { key: 'pdf', header: '', align: 'right', render: (i) => <Button size="sm" variant="ghost" icon={FileDown} onClick={() => api.openPdf(`/invoices/${i.id}/pdf`)}>PDF</Button> },
        ]} />
      )}
    </div>
  );
}
