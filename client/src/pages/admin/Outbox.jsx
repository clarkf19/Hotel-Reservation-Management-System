/** Notification outbox — every simulated e-mail, SMS, push and in-app message sent by NotificationService. */
import { useState } from 'react';
import { Badge, LoadingBlock, PageHeader, Table, Tabs } from '../../components/ui/index.js';
import { TraceChips } from '../../components/viva/TraceChips.jsx';
import { useApi } from '../../lib/hooks.js';
import { fmtDateTime } from '../../lib/format.js';

export default function Outbox() {
  const [channel, setChannel] = useState('');
  const { data, loading } = useApi(`/admin/notifications${channel ? `?channel=${channel}` : ''}`, { deps: [channel], poll: 15000 });
  return (
    <div>
      <PageHeader eyebrow="Notification service" title="Notification outbox" subtitle="Local development uses a simulated provider: nothing leaves the machine, but every message is recorded exactly as it would be sent." />
      <TraceChips screen="audit" />
      <div className="mb-4"><Tabs value={channel} onChange={setChannel} tabs={[{ value: '', label: 'All' }, { value: 'EMAIL', label: 'E-mail' }, { value: 'SMS', label: 'SMS' }, { value: 'PUSH', label: 'Push' }, { value: 'IN_APP', label: 'In-app' }]} /></div>
      {loading ? <LoadingBlock /> : (
        <Table dense rows={data.notifications} columns={[
          { key: 'createdAt', header: 'Sent', render: (n) => fmtDateTime(n.createdAt) },
          { key: 'channel', header: 'Channel', render: (n) => <Badge tone={n.channel === 'EMAIL' ? 'blue' : n.channel === 'SMS' ? 'green' : n.channel === 'PUSH' ? 'violet' : 'gray'}>{n.channel}</Badge> },
          { key: 'type', header: 'Type', render: (n) => <span className="font-mono text-[11.5px]">{n.type}</span> },
          { key: 'recipient', header: 'Recipient', render: (n) => <>{n.user}<div className="text-[11px] text-ink-500">{n.recipient}</div></> },
          { key: 'subject', header: 'Message', render: (n) => <><div className="font-medium">{n.subject}</div><div className="line-clamp-1 max-w-lg text-[12px] text-ink-500">{n.body}</div></> },
          { key: 'status', header: 'Status', render: (n) => <Badge tone="green">{n.status.toLowerCase()}</Badge> },
        ]} />
      )}
    </div>
  );
}
