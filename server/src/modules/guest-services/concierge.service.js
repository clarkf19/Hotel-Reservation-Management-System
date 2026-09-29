/**
 * DFD Level 1 process 5.0 "Guest Services (Concierge)" (D6 Service Requests)
 * SRS 4.4: AI.Query, AI.Booking, AI.FAQ.Answer, AI.Query.Escalate ; SI-3.1
 * Use cases: Chat with AI Concierge, <<extend>> Handle Escalated AI Query (Receptionist)
 * UML: Guest.chatWithAIConcierge(), AIConversation.addMessage(), AIConciergeService.handleQuery()
 * Activity: Guest "Chat with AI Concierge (FAQs / Requests)" -> <Need Additional Services?> -> "Submit Service Request"
 *           HRMS "Process Concierge Request" -> AI "Process Natural-Language Request (NLP)"
 *           -> "Provide FAQ / Booking Assistance" | "Provide Local Recommendations"
 *           -> <Request Resolved?> No -> "Escalate to Receptionist" -> "Handle Escalated Guest Request"
 */
import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { addDays, formatDateOnly, hotelToday, parseDateOnly } from '../../lib/dates.js';
import { trace, traceScenario } from '../../lib/trace.js';
import { getSettings } from '../../lib/settings.js';
import { AuditLog } from '../../domain/AuditLog.js';
import { ROLES } from '../../domain/rbac.js';
import { KnowledgeBaseConcierge, ClaudeConcierge, llmAvailable } from '../../integrations/AIConciergeService.js';
import { notificationService } from '../../integrations/NotificationService.js';
import { searchRooms } from '../reservations/room.service.js';
import { formatReference } from '../reservations/reservation.service.js';
import { createServiceRequest, SERVICE_CATALOG } from './serviceRequest.service.js';

/** Requests the concierge can file directly as service requests ("Submit Service Request"). */
const SERVICE_INTENTS = [
  { category: 'LATE_CHECKOUT', re: /late\s*check-?\s*out/i },
  { category: 'EARLY_CHECKIN', re: /early\s*check-?\s*in/i },
  { category: 'EXTRA_BED', re: /extra\s*bed|rollaway|\bcrib\b|\bcot\b/i },
  { category: 'AMENITIES', re: /towel|toiletr|pillow|blanket|shampoo|soap|slipper|toothbrush|iron(ing)?\s*board|hair\s*dryer|bathrobe/i },
  { category: 'HOUSEKEEPING', re: /housekeeping|clean(ing)?\s*(my|the)?\s*room|make up (my|the) room|tidy|change (the )?(sheets|linen)/i },
  { category: 'TRANSPORT', re: /airport|taxi|\bcab\b|pick-?up|drop-?off|transfer/i },
  { category: 'MAINTENANCE', re: /(not|isn'?t|doesn'?t|won'?t) work|broken|leak|no hot water|\bac\b.*(cold|warm|work)|air.?con|heater/i },
  { category: 'WAKE_UP_CALL', re: /wake.?up call/i },
  { category: 'ROOM_SERVICE', re: /room service|order (food|breakfast|dinner|lunch)|bring (me )?(food|breakfast|coffee)/i },
];
const REQUEST_VERB = /\b(can|could|would|may)\s+(i|you|we)\b|\bplease\b|\b(i|we)\s+(need|want|would like|'d like)\b|\brequest\b|\bsend\b|\bbring\b|\bbook (a|an)\b|\barrange\b|\b(is|are)\s+(not|broken)\b|n't work/i;

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** Tiny date / party-size parser for AI.Booking ("book a deluxe room from 12 Oct to 14 Oct for 2 guests"). */
export function parseBookingRequest(text, today = hotelToday()) {
  const t = text.toLowerCase();
  const dates = [];
  for (const m of t.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)) dates.push(parseDateOnly(m[0]));
  for (const m of t.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/g)) dates.push(nextDate(+m[1], MONTHS[m[2]], today));
  for (const m of t.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/g)) dates.push(nextDate(+m[2], MONTHS[m[1]], today));
  if (/\btonight\b|\btoday\b/.test(t)) dates.unshift(today);
  if (/\btomorrow\b/.test(t)) dates.unshift(addDays(today, 1));
  if (/\bthis weekend\b|\bnext weekend\b/.test(t)) {
    const toSat = (6 - today.getUTCDay() + 7) % 7 || 7;
    dates.unshift(addDays(today, toSat + (/next weekend/.test(t) ? 7 : 0)));
  }
  dates.sort((a, b) => a - b);
  let checkIn = dates[0] ?? null;
  let checkOut = dates[1] ?? null;
  const nightsMatch = /(\d+)\s*nights?/.exec(t);
  if (checkIn && !checkOut) checkOut = addDays(checkIn, nightsMatch ? +nightsMatch[1] : 1);
  const guestsMatch = /(\d+)\s*(guests?|people|persons?|adults?|of us)/.exec(t);
  const category = /suite/.test(t) ? 'SUITE' : /deluxe/.test(t) ? 'DELUXE' : /accessible|wheelchair/.test(t) ? 'ACCESSIBLE' : /standard/.test(t) ? 'STANDARD' : undefined;
  return { checkIn, checkOut, guests: guestsMatch ? +guestsMatch[1] : 2, category, accessible: /accessible|wheelchair/.test(t) };
}

