import { Link } from 'react-router-dom';
import { ArrowRight, BedDouble, CalendarDays, Users } from 'lucide-react';
import { StatusBadge } from '../ui/index.js';
import { RoomImage } from './RoomCard.jsx';
import { fmtDate, inr } from '../../lib/format.js';

export function ReservationCard({ r, to }) {
  return (
    <Link to={to} className="group flex overflow-hidden rounded-2xl border border-ink-200/70 bg-white shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
      <RoomImage src={r.room?.roomType?.imageUrl} alt="" className="w-28 shrink-0 sm:w-40" />
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-mono text-[12px] text-ink-500">{r.reference || `Booking #${r.id}`}</div>
            <h3 className="truncate font-semibold text-ink-900">{r.room?.roomType?.typeName} · Room {r.room?.roomNumber}</h3>
          </div>
          <StatusBadge status={r.status} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-600">
          <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" />{fmtDate(r.checkInDate)} → {fmtDate(r.checkOutDate)}</span>
          <span className="inline-flex items-center gap-1"><Users className="size-3.5" />{r.numGuests}</span>
          <span className="inline-flex items-center gap-1"><BedDouble className="size-3.5" />{r.nights} night{r.nights > 1 ? 's' : ''}</span>
        </div>
        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="font-semibold tabular">{inr(r.totalAmount)}</span>
          <span className="inline-flex items-center gap-1 text-[13px] font-medium text-brass-700">Details <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" /></span>
        </div>
      </div>
    </Link>
  );
}
