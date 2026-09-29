/** Manage Users — SystemAdministrator.manageUsers(); User.Role.Assign (BR-2); UC-4. */
import { useState } from 'react';
import { toast } from 'sonner';
import { Lock, Search, UserPlus } from 'lucide-react';
import { Alert, Avatar, Badge, Button, Drawer, Field, Input, LoadingBlock, Modal, PageHeader, Select, Table, Toggle } from '../../components/ui/index.js';
import { TraceChips } from '../../components/viva/TraceChips.jsx';
import { useApi } from '../../lib/hooks.js';
import { api, qs } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { fmtDateTime, timeAgo } from '../../lib/format.js';

const ROLES = ['Guest', 'Receptionist', 'Hotel Manager', 'Finance Staff', 'System Administrator'];
const ROLE_TONE = { Guest: 'gray', Receptionist: 'blue', 'Hotel Manager': 'violet', 'Finance Staff': 'green', 'System Administrator': 'ink' };

export default function Users() {
  const { user: me } = useAuth();
  const [f, setF] = useState({ search: '', role: '', status: '' });
  const [applied, setApplied] = useState(f);
  const { data, loading, reload } = useApi(`/admin/users${qs(applied)}`, { deps: [applied] });
  const [sel, setSel] = useState(null);
  const [create, setCreate] = useState(false);
  const [nu, setNu] = useState({ name: '', email: '', phone: '', password: '', role: 'Receptionist', department: '' });
  const [err, setErr] = useState(null);

  const update = async (body) => {
    try { const { user } = await api.patch(`/admin/users/${sel.id}`, body); setSel(user); toast.success('User updated'); reload({ quiet: true }); } catch (e) { toast.error(e.message); }
  };
  const add = async () => {
    setErr(null);
    try { await api.post('/admin/users', nu); toast.success(`${nu.name} created`); setCreate(false); setNu({ name: '', email: '', phone: '', password: '', role: 'Receptionist', department: '' }); reload(); } catch (e) { setErr(e); }
  };
  const upd = (k) => (e) => { const n = { ...f, [k]: e.target.value }; setF(n); if (k !== 'search') setApplied(n); };

  return (
    <div>
      <PageHeader eyebrow="Administration" title="Users" subtitle="Create, update and deactivate accounts. Only the System Administrator can change roles (BR-2); every change is audited." actions={<Button icon={UserPlus} onClick={() => setCreate(true)}>New user</Button>} />
      <TraceChips screen="users" />
      <form onSubmit={(e) => { e.preventDefault(); setApplied(f); }} className="mb-4 grid gap-3 md:grid-cols-[1fr_220px_170px]">
        <Input icon={Search} placeholder="Name or e-mail" value={f.search} onChange={upd('search')} />
        <Select value={f.role} onChange={upd('role')}><option value="">All roles</option>{ROLES.map((r) => <option key={r}>{r}</option>)}</Select>
        <Select value={f.status} onChange={upd('status')}><option value="">Any status</option><option value="active">Active</option><option value="inactive">Deactivated</option></Select>
      </form>
      {loading ? <LoadingBlock /> : (
        <Table dense rows={data.users} onRowClick={setSel} columns={[
          { key: 'name', header: 'User', render: (u) => <div className="flex items-center gap-2.5"><Avatar name={u.name} /><div><div className="font-medium">{u.name}{u.id === me.id && <span className="ml-1 text-[11px] text-ink-400">(you)</span>}</div><div className="text-[11.5px] text-ink-500">{u.email}</div></div></div> },
          { key: 'role', header: 'Role', render: (u) => <Badge tone={ROLE_TONE[u.role]}>{u.role}</Badge> },
          { key: 'id2', header: 'ID', render: (u) => <span className="font-mono text-[12px]">{u.guestId || u.employeeId}</span> },
          { key: 'lastLoginAt', header: 'Last sign-in', render: (u) => (u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'never') },
          { key: 'status', header: 'Status', render: (u) => !u.isActive ? <Badge tone="red">Deactivated</Badge> : u.lockedUntil && new Date(u.lockedUntil) > new Date() ? <Badge tone="amber"><Lock className="size-3" />Locked</Badge> : <Badge tone="green">Active</Badge> },
        ]} />
      )}
      <Drawer open={Boolean(sel)} onClose={() => setSel(null)} title={sel?.name} subtitle={sel?.email}>
        {sel && (
          <div className="space-y-6 p-6">
            <div className="grid grid-cols-2 gap-3 text-sm"><div><div className="text-ink-500">Created</div>{fmtDateTime(sel.createdAt)}</div><div><div className="text-ink-500">Last sign-in</div>{sel.lastLoginAt ? fmtDateTime(sel.lastLoginAt) : 'never'}</div><div><div className="text-ink-500">MFA</div>{sel.mfaEnabled ? 'Enabled' : 'Off'}</div><div><div className="text-ink-500">Department</div>{sel.department || '—'}</div></div>
            <Field label="Role (User.Role.Assign)" hint={sel.role === 'Guest' ? 'Guest accounts cannot be converted into staff accounts.' : 'Changing a role signs the user out everywhere.'}>
              <Select value={sel.role} disabled={sel.id === me.id || sel.role === 'Guest'} onChange={(e) => update({ role: e.target.value })}>{ROLES.filter((r) => sel.role === 'Guest' || r !== 'Guest').map((r) => <option key={r}>{r}</option>)}</Select>
            </Field>
            <Toggle checked={sel.isActive} disabled={sel.id === me.id} onChange={(v) => update({ isActive: v })} label={sel.isActive ? 'Account active' : 'Account deactivated'} />
            {sel.lockedUntil && new Date(sel.lockedUntil) > new Date() && <Alert tone="amber" title="Temporarily locked">Too many failed sign-ins. <button className="font-semibold underline" onClick={() => update({ unlock: true })}>Unlock now</button></Alert>}
          </div>
        )}
      </Drawer>
      <Modal open={create} onClose={() => setCreate(false)} title="New user" footer={<><Button variant="secondary" onClick={() => setCreate(false)}>Cancel</Button><Button onClick={add}>Create user</Button></>}>
        {err && <Alert tone="red" className="mb-3">{err.message}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name"><Input value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} /></Field>
          <Field label="E-mail"><Input type="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} /></Field>
          <Field label="Phone"><Input value={nu.phone} onChange={(e) => setNu({ ...nu, phone: e.target.value })} /></Field>
          <Field label="Temporary password" hint="8+ chars, letter and number"><Input type="password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} /></Field>
          <Field label="Role"><Select value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</Select></Field>
          <Field label="Department"><Input value={nu.department} onChange={(e) => setNu({ ...nu, department: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}
