export function Logo({ dark = false, compact = false }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 64 64" className="size-9 shrink-0" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill={dark ? '#18223b' : '#0f1629'} />
        <circle cx="32" cy="36" r="13" fill="none" stroke="#d4b06a" strokeWidth="3" />
        <path d="M12 40h40" stroke="#d4b06a" strokeWidth="3" strokeLinecap="round" />
        <path d="M18 46h28M24 52h16" stroke="#8a93a8" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {!compact && (
        <span className="leading-none">
          <span className={`block font-display text-[19px] font-semibold ${dark ? 'text-white' : 'text-ink-900'}`}>Solstice Bay</span>
          <span className={`mt-1 block text-[10.5px] font-semibold uppercase tracking-[0.18em] ${dark ? 'text-brass-400' : 'text-brass-600'}`}>HRMS · Release 1.0</span>
        </span>
      )}
    </span>
  );
}
