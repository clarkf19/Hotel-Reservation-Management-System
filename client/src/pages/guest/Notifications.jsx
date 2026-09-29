/** Notifications — NotificationService outbox for this user (in-app, e-mail, SMS, push simulations). CI-1, CI-2, CI-3, HI-2. */
import { useState } from 'react';
import { Bell, Mail, MessageSquare, Smartphone } from 'lucide-react';
import clsx from 'clsx';
import { Card, EmptyState, LoadingBlock, PageHeader, Tabs, Badge } from '../../components/ui/index.js';
import { useApi } from '../../lib/hooks.js';
import { fmtDateTime } from '../../lib/format.js';

const ICONS = { IN_APP: Bell, EMAIL: Mail, SMS: MessageSquare, PUSH: Smartphone };

export default function Notifications() {
  const [channel, setChannel] = useState('');
  const { data, loading } = useApi(`/notifications${channel ? `?channel=${channel}` : ''}`, { deps: [channel] });
  return (
    <div>
      <PageHeader eyebrow="Notification service" title="Notifications" subtitle="Every message the hotel has sent you. E-mail, SMS and push are simulated locally and recorded here." />
      <div className="mb-5"><Tabs value={channel} onChange={setChannel} tabs={[{ value: '', label: 'All' }, { value: 'IN_APP', label: 'In-app' }, { value: 'EMAIL', label: 'E-mail' }, { value: 'SMS', label: 'SMS' }, { value: 'PUSH', label: 'Push' }]} /></div>
      {loading ? <LoadingBlock /> : !data?.notifications.length ? <EmptyState icon={Bell} title="No messages" /> : (
        <div className="space-y-3">
          {data.notifications.map((n) => {
            const Icon = ICONS[n.channel];
            return (
              <Card key={n.id} className={clsx('flex gap-4', n.channel === 'EMAIL' && 'border-l-4 border-l-sky-400')}>
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink-50 text-ink-600"><Icon className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{n.subject}</span><span className="text-[12px] text-ink-400">{fmtDateTime(n.createdAt)}</span></div>
                  <p className="mt-1 text-sm text-ink-600">{n.body}</p>
                  <div className="mt-2 flex gap-2 text-[11.5px] text-ink-500"><Badge>{n.channel.replace('_', '-').toLowerCase()}</Badge><span>to {n.recipient}</span></div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
