import { forwardRef } from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

const BUTTON = {
  primary: 'bg-ink-900 text-white hover:bg-ink-800 shadow-sm',
  brass: 'bg-brass-500 text-ink-950 hover:bg-brass-400 shadow-sm',
  secondary: 'bg-white text-ink-900 border border-ink-200 hover:border-ink-300 hover:bg-ink-50',
  ghost: 'text-ink-700 hover:bg-ink-100',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
};
const SIZE = { sm: 'h-8 px-3 text-[13px] gap-1.5', md: 'h-10 px-4 text-sm gap-2', lg: 'h-12 px-6 text-[15px] gap-2' };

export const Button = forwardRef(function Button({ variant = 'primary', size = 'md', loading, icon: Icon, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx('inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150 disabled:opacity-55 disabled:cursor-not-allowed active:scale-[.98] whitespace-nowrap', BUTTON[variant], SIZE[size], className)}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon ? <Icon className="size-4" strokeWidth={2} /> : null}
      {children}
    </button>
  );
});

export function Field({ label, hint, error, children, className, required }) {
  return (
    <label className={clsx('block', className)}>
      {label && <span className="mb-1.5 block text-[13px] font-medium text-ink-700">{label}{required && <span className="text-brass-600"> *</span>}</span>}
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-ink-500">{hint}</span> : null}
    </label>
  );
}

const inputCls = 'w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 transition focus:border-brass-500 focus:ring-3 focus:ring-brass-100 outline-none disabled:bg-ink-50';

export const Input = forwardRef(function Input({ className, icon: Icon, ...rest }, ref) {
  if (!Icon) return <input ref={ref} className={clsx(inputCls, 'h-10', className)} {...rest} />;
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
      <input ref={ref} className={clsx(inputCls, 'h-10 pl-9', className)} {...rest} />
    </div>
  );
});

export const Select = forwardRef(function Select({ className, children, ...rest }, ref) {
  return <select ref={ref} className={clsx(inputCls, 'h-10 pr-8', className)} {...rest}>{children}</select>;
});

export const Textarea = forwardRef(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={clsx(inputCls, 'py-2 min-h-20', className)} {...rest} />;
});

export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className="inline-flex items-center gap-2.5 text-sm text-ink-700 disabled:opacity-50">
      <span className={clsx('relative h-5 w-9 rounded-full transition', checked ? 'bg-emerald-500' : 'bg-ink-300')}>
        <span className={clsx('absolute top-0.5 size-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </span>
      {label}
    </button>
  );
}

export function Card({ className, children, padded = true, ...rest }) {
  const custom = className || '';
  return (
    <div
      className={clsx(
        'rounded-[var(--radius-xl)] border shadow-[var(--shadow-soft)]',
        !/(^|\s)bg-/.test(custom) && 'bg-white',
        !/(^|\s)border-(?!l-|r-|t-|b-|dashed|dotted)[a-z]/.test(custom) && 'border-ink-200/70',
        padded && 'p-5',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, icon: Icon }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        {Icon && <span className="mt-0.5 grid size-8 place-items-center rounded-lg bg-brass-50 text-brass-600"><Icon className="size-4" /></span>}
        <div>
          <h3 className="text-[15px] font-semibold text-ink-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[13px] text-ink-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function Spinner({ className }) {
  return <Loader2 className={clsx('size-5 animate-spin text-ink-400', className)} />;
}

export function Skeleton({ className }) {
  return <div className={clsx('skeleton', className)} />;
}

export function Avatar({ name, className }) {
  const letters = (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return <span className={clsx('grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-brass-300 to-brass-500 font-semibold text-ink-950', className || 'size-8 text-xs')}>{letters}</span>;
}

export function Kbd({ children }) {
  return <kbd className="rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 font-mono text-[11px] text-ink-600">{children}</kbd>;
}
