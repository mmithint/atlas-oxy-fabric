import {
  Boxes,
  ChevronsLeft,
  ChevronsRight,
  ClipboardCheck,
  Database,
  FileSpreadsheet,
  History,
  Inbox,
  LayoutDashboard,
  Moon,
  PlusSquare,
  RefreshCw,
  ScanLine,
  Search,
  ShieldCheck,
  Sun,
  Upload,
  Wrench,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { useTheme } from '@/hooks/theme.context';
import { cn } from '@/lib/utils';

import { DemoPath } from './DemoPath';
import { resetDemo } from './repo';
import { useAtlas } from './store';
import { Button, fmtDate } from './ui';

export type Route =
  | { page: 'overview' }
  | { page: 'equipment'; equipmentNumber?: string; q?: string }
  | { page: 'approvals'; requestCode?: string; unit?: string }
  | { page: 'requests'; requestCode?: string }
  | { page: 'new' }
  | { page: 'iq' }
  | { page: 'bulk' }
  | { page: 'quality' }
  | { page: 'sap' }
  | { page: 'audit' };

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const [, page, arg, arg2] = path.split('/');
  const params = new URLSearchParams(query);
  const a = arg ? decodeURIComponent(arg) : undefined;
  switch (page) {
    case 'equipment':
      return { page: 'equipment', equipmentNumber: a, q: params.get('q') ?? undefined };
    case 'approvals':
      if (arg === 'unit' && arg2) return { page: 'approvals', unit: decodeURIComponent(arg2) };
      return { page: 'approvals', requestCode: a };
    case 'requests':
      return { page: 'requests', requestCode: a };
    case 'new':
    case 'iq':
    case 'bulk':
    case 'quality':
    case 'sap':
    case 'audit':
      return { page };
    default:
      return { page: 'overview' };
  }
}

