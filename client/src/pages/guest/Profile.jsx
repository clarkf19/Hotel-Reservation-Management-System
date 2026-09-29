/** Profile & preferences — Guest.Profile.Manage, Guest.Profile.History, SE-3 (MFA), OR-3 (data export). */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Download, History, KeyRound, Save, SlidersHorizontal, UserRound } from 'lucide-react';
import { Button, Card, CardHeader, Field, Input, LoadingBlock, PageHeader, Select, Table, Toggle, StatusBadge } from '../../components/ui/index.js';
import { TraceChips } from '../../components/viva/TraceChips.jsx';
import { useApi } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { fmtDate, inr } from '../../lib/format.js';

export default function Profile() {
  const { refresh } = useAuth();
  const { data, loading, reload } = useApi('/me/profile');
  const { data: history } = useApi('/me/stay-history');
  const [p, setP] = useState(null);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data) setP(data.profile); }, [data]);
  if (loading || !p) return <LoadingBlock />;
  const pref = p.preferences || {};
  const setPref = (k, v) => setP({ ...p, preferences: { ...pref, [k]: v } });

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/me/profile', { name: p.name, phone: p.phone || undefined, nationality: p.nationality || undefined, address: p.address || undefined, dateOfBirth: p.dateOfBirth || null, accessibilityNeeds: p.accessibilityNeeds || undefined, preferredCurrency: p.preferredCurrency, preferences: pref, mfaEnabled: p.mfaEnabled });
      toast.success('Profile saved — future recommendations will use your preferences');
      reload({ quiet: true });
      refresh();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };
  const changePw = async () => {
    try { await api.post('/auth/password/change', pw); toast.success('Password changed'); setPw({ currentPassword: '', newPassword: '' }); } catch (e) { toast.error(e.message); }
  };
  const exportData = () => api.download('/me/export', 'hrms-data.json');

  return (
    <div>
      <PageHeader eyebrow={`Guest ID ${p.guestId}`} title="Profile & preferences" actions={<><Button variant="secondary" icon={Download} onClick={exportData}>Export my data</Button><Button icon={Save} onClick={save} loading={saving}>Save changes</Button></>} />
      <TraceChips screen="profile" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader icon={UserRound} title="Personal details" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name"><Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
            <Field label="E-mail"><Input value={p.email} disabled /></Field>
            <Field label="Mobile"><Input value={p.phone || ''} onChange={(e) => setP({ ...p, phone: e.target.value })} /></Field>
            <Field label="Date of birth"><Input type="date" value={p.dateOfBirth || ''} onChange={(e) => setP({ ...p, dateOfBirth: e.target.value })} /></Field>
            <Field label="Nationality"><Input value={p.nationality || ''} onChange={(e) => setP({ ...p, nationality: e.target.value })} /></Field>
            <Field label="Preferred currency"><Select value={p.preferredCurrency} onChange={(e) => setP({ ...p, preferredCurrency: e.target.value })}>{['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'JPY', 'AUD'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Address" className="sm:col-span-2"><Input value={p.address || ''} onChange={(e) => setP({ ...p, address: e.target.value })} /></Field>
          </div>
        </Card>
        <Card>
          <CardHeader icon={SlidersHorizontal} title="Room preferences" subtitle="Used by smart room allocation (Reservation.Allocate.Smart)" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Floor"><Select value={pref.floor || 'ANY'} onChange={(e) => setPref('floor', e.target.value)}><option value="ANY">No preference</option><option value="HIGH">High floor</option><option value="LOW">Low floor</option></Select></Field>
            <Field label="View"><Select value={pref.view || ''} onChange={(e) => setPref('view', e.target.value)}><option value="">No preference</option>{['Sea', 'City', 'Garden', 'Pool'].map((v) => <option key={v}>{v}</option>)}</Select></Field>
            <Field label="Bed"><Select value={pref.bedType || ''} onChange={(e) => setPref('bedType', e.target.value)}><option value="">No preference</option><option>King</option><option>Queen</option><option>Twin</option></Select></Field>
            <Field label="Pillow"><Select value={pref.pillow || ''} onChange={(e) => setPref('pillow', e.target.value)}><option value="">Standard</option><option>Firm</option><option>Soft</option><option>Hypoallergenic</option></Select></Field>
            <Field label="Accessibility needs" className="sm:col-span-2" hint="If set, accessible rooms are prioritised automatically."><Input value={p.accessibilityNeeds || ''} onChange={(e) => setP({ ...p, accessibilityNeeds: e.target.value })} placeholder="e.g. step-free access, roll-in shower" /></Field>
            <div className="flex flex-wrap gap-5 sm:col-span-2">
              <Toggle checked={Boolean(pref.quiet)} onChange={(v) => setPref('quiet', v)} label="Quiet room" />
              <Toggle checked={Boolean(pref.nearElevator)} onChange={(v) => setPref('nearElevator', v)} label="Near elevator" />
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader icon={KeyRound} title="Security" subtitle="SE-3 multi-factor authentication is optional" />
          <Toggle checked={Boolean(p.mfaEnabled)} onChange={(v) => setP({ ...p, mfaEnabled: v })} label="Require a one-time code at sign-in (saved with the profile)" />
          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Current password"><Input type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
            <Field label="New password"><Input type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
            <Button variant="secondary" onClick={changePw} disabled={!pw.currentPassword || pw.newPassword.length < 8}>Change</Button>
          </div>
        </Card>
        <Card>
          <CardHeader icon={History} title="Stay history" subtitle="Previous 12 months (Guest.Profile.History)" />
          <Table dense rows={history?.stays || []} columns={[
            { key: 'reference', header: 'Reservation', render: (r) => <span className="font-mono text-[12px]">{r.reference || '—'}</span> },
            { key: 'dates', header: 'Dates', render: (r) => `${fmtDate(r.checkInDate, { weekday: false })} → ${fmtDate(r.checkOutDate, { weekday: false })}` },
            { key: 'room', header: 'Room', render: (r) => r.room.roomNumber },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'total', header: 'Total', align: 'right', render: (r) => inr(r.totalAmount) },
          ]} />
        </Card>
      </div>
    </div>
  );
}
