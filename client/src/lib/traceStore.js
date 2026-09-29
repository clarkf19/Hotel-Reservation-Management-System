/** Tiny observable store holding the most recent UML execution traces returned by the API. */
const listeners = new Set();
let traces = [];
let seq = 0;

export const traceStore = {
  push(trace) {
    traces = [{ id: ++seq, receivedAt: new Date(), ...trace }, ...traces].slice(0, 25);
    listeners.forEach((l) => l(traces));
  },
  get: () => traces,
  clear() { traces = []; listeners.forEach((l) => l(traces)); },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
