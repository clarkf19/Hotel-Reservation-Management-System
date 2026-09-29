import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { X, AlertTriangle } from 'lucide-react';
import { Button } from './primitives.jsx';

function useEscape(open, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
}

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  useEscape(open, onClose);
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-ink-950/50 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            role="dialog" aria-modal="true" aria-label={title}
            className={clsx('relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-[var(--shadow-lift)] sm:rounded-2xl', width)}
            initial={{ y: 24, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 16, scale: 0.98 }} transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          >
            <div className="flex items-start justify-between border-b border-ink-100 px-6 py-4">
              <div>
                <h2 className="font-display text-xl font-semibold">{title}</h2>
                {subtitle && <p className="mt-0.5 text-[13px] text-ink-500">{subtitle}</p>}
              </div>
              <button onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label="Close"><X className="size-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-ink-100 bg-ink-50/50 px-6 py-3.5">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function Drawer({ open, onClose, title, subtitle, children, width = 'max-w-xl' }) {
  useEscape(open, onClose);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-ink-950/40" onClick={onClose} />
          <motion.aside
            className={clsx('absolute right-0 top-0 flex h-full w-full flex-col bg-white shadow-2xl', width)}
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="flex items-start justify-between border-b border-ink-100 px-6 py-4">
              <div>
                <h2 className="font-display text-xl font-semibold">{title}</h2>
                {subtitle && <p className="mt-0.5 text-[13px] text-ink-500">{subtitle}</p>}
              </div>
              <button onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100" aria-label="Close"><X className="size-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">{children}</div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Explicit confirmation step (e.g. Reservation.Cancel.Confirm). */
export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel = 'Confirm', tone = 'danger', loading }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" footer={<>
      <Button variant="secondary" onClick={onClose} disabled={loading}>Keep it</Button>
      <Button variant={tone} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
    </>}>
      <div className="flex gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-red-50 text-red-600"><AlertTriangle className="size-5" /></span>
        <div className="text-sm text-ink-700">{children}</div>
      </div>
    </Modal>
  );
}
