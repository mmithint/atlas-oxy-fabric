import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FilterX } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { Empty } from './ui';

/* iCUE-style list screens: a facet panel with counts on the left, a full table with a filter under each column on the right. */

export type FacetTone = 'primary' | 'danger' | 'warning' | 'success' | 'neutral' | 'info';
export type FacetItem = { key: string; label: string; count: number; tone?: FacetTone };
export type FacetSection = { title: string; items: FacetItem[]; value: string; onChange: (key: string) => void };

const TONE_BORDER: Record<FacetTone, string> = {
  primary: 'border-l-primary',
  danger: 'border-l-destructive',
  warning: 'border-l-warning',
  success: 'border-l-success',
  neutral: 'border-l-muted-foreground/50',
  info: 'border-l-[#3b6fb6]',
};
const TONE_TEXT: Record<FacetTone, string> = {
  primary: 'text-primary',
  danger: 'text-destructive',
  warning: 'text-warning',
  success: 'text-success',
  neutral: 'text-foreground',
  info: 'text-[#3b6fb6]',
};

/** Left filter panel. One choice per section; clicking the active item clears it. */
export function FacetPanel({ title = 'Filters', sections, onClearAll }: { title?: string; sections: FacetSection[]; onClearAll?: () => void }) {
  const [closed, setClosed] = useState<Set<string>>(() => {
    // On narrow screens the panel sits above the table, so start collapsed to keep the data in view.
    const narrow = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1279px)').matches;
    return narrow ? new Set(sections.filter((s) => !s.value).map((s) => s.title)) : new Set();
  });
  const anyActive = sections.some((s) => s.value);
  return (
    <aside className="self-start rounded-xl border border-border bg-card xl:sticky xl:top-0">
      <div className="flex items-center justify-between border-b border-border px-400 py-300">
        <p className="font-heading text-400 font-semibold">{title}</p>
        <div className="flex items-center gap-300 text-200">
          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setClosed(closed.size ? new Set() : new Set(sections.map((s) => s.title)))}>
            {closed.size ? 'Expand all' : 'Collapse all'}
          </button>
          {anyActive && onClearAll ? (
            <button type="button" className="font-medium text-primary hover:underline" onClick={onClearAll}>
              Clear
            </button>
          ) : null}
        </div>
      </div>
      {sections.map((s) => {
        const open = !closed.has(s.title);
        return (
          <section key={s.title} className="border-b border-border last:border-0">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => {
                const n = new Set(closed);
                if (open) n.add(s.title);
                else n.delete(s.title);
                setClosed(n);
              }}
              className="flex w-full items-center justify-between px-400 py-300 text-left text-300 font-semibold text-primary"
            >
              {s.title}
              <ChevronDown aria-hidden className={cn('icon-size-200 transition', open ? 'rotate-180' : '')} />
            </button>
            {open ? (
              <ul className="space-y-200 px-400 pb-400">
                {s.items.map((it) => {
                  const active = s.value === it.key;
                  const tone = it.tone ?? 'neutral';
                  return (
                    <li key={it.key}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => s.onChange(active ? '' : it.key)}
                        className={cn(
                          'flex min-h-[36px] w-full items-center justify-between gap-200 rounded-md border border-l-[3px] border-border px-300 text-left text-300 transition hover:bg-accent',
                          TONE_BORDER[tone],
                          active && 'bg-primary/10 ring-1 ring-primary/40'
                        )}
                      >
                        <span className={cn('min-w-0 truncate', TONE_TEXT[tone], active && 'font-semibold')}>{it.label}</span>
                        <span className="shrink-0 rounded-full bg-muted px-200 font-monospace text-200 text-muted-foreground">{it.count}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
        );
      })}
    </aside>
  );
}

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Text the column filter matches against. Omit to have no filter box. */
  filterText?: (row: T) => string;
  className?: string;
};

/** Remembers column filters and page per table while the app is open, so coming back from a record keeps them. */
const memory = new Map<string, { filters: Record<string, string>; page: number }>();

export function DataTable<T>({
  id,
  rows,
  columns,
  rowKey,
  rowHref,
  pageSize = 25,
  empty = 'Nothing matches these filters.',
  toolbar,
  rowClassName,
}: {
  id: string;
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  pageSize?: number;
  empty?: ReactNode;
  toolbar?: ReactNode;
  rowClassName?: (row: T) => string | undefined;
}) {
  const saved = memory.get(id);
  const [filters, setFilters] = useState<Record<string, string>>(saved?.filters ?? {});
  const [page, setPage] = useState(saved?.page ?? 0);
  useEffect(() => {
    memory.set(id, { filters, page });
  }, [id, filters, page]);

  const active = Object.entries(filters).filter(([, v]) => v.trim());
  const filtered = active.length
    ? rows.filter((r) =>
        active.every(([k, v]) => {
          const col = columns.find((c) => c.key === k);
          return !col?.filterText || col.filterText(r).toLowerCase().includes(v.trim().toLowerCase());
        })
      )
    : rows;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const p = Math.min(page, pages - 1);
  const shown = filtered.slice(p * pageSize, p * pageSize + pageSize);
  const from = filtered.length ? p * pageSize + 1 : 0;
  const to = p * pageSize + shown.length;

  const go = (n: number) => setPage(Math.max(0, Math.min(pages - 1, n)));
  const pagerBtn = 'grid h-[32px] min-w-[32px] place-items-center rounded-md text-primary hover:bg-accent disabled:text-muted-foreground disabled:opacity-40';

  return (
    <section className="min-w-0 rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-300 border-b border-border px-400 py-300">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-300">
          <p className="text-200 text-muted-foreground">
            Page {p + 1}/{pages} · Records {from} to {to} of {filtered.length}
            {filtered.length !== rows.length ? <span> (filtered from {rows.length})</span> : null}
          </p>
          {toolbar}
        </div>
        <div className="flex items-center gap-100">
          {active.length ? (
            <button type="button" title="Clear column filters" onClick={() => setFilters({})} className={pagerBtn}>
              <FilterX aria-hidden className="icon-size-200" />
              <span className="sr-only">Clear column filters</span>
            </button>
          ) : null}
          <button type="button" className={pagerBtn} disabled={p === 0} onClick={() => go(0)} title="First page"><ChevronsLeft aria-hidden className="icon-size-200" /></button>
          <button type="button" className={pagerBtn} disabled={p === 0} onClick={() => go(p - 1)} title="Previous page"><ChevronLeft aria-hidden className="icon-size-200" /></button>
          <span className="grid h-[28px] min-w-[28px] place-items-center rounded-md bg-primary px-200 font-monospace text-200 text-primary-foreground">{p + 1}</span>
          <button type="button" className={pagerBtn} disabled={p >= pages - 1} onClick={() => go(p + 1)} title="Next page"><ChevronRight aria-hidden className="icon-size-200" /></button>
          <button type="button" className={pagerBtn} disabled={p >= pages - 1} onClick={() => go(pages - 1)} title="Last page"><ChevronsRight aria-hidden className="icon-size-200" /></button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/60">
            <tr className="align-top">
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn('px-300 pb-300 pt-300 text-left text-200 font-semibold', c.className)}>
                  <span className="block whitespace-nowrap">{c.header}</span>
                  {c.filterText ? (
                    <input
                      aria-label={`Filter ${c.header}`}
                      value={filters[c.key] ?? ''}
                      onChange={(e) => {
                        setFilters({ ...filters, [c.key]: e.target.value });
                        setPage(0);
                      }}
                      className="mt-200 h-[30px] w-full min-w-[64px] rounded-md border border-input bg-card px-200 text-200 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  ) : (
                    <span aria-hidden className="mt-200 block h-[30px]" />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const link = rowHref?.(r);
              return (
                <tr
                  key={rowKey(r)}
                  onClick={
                    link
                      ? (e) => {
                          if ((e.target as HTMLElement).closest('a,button,input,select,label')) return;
                          window.location.hash = link.replace(/^#/, '');
                        }
                      : undefined
                  }
                  className={cn('border-t border-border align-middle', link && 'cursor-pointer hover:bg-accent/50', rowClassName?.(r))}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cn('px-300 py-200 text-300', c.className)}>
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {shown.length ? null : <Empty>{empty}</Empty>}
      </div>
    </section>
  );
}

/** Facet panel on the left, table on the right; stacks on narrow screens. */
export function ListLayout({ panel, children }: { panel: ReactNode; children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-500 xl:grid-cols-[272px_minmax(0,1fr)]">{panel}<div className="min-w-0">{children}</div></div>;
}

/** Counts rows per key, preserving the order of `keys`. */
export function countBy<T>(rows: T[], keyOf: (r: T) => string | undefined, keys?: string[]): Map<string, number> {
  const m = new Map<string, number>((keys ?? []).map((k) => [k, 0]));
  for (const r of rows) {
    const k = keyOf(r);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}
