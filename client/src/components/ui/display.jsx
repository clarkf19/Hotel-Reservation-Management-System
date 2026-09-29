import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Clock, Inbox, XCircle, Info, RefreshCw } from 'lucide-react';
import { Button } from './primitives.jsx';

/** Status badges: every status carries an icon + label, never colour alone. */
const TONES = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/15',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/15',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/15',
  gray: 'bg-ink-50 text-ink-600 ring-ink-500/15',
  brass: 'bg-brass-50 text-brass-700 ring-brass-600/20',
  ink: 'bg-ink-900 text-white ring-ink-900',
};

const STATUS = {
  // reservation (data dictionary)
  DRAFT: ['gray', 'Draft'], PENDING_PAYMENT: ['amber', 'Pending payment'], CONFIRMED: ['blue', 'Confirmed'],
  CHECKED_IN: ['green', 'Checked in'], CHECKED_OUT: ['violet', 'Checked out'], CANCELLED: ['red', 'Cancelled'],
  // payment
  INITIATED: ['gray', 'Initiated'], PROCESSING: ['amber', 'Processing'], VERIFIED: ['blue', 'Verified'], FAILED: ['red', 'Failed'], CAPTURED: ['green', 'Captured'], REFUNDED: ['violet', 'Refunded'],
  // room
  AVAILABLE: ['green', 'Available'], RESERVED: ['blue', 'Arriving'], OCCUPIED: ['brass', 'Occupied'], CLEANING: ['amber', 'Cleaning'], MAINTENANCE: ['red', 'Maintenance'], OUT_OF_SERVICE: ['red', 'Out of service'],
  // key / sync / requests / invoices
  ACTIVE: ['green', 'Active'], EXPIRED: ['gray', 'Expired'], SUCCESS: ['green', 'Success'], CONFLICT: ['red', 'Conflict'], RESOLVED: ['green', 'Resolved'],
  OPEN: ['amber', 'Open'], IN_PROGRESS: ['blue', 'In progress'], COMPLETED: ['green', 'Completed'], ISSUED: ['blue', 'Issued'], PAID: ['green', 'Paid'], VOID: ['gray', 'Void'],
  CONNECTED: ['green', 'Connected'], DISABLED: ['gray', 'Disabled'], ERROR: ['red', 'Error'],
  MATCHED: ['green', 'Matched'], MISMATCH: ['red', 'Mismatch'], MISSING_AT_GATEWAY: ['amber', 'Missing at gateway'], MISSING_IN_HRMS: ['amber', 'Missing in HRMS'],
  GRANTED: ['green', 'Granted'], DENIED: ['red', 'Denied'],
};
const ICON = { green: CheckCircle2, red: XCircle, amber: Clock, blue: Info, violet: CheckCircle2, gray: Clock, brass: CheckCircle2 };

export function StatusBadge({ status, label, className }) {
  const [tone, text] = STATUS[status] || ['gray', status?.replace(/_/g, ' ').toLowerCase()];
  const Icon = ICON[tone] || Info;
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset', TONES[tone], className)}>
      <Icon className="size-3" strokeWidth={2.5} />
      {label || text}
    </span>
  );
}

export function Badge({ tone = 'gray', children, className }) {
  return <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset', TONES[tone], className)}>{children}</span>;
}

export function PageHeader({ eyebrow, title, subtitle, actions, children }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-brass-600">{eyebrow}</div>}
        <h1 className="font-display text-[28px] leading-tight font-semibold text-ink-900 md:text-[32px]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-[14px] text-ink-500">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, sub, icon: Icon, tone = 'ink', trend }) {
  const toneCls = { ink: 'bg-ink-900 text-brass-300', green: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600', red: 'bg-red-50 text-red-600', blue: 'bg-sky-50 text-sky-600', brass: 'bg-brass-50 text-brass-600' }[tone];
  return (
    <div className="rounded-[var(--radius-xl)] border border-ink-200/70 bg-white p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-start justify-between">
        <span className="text-[13px] font-medium text-ink-500">{label}</span>
        {Icon && <span className={clsx('grid size-8 place-items-center rounded-lg', toneCls)}><Icon className="size-4" /></span>}
      </div>
      <div className="mt-2 font-display text-[28px] leading-none font-semibold tabular text-ink-900">{value}</div>
      {(sub || trend) && <div className="mt-2 text-[12px] text-ink-500">{trend}{sub}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-200 bg-paper px-6 py-12 text-center">
      <span className="mb-3 grid size-12 place-items-center rounded-full bg-ink-50 text-ink-400"><Icon className="size-6" /></span>
      <h3 className="font-semibold text-ink-800">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-ink-500">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <AlertTriangle className="mt-0.5 size-5 shrink-0" />
      <div className="flex-1">
        <div className="font-semibold">Something went wrong</div>
        <div className="mt-0.5">{error?.message || 'Unable to load this data.'}</div>
      </div>
      {onRetry && <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => onRetry()}>Retry</Button>}
    </div>
  );
}

export function Alert({ tone = 'blue', title, children, icon: Icon = Info, className }) {
  const cls = { blue: 'border-sky-200 bg-sky-50 text-sky-900', amber: 'border-amber-200 bg-amber-50 text-amber-900', red: 'border-red-200 bg-red-50 text-red-900', green: 'border-emerald-200 bg-emerald-50 text-emerald-900', brass: 'border-brass-300 bg-brass-50 text-ink-900' }[tone];
  return (
    <div className={clsx('flex gap-3 rounded-xl border p-3.5 text-[13px]', cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div>{title && <div className="font-semibold">{title}</div>}<div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div></div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-ink-200 bg-white p-1 shadow-sm">
      {tabs.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)} className={clsx('rounded-md px-3 py-1.5 text-[13px] font-medium transition', value === t.value ? 'bg-ink-900 text-white shadow' : 'text-ink-600 hover:text-ink-900')}>
          {t.label}{t.count != null && <span className={clsx('ml-1.5 rounded-full px-1.5 text-[11px]', value === t.value ? 'bg-white/20' : 'bg-ink-100')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Data table. columns: [{ key, header, render?, align?, className? }] */
export function Table({ columns, rows, rowKey = 'id', onRowClick, empty, dense }) {
  if (!rows?.length) return empty || <EmptyState title="Nothing here yet" />;
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-200/70 bg-white">
      <table className="w-full text-left text-[13px]">
        <thead className="border-b border-ink-100 bg-ink-50/60">
          <tr>{columns.map((c) => <th key={c.key} className={clsx('px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-ink-500', c.align === 'right' && 'text-right', c.className)}>{c.header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((r, i) => (
            <tr key={r[rowKey] ?? i} onClick={onRowClick ? () => onRowClick(r) : undefined} className={clsx('transition', onRowClick && 'cursor-pointer hover:bg-brass-50/50')}>
              {columns.map((c) => <td key={c.key} className={clsx(dense ? 'px-4 py-2' : 'px-4 py-3', 'align-middle text-ink-800', c.align === 'right' && 'text-right tabular', c.className)}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LoadingBlock({ rows = 4 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="skeleton h-14" />)}
    </div>
  );
}

export function KeyValue({ label, value, className }) {
  return (
    <div className={className}>
      <div className="text-[12px] font-medium uppercase tracking-wide text-ink-400">{label}</div>
      <div className="mt-0.5 text-[14px] font-medium text-ink-900">{value ?? '—'}</div>
    </div>
  );
}
