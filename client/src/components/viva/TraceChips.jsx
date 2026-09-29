import { useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, GraduationCap } from 'lucide-react';
import { SCREENS } from '../../lib/traceability.js';
import { useViva } from './VivaContext.jsx';

const ROWS = [
  ['srs', 'SRS', 'bg-sky-50 text-sky-800 ring-sky-200'],
  ['useCases', 'Use case', 'bg-violet-50 text-violet-800 ring-violet-200'],
  ['classes', 'Class', 'bg-brass-50 text-brass-700 ring-brass-300'],
  ['sequence', 'Sequence', 'bg-ink-100 text-ink-800 ring-ink-300'],
  ['activity', 'Activity', 'bg-emerald-50 text-emerald-800 ring-emerald-200'],
  ['dfd', 'DFD', 'bg-orange-50 text-orange-800 ring-orange-200'],
  ['wbs', 'WBS', 'bg-slate-50 text-slate-700 ring-slate-200'],
  ['api', 'API', 'bg-white text-ink-700 ring-ink-200 font-mono'],
  ['tables', 'Database', 'bg-white text-ink-700 ring-ink-200 font-mono'],
];

/** Viva Mode strip: where this screen comes from in the submitted documentation. */
export function TraceChips({ screen }) {
  const { enabled, openTrace } = useViva();
  const [open, setOpen] = useState(true);
  const s = SCREENS[screen];
  if (!enabled || !s) return null;
  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-brass-300/70 bg-gradient-to-r from-brass-50 to-white">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left">
        <GraduationCap className="size-4 text-brass-600" />
        <span className="text-[13px] font-semibold text-ink-800">Traceability — {s.feature}</span>
        <span className="text-[12px] text-ink-500">SRS → Use case → Class → Sequence → Activity → DFD → API → Database</span>
        <ChevronDown className={clsx('ml-auto size-4 text-ink-400 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="grid gap-2 border-t border-brass-200/60 px-4 py-3">
          {ROWS.map(([key, label, cls]) => {
            const v = s[key];
            if (!v || (Array.isArray(v) && !v.length)) return null;
            return (
              <div key={key} className="grid grid-cols-[84px_1fr] items-start gap-2">
                <span className="pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">{label}</span>
                <div className="flex flex-wrap gap-1.5">
                  {(Array.isArray(v) ? v : [v]).map((item) => <span key={item} className={clsx('rounded-md px-1.5 py-0.5 text-[11.5px] ring-1 ring-inset', cls)}>{item}</span>)}
                </div>
              </div>
            );
          })}
          <div className="pt-1 text-[12px] text-ink-500">Perform an action on this screen, then open <button onClick={() => openTrace()} className="font-semibold text-brass-700 underline decoration-dotted">Live UML</button> to watch the executed sequence diagram.</div>
        </div>
      )}
    </div>
  );
}
