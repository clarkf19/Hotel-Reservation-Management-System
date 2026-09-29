/** System configuration — SystemAdministrator.systemSettings(); exchange rates (SI-5.1) and health. */
import { useState } from 'react';
import { toast } from 'sonner';
import { Activity, Save, Settings2 } from 'lucide-react';
import { Button, Card, CardHeader, Input, LoadingBlock, PageHeader, Textarea, KeyValue } from '../../components/ui/index.js';
import { TraceChips } from '../../components/viva/TraceChips.jsx';
import { useApi } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { fmtDateTime, timeAgo } from '../../lib/format.js';

function SettingRow({ s, onSaved }) {
  const isObj = typeof s.value === 'object';
  const [v, setV] = useState(isObj ? JSON.stringify(s.value, null, 1) : String(s.value));
  const dirty = v !== (isObj ? JSON.stringify(s.value, null, 1) : String(s.value));
  const save = async () => {
    let value = v;
    try {
      if (isObj) value = JSON.parse(v);
      else if (typeof s.defaultValue === 'number') value = Number(v);
      await api.put(`/admin/settings/${s.key}`, { value });
      toast.success(`${s.key} updated`);
      onSaved();
    } catch (e) { toast.error(e.message); }
  };
  return (
    <div className="grid gap-2 border-b border-ink-100 py-3 last:border-0 md:grid-cols-[260px_1fr_auto] md:items-center">
      <div><div className="font-mono text-[12.5px] font-semibold">{s.key}</div><div className="text-[12px] text-ink-500">{s.description}</div></div>
      {isObj ? <Textarea value={v} onChange={(e) => setV(e.target.value)} className="font-mono text-[12px]" rows={4} /> : <Input value={v} onChange={(e) => setV(e.target.value)} />}
      <Button size="sm" variant={dirty ? 'primary' : 'ghost'} icon={Save} disabled={!dirty} onClick={save}>Save</Button>
    </div>
  );
}

export default function Settings() {
  const { data, loading, reload } = useApi('/admin/settings');
  const { data: health } = useApi('/admin/health', { poll: 30000 });
  return (
    <div>
      <PageHeader eyebrow="Administration" title="System configuration" subtitle="Hotel policies and integration parameters. Every change is recorded in the audit log." />
      <TraceChips screen="settings" />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader icon={Settings2} title="Settings" />
          {loading ? <LoadingBlock /> : data.settings.map((s) => <SettingRow key={s.key} s={s} onSaved={() => reload({ quiet: true })} />)}
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader icon={Activity} title="System health" />
            {health && <div className="grid grid-cols-2 gap-4">
              <KeyValue label="Database" value={<span className="text-emerald-600">● {health.database}</span>} />
              <KeyValue label="Users" value={health.users} />
              <KeyValue label="Reservations" value={health.reservations} />
              <KeyValue label="Active keys" value={health.activeKeys} />
              <KeyValue label="Last OTA sync" value={health.lastChannelSync ? timeAgo(health.lastChannelSync) : '—'} className="col-span-2" />
            </div>}
          </Card>
          <Card>
            <CardHeader title="Exchange rates" subtitle="CurrencyExchangeRateService · refreshed ≤ 24 h (SI-5.1)" />
            <ul className="divide-y divide-ink-100 text-[13px]">
              {(health?.exchangeRates || []).map((r) => <li key={r.currency} className="flex justify-between py-1.5"><span className="font-semibold">1 {r.currency}</span><span className="tabular">₹{r.rate.toFixed(4)}</span><span className="text-ink-400">{fmtDateTime(r.fetchedAt)}</span></li>)}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
