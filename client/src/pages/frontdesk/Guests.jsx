/** Guest look-up for front-desk staff (guest.read). */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Badge, Input, LoadingBlock, PageHeader, Table, Avatar } from '../../components/ui/index.js';
import { api, qs } from '../../lib/api.js';

export default function Guests() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  useEffect(() => { const t = setTimeout(() => api.get(`/guests${qs({ search: q })}`).then((d) => setRows(d.guests)), 250); return () => clearTimeout(t); }, [q]);
  return (
    <div>
      <PageHeader eyebrow="Guest management" title="Guests" subtitle="Search registered guests by name, e-mail, phone or 8-character guest ID." />
      <div className="mb-4 max-w-lg"><Input icon={Search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search guests…" autoFocus /></div>
      {!rows ? <LoadingBlock /> : (
        <Table rows={rows} onRowClick={(g) => navigate(`/front-desk/reservations?search=${encodeURIComponent(g.email)}`)} columns={[
          { key: 'name', header: 'Guest', render: (g) => <div className="flex items-center gap-2.5"><Avatar name={g.name} /><div><div className="font-medium">{g.name}</div><div className="text-[11.5px] text-ink-500">{g.email}</div></div></div> },
          { key: 'guestId', header: 'Guest ID', render: (g) => <span className="font-mono">{g.guestId}</span> },
          { key: 'phone', header: 'Phone' },
          { key: 'tier', header: 'Loyalty', render: (g) => <Badge tone={g.tier === 'PLATINUM' ? 'ink' : g.tier === 'GOLD' ? 'brass' : 'gray'}>{g.tier} · {g.points.toLocaleString('en-IN')} pts</Badge> },
          { key: 'reservations', header: 'Stays', align: 'right' },
        ]} />
      )}
    </div>
  );
}
