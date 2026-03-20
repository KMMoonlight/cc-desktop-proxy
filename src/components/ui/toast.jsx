import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

import { cn } from '@/lib/utils';

const TOAST_TONE_STYLES = {
  error: {
    Icon: AlertTriangle,
    iconClassName: 'bg-destructive/10 text-destructive',
    shellClassName: 'border-destructive/20 bg-background/96',
  },
  info: {
    Icon: Info,
    iconClassName: 'bg-sky-500/10 text-sky-600 dark:text-sky-300',
    shellClassName: 'border-border/80 bg-background/96',
  },
  success: {
    Icon: CheckCircle2,
    iconClassName: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
    shellClassName: 'border-emerald-500/20 bg-background/96',
  },
};

export function ToastViewport({ items, onDismiss, className }) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  return (
    <div className={cn('pointer-events-none absolute inset-x-0 top-14 z-[70] flex justify-end px-4', className)}>
      <div className="flex w-full max-w-sm flex-col gap-2" aria-live="polite" aria-atomic="true">
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={onDismiss} />
        ))}
      </div>
    </div>
  );
}

function ToastCard({ item, onDismiss }) {
  const toneStyle = TOAST_TONE_STYLES[item?.tone] || TOAST_TONE_STYLES.error;
  const Icon = toneStyle.Icon;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      onDismiss?.(item.id);
    }, item?.duration ?? 3200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [item?.duration, item?.id, onDismiss]);

  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto flex items-start gap-3 rounded-2xl border px-3 py-3 shadow-lg shadow-foreground/5 backdrop-blur',
        toneStyle.shellClassName,
      )}
    >
      <span className={cn('mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full', toneStyle.iconClassName)}>
        <Icon className="h-4 w-4" />
      </span>
      <p className="min-w-0 flex-1 break-words pr-1 text-[13px] leading-5 text-foreground">{item.message}</p>
      <button
        type="button"
        onClick={() => onDismiss?.(item.id)}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
