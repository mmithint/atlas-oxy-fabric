import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn('rounded-xl border border-border bg-card text-card-foreground', className)}>
      {children}
    </section>
  );
}

export function CardHeader({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-300 border-b border-border px-500 py-400">
      <div>
        <h2 className="font-heading text-500 font-semibold leading-500 tracking-wide">{title}</h2>
        {hint ? <p className="mt-100 text-300 text-muted-foreground">{hint}</p> : null}
      </div>
      {action}
    </header>
  );
}

/** Compact page title row; actions sit on the right of the same row so the data starts high on the page. */
export function PageTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-400 flex flex-wrap items-end justify-between gap-300">
      <div className="min-w-0">
        <p className="truncate font-monospace text-100 uppercase tracking-widest text-primary">{eyebrow}</p>
        <h1 className="font-heading text-600 font-bold leading-600 text-primary">{title}</h1>
      </div>
      {children ? <div className="flex flex-wrap items-center gap-300">{children}</div> : null}
    </div>
  );
}

/** Equipment numbers render as stamped tag plates — the app's signature detail. */
export function Tag({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'muted' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-200 py-100 font-monospace text-[length:var(--text-200)] leading-200 tracking-wide',
        tone === 'default' ? 'border-foreground/30 bg-background' : 'border-border bg-muted text-muted-foreground'
      )}
    >
      {children}
    </span>
  );
}

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
const TONES: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/15 text-primary',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-destructive/15 text-destructive',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-100 whitespace-nowrap rounded-full px-200 py-100 text-[length:var(--text-200)] font-medium leading-200', TONES[tone])}>
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  type?: 'button' | 'submit';
  title?: string;
}) {
  const styles = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'border border-border bg-card text-foreground hover:bg-accent',
    danger: 'border border-destructive/40 bg-card text-destructive hover:bg-destructive/10',
    ghost: 'text-muted-foreground hover:bg-accent hover:text-foreground',
  }[variant];
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center gap-200 rounded-lg px-400 py-200 text-[length:var(--text-300)] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
        styles
      )}
    >
      {children}
    </button>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div className="rounded-xl border border-border bg-card p-500">
      <p className="text-200 font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-200 font-heading text-[length:var(--text-hero-900)] font-semibold leading-hero-900 tabular-nums',
          tone === 'success' && 'text-success',
          tone === 'warning' && 'text-warning',
          tone === 'danger' && 'text-destructive',
          tone === 'primary' && 'text-primary'
        )}
      >
        {value}
      </p>
      {sub ? <p className="mt-100 text-200 text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-500 py-800 text-center text-300 text-muted-foreground">{children}</div>;
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th className={cn('whitespace-nowrap px-400 py-300 text-left text-[length:var(--text-200)] font-semibold uppercase tracking-wider text-muted-foreground', className)}>
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn('px-400 py-300 align-top text-[length:var(--text-300)]', className)}>{children}</td>;
}

export function fmtDate(d?: Date, withTime = true): string {
  if (!d) return '—';
  return d.toLocaleString(undefined, withTime
    ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ageHours(d: Date, now = Date.now()): number {
  return Math.max(0, (now - d.getTime()) / 3_600_000);
}

export function fmtAge(d: Date): string {
  const h = ageHours(d);
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} d`;
}

/** One label set for request status, used on every screen. */
export const STATUS_TONE: Record<string, Tone> = {
  PENDING: 'warning',
  RETURNED: 'neutral',
  APPROVED: 'primary',
  SENT_TO_SAP: 'primary',
  SAP_LOADED: 'primary',
  SAP_FAILED: 'danger',
  SYNCED: 'success',
  REJECTED: 'danger',
};

export const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Submitted · awaiting review',
  RETURNED: 'Returned for correction',
  APPROVED: 'Approved · ready for SAP file',
  SENT_TO_SAP: 'In SAP upload file',
  SAP_LOADED: 'Loaded by SAP team (simulated)',
  SAP_FAILED: 'SAP load failed (simulated)',
  SYNCED: 'Confirmed',
  REJECTED: 'Rejected',
};

/** Ordered stages for the request timeline. */
export const STAGES = ['Submitted', 'Reviewed', 'In SAP file', 'Loaded by SAP', 'Confirmed'] as const;

export function stageIndex(status: string): number {
  switch (status) {
    case 'PENDING':
    case 'RETURNED':
      return 0;
    case 'APPROVED':
    case 'REJECTED':
      return 1;
    case 'SENT_TO_SAP':
      return 2;
    case 'SAP_LOADED':
    case 'SAP_FAILED':
      return 3;
    case 'SYNCED':
      return 4;
    default:
      return 0;
  }
}

/** Marks a step that is simulated in this POV. */
export function Simulated({ children = 'Simulated' }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-dashed border-warning px-200 text-[length:var(--text-100)] font-semibold uppercase leading-200 tracking-wider text-warning">
      {children}
    </span>
  );
}

export const SEVERITY_TONE: Record<string, Tone> = { CRITICAL: 'danger', HIGH: 'warning', MEDIUM: 'neutral' };

export const SOURCE_LABEL: Record<string, string> = {
  ATLAS: 'ATLAS app',
  TRUECONTEXT: 'TrueContext field form',
  BULK_UPLOAD: 'Bulk upload',
  EQUIPMENTIQ: 'EquipmentIQ (AI)',
};
