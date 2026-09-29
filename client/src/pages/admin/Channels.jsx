/** OTA connections — Channel.Connect.Manage (add, configure or disable an OTA channel); CO-2 HTTPS; CO-4 >= 2 OTAs. */
import { useState } from 'react';
import { toast } from 'sonner';
import { Network, Plus } from 'lucide-react';
import { Alert, Button, Card, Field, Input, LoadingBlock, Modal, PageHeader, Select, StatusBadge } from '../../components/ui/index.js';
import { TraceChips } from '../../components/viva/TraceChips.jsx';
import { useApi } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { inr, timeAgo } from '../../lib/format.js';

const EMPTY = { channelName: '', code: '', apiEndpoint: 'https://', commissionPercent: 15, status: 'CONNECTED' };

export default function Channels() {
  const { data, loading, reload } = useApi('/channels');
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState(null);
  const save = async () => {
    setErr(null);
    try {
      const body = { channelName: edit.channelName, code: edit.code, apiEndpoint: edit.apiEndpoint, commissionPercent: Number(edit.commissionPercent), status: edit.status };
      if (edit.id) await api.patch(`/channels/${edit.id}`, body); else await api.post('/channels', body);
      toast.success('Channel saved');
      setEdit(null); reload({ quiet: true });
    } catch (e) { setErr(e); }
  };
  const connected = (data?.channels || []).filter((c) => c.status !== 'DISABLED').length;
  return (
    <div>
      <PageHeader eyebrow="Administration" title="OTA connections" subtitle="Third-party booking platforms connected through the OTAPlatform interface." actions={<Button icon={Plus} onClick={() => setEdit(EMPTY)}>Add channel</Button>} />
      <TraceChips screen="settings" />
      {connected < 2 && <Alert tone="amber" className="mb-4">CO-4 requires at least two connected OTA platforms for Release 1.0.</Alert>}
      {loading ? <LoadingBlock /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.channels.map((c) => (
            <Card key={c.id}>
              <div className="flex items-start justify-between"><div className="flex items-center gap-2.5"><span className="grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-600"><Network className="size-5" /></span><div><div className="font-semibold">{c.channelName}</div><div className="font-mono text-[11px] text-ink-400">{c.code}</div></div></div><StatusBadge status={c.status} /></div>
              <div className="mt-3 truncate font-mono text-[12px] text-ink-500">{c.apiEndpoint}</div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[12px]"><div><b className="block text-base">{c.bookings}</b>bookings</div><div><b className="block text-base">{inr(c.revenue)}</b>revenue</div><div><b className="block text-base">{c.commissionPercent}%</b>commission</div></div>
              <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3 text-[12px] text-ink-500"><span>Last sync {c.lastSyncAt ? timeAgo(c.lastSyncAt) : 'never'}</span><Button size="sm" variant="secondary" onClick={() => setEdit(c)}>Configure</Button></div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?.id ? `Configure ${edit.channelName}` : 'Add OTA channel'} footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save}>Save</Button></>}>
        {edit && (
          <div className="grid gap-3 sm:grid-cols-2">
            {err && <Alert tone="red" className="sm:col-span-2">{err.message}</Alert>}
            <Field label="Name"><Input value={edit.channelName} onChange={(e) => setEdit({ ...edit, channelName: e.target.value })} /></Field>
            <Field label="Code"><Input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="API endpoint (HTTPS, CO-2)" className="sm:col-span-2"><Input value={edit.apiEndpoint} onChange={(e) => setEdit({ ...edit, apiEndpoint: e.target.value })} /></Field>
            <Field label="Commission %"><Input type="number" value={edit.commissionPercent} onChange={(e) => setEdit({ ...edit, commissionPercent: e.target.value })} /></Field>
            <Field label="Connection" hint="ERROR simulates the OTA API being down."><Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="CONNECTED">Connected</option><option value="DISABLED">Disabled</option><option value="ERROR">Error (simulate outage)</option></Select></Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