function nextDate(day, month, today) {
  let d = new Date(Date.UTC(today.getUTCFullYear(), month, day));
  if (d < today) d = new Date(Date.UTC(today.getUTCFullYear() + 1, month, day));
  return d;
}

async function currentStay(guestPk) {
  return prisma.reservation.findFirst({
    where: { guestId: guestPk, status: { in: ['CHECKED_IN', 'CONFIRMED'] }, checkOutDate: { gte: hotelToday() } },
    include: { room: { include: { roomType: true } } },
    orderBy: [{ status: 'asc' }, { checkInDate: 'asc' }],
  });
}

/** Guest.chatWithAIConcierge() — one conversational turn; persisted as an AIConversation row. */
export async function chat(user, { message, sessionId }) {
  traceScenario('AI Concierge (UC-2 / Activity AI lane)');
  const settings = await getSettings();
  const sid = sessionId || crypto.randomUUID();
  const stay = await currentStay(user.guestPk);
  trace('Guest', 'HRMS', 'chatWithAIConcierge()', { ref: 'Class diagram', activity: 'Chat with AI Concierge (FAQs / Requests)', dfd: '5.0 Guest Services (Concierge)' });
  trace('HRMS', 'HRMS', 'Process Concierge Request', { ref: 'Activity', activity: 'Process Concierge Request' });

  let reply = null;
  let intent = 'FAQ';
  let resolved = true;
  let source = 'KNOWLEDGE_BASE';
  let action = null;
  let createdRequest = null;

  // 1) Service requests the concierge can fulfil directly
  const service = SERVICE_INTENTS.find((s) => s.re.test(message));
  if (service && REQUEST_VERB.test(message)) {
    intent = `SERVICE_REQUEST:${service.category}`;
    const spec = SERVICE_CATALOG[service.category];
    if (!stay) {
      reply = `I'd be glad to arrange ${spec.label.toLowerCase()}, but I can only file requests for a confirmed or current stay. Once you have a booking, just ask me again!`;
    } else {
      trace('HRMS', 'HRMS', 'Need Additional Services? — Yes → Submit Service Request', { ref: 'Activity', activity: 'Submit Service Request', dfd: '5.0 → D6 Service Requests' });
      createdRequest = await createServiceRequest(user, { category: service.category, description: message.slice(0, 300), reservationId: stay.id, source: 'AI_CONCIERGE' }, { skipTrace: true });
      reply = `Done — I've sent a ${spec.label.toLowerCase()} request for room ${stay.room.roomNumber} to our team (request #${createdRequest.id}).${spec.charge ? ` Please note this service costs ₹${spec.charge.toLocaleString('en-IN')} and will be added to your final bill.` : ''} ${spec.eta}`;
      action = { type: 'SERVICE_REQUEST_CREATED', requestId: createdRequest.id, category: service.category };
    }
  }

  // 2) AI.Booking — booking assistance
  if (!reply && /\b(book|reserve|availab|vacanc|free room|room for)\b/i.test(message)) {
    intent = 'BOOKING_ASSISTANCE';
    const parsed = parseBookingRequest(message);
    if (!parsed.checkIn) {
      reply = 'I can check availability and book for you. Which dates would you like — for example "a deluxe room from 12 Oct to 14 Oct for 2 guests"?';
    } else if (parsed.checkIn < hotelToday()) {
      reply = 'Those dates are in the past — could you give me future dates?';
    } else {
      trace('AIConciergeService', 'HRMS', 'searchRooms()', { ref: 'AI.Booking', activity: 'Provide FAQ / Booking Assistance' });
      const result = await searchRooms({ checkIn: formatDateOnly(parsed.checkIn), checkOut: formatDateOnly(parsed.checkOut), guests: parsed.guests, category: parsed.category, accessible: parsed.accessible }, user.guestPk);
      const top = result.rooms.slice(0, 3);
      if (top.length) {
        reply = `Good news — I found ${result.rooms.length} room${result.rooms.length === 1 ? '' : 's'} for ${result.checkIn} → ${result.checkOut} (${result.nights} night${result.nights === 1 ? '' : 's'}, ${parsed.guests} guest${parsed.guests === 1 ? '' : 's'}). My top pick is room ${top[0].roomNumber}, a ${top[0].roomType.typeName} at ₹${top[0].baseRate.toLocaleString('en-IN')}/night${top[0].recommendation.reasons[0] ? ` — ${top[0].recommendation.reasons[0].toLowerCase()}` : ''}. Tap a room below to book it.`;
        action = { type: 'ROOM_SUGGESTIONS', checkIn: result.checkIn, checkOut: result.checkOut, guests: parsed.guests, rooms: top.map((r) => ({ id: r.id, roomNumber: r.roomNumber, typeName: r.roomType.typeName, baseRate: r.baseRate, total: r.pricing.total, imageUrl: r.roomType.imageUrl, score: r.recommendation.score })) };
      } else {
        const alt = result.alternatives?.dates?.[0];
        reply = `Sorry, nothing matches ${result.checkIn} → ${result.checkOut}${parsed.category ? ` in ${parsed.category.toLowerCase()}` : ''}.${alt ? ` The nearest available dates are ${alt.checkIn} → ${alt.checkOut} (${alt.availableRooms} rooms).` : ''}`;
      }
    }
  }

  // 3) Questions about the guest's own reservation
  if (!reply && /\bmy (booking|reservation|room|stay)\b|\breservation (status|number)\b/i.test(message)) {
    intent = 'MY_RESERVATION';
    reply = stay
      ? `Your ${stay.status === 'CHECKED_IN' ? 'current' : 'upcoming'} stay is ${formatReference(stay.reservationNumber)}: ${stay.room.roomType.typeName}, room ${stay.room.roomNumber}, ${formatDateOnly(stay.checkInDate)} → ${formatDateOnly(stay.checkOutDate)}. ${stay.status === 'CHECKED_IN' ? 'Your digital key is in the "Digital key" tab.' : `Online check-in opens on ${formatDateOnly(stay.checkInDate)} from ${settings.checkInTime}.`}`
      : "I don't see an upcoming stay on your account. Would you like me to check availability?";
  }

  // 4) FAQ / local recommendations — AIConciergeService.handleQuery()
  if (!reply) {
    const kbEntries = await prisma.faqEntry.findMany();
    const kb = new KnowledgeBaseConcierge(kbEntries);
    trace('HRMS', 'AIConciergeService', 'handleQuery(query)', { ref: 'Class diagram / SI-3.1', activity: 'Process Natural-Language Request (NLP)' });
    let answer = null;
    if (llmAvailable()) {
      try {
        const history = await prisma.aIConversation.findMany({ where: { guestId: user.guestPk, sessionId: sid }, orderBy: { timestamp: 'asc' }, take: 6 });
        answer = await new ClaudeConcierge(kbEntries).handleQuery(message, {
          guestName: user.name, hotelName: settings.hotelName, history,
          stay: stay ? `${stay.room.roomType.typeName} room ${stay.room.roomNumber}, ${formatDateOnly(stay.checkInDate)} to ${formatDateOnly(stay.checkOutDate)}, status ${stay.status}` : null,
        });
      } catch (err) {
        console.error('[concierge] LLM unavailable, using knowledge base:', err.message);
        answer = null;
      }
    }
    if (!answer || (!answer.text && !answer.escalate)) answer = await kb.handleQuery(message);
    const threshold = settings.conciergeEscalationThreshold;
    const isResolved = Boolean(answer.text) && !answer.escalate && (answer.source === 'LLM' || answer.confidence >= threshold);
    source = answer.source;
    const m = kb.match(message);
    intent = m.entry?.category === 'Local' ? 'LOCAL_RECOMMENDATION' : 'FAQ';
    trace('AIConciergeService', 'HRMS', isResolved ? `response (${source === 'LLM' ? 'LLM' : `knowledge base, confidence ${answer.confidence.toFixed(2)}`})` : 'unable to interpret request', { ref: 'SI-3.1', kind: 'return', activity: intent === 'LOCAL_RECOMMENDATION' ? 'Provide Local Recommendations' : 'Provide FAQ / Booking Assistance' });
    if (isResolved) {
      reply = answer.text;
    } else {
      resolved = false;
      intent = 'ESCALATED';
      source = 'ESCALATED';
    }
  }

  trace('HRMS', 'HRMS', `Request Resolved? — ${resolved ? 'Yes' : 'No'}`, { ref: 'Activity', kind: 'alt', branch: resolved ? undefined : 'failure' });

  // AIConversation.addMessage()
  const conversation = await prisma.aIConversation.create({
    data: { guestId: user.guestPk, sessionId: sid, query: message, response: reply ?? '(escalated)', intent, source, resolved },
  });

  if (!resolved) {
    // AI.Query.Escalate -> Receptionist ("Handle Escalated Guest Request")
    trace('HRMS', 'Receptionist', 'Escalate to Receptionist', { ref: 'UC «extend» Handle Escalated AI Query', activity: 'Escalate to Receptionist', branch: 'failure' });
    const req = await prisma.serviceRequest.create({
      data: { guestId: user.guestPk, reservationId: stay?.id ?? null, conversationId: conversation.id, category: 'CONCIERGE_ESCALATION', description: message.slice(0, 500), isEscalation: true },
    });
    await notificationService.notifyRole([ROLES.RECEPTIONIST], { type: 'AI_ESCALATION', subject: `Guest question needs a human (${user.name})`, body: message.slice(0, 200) });
    await AuditLog.record({ action: 'AI_QUERY_ESCALATED', entityType: 'AIConversation', entityId: conversation.id, performedBy: user.id, details: { serviceRequestId: req.id } });
    reply = `I'm not certain about that one, so I've passed your question to our front-desk team (ticket #${req.id}). A receptionist will reply shortly — you'll see the answer under Service requests and get a notification.`;
    await prisma.aIConversation.update({ where: { id: conversation.id }, data: { response: reply } });
    action = { type: 'ESCALATED', requestId: req.id };
  }

  return {
    sessionId: sid,
    message: { id: conversation.id, query: message, response: reply, intent, source, resolved, timestamp: conversation.timestamp },
    action,
    mode: llmAvailable() ? 'LLM + knowledge base' : 'Knowledge base (no API key configured)',
  };
}

export async function history(user, sessionId) {
  const rows = await prisma.aIConversation.findMany({
    where: { guestId: user.guestPk, ...(sessionId ? { sessionId } : {}) },
    orderBy: { timestamp: 'asc' },
    take: 100,
  });
  return rows;
}

export async function conciergeInfo() {
  const faqs = await prisma.faqEntry.findMany({ orderBy: [{ category: 'asc' }, { id: 'asc' }] });
  return { mode: llmAvailable() ? 'LLM + knowledge base' : 'Knowledge base', llmConfigured: llmAvailable(), suggestions: ['What time is check-in?', 'Can I request late checkout?', 'Where is the restaurant?', 'Can I get extra towels?', 'What amenities are available?', 'Book a deluxe room tomorrow for 2 nights'], faqs };
}

export { addDays };
