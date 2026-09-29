import { motion } from 'framer-motion';
import clsx from 'clsx';
import { Accessibility, BedDouble, Eye, Layers, Sparkles, Users } from 'lucide-react';
import { Button } from '../ui/index.js';
import { inr } from '../../lib/format.js';

export function RoomImage({ src, alt, className }) {
  return (
    <div className={clsx('relative overflow-hidden bg-gradient-to-br from-ink-700 via-ink-800 to-ink-950', className)}>
      {src && <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
    </div>
  );
}

/** A room from search results, with its smart-allocation score and reasons (Reservation.Allocate.Smart). */
export function RoomCard({ room, best, onSelect, index = 0 }) {
  const rec = room.recommendation;
  return (
    <motion.article initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 8) * 0.04 }}
      className={clsx('group flex flex-col overflow-hidden rounded-2xl border bg-white shadow-[var(--shadow-soft)] transition hover:shadow-[var(--shadow-lift)] sm:flex-row', best ? 'border-brass-400 ring-2 ring-brass-300/50' : 'border-ink-200/70')}>
      <div className="relative sm:w-72 sm:shrink-0">
        <RoomImage src={room.roomType.imageUrl} alt={room.roomType.typeName} className="aspect-[16/10] h-full sm:aspect-auto" />
        {best && <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-brass-400 px-2.5 py-1 text-[11.5px] font-bold text-ink-950 shadow"><Sparkles className="size-3.5" />Best match</span>}
        <span className="absolute bottom-3 left-3 rounded-md bg-ink-950/75 px-2 py-0.5 text-[12px] font-semibold text-white backdrop-blur">Room {room.roomNumber}</span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brass-600">{room.roomType.category.toLowerCase()}</div>
            <h3 className="font-display text-xl font-semibold">{room.roomType.typeName}</h3>
          </div>
          {rec && (
            <div className="text-right" title="Smart allocation score (0-100)">
              <div className={clsx('font-display text-2xl font-semibold tabular', rec.score >= 75 ? 'text-emerald-600' : rec.score >= 55 ? 'text-ink-800' : 'text-ink-500')}>{rec.score}</div>
              <div className="text-[10.5px] uppercase tracking-wide text-ink-400">match</div>
            </div>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-600">
          <span className="inline-flex items-center gap-1"><Users className="size-3.5" />Sleeps {room.capacity}</span>
          <span className="inline-flex items-center gap-1"><BedDouble className="size-3.5" />{room.roomType.bedType}</span>
          <span className="inline-flex items-center gap-1"><Layers className="size-3.5" />Floor {room.floor}</span>
          {room.view && <span className="inline-flex items-center gap-1"><Eye className="size-3.5" />{room.view} view</span>}
          {room.accessible && <span className="inline-flex items-center gap-1 text-sky-700"><Accessibility className="size-3.5" />Accessible</span>}
        </div>
        {rec?.reasons?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {rec.reasons.slice(0, 4).map((r) => <span key={r} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11.5px] font-medium text-emerald-700">✓ {r}</span>)}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">{room.roomType.amenities.slice(0, 5).map((a) => <span key={a} className="rounded-md bg-ink-50 px-2 py-0.5 text-[11.5px] text-ink-600">{a}</span>)}</div>
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div>
            <div className="text-[12px] text-ink-500">{inr(room.baseRate)} × {room.pricing.nights} night{room.pricing.nights > 1 ? 's' : ''} + tax</div>
            <div className="font-display text-2xl font-semibold tabular">{inr(room.pricing.total)}</div>
          </div>
          <Button variant={best ? 'brass' : 'primary'} onClick={() => onSelect(room)}>Select room</Button>
        </div>
      </div>
    </motion.article>
  );
}
