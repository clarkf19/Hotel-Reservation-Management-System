/** Roles & permissions matrix — SystemAdministrator.manageRoles() / managePermissions(); UML Role 1 grants 0..* Permission. */
import { toast } from 'sonner';
import clsx from 'clsx';
import { Check, ShieldCheck } from 'lucide-react';
import { Alert, LoadingBlock, PageHeader } from '../../components/ui/index.js';
import { TraceChips } from '../../components/viva/TraceChips.jsx';
import { useApi } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';

export default function Roles() {
  const { data, loading, setData } = useApi('/admin/roles');
  const toggle = async (role, perm, granted) => {
    try { setData(await api.put(`/admin/roles/${role.id}/permissions/${perm.id}`, { granted })); toast.success(`${granted ? 'Granted' : 'Revoked'} ${perm.permissionName} ${granted ? 'to' : 'from'} ${role.roleName}`); } catch (e) { toast.error(e.message); }
  };
  if (loading) return <LoadingBlock />;
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Roles & permissions" subtitle="Toggle a cell to grant or revoke. Changes take effect on the user's next request — the API checks permissions on every call." />
      <TraceChips screen="users" />
      <Alert tone="blue" icon={ShieldCheck} className="mb-4">The five roles are the SRS 2.3 user classes. Permissions were derived from each role's use cases and class-diagram operations (see docs/ASSUMPTIONS.md).</Alert>
      <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white">
        <table className="w-full min-w-[900px] text-[13px]">
          <thead className="sticky top-0 bg-ink-900 text-white">
            <tr><th className="px-4 py-3 text-left font-semibold">Permission</th>{data.roles.map((r) => <th key={r.id} className="px-2 py-3 text-center font-semibold">{r.roleName}<div className="text-[11px] font-normal text-ink-300">{r.userCount} users</div></th>)}</tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {data.permissions.map((p) => (
              <tr key={p.id} className="hover:bg-brass-50/40">
                <td className="px-4 py-2"><div className="font-mono text-[12px] font-semibold text-ink-900">{p.permissionName}</div><div className="text-[11.5px] text-ink-500">{p.description}</div></td>
                {data.roles.map((r) => {
                  const on = r.permissionIds.includes(p.id);
                  return (
                    <td key={r.id} className="px-2 py-2 text-center">
                      <button onClick={() => toggle(r, p, !on)} aria-label={`${on ? 'Revoke' : 'Grant'} ${p.permissionName} for ${r.roleName}`} className={clsx('inline-grid size-7 place-items-center rounded-md border transition', on ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-ink-200 bg-white text-transparent hover:border-ink-400')}><Check className="size-4" /></button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
