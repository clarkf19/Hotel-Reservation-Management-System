export const inr = (n, opts = {}) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: opts.decimals ?? 0, maximumFractionDigits: opts.decimals ?? 0 })}`;
export const inr2 = (n) => inr(n, { decimals: 2 });
export const num = (n) => Number(n || 0).toLocaleString('en-IN');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** '2026-10-12' -> 'Mon, 12 Oct' */
export function fmtDate(d, { year = false, weekday = true } = {}) {
  if (!d) return '—';
  const x = typeof d === 'string' && d.length === 10 ? new Date(`${d}T00:00:00Z`) : new Date(d);
  const s = `${weekday ? `${DAYS[x.getUTCDay()]}, ` : ''}${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}`;
  return year ? `${s} ${x.getUTCFullYear()}` : s;
}
export const fmtShort = (d) => fmtDate(d, { weekday: false });

export function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}

export function timeAgo(d) {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return fmtDateTime(d);
}

/** Hotel "today" (Asia/Kolkata) as YYYY-MM-DD */
export function today(offset = 0) {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  if (!offset) return s;
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const nights = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
export const title = (s) => String(s || '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export const reference = (n) => (n ? `HRMS-${String(n).padStart(6, '0')}` : 'Draft');
export const initials = (name = '') => name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
