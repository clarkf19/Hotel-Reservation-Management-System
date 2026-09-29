import { useState } from 'react';
import clsx from 'clsx';
import { Workflow, Trash2 } from 'lucide-react';
import { Drawer, Tabs, EmptyState } from '../ui/index.js';
import { traceStore } from '../../lib/traceStore.js';
import { timeAgo } from '../../lib/format.js';
import { useViva } from './VivaContext.jsx';
import { SequenceReplay, TraceStepTable } from './SequenceReplay.jsx';

/** Floating "Live UML" button + drawer listing the traces of recent API calls. */
export function LiveUmlPanel() {
  const { enabled, panelOpen, setPanelOpen, traces, selectedId, setSelectedId } = useViva();
  const [view, setView] = useState('diagram');
  const meaningful = traces.filter((t) => t.steps?.length > 1);
  const selected = meaningful.find((t) => t.id === selectedId) || meaningful[0];

  return (
    <>
      {enabled && (
        <button
          onClick={() => { setSelectedId(meaningful[0]?.id); setPanelOpen(true); }}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-ink-900 py-2.5 pl-3 pr-4 text-sm font-medium text-white shadow-[var(--shadow-lift)] ring-1 ring-brass-400/40 transition hover:bg-ink-800"
        >
          <span className="relative grid size-6 place-items-center rounded-full bg-brass-400 text-ink-950"><Workflow className="size-3.5" />{meaningful.length > 0 && <span className="pulse-ring absolute inset-0 text-brass-400" />}</span>
          Live UML
          {meaningful.length > 0 && <span className="rounded-full bg-white/15 px-1.5 text-xs tabular">{meaningful.length}</span>}
        </button>
      )}
      <Drawer open={panelOpen} onClose={() => setPanelOpen(false)} width="max-w-5xl" title="Live UML execution trace" subtitle="Messages the backend actually executed, tagged with the sequence diagram (Exp 4), activity node (Exp 5) and DFD process (Exp 6) they implement.">
        {meaningful.length === 0 ? (
          <div className="p-6"><EmptyState icon={Workflow} title="No traces yet" message="Search for rooms, make a booking, check in or run an OTA sync — each action appears here as a sequence diagram." /></div>
        ) : (
          <div className="grid h-full grid-cols-1 md:grid-cols-[260px_1fr]">
            <aside className="border-r border-ink-100 bg-ink-50/50 p-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">Recent requests</span>
                <button onClick={() => traceStore.clear()} className="rounded p-1 text-ink-400 hover:bg-ink-100" aria-label="Clear"><Trash2 className="size-3.5" /></button>
              </div>
              <ul className="space-y-1">
                {meaningful.map((t) => (
                  <li key={t.id}>
                    <button onClick={() => setSelectedId(t.id)} className={clsx('w-full rounded-lg px-2.5 py-2 text-left text-[12.5px] transition', selected?.id === t.id ? 'bg-white shadow-sm ring-1 ring-ink-200' : 'hover:bg-white/70')}>
                      <div className="font-semibold text-ink-800">{t.scenario || t.label || 'Request'}</div>
                      <div className="mt-0.5 flex justify-between text-ink-500">
                        <span className="truncate">{t.method} {t.path.split('?')[0]}</span>
                        <span className={clsx('ml-2 shrink-0 tabular', t.status >= 400 ? 'text-red-600' : 'text-emerald-600')}>{t.status}</span>
                      </div>
                      <div className="text-[11px] text-ink-400">{t.steps.length} messages · {timeAgo(t.receivedAt)}</div>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
            <section className="min-w-0 p-5">
              {selected && (
                <>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-[12px] font-semibold uppercase tracking-wide text-brass-600">{selected.method} {selected.path.split('?')[0]}</div>
                      <h3 className="font-display text-xl font-semibold">{selected.scenario || 'Request trace'}</h3>
                    </div>
                    <Tabs value={view} onChange={setView} tabs={[{ value: 'diagram', label: 'Sequence diagram' }, { value: 'steps', label: 'Message list' }]} />
                  </div>
                  {view === 'diagram' ? <SequenceReplay trace={selected} /> : <TraceStepTable trace={selected} />}
                  <p className="mt-3 text-[12px] text-ink-500">Solid arrows are calls, dashed arrows are returns, red marks the failure/alternative branch. Numbers are the executed order; the tag after each message (e.g. “SD-1 msg 7”) is the message in the submitted diagram.</p>
                </>
              )}
            </section>
          </div>
        )}
      </Drawer>
    </>
  );
}
