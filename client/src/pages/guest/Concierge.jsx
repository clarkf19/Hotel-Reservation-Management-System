/**
 * AI Concierge chat — SRS 4.4 (AI.Query, AI.Booking, AI.FAQ.Answer, AI.Query.Escalate).
 * Each reply shows its real source: knowledge base, LLM, or escalated to a Receptionist.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { Bot, BookOpen, ConciergeBell, Send, Sparkles, UserRound, Headset, BedDouble } from 'lucide-react';
import { Badge, Button, Card, PageHeader } from '../../components/ui/index.js';
import { TraceChips } from '../../components/viva/TraceChips.jsx';
import { useApi } from '../../lib/hooks.js';
import { api, qs } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { inr } from '../../lib/format.js';

const SOURCE = {
  KNOWLEDGE_BASE: { label: 'Knowledge base', icon: BookOpen, tone: 'blue' },
  LLM: { label: 'Claude (LLM)', icon: Sparkles, tone: 'violet' },
  ESCALATED: { label: 'Escalated to front desk', icon: Headset, tone: 'amber' },
};

function Message({ m, onBook }) {
  const src = SOURCE[m.source] || SOURCE.KNOWLEDGE_BASE;
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-ink-900 px-4 py-2.5 text-[14px] text-white">{m.query}</div>
      </div>
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brass-400 text-ink-950"><Bot className="size-4" /></span>
        <div className="max-w-[85%]">
          <div className={clsx('rounded-2xl rounded-tl-md border px-4 py-2.5 text-[14px] leading-relaxed', m.resolved ? 'border-ink-200 bg-white' : 'border-amber-200 bg-amber-50')}>{m.response}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-500">
            <Badge tone={src.tone}><src.icon className="size-3" />{src.label}</Badge>
            {m.intent && <span className="font-mono">{m.intent.toLowerCase()}</span>}
          </div>
          {m.action?.type === 'ROOM_SUGGESTIONS' && (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {m.action.rooms.map((r) => (
                <button key={r.id} onClick={() => onBook(r, m.action)} className="group overflow-hidden rounded-xl border border-ink-200 bg-white text-left transition hover:border-brass-400 hover:shadow">
                  <div className="h-20 bg-ink-800">{r.imageUrl && <img src={r.imageUrl} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}</div>
                  <div className="p-2.5"><div className="text-[12.5px] font-semibold">{r.typeName} · {r.roomNumber}</div><div className="text-[12px] text-ink-500">{inr(r.total)} total · match {r.score}</div><div className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-brass-700"><BedDouble className="size-3" />Book</div></div>
                </button>
              ))}
            </div>
          )}
          {m.action?.type === 'SERVICE_REQUEST_CREATED' && <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[12px] font-medium text-emerald-700"><ConciergeBell className="size-3.5" />Service request #{m.action.requestId} submitted</div>}
          {m.action?.type === 'ESCALATED' && <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1.5 text-[12px] font-medium text-amber-800"><Headset className="size-3.5" />Ticket #{m.action.requestId} with a receptionist</div>}
        </div>
      </motion.div>
    </div>
  );
}

export default function Concierge() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: info } = useApi('/concierge');
  const { data: hist } = useApi('/concierge/history');
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const bottom = useRef(null);

  useEffect(() => { if (hist?.messages) setMessages(hist.messages.slice(-8)); }, [hist]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, pending]);

  const send = async (msg) => {
    const m = (msg ?? text).trim();
    if (!m) return;
    setText('');
    setPending(true);
    setMessages((prev) => [...prev, { id: `tmp-${Date.now()}`, query: m, response: '…', pending: true }]);
    try {
      const res = await api.post('/concierge/messages', { message: m, sessionId: sessionId || undefined }, { label: 'AI Concierge' });
      setSessionId(res.sessionId);
      setMessages((prev) => [...prev.filter((x) => !x.pending), { ...res.message, action: res.action }]);
    } catch (e) {
      setMessages((prev) => [...prev.filter((x) => !x.pending), { id: Date.now(), query: m, response: e.message, resolved: false, source: 'ESCALATED' }]);
    } finally { setPending(false); }
  };

  const book = (r, a) => navigate(`/guest/book${qs({ roomId: r.id, checkIn: a.checkIn, checkOut: a.checkOut, guests: a.guests })}`);

  return (
    <div>
      <PageHeader eyebrow="Guest services" title="AI Concierge" subtitle="Ask about the hotel, get local tips, request services or book a room. If I can't help, I'll pass you to our front-desk team." />
      <TraceChips screen="concierge" />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card padded={false} className="flex h-[calc(100vh-260px)] min-h-[520px] flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
            <div className="flex items-center gap-2.5"><span className="relative grid size-9 place-items-center rounded-full bg-ink-900 text-brass-300"><Bot className="size-5" /><span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-white bg-emerald-500" /></span><div><div className="text-sm font-semibold">Solstice Concierge</div><div className="text-[11.5px] text-ink-500">Mode: {info?.mode ?? '…'}</div></div></div>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto bg-paper px-5 py-5">
            {messages.length === 0 && (
              <div className="py-10 text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brass-50 text-brass-600"><Sparkles className="size-7" /></span>
                <h3 className="mt-3 font-display text-2xl font-semibold">Good day, {user.name.split(' ')[0]}</h3>
                <p className="mt-1 text-sm text-ink-500">How can I make your stay better?</p>
              </div>
            )}
            <AnimatePresence initial={false}>
              {messages.map((m) => m.pending ? (
                <div key={m.id} className="space-y-3">
                  <div className="flex justify-end"><div className="max-w-[80%] rounded-2xl rounded-br-md bg-ink-900 px-4 py-2.5 text-[14px] text-white">{m.query}</div></div>
                  <div className="flex gap-2.5"><span className="grid size-8 place-items-center rounded-full bg-brass-400 text-ink-950"><Bot className="size-4" /></span><div className="flex gap-1 rounded-2xl border border-ink-200 bg-white px-4 py-3">{[0, 1, 2].map((i) => <motion.span key={i} className="size-1.5 rounded-full bg-ink-400" animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.15 }} />)}</div></div>
                </div>
              ) : <Message key={m.id} m={m} onBook={book} />)}
            </AnimatePresence>
            <div ref={bottom} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2 border-t border-ink-100 p-3">
            <span className="hidden size-10 shrink-0 place-items-center rounded-full bg-ink-100 text-ink-500 sm:grid"><UserRound className="size-5" /></span>
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Ask me anything… e.g. “Can I get extra towels?”" className="h-10 flex-1 rounded-full border border-ink-200 px-4 text-sm outline-none focus:border-brass-500 focus:ring-3 focus:ring-brass-100" />
            <Button type="submit" icon={Send} loading={pending} className="rounded-full">Send</Button>
          </form>
        </Card>
        <div className="space-y-4">
          <Card>
            <h3 className="mb-3 text-sm font-semibold">Try asking</h3>
            <div className="flex flex-wrap gap-2">{(info?.suggestions || []).map((s) => <button key={s} onClick={() => send(s)} disabled={pending} className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-left text-[12.5px] text-ink-700 transition hover:border-brass-400 hover:bg-brass-50">{s}</button>)}</div>
          </Card>
          <Card className="text-[12.5px] text-ink-600">
            <h3 className="mb-2 text-sm font-semibold text-ink-900">How answers are produced</h3>
            <p>{info?.llmConfigured ? 'A Claude model answers using the hotel knowledge base; if it is unavailable the knowledge base answers directly.' : 'No LLM API key is configured, so answers come from the hotel\'s maintained knowledge base (AI.FAQ.Answer).'} Requests like towels or late check-out become service requests; questions it cannot answer are escalated to a receptionist (AI.Query.Escalate).</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