export function href(route: Route): string {
  switch (route.page) {
    case 'equipment':
      if (route.equipmentNumber) return `#/equipment/${encodeURIComponent(route.equipmentNumber)}`;
      return route.q ? `#/equipment?q=${encodeURIComponent(route.q)}` : '#/equipment';
    case 'approvals':
      if (route.unit) return `#/approvals/unit/${encodeURIComponent(route.unit)}`;
      return route.requestCode ? `#/approvals/${encodeURIComponent(route.requestCode)}` : '#/approvals';
    case 'requests':
      return route.requestCode ? `#/requests/${encodeURIComponent(route.requestCode)}` : '#/requests';
    default:
      return `#/${route.page}`;
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parseHash(window.location.hash));
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

const NAV: { page: Route['page']; label: string; icon: typeof LayoutDashboard; section: string }[] = [
  { page: 'overview', label: 'Overview', icon: LayoutDashboard, section: 'Monitor' },
  { page: 'equipment', label: 'Equipment', icon: Wrench, section: 'Monitor' },
  { page: 'approvals', label: 'Approvals', icon: ClipboardCheck, section: 'Govern' },
  { page: 'requests', label: 'My requests', icon: Inbox, section: 'Govern' },
  { page: 'new', label: 'New equipment', icon: PlusSquare, section: 'Govern' },
  { page: 'iq', label: 'EquipmentIQ', icon: ScanLine, section: 'Govern' },
  { page: 'bulk', label: 'Bulk upload', icon: Upload, section: 'Govern' },
  { page: 'quality', label: 'Data quality', icon: ShieldCheck, section: 'Govern' },
  { page: 'sap', label: 'SAP sync', icon: FileSpreadsheet, section: 'Publish' },
  { page: 'audit', label: 'Audit history', icon: History, section: 'Publish' },
];

const APP_VERSION = 'POV 2.2';

function initials(actor: string): { initials: string; name: string } {
  const local = actor.split('@')[0] ?? actor;
  const parts = local.split(/[._\s-]+/).filter(Boolean);
  const name = parts.map((p) => p[0].toUpperCase() + p.slice(1)).join(' ') || actor;
  return { initials: parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?', name };
}

export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const { isDark, toggleTheme } = useTheme();
  const { requests, goldEquipment, reloadAll, state, actor } = useAtlas();
  const pending = requests.filter((r) => r.status === 'PENDING').length;
  const returned = requests.filter((r) => r.status === 'RETURNED').length;
  const sapWork = requests.filter((r) => r.status === 'APPROVED' || r.status === 'SAP_FAILED').length;
  const loadedAt = goldEquipment[0]?.goldLoadedAt;
  const [resetting, setResetting] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('atlas.nav.expanded') === '1';
    } catch {
      return false;
    }
  });
  const toggleRail = () =>
    setExpanded((p) => {
      try {
        window.localStorage.setItem('atlas.nav.expanded', p ? '0' : '1');
      } catch {
        /* storage unavailable — keep it for this session only */
      }
      return !p;
    });
  const mainRef = useRef<HTMLElement>(null);
  const who = initials(actor);

  // The page scrolls inside <main>, so reset it on navigation.
  useEffect(() => {
    mainRef.current?.scrollTo?.({ top: 0 });
  }, [route]);

  const reset = async () => {
    if (!window.confirm('Reset demo data? This deletes all requests, evidence uploads, rule runs and audit events and re-seeds the sample set. Lakehouse data is not touched.')) return;
    setResetting(true);
    try {
      await resetDemo(actor);
      await reloadAll();
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Full-width header, like iCUE: brand, global search, actions, user. */}
      <header className="flex h-[56px] shrink-0 items-center gap-400 border-b border-border bg-card px-400">
        <a href={href({ page: 'overview' })} className="flex shrink-0 items-center gap-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="grid h-[32px] w-[32px] place-items-center rounded-lg bg-primary text-primary-foreground">
            <Boxes aria-hidden className="icon-size-200" />
          </span>
          <span className="font-heading text-600 font-bold leading-600 tracking-wider text-primary">ATLAS</span>
          <span aria-hidden className="hidden h-[24px] w-px bg-border sm:block" />
          <span className="hidden leading-tight sm:block">
            <span className="block text-300 font-semibold">on Microsoft Fabric</span>
            <span className="block text-200 text-muted-foreground">Equipment data · POV</span>
          </span>
        </a>
        <form
          role="search"
          className="relative ml-auto hidden w-full max-w-[360px] lg:block"
          onSubmit={(e) => {
            e.preventDefault();
            const q = search.trim();
            window.location.hash = href({ page: 'equipment', q: q || undefined }).replace(/^#/, '');
            setSearch('');
          }}
        >
          <Search aria-hidden className="pointer-events-none absolute left-300 top-1/2 icon-size-200 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search equipment"
            placeholder="Search equipment — number, serial, tag, name"
            className="h-[36px] w-full rounded-lg border border-input bg-background py-100 pl-[34px] pr-300 text-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </form>
        <div className="ml-auto flex shrink-0 items-center gap-200 lg:ml-0">
          <DemoPath />
          <Button variant="ghost" onClick={() => void reloadAll()} disabled={state.kind === 'loading'} title="Reload Lakehouse and app data">
            <RefreshCw aria-hidden className={cn('icon-size-200', state.kind === 'loading' && 'animate-spin')} />
            <span className="sr-only">Refresh</span>
          </Button>
          <Button variant="ghost" onClick={toggleTheme} title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}>
            {isDark ? <Sun aria-hidden className="icon-size-200" /> : <Moon aria-hidden className="icon-size-200" />}
            <span className="sr-only">Toggle theme</span>
          </Button>
          <span className="hidden whitespace-nowrap text-300 text-primary xl:inline">{who.name}</span>
          <span title={actor} className="grid h-[34px] w-[34px] place-items-center rounded-full bg-primary text-200 font-semibold text-primary-foreground">
            {who.initials}
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Icon rail like iCUE. The arrow at the bottom expands it to show labels; the choice is remembered. */}
        <nav
          aria-label="Main"
          className={cn(
            'flex shrink-0 flex-col gap-100 overflow-y-auto overflow-x-hidden border-r border-border bg-card py-300 transition-[width] duration-200',
            expanded ? 'w-[216px] px-200' : 'w-[60px] items-center'
          )}
        >
          {NAV.map((n, i) => {
            const header = i === 0 || NAV[i - 1].section !== n.section;
            const active = route.page === n.page;
            const Icon = n.icon;
            const count = n.page === 'approvals' ? pending : n.page === 'requests' ? returned : n.page === 'sap' ? sapWork : 0;
            return (
              <div key={n.page} className="contents">
                {header ? (
                  expanded ? (
                    <p className="px-300 pb-100 pt-300 text-[length:var(--text-100)] font-semibold uppercase tracking-widest text-muted-foreground">{n.section}</p>
                  ) : i > 0 ? (
                    <span aria-hidden className="my-200 h-px w-[28px] shrink-0 bg-border" />
                  ) : null
                ) : null}
                <a
                  href={href({ page: n.page } as Route)}
                  aria-current={active ? 'page' : undefined}
                  title={expanded ? undefined : n.label}
                  className={cn(
                    'relative flex h-[40px] shrink-0 items-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    expanded ? 'w-full gap-300 px-300 text-[length:var(--text-300)] font-medium' : 'w-[40px] justify-center',
                    active ? 'bg-primary/12 text-primary shadow-[inset_3px_0_0_var(--color-primary)]' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <Icon aria-hidden className="icon-size-300 shrink-0" />
                  {expanded ? <span className="flex-1 truncate">{n.label}</span> : <span className="sr-only">{n.label}</span>}
                  {count > 0 ? (
                    expanded ? (
                      <span aria-label={`${count} waiting`} className="rounded-full bg-primary px-200 text-[length:var(--text-100)] font-semibold leading-200 text-primary-foreground">
                        {count}
                      </span>
                    ) : (
                      <span aria-label={`${count} waiting`} className="absolute right-[1px] top-[2px] grid h-[16px] min-w-[16px] place-items-center rounded-full bg-primary px-100 text-[length:var(--text-100)] font-semibold text-primary-foreground ring-2 ring-card">
                        {count}
                      </span>
                    )
                  ) : null}
                </a>
              </div>
            );
          })}
          <button
            type="button"
            onClick={toggleRail}
            aria-expanded={expanded}
            title={expanded ? 'Collapse menu' : 'Expand menu'}
            className={cn(
              'mt-auto flex h-[36px] shrink-0 items-center rounded-lg border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              expanded ? 'w-full gap-200 px-300 text-[length:var(--text-200)]' : 'w-[36px] justify-center'
            )}
          >
            {expanded ? <ChevronsLeft aria-hidden className="icon-size-200" /> : <ChevronsRight aria-hidden className="icon-size-200" />}
            {expanded ? <span>Collapse</span> : <span className="sr-only">Expand menu</span>}
          </button>
        </nav>

        <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto px-400 py-400 lg:px-500">
          {children}
        </main>
      </div>

      {/* Footer: version, data freshness, demo controls. */}
      <footer className="flex h-[32px] shrink-0 items-center gap-400 overflow-hidden whitespace-nowrap border-t border-border bg-card px-400 text-200 text-muted-foreground">
        <span className="font-medium text-foreground">ATLAS {APP_VERSION} · Fabric App</span>
        <span className="hidden sm:inline">Sample data — not Oxy production</span>
        <span className="flex items-center gap-100">
          <Database aria-hidden className="icon-size-100" />
          Lakehouse Gold {loadedAt ? `loaded ${fmtDate(loadedAt)}` : '—'}
        </span>
        <span className="ml-auto hidden truncate md:inline" title={actor}>Signed in as {actor}</span>
        <button type="button" className="text-primary hover:underline disabled:opacity-50" disabled={resetting || state.kind === 'loading'} onClick={() => void reset()}>
          {resetting ? 'Resetting…' : 'Reset demo data'}
        </button>
      </footer>
    </div>
  );
}
