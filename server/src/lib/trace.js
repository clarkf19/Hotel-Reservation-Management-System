/**
 * UML execution tracer ("Viva Mode").
 *
 * While a request is being handled, services call `trace(...)` at the exact
 * points where a message from the documented sequence diagrams (Exp 4) or an
 * activity-diagram node (Exp 5) is executed. The collected steps are returned
 * to the client in the `trace` field of the JSON response, and the frontend
 * replays them as a live sequence diagram. This makes the link between the
 * UML models and the running code visible during a demonstration.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

export function runWithTrace(fn) {
  return storage.run({ steps: [], startedAt: performance.now(), scenario: null }, fn);
}

/** Name the documented scenario this request implements, e.g. "SD-1 Making Room Reservation". */
export function traceScenario(name) {
  const ctx = storage.getStore();
  if (ctx) ctx.scenario = name;
}

/**
 * Record one executed message.
 * @param {string} from     sender lifeline (e.g. "Guest", "HRMS", "Reservation")
 * @param {string} to       receiver lifeline
 * @param {string} message  message text exactly as in the diagram, e.g. "checkAvailability()"
 * @param {object} [meta]   { ref: "SD-1", kind: "call"|"return"|"self"|"alt", activity, dfd, note, branch }
 */
export function trace(from, to, message, meta = {}) {
  const ctx = storage.getStore();
  if (!ctx) return;
  ctx.steps.push({
    seq: ctx.steps.length + 1,
    from,
    to,
    message,
    kind: meta.kind || (from === to ? 'self' : 'call'),
    ...meta,
    atMs: Math.round(performance.now() - ctx.startedAt),
  });
}

export function currentTrace() {
  const ctx = storage.getStore();
  if (!ctx || ctx.steps.length === 0) return undefined;
  return { scenario: ctx.scenario, steps: ctx.steps, totalMs: Math.round(performance.now() - ctx.startedAt) };
}
