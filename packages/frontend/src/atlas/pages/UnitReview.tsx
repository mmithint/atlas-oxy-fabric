import type { ChangeRequestRecord } from '@rayfin-app/shared';
import { ArrowLeft, CheckCircle2, CornerUpLeft, Layers, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';

import { EvidenceGallery } from '../components';
import { fieldDef, formatValue } from '../fields';
import { decideRequest } from '../repo';
import { evaluateRules } from '../rules';
import { href } from '../Shell';
import { useAtlas } from '../store';
import { ageHours, Badge, Button, Card, CardHeader, Empty, fmtAge, PageTitle, SOURCE_LABEL, Tag } from '../ui';

/**
 * Review every waiting change for one piece of equipment together and decide them in one go.
 * Day 1 ask: "somebody goes to the field and says 90% of this data is wrong — that should come as one approval".
 */
export function UnitReview({ equipmentNumber }: { equipmentNumber: string }) {
  const { equipment, requests, rules, liveViolations, evidence, approvers, actor, refreshApp } = useAtlas();
  const e = equipment.find((x) => x.equipmentNumber === equipmentNumber);
  const waiting = useMemo(
    () => requests.filter((r) => r.equipmentNumber === equipmentNumber && r.status === 'PENDING').sort((a, b) => a.requestCode.localeCompare(b.requestCode)),
    [requests, equipmentNumber]
  );
  const [picked, setPicked] = useState<Set<string>>(() => new Set(waiting.map((r) => r.id)));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const selected = waiting.filter((r) => picked.has(r.id));
  const codes = new Set(waiting.map((r) => r.requestCode));
  const groupEvidence = evidence.filter((x) => x.requestCode && codes.has(x.requestCode));
  const sla = (r: ChangeRequestRecord) => approvers.find((a) => a.attributeGroup === r.attributeGroup && a.area === r.area)?.slaHours ?? 48;
  const routedTo = [...new Set(waiting.map((r) => r.assignedApprover ?? 'unassigned'))];

  // Combined impact of the selected changes on this unit's rule results.
  const impact = useMemo(() => {
    if (!e) return { fixes: [] as string[], breaks: [] as string[] };
    const before = liveViolations.filter((v) => v.equipmentNumber === e.equipmentNumber);
    const patched: Record<string, unknown> = { ...e };
    for (const r of selected) {
      const def = fieldDef(r.fieldName);
      patched[r.fieldName] = def && (def.kind === 'int' || def.kind === 'decimal') ? Number(r.newValue) : r.newValue;
    }
    const pool = equipment.map((x) => (x.equipmentNumber === e.equipmentNumber ? (patched as unknown as typeof x) : x));
    const after = evaluateRules(pool, rules).filter((v) => v.equipmentNumber === e.equipmentNumber);
    return {
      fixes: before.filter((b) => !after.some((a) => a.ruleCode === b.ruleCode)).map((v) => `${v.ruleCode} · ${v.violation}`),
      breaks: after.filter((a) => !before.some((b) => a.ruleCode === b.ruleCode)).map((v) => `${v.ruleCode} · ${v.violation}`),
    };
  }, [e, selected, equipment, liveViolations, rules]);

  const act = async (d: 'APPROVED' | 'REJECTED' | 'RETURNED') => {
    if (!selected.length) return setError('Tick at least one change.');
    if ((d === 'REJECTED' || d === 'RETURNED') && note.trim().length < 3) return setError('Add a comment so the requester knows what to fix.');
    setBusy(d);
    setError(null);
    try {
      const text = `${note.trim() ? `${note.trim()} · ` : ''}reviewed together with ${selected.length} change${selected.length === 1 ? '' : 's'} on ${equipmentNumber}`.slice(0, 300);
      for (const r of selected) await decideRequest(r, d, actor, text);
      const verb = d === 'APPROVED' ? 'Approved' : d === 'REJECTED' ? 'Rejected' : 'Returned';
      setDone(`${verb} ${selected.length} change${selected.length === 1 ? '' : 's'}: ${selected.map((r) => r.requestCode).join(', ')}.`);
      setNote('');
      await refreshApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const label = 'text-200 font-semibold uppercase tracking-wider text-muted-foreground';

  return (
    <>
      <PageTitle eyebrow="Reviewer inbox · grouped by equipment" title={!e ? equipmentNumber : done && !waiting.length ? `${e.equipmentNumber} · reviewed` : `${e.equipmentNumber} · ${waiting.length} change${waiting.length === 1 ? '' : 's'} waiting`}>
        <a href={href({ page: 'approvals' })} className="inline-flex items-center gap-100 text-300 font-medium text-primary hover:underline">
          <ArrowLeft aria-hidden className="icon-size-200" /> All requests
        </a>
      </PageTitle>

      {done ? (
        <p role="status" className="mb-400 rounded-lg border border-success/40 bg-success/10 px-400 py-300 text-300 text-success">
          {done}{' '}
          <a className="font-medium underline" href={href({ page: 'equipment', equipmentNumber })}>See the unit</a>
        </p>
      ) : null}

      {!e ? (
        <Card><Empty>Equipment {equipmentNumber} isn’t in the Gold layer.</Empty></Card>
      ) : !waiting.length ? (
        <Card><Empty>Nothing is waiting for review on this unit. <a className="text-primary hover:underline" href={href({ page: 'approvals' })}>Back to the inbox</a></Empty></Card>
      ) : (
        <div className="grid grid-cols-1 gap-500 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
          <Card className="min-w-0">
            <CardHeader
              title={e.description}
              hint={`${e.facility} · ${e.floc ?? ''} · routed to ${routedTo.join(' and ')}`}
              action={<Badge tone="warning"><Layers aria-hidden className="mr-100 inline icon-size-100" />{waiting.length} waiting</Badge>}
            />
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/60">
                  <tr className="text-left text-200 font-semibold">
                    <th className="px-300 py-300">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        className="h-[18px] w-[18px] accent-primary"
                        checked={picked.size === waiting.length}
                        onChange={(ev) => setPicked(ev.target.checked ? new Set(waiting.map((r) => r.id)) : new Set())}
                      />
                    </th>
                    <th className="px-300 py-300">Field</th>
                    <th className="px-300 py-300">Current → proposed</th>
                    <th className="px-300 py-300">Reason</th>
                    <th className="px-300 py-300">Routed to</th>
                    <th className="px-300 py-300">Waiting</th>
                  </tr>
                </thead>
                <tbody>
                  {waiting.map((r) => {
                    const def = fieldDef(r.fieldName);
                    const over = ageHours(r.submittedAt) > sla(r);
                    return (
                      <tr key={r.id} className="border-t border-border align-top text-300">
                        <td className="px-300 py-300">
                          <input
                            type="checkbox"
                            aria-label={`Include ${r.requestCode}`}
                            className="h-[18px] w-[18px] accent-primary"
                            checked={picked.has(r.id)}
                            onChange={(ev) => {
                              const s = new Set(picked);
                              if (ev.target.checked) s.add(r.id);
                              else s.delete(r.id);
                              setPicked(s);
                            }}
                          />
                        </td>
                        <td className="px-300 py-300">
                          <span className="font-medium">{def?.label ?? r.fieldName}</span>
                          <p className="text-200">
                            <a className="font-monospace text-primary hover:underline" href={href({ page: 'approvals', requestCode: r.requestCode })}>{r.requestCode}</a>
                            {def && !def.sap ? <span className="text-muted-foreground"> · ATLAS only</span> : null}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-300 py-300 font-monospace">
                          <span className="text-muted-foreground line-through">{r.oldValue ? formatValue(r.oldValue) : 'blank'}</span> → <span className="font-semibold">{r.newValue}</span>
                          {def?.unit ? <span className="text-200 text-muted-foreground"> {def.unit}</span> : null}
                        </td>
                        <td className="min-w-[220px] px-300 py-300 text-200">
                          {r.reason}
                          <p className="text-muted-foreground">{r.requestedBy} · {SOURCE_LABEL[r.source]}</p>
                        </td>
                        <td className="whitespace-nowrap px-300 py-300">{r.assignedApprover ?? 'unassigned'}</td>
                        <td className="px-300 py-300"><Badge tone={over ? 'danger' : 'neutral'}>{fmtAge(r.submittedAt)}{over ? ' · past SLA' : ''}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-300 border-t border-border p-500">
              <div>
                <p className={label}>Data-quality impact of the {selected.length} selected</p>
                <ul className="mt-100 space-y-100 text-300">
                  {impact.fixes.map((x) => <li key={x} className="text-success">✓ Clears {x}</li>)}
                  {impact.breaks.map((x) => <li key={x} className="text-destructive">✗ Introduces {x}</li>)}
                  {!impact.fixes.length && !impact.breaks.length ? <li className="text-muted-foreground">No change to rule results.</li> : null}
                </ul>
              </div>
              {routedTo.length > 1 ? (
                <p className="text-200 text-muted-foreground">
                  These changes are routed to {routedTo.join(' and ')}. In this POV one reviewer can decide them all; in production each approver decides the rows routed to them, or the accountable lead approves the whole visit.
                </p>
              ) : null}
              <label className="block text-300 font-medium">
                Comment to requester <span className="font-normal text-muted-foreground">(required to return or reject)</span>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(ev) => setNote(ev.target.value)}
                  placeholder="e.g. all four match the new engine nameplate"
                  className="mt-100 w-full rounded-lg border border-input bg-card px-300 py-200 text-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              {error ? <p role="alert" className="text-300 text-destructive">{error}</p> : null}
              <div className="flex flex-wrap gap-300">
                <Button onClick={() => void act('APPROVED')} disabled={!!busy || !selected.length}>
                  <CheckCircle2 aria-hidden className="icon-size-200" /> {busy === 'APPROVED' ? 'Approving…' : `Approve ${selected.length} selected`}
                </Button>
                <Button variant="secondary" onClick={() => void act('RETURNED')} disabled={!!busy || !selected.length}>
                  <CornerUpLeft aria-hidden className="icon-size-200" /> Return selected
                </Button>
                <Button variant="danger" onClick={() => void act('REJECTED')} disabled={!!busy || !selected.length}>
                  <XCircle aria-hidden className="icon-size-200" /> Reject selected
                </Button>
              </div>
            </div>
          </Card>

          <Card className="self-start">
            <CardHeader title={`Evidence (${groupEvidence.length})`} hint="Attached to any of these requests" />
            <div className="p-500">
              <EvidenceGallery items={groupEvidence} large empty="No evidence attached to these requests." />
              <p className="mt-400 text-200">
                <a className="text-primary hover:underline" href={href({ page: 'equipment', equipmentNumber })}>
                  Open <Tag>{equipmentNumber}</Tag> for all its records and history
                </a>
              </p>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
