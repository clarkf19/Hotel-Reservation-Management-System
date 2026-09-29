/**
 * Renders a UML execution trace (returned by the API) as an animated sequence diagram:
 * lifelines in order of first appearance, synchronous calls as solid arrows, returns as
 * dashed arrows, self-messages as loops, alt/fork/join markers, failure branches in red.
 */
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Pause, Play, RotateCcw } from 'lucide-react';

const COL = 190;
const ROW = 34;
const TOP = 58;

export function SequenceReplay({ trace, autoplay = true, speed = 380 }) {
  const steps = trace?.steps || [];
  const lifelines = useMemo(() => {
    const order = [];
    for (const s of steps) for (const p of [s.from, s.to]) if (!order.includes(p)) order.push(p);
    return order;
  }, [steps]);
  const [shown, setShown] = useState(autoplay ? 0 : steps.length);
  const [playing, setPlaying] = useState(autoplay);

  useEffect(() => { setShown(autoplay ? 0 : steps.length); setPlaying(autoplay); }, [trace, autoplay, steps.length]);
  useEffect(() => {
    if (!playing) return undefined;
    if (shown >= steps.length) { setPlaying(false); return undefined; }
    const t = setTimeout(() => setShown((n) => n + 1), speed);
    return () => clearTimeout(t);
  }, [playing, shown, steps.length, speed]);

  if (!steps.length) return <div className="p-6 text-sm text-ink-500">No messages recorded for this request.</div>;

  const width = Math.max(560, lifelines.length * COL + 40);
  const height = TOP + steps.length * ROW + 30;
  const x = (name) => 20 + lifelines.indexOf(name) * COL + COL / 2;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <button onClick={() => { if (shown >= steps.length) setShown(0); setPlaying((p) => !p); }} className="inline-flex items-center gap-1.5 rounded-md bg-ink-900 px-2.5 py-1 text-xs font-medium text-white">
          {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}{playing ? 'Pause' : shown >= steps.length ? 'Replay' : 'Play'}
        </button>
        <button onClick={() => { setShown(steps.length); setPlaying(false); }} className="rounded-md border border-ink-200 px-2.5 py-1 text-xs text-ink-600">Show all</button>
        <button onClick={() => { setShown(0); setPlaying(true); }} className="rounded-md p-1 text-ink-500 hover:bg-ink-100" aria-label="Restart"><RotateCcw className="size-3.5" /></button>
        <span className="ml-auto text-xs text-ink-500 tabular">{Math.min(shown, steps.length)} / {steps.length} messages · {trace.totalMs} ms</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-ink-200 bg-paper">
        <svg width={width} height={height} className="block" role="img" aria-label={`Sequence diagram: ${trace.scenario || 'request'}`}>
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#18223b" /></marker>
            <marker id="arr-open" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10" fill="none" stroke="#5b6680" strokeWidth="1.5" /></marker>
            <marker id="arr-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#dc2626" /></marker>
          </defs>
          {lifelines.map((name) => (
            <g key={name}>
              <rect x={x(name) - 64} y={10} width={128} height={30} rx={7} fill={name === 'Guest' || name === 'Receptionist' || name === 'HotelManager' ? '#0f1629' : '#ffffff'} stroke="#18223b" strokeWidth="1.2" />
              <text x={x(name)} y={29} textAnchor="middle" fontSize="11.5" fontWeight="600" fill={name === 'Guest' || name === 'Receptionist' || name === 'HotelManager' ? '#e4cb97' : '#0f1629'}>{name.length > 19 ? `${name.slice(0, 18)}…` : name}</text>
              <line x1={x(name)} y1={40} x2={x(name)} y2={height - 10} stroke="#b7bdca" strokeDasharray="4 4" />
            </g>
          ))}
          {steps.slice(0, shown).map((s, i) => {
            const y = TOP + i * ROW + 10;
            const fail = s.branch === 'failure';
            const color = fail ? '#dc2626' : s.kind === 'return' ? '#5b6680' : '#18223b';
            const label = `${s.seq}. ${s.message}`;
            if (s.kind === 'fork' || s.kind === 'join') {
              return (
                <g key={i} className="animate-[fadein_.3s]">
                  <rect x={x(s.from) - 70} y={y - 5} width={140} height={7} rx={2} fill="#0f1629" />
                  <text x={x(s.from) + 78} y={y + 3} fontSize="11" fontWeight="600" fill="#a57c34">{s.message}</text>
                </g>
              );
            }
            if (s.from === s.to) {
              const cx = x(s.from);
              return (
                <g key={i}>
                  <path d={`M${cx},${y - 6} h26 v14 h-24`} fill="none" stroke={color} strokeWidth="1.5" markerEnd={fail ? 'url(#arr-red)' : 'url(#arr)'} />
                  <rect x={cx + 30} y={y - 12} width={Math.min(360, label.length * 6.3 + 10)} height={17} rx={4} fill={s.kind === 'alt' ? (fail ? '#fef2f2' : '#ecfdf5') : '#ffffff'} opacity=".95" />
                  <text x={cx + 35} y={y} fontSize="11" fill={color} fontWeight={s.kind === 'alt' ? 600 : 500}>{label}</text>
                </g>
              );
            }
            const x1 = x(s.from);
            const x2 = x(s.to);
            const mid = (x1 + x2) / 2;
            return (
              <g key={i}>
                <line x1={x1} y1={y} x2={x2 + (x2 > x1 ? -2 : 2)} y2={y} stroke={color} strokeWidth="1.5" strokeDasharray={s.kind === 'return' ? '5 4' : undefined} markerEnd={fail ? 'url(#arr-red)' : s.kind === 'return' ? 'url(#arr-open)' : 'url(#arr)'} />
                <rect x={mid - Math.min(Math.abs(x2 - x1) - 10, label.length * 6.1) / 2 - 4} y={y - 16} width={Math.min(Math.abs(x2 - x1) - 10, label.length * 6.1) + 8} height={14} rx={3} fill="#fdfcf9" />
                <text x={mid} y={y - 5} textAnchor="middle" fontSize="11" fill={color} fontStyle={s.kind === 'return' ? 'italic' : 'normal'}>
                  {label.length * 6.1 > Math.abs(x2 - x1) - 10 ? `${label.slice(0, Math.floor((Math.abs(x2 - x1) - 14) / 6.1))}…` : label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function TraceStepTable({ trace }) {
  return (
    <ol className="divide-y divide-ink-100 rounded-xl border border-ink-200 bg-white text-[12.5px]">
      {trace.steps.map((s) => (
        <li key={s.seq} className={clsx('grid grid-cols-[28px_1fr] gap-2 px-3 py-2', s.branch === 'failure' && 'bg-red-50/60')}>
          <span className="tabular text-ink-400">{s.seq}</span>
          <div>
            <div className="font-medium text-ink-800"><span className="text-ink-500">{s.from} → {s.to}:</span> {s.message}</div>
            <div className="mt-0.5 flex flex-wrap gap-1.5 text-[11px]">
              {s.ref && <span className="rounded bg-ink-100 px-1.5 py-0.5 text-ink-600">{s.ref}</span>}
              {s.activity && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">Activity: {s.activity}</span>}
              {s.dfd && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-sky-700">DFD: {s.dfd}</span>}
              {s.note && <span className="rounded bg-brass-50 px-1.5 py-0.5 text-brass-700">{s.note}</span>}
              <span className="ml-auto text-ink-400 tabular">+{s.atMs} ms</span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
