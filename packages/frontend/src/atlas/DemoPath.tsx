import { Check, Route as RouteIcon, X } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

import { href } from './Shell';
import { useAtlas } from './store';
import { Button } from './ui';

/** The heater used for the guided end-to-end demo (heat duty missing, evidence attached). */
export const JOURNEY = { equipmentNumber: '10412344', tag: 'RB-218', field: 'heatDutyMmbtu', value: '1.50' } as const;

const ORDER = ['PENDING', 'APPROVED', 'SENT_TO_SAP', 'SAP_LOADED', 'SYNCED'];

/** Step-by-step guide for following one heater through the whole workflow. */
export function DemoPath() {
  const { requests } = useAtlas();
  const [open, setOpen] = useState(false);
  const req = requests
    .filter((r) => r.equipmentNumber === JOURNEY.equipmentNumber && r.fieldName === JOURNEY.field)
    .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())[0];
  const at = req ? ORDER.indexOf(req.status) : -1;
  const eq = href({ page: 'equipment', equipmentNumber: JOURNEY.equipmentNumber });

  const steps = [
    { label: `Find the heater — search “${JOURNEY.tag}”`, link: href({ page: 'equipment', q: JOURNEY.tag }), done: !!req },
    { label: 'Inspect its evidence (nameplate photo, data sheet)', link: eq, done: !!req },
    { label: `Propose the missing heat duty (${JOURNEY.value} MMBtu/hr) with evidence`, link: eq, done: !!req },
    { label: 'Review the rule impact in Approvals', link: req ? href({ page: 'approvals', requestCode: req.requestCode }) : href({ page: 'approvals' }), done: at >= 1 },
    { label: 'Approve', link: req ? href({ page: 'approvals', requestCode: req.requestCode }) : href({ page: 'approvals' }), done: at >= 1 },
    { label: 'See the approved value on the heater immediately', link: eq, done: at >= 1 },
    { label: 'Generate the SAP upload file', link: href({ page: 'sap' }), done: at >= 2 },
    { label: 'SAP team loads it (simulated)', link: href({ page: 'sap' }), done: at >= 3 },
    { label: 'Confirm against refreshed source (simulated)', link: href({ page: 'sap' }), done: at >= 4 },
  ];
  const next = steps.findIndex((s) => !s.done);

  return (
    <div className="relative">
      <Button variant="secondary" onClick={() => setOpen((o) => !o)}>
        <RouteIcon aria-hidden className="icon-size-200" />
        <span className="hidden whitespace-nowrap sm:inline">Demo path</span>
        <span className="font-monospace text-[length:var(--text-200)] text-muted-foreground">
          {steps.filter((s) => s.done).length}/{steps.length}
        </span>
      </Button>
      {open ? (
        <div role="dialog" aria-label="Demo path" className="absolute right-0 top-full z-40 mt-200 w-[min(380px,90vw)] rounded-xl border border-border bg-popover p-400 text-popover-foreground shadow-xl">
          <div className="mb-300 flex items-start justify-between gap-200">
            <div>
              <p className="font-heading text-500 font-semibold">One heater, end to end</p>
              <p className="text-200 text-muted-foreground">
                Reboiler {JOURNEY.tag} · Spraberry CS · SAP {JOURNEY.equipmentNumber}
                {req ? ` · ${req.requestCode}` : ''}
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-md p-100 text-muted-foreground hover:bg-accent" aria-label="Close demo path">
              <X aria-hidden className="icon-size-200" />
            </button>
          </div>
          <ol className="space-y-100">
            {steps.map((s, i) => (
              <li key={s.label}>
                <a
                  href={s.link}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex items-start gap-300 rounded-lg px-200 py-200 text-300 hover:bg-accent',
                    i === next && 'bg-primary/10 font-medium text-primary'
                  )}
                >
                  <span
                    className={cn(
                      'mt-[1px] grid h-[20px] w-[20px] shrink-0 place-items-center rounded-full border text-[length:var(--text-100)] font-semibold',
                      s.done ? 'border-success bg-success text-success-foreground' : 'border-border text-muted-foreground'
                    )}
                  >
                    {s.done ? <Check aria-hidden className="icon-size-100" /> : i + 1}
                  </span>
                  <span>{s.label}</span>
                </a>
              </li>
            ))}
          </ol>
          <p className="mt-300 text-200 text-muted-foreground">Use “Reset demo data” in the expanded menu to run it again.</p>
        </div>
      ) : null}
    </div>
  );
}
