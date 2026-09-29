/** Loyalty — Guest.Rewards.Accrue / Redeem, BR-6; UML LoyaltyAccount.getBalance(). */
import { Crown, Gift, TrendingUp } from 'lucide-react';
import clsx from 'clsx';
import { Card, CardHeader, ErrorState, LoadingBlock, PageHeader, Table, Badge } from '../../components/ui/index.js';
import { TraceChips } from '../../components/viva/TraceChips.jsx';
import { useApi } from '../../lib/hooks.js';
import { fmtDateTime, reference } from '../../lib/format.js';

const TIER_STYLE = { SILVER: 'from-slate-300 via-slate-100 to-slate-400 text-ink-900', GOLD: 'from-brass-500 via-brass-300 to-brass-600 text-ink-950', PLATINUM: 'from-ink-700 via-ink-500 to-ink-900 text-white' };

export default function Loyalty() {
  const { data, error, loading, reload } = useApi('/me/loyalty');
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading) return <LoadingBlock />;
  const pct = data.nextTier ? Math.min(100, (data.lifetimePoints / data.nextTier.minLifetimePoints) * 100) : 100;
  return (
    <div>
      <PageHeader eyebrow="Guest preference and loyalty" title="Loyalty rewards" />
      <TraceChips screen="loyalty" />
      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <div className={clsx('relative aspect-[1.6] overflow-hidden rounded-3xl bg-gradient-to-br p-7 shadow-[var(--shadow-lift)]', TIER_STYLE[data.tier] || TIER_STYLE.SILVER)}>
          <div className="absolute -right-10 -top-10 size-48 rounded-full bg-white/20" />
          <div className="relative flex h-full flex-col justify-between">
            <div className="flex items-center justify-between"><span className="font-display text-lg font-semibold">Solstice Rewards</span><Crown className="size-6" /></div>
            <div><div className="text-[12px] uppercase tracking-[0.2em] opacity-70">Points balance</div><div className="font-display text-5xl font-semibold tabular">{data.balance.toLocaleString('en-IN')}</div></div>
            <div className="flex items-end justify-between"><span className="text-xl font-semibold tracking-widest">{data.tier}</span><span className="text-[12px] opacity-75">×{data.tierMultiplier} earning</span></div>
          </div>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader icon={TrendingUp} title="Tier progress" subtitle={`${data.lifetimePoints.toLocaleString('en-IN')} lifetime points`} />
            <div className="h-3 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-gradient-to-r from-brass-400 to-brass-600 transition-all" style={{ width: `${pct}%` }} /></div>
            <div className="mt-3 flex justify-between text-[12px] text-ink-500">{data.tiers.map((t) => <span key={t.name} className={t.name === data.tier ? 'font-semibold text-ink-900' : ''}>{t.name} · {t.minLifetimePoints.toLocaleString('en-IN')}+</span>)}</div>
            <p className="mt-3 text-sm text-ink-600">{data.nextTier ? <>Earn <b>{data.nextTier.pointsNeeded.toLocaleString('en-IN')}</b> more points to reach <b>{data.nextTier.name}</b>.</> : 'You have reached our highest tier.'}</p>
          </Card>
          <Card>
            <CardHeader icon={Gift} title="How it works" />
            <ul className="space-y-1.5 text-sm text-ink-600"><li>• Earn: {data.rules.earn}.</li><li>• Redeem: {data.rules.redeem}, when you book.</li></ul>
          </Card>
        </div>
      </div>
      <h2 className="mb-3 mt-8 font-semibold">Points history</h2>
      <Table rows={data.transactions} columns={[
        { key: 'createdAt', header: 'Date', render: (t) => fmtDateTime(t.createdAt) },
        { key: 'type', header: 'Type', render: (t) => <Badge tone={t.type === 'ACCRUAL' ? 'green' : t.type === 'REDEMPTION' ? 'brass' : 'blue'}>{t.type.toLowerCase()}</Badge> },
        { key: 'description', header: 'Description' },
        { key: 'res', header: 'Reservation', render: (t) => t.reservationNumber ? <span className="font-mono text-[12px]">{reference(t.reservationNumber)}</span> : '—' },
        { key: 'points', header: 'Points', align: 'right', render: (t) => <span className={t.points > 0 ? 'text-emerald-700' : 'text-brass-700'}>{t.points > 0 ? '+' : ''}{t.points.toLocaleString('en-IN')}</span> },
      ]} />
    </div>
  );
}
