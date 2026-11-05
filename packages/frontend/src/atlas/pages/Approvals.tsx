import type { ChangeRequestRecord } from '@rayfin-app/shared';
import { ArrowLeft, CheckCircle2, CornerUpLeft, Sparkles, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { cn } from '@/lib/utils';

import { EvidenceGallery, RequestTimeline } from '../components';
import { findDuplicateCandidates } from '../duplicates';
import { UnitReview } from './UnitReview';
import { DataTable, FacetPanel, ListLayout, type Column, type FacetSection, type FacetTone } from '../listkit';
import { fieldDef, GROUP_LABELS, sourceSystemFor } from '../fields';
import { decideRequest, type ProposedEquipment } from '../repo';
import { evaluateRules } from '../rules';
import { href } from '../Shell';
import { useAtlas } from '../store';
import {
  ageHours,
  Badge,
  Button,
  Card,
  CardHeader,
  Empty,
  fmtAge,
  fmtDate,
  PageTitle,
  SOURCE_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  Tag,
  Td,
  Th,
} from '../ui';

const savedFacets = { status: 'awaiting', approver: '', source: '', type: '' };
type FacetKey = keyof typeof savedFacets;
const savedView = { grouped: false };

const STATUS_FACETS: { key: string; label: string; tone: FacetTone; match: (r: ChangeRequestRecord, overSla: boolean) => boolean }[] = [
  { key: 'awaiting', label: 'Awaiting review', tone: 'warning', match: (r) => r.status === 'PENDING' },
  { key: 'sla', label: 'Past SLA', tone: 'danger', match: (r, over) => r.status === 'PENDING' && over },
  { key: 'returned', label: 'Returned for correction', tone: 'neutral', match: (r) => r.status === 'RETURNED' },
  { key: 'sap', label: 'On the way to SAP', tone: 'primary', match: (r) => r.status === 'APPROVED' || r.status === 'SENT_TO_SAP' || r.status === 'SAP_LOADED' },
  { key: 'failed', label: 'SAP load failed', tone: 'danger', match: (r) => r.status === 'SAP_FAILED' },
  { key: 'done', label: 'Confirmed', tone: 'success', match: (r) => r.status === 'SYNCED' },
  { key: 'rejected', label: 'Rejected', tone: 'neutral', match: (r) => r.status === 'REJECTED' },
];

export function Approvals({ requestCode, unit }: { requestCode?: string; unit?: string }) {
  const { requests, approvers } = useAtlas();
  if (unit) return <UnitReview equipmentNumber={unit} />;
  const sla = (r: ChangeRequestRecord) => approvers.find((a) => a.attributeGroup === r.attributeGroup && a.area === r.area)?.slaHours ?? 48;
  const selected = requestCode ? requests.find((r) => r.requestCode === requestCode) : undefined;

  if (requestCode) {
    return (
      <>
        <PageTitle eyebrow="Reviewer inbox" title={selected ? `${selected.requestCode} · review` : 'Approvals'}>
          <a href={href({ page: 'approvals' })} className="inline-flex items-center gap-100 text-300 font-medium text-primary hover:underline">
            <ArrowLeft aria-hidden className="icon-size-200" /> All requests
          </a>
        </PageTitle>
        {selected ? <RequestReview key={`${selected.id}-${selected.status}-${selected.revision}`} r={selected} slaHours={sla(selected)} /> : <Card><Empty>Request {requestCode} wasn’t found.</Empty></Card>}
      </>
    );
  }
  return <ApprovalsList />;
}

function ApprovalsList() {
  const { requests, approvers } = useAtlas();
  const [f, setF] = useState<Record<FacetKey, string>>({ ...savedFacets });
  const [grouped, setGrouped] = useState(savedView.grouped);
  useEffect(() => {
    Object.assign(savedFacets, f);
    savedView.grouped = grouped;
  }, [f, grouped]);
  const sla = (r: ChangeRequestRecord) => approvers.find((a) => a.attributeGroup === r.attributeGroup && a.area === r.area)?.slaHours ?? 48;
  const over = (r: ChangeRequestRecord) => ageHours(r.submittedAt) > sla(r);
  const typeOf = (r: ChangeRequestRecord) => (r.requestType === 'NEW_RECORD' ? 'new' : 'change');

  const match: Record<FacetKey, (r: ChangeRequestRecord, v: string) => boolean> = {
    status: (r, v) => !!STATUS_FACETS.find((x) => x.key === v)?.match(r, over(r)),
    approver: (r, v) => r.assignedApprover === v,
    source: (r, v) => r.source === v,
    type: (r, v) => typeOf(r) === v,
  };
  const except = (skip?: FacetKey) => requests.filter((r) => (Object.keys(f) as FacetKey[]).every((k) => k === skip || !f[k] || match[k](r, f[k])));
  const count = (k: FacetKey, v: string) => except(k).filter((r) => match[k](r, v)).length;
  const set = (k: FacetKey) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const rows = except().sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
  const names = [...new Set(approvers.map((a) => a.approver))].sort();

  const sections: FacetSection[] = [
    { title: 'Status', value: f.status, onChange: set('status'), items: STATUS_FACETS.map((x) => ({ key: x.key, label: x.label, tone: x.tone, count: count('status', x.key) })) },
    { title: 'Approver', value: f.approver, onChange: set('approver'), items: names.map((n) => ({ key: n, label: n, count: count('approver', n) })) },
    { title: 'Source', value: f.source, onChange: set('source'), items: Object.entries(SOURCE_LABEL).map(([k, label]) => ({ key: k, label, count: count('source', k) })) },
    {
      title: 'Request type',
      value: f.type,
      onChange: set('type'),
      items: [
        { key: 'change', label: 'Attribute change', count: count('type', 'change') },
        { key: 'new', label: 'New equipment', tone: 'info' as const, count: count('type', 'new') },
      ],
    },
  ];

  const changeText = (r: ChangeRequestRecord) => (r.requestType === 'NEW_RECORD' ? 'Create new equipment' : `${fieldDef(r.fieldName)?.label ?? r.fieldName}: ${r.oldValue ?? '∅'} → ${r.newValue}`);
  const columns: Column<ChangeRequestRecord>[] = [
    {
      key: 'code',
      header: 'Request',
      filterText: (r) => r.requestCode,
      cell: (r) => (
        <a href={href({ page: 'approvals', requestCode: r.requestCode })} className="whitespace-nowrap font-monospace text-primary hover:underline">
          {r.requestCode}
          {(r.revision ?? 1) > 1 ? <span className="text-muted-foreground"> · rev {r.revision}</span> : null}
        </a>
      ),
    },
    { key: 'eq', header: 'Equipment', className: 'whitespace-nowrap', filterText: (r) => `${r.equipmentNumber} ${r.facility}`, cell: (r) => <><Tag>{r.equipmentNumber}</Tag><p className="mt-100 text-200 text-muted-foreground">{r.facility}</p></> },
    { key: 'change', header: 'Change', className: 'min-w-[240px]', filterText: changeText, cell: (r) => <span className="font-monospace text-200">{changeText(r)}</span> },
    {
      key: 'source',
      header: 'Source',
      filterText: (r) => SOURCE_LABEL[r.source] ?? r.source,
      cell: (r) => (
        <span className="inline-flex items-center gap-100 whitespace-nowrap">
          {r.source === 'EQUIPMENTIQ' ? <Sparkles aria-hidden className="icon-size-100 text-primary" /> : null}
          {SOURCE_LABEL[r.source]}
        </span>
      ),
    },
    { key: 'approver', header: 'Approver', filterText: (r) => r.assignedApprover ?? '', cell: (r) => r.assignedApprover ?? 'unassigned' },
    {
      key: 'age',
      header: 'Waiting',
      cell: (r) =>
        r.status === 'PENDING' ? (
          <Badge tone={over(r) ? 'danger' : 'neutral'}>{fmtAge(r.submittedAt)}{over(r) ? ' · past SLA' : ''}</Badge>
        ) : (
          <span className="whitespace-nowrap text-200 text-muted-foreground">{r.decidedAt ? `decided ${fmtDate(r.decidedAt, false)}` : '—'}</span>
        ),
    },
    { key: 'status', header: 'Status', filterText: (r) => STATUS_LABEL[r.status], cell: (r) => <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge> },
  ];

  return (
    <>
      <PageTitle eyebrow="Reviewer inbox" title="Approvals" />
      <ListLayout panel={<FacetPanel title="Insights" sections={sections} onClearAll={() => setF({ status: '', approver: '', source: '', type: '' })} />}>
        <div className="mb-300 flex flex-wrap items-center gap-200 text-300">
          <span className="text-muted-foreground">View</span>
          <div role="group" aria-label="View" className="inline-flex rounded-lg border border-border bg-card p-[3px]">
            {([['requests', 'One row per request'], ['units', 'Grouped by equipment']] as const).map(([k, l]) => {
              const on = (k === 'units') === grouped;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setGrouped(k === 'units')}
                  className={cn('rounded-md px-300 py-100 font-medium', on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                  {l}
                </button>
              );
            })}
          </div>
          {grouped ? <span className="text-200 text-muted-foreground">Review all of a unit’s changes together and approve them in one go.</span> : null}
        </div>
        {grouped ? (
          <DataTable
            id="approvals-units"
            rows={groupByUnit(rows)}
            columns={unitColumns(over)}
            rowKey={(g) => g.equipmentNumber}
            rowHref={(g) => (g.pending ? href({ page: 'approvals', unit: g.equipmentNumber }) : href({ page: 'approvals', requestCode: g.items[0].requestCode }))}
            empty="Nothing here for these filters."
            toolbar={<span className="text-200 text-muted-foreground">Units with the most waiting changes first</span>}
          />
        ) : (
          <DataTable
            id="approvals"
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            rowHref={(r) => href({ page: 'approvals', requestCode: r.requestCode })}
            empty="Nothing here — the inbox is clear for these filters."
            toolbar={<span className="text-200 text-muted-foreground">Oldest first · click a row to review</span>}
          />
        )}
        <RaciTable />
      </ListLayout>
    </>
  );
}

type UnitGroup = { equipmentNumber: string; facility: string; items: ChangeRequestRecord[]; pending: number };

function groupByUnit(rows: ChangeRequestRecord[]): UnitGroup[] {
  const m = new Map<string, UnitGroup>();
  for (const r of rows) {
    const g = m.get(r.equipmentNumber) ?? { equipmentNumber: r.equipmentNumber, facility: r.facility, items: [], pending: 0 };
    g.items.push(r);
    if (r.status === 'PENDING') g.pending += 1;
    m.set(r.equipmentNumber, g);
  }
  const oldest = (g: UnitGroup) => Math.min(...g.items.map((r) => r.submittedAt.getTime()));
  return [...m.values()].sort((a, b) => b.items.length - a.items.length || oldest(a) - oldest(b));
}

function unitColumns(over: (r: ChangeRequestRecord) => boolean): Column<UnitGroup>[] {
  return [
    {
      key: 'eq',
      header: 'Equipment',
      className: 'whitespace-nowrap',
      filterText: (g) => `${g.equipmentNumber} ${g.facility}`,
      cell: (g) => <><Tag>{g.equipmentNumber}</Tag><p className="mt-100 text-200 text-muted-foreground">{g.facility}</p></>,
    },
    {
      key: 'n',
      header: 'Changes',
      cell: (g) => <Badge tone={g.items.length > 1 ? 'primary' : 'neutral'}>{g.items.length} change{g.items.length === 1 ? '' : 's'}</Badge>,
    },
    {
      key: 'fields',
      header: 'Fields',
      className: 'min-w-[260px]',
      filterText: (g) => g.items.map((r) => fieldDef(r.fieldName)?.label ?? r.fieldName).join(' '),
      cell: (g) => <span className="text-200">{g.items.map((r) => (r.requestType === 'NEW_RECORD' ? 'New equipment' : fieldDef(r.fieldName)?.label ?? r.fieldName)).join(' · ')}</span>,
    },
    {
      key: 'by',
      header: 'Requested by',
      filterText: (g) => [...new Set(g.items.map((r) => r.requestedBy))].join(' '),
      cell: (g) => <span className="text-200">{[...new Set(g.items.map((r) => r.requestedBy))].join(', ')}</span>,
    },
    {
      key: 'to',
      header: 'Routed to',
      filterText: (g) => [...new Set(g.items.map((r) => r.assignedApprover ?? ''))].join(' '),
      cell: (g) => <span className="text-200">{[...new Set(g.items.map((r) => r.assignedApprover ?? 'unassigned'))].join(', ')}</span>,
    },
    {
      key: 'age',
      header: 'Oldest waiting',
      cell: (g) => {
        const p = g.items.filter((r) => r.status === 'PENDING').sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime())[0];
        return p ? <Badge tone={over(p) ? 'danger' : 'neutral'}>{fmtAge(p.submittedAt)}{over(p) ? ' · past SLA' : ''}</Badge> : <span className="text-200 text-muted-foreground">—</span>;
      },
    },
    {
      key: 'act',
      header: '',
      cell: (g) =>
        g.pending ? (
          <a href={href({ page: 'approvals', unit: g.equipmentNumber })} className="whitespace-nowrap text-300 font-medium text-primary hover:underline">
            Review {g.pending > 1 ? `all ${g.pending}` : ''} →
          </a>
        ) : null,
    },
  ];
}

function RequestReview({ r, slaHours }: { r: ChangeRequestRecord; slaHours: number }) {
  const { equipment, goldEquipment, requests, rules, liveViolations, evidence, audit, actor, refreshApp } = useAtlas();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isNew = r.requestType === 'NEW_RECORD';
  const e = equipment.find((x) => x.equipmentNumber === r.equipmentNumber);
  const def = fieldDef(r.fieldName);
  const myEvidence = evidence.filter((x) => x.requestCode === r.requestCode);
  const proposed = useMemo(() => {
    if (!isNew || !r.proposedRecord) return undefined;
    try {
      return JSON.parse(r.proposedRecord) as ProposedEquipment;
    } catch {
      return undefined;
    }
  }, [isNew, r.proposedRecord]);
  const candidates = useMemo(() => (proposed ? findDuplicateCandidates(proposed, goldEquipment) : []), [proposed, goldEquipment]);

  // Impact preview: which rule issues this change would clear or introduce.
  const impact = useMemo(() => {
    if (!e || !def) return { fixes: [] as string[], breaks: [] as string[] };
    // Pending: compare today's view with the change applied. Decided: compare the
    // source record (before this change) with the change applied.
    const base = r.status === 'PENDING' ? e : goldEquipment.find((x) => x.equipmentNumber === e.equipmentNumber) ?? e;
    const pool = equipment.map((x) => (x.equipmentNumber === e.equipmentNumber ? base : x));
    const before = r.status === 'PENDING' ? liveViolations.filter((v) => v.equipmentNumber === e.equipmentNumber) : evaluateRules(pool, rules).filter((v) => v.equipmentNumber === e.equipmentNumber);
    const patched = { ...base, [r.fieldName]: def.kind === 'int' || def.kind === 'decimal' ? Number(r.newValue) : r.newValue };
    const after = evaluateRules(pool.map((x) => (x.equipmentNumber === e.equipmentNumber ? patched : x)), rules).filter((v) => v.equipmentNumber === e.equipmentNumber);
    return {
      fixes: before.filter((b) => !after.some((a) => a.ruleCode === b.ruleCode)).map((v) => `${v.ruleCode} · ${v.violation}`),
      breaks: after.filter((a) => !before.some((b) => a.ruleCode === b.ruleCode)).map((v) => `${v.ruleCode} · ${v.violation}`),
    };
  }, [e, def, r, equipment, goldEquipment, rules, liveViolations]);

  const others = requests.filter((x) => x.equipmentNumber === r.equipmentNumber && x.id !== r.id);
  const decidable = r.status === 'PENDING';
  const over = decidable && ageHours(r.submittedAt) > slaHours;
  const strongDup = candidates.some((c) => c.strength === 'strong');

  const act = async (d: 'APPROVED' | 'REJECTED' | 'RETURNED') => {
    if ((d === 'REJECTED' || d === 'RETURNED') && note.trim().length < 3) {
      setError('Add a comment so the requester knows what to fix.');
      return;
    }
    setBusy(d);
    setError(null);
    try {
      await decideRequest(r, d, actor, note.trim().slice(0, 300));
      await refreshApp();
      setNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const label = 'text-200 font-semibold uppercase tracking-wider text-muted-foreground';

  const siblingsWaiting = others.filter((o) => o.status === 'PENDING');
  return (
    <div className="flex flex-col gap-600">
      {decidable && siblingsWaiting.length ? (
        <div role="note" className="flex flex-wrap items-center justify-between gap-300 rounded-lg border border-warning/50 bg-warning/10 px-400 py-300 text-300">
          <span>
            <strong>{siblingsWaiting.length} more change{siblingsWaiting.length === 1 ? ' is' : 's are'} waiting on this unit</strong>{' '}
            <span className="text-muted-foreground">({siblingsWaiting.map((o) => fieldDef(o.fieldName)?.label ?? o.fieldName).join(', ')})</span>
          </span>
          <a href={href({ page: 'approvals', unit: r.equipmentNumber })} className="font-medium text-primary hover:underline">
            Review all {siblingsWaiting.length + 1} together →
          </a>
        </div>
      ) : null}
      <Card>
        <CardHeader
          title={`${r.requestCode} · ${isNew ? 'New equipment' : def?.label ?? r.fieldName}${(r.revision ?? 1) > 1 ? ` · revision ${r.revision}` : ''}`}
          hint={`${GROUP_LABELS[r.attributeGroup]} · routed to ${r.assignedApprover ?? 'unassigned'} · SLA ${slaHours} h${decidable ? ` · waiting ${fmtAge(r.submittedAt)}` : r.decidedBy ? ` · decided by ${r.decidedBy} ${fmtDate(r.decidedAt)}` : ''}`}
          action={<Badge tone={over ? 'danger' : STATUS_TONE[r.status]}>{over ? 'Past SLA' : STATUS_LABEL[r.status]}</Badge>}
        />
        <div className="grid grid-cols-1 gap-600 p-500 lg:grid-cols-2">
          {/* What is being asked */}
          <div className="flex flex-col gap-500">
            {isNew && proposed ? (
              <div>
                <p className={label}>Proposed new record</p>
                <dl className="mt-200 grid grid-cols-[auto_1fr] gap-x-400 gap-y-100 text-300">
                  {[
                    ['Class', `${proposed.equipmentClass} · ${proposed.equipmentSubtype}`],
                    ['Facility', `${proposed.facility} (${proposed.floc})`],
                    ['P&ID tag', proposed.pidTag],
                    ['Manufacturer / model', `${proposed.manufacturer} ${proposed.model}`],
                    ['Serial no.', proposed.serialNumber],
                    ...(proposed.heatDutyMmbtu !== undefined ? [['Heat duty', `${proposed.heatDutyMmbtu} MMBtu/hr`]] : []),
                    ...(proposed.horsepower !== undefined ? [['Rated HP', `${proposed.horsepower}`]] : []),
                  ].map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="font-monospace">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : (
              <div>
                <p className={label}>Proposed change</p>
                <div className="mt-200 flex flex-wrap items-baseline gap-300 font-monospace text-600">
                  <span className="text-muted-foreground line-through decoration-destructive/60">{r.oldValue ?? 'blank'}</span>
                  <span aria-hidden>→</span>
                  <span className="font-semibold">{r.newValue}</span>
                  {def?.unit ? <span className="text-300 text-muted-foreground">{def.unit}</span> : null}
                </div>
                {def ? (
                  <p className="mt-100 text-200 text-muted-foreground">
                    Source: {sourceSystemFor(def)} ·{' '}
                    {def.sap ? `goes to SAP via ${def.sap.template === 'EQUIPMENT_UPDATE' ? `equipment update (${def.sap.sapField})` : `characteristics (${def.sap.characteristic})`}` : 'ATLAS-only, not sent to SAP'}
                  </p>
                ) : null}
              </div>
            )}

            <div>
              <p className={label}>Requester’s reason</p>
              <p className="mt-100 text-300">{r.reason}</p>
              <p className="mt-100 flex flex-wrap items-center gap-200 text-200 text-muted-foreground">
                {r.source === 'EQUIPMENTIQ' ? <Sparkles aria-hidden className="icon-size-100 text-primary" /> : null}
                {SOURCE_LABEL[r.source]} · {r.requestedBy} · {fmtDate(r.submittedAt)}
              </p>
            </div>

            {!isNew ? (
              <div>
                <p className={label}>{decidable ? 'Data-quality impact' : 'Data-quality impact of this change'}</p>
                {impact.fixes.length || impact.breaks.length ? (
                  <ul className="mt-100 space-y-100 text-300">
                    {impact.fixes.map((f) => <li key={f} className="text-success">✓ Clears {f}</li>)}
                    {impact.breaks.map((f) => <li key={f} className="text-destructive">✕ Introduces {f}</li>)}
                  </ul>
                ) : (
                  <p className="mt-100 text-300 text-muted-foreground">No change to business-rule results.</p>
                )}
              </div>
            ) : null}

            {e && !isNew ? (
              <div>
                <p className={label}>Equipment</p>
                <div className="mt-100 text-300">
                  <a href={href({ page: 'equipment', equipmentNumber: e.equipmentNumber })} className="hover:underline"><Tag>{e.equipmentNumber}</Tag></a>{' '}
                  <span className="font-medium">{e.description}</span>
                  <p className="font-monospace text-200 text-muted-foreground">P&amp;ID {e.pidTag ?? '—'} · S/N {e.serialNumber ?? '—'} · {e.manufacturer ?? '—'} {e.model ?? ''}</p>
                  <p className="text-200 text-muted-foreground">Last field verification: {e.lastVerifiedAt ? fmtDate(e.lastVerifiedAt, false) : 'never'}</p>
                </div>
              </div>
            ) : null}

            {others.length ? (
              <div>
                <p className={label}>Other requests on this unit</p>
                <ul className="mt-100 space-y-100 text-200">
                  {others.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center gap-200">
                      <span className="font-monospace">{o.requestCode}</span> {o.fieldName} → {o.newValue}
                      <Badge tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {/* Evidence, beside the proposal */}
          <div>
            <p className={label}>Evidence ({myEvidence.length})</p>
            <div className="mt-200">
              <EvidenceGallery items={myEvidence} large empty="No evidence attached — consider returning the request for a photo or document." />
            </div>
          </div>
        </div>

        {isNew ? (
          <div className="border-t border-border p-500">
            <p className={label}>Possible duplicates in Gold</p>
            {candidates.length ? (
              <div className="mt-200 overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-border">
                    <tr>
                      <Th>Existing record</Th>
                      <Th>Facility</Th>
                      <Th>P&amp;ID tag</Th>
                      <Th>Serial</Th>
                      <Th>Make / model</Th>
                      <Th>Why it matched</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((c) => (
                      <tr key={c.equipment.equipmentNumber} className="border-b border-border last:border-0">
                        <Td><a href={href({ page: 'equipment', equipmentNumber: c.equipment.equipmentNumber })}><Tag>{c.equipment.equipmentNumber}</Tag></a></Td>
                        <Td className={c.matched.has('facility') ? 'font-medium text-primary' : ''}>{c.equipment.facility}</Td>
                        <Td className={cn('font-monospace', c.matched.has('pidTag') && 'font-semibold text-primary')}>{c.equipment.pidTag ?? '—'}</Td>
                        <Td className={cn('font-monospace', c.matched.has('serialNumber') && 'font-semibold text-primary')}>{c.equipment.serialNumber ?? '—'}</Td>
                        <Td className={c.matched.has('model') ? 'font-medium text-primary' : ''}>{c.equipment.manufacturer} {c.equipment.model}</Td>
                        <Td>
                          <Badge tone={c.strength === 'strong' ? 'danger' : 'warning'}>{c.strength === 'strong' ? 'Likely duplicate' : 'Possible'}</Badge>
                          <p className="mt-100 text-200 text-muted-foreground">{c.reasons.join('; ')}</p>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-100 text-300 text-success">No existing record shares this serial, tag or make/model at the facility.</p>
            )}
          </div>
        ) : null}

        {r.status === 'SAP_FAILED' ? (
          <div className="border-t border-destructive/40 bg-destructive/5 p-500 text-300">
            <p className="font-medium text-destructive">SAP load failed (simulated): {r.sapMessage}</p>
            <p className="mt-100 text-muted-foreground">
              Handle it on the <a className="text-primary underline" href={href({ page: 'sap' })}>SAP sync</a> page — send it back to the requester with SAP’s reason.
            </p>
          </div>
        ) : null}

        {decidable ? (
          <div className="border-t border-border p-500">
            <label className="block text-300 font-medium">
              Comment to requester <span className="font-normal text-muted-foreground">(required to return or reject)</span>
              <textarea
                value={note}
                onChange={(ev) => setNote(ev.target.value)}
                rows={2}
                className="mt-100 w-full rounded-lg border border-input bg-card px-300 py-200 text-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder={isNew && strongDup ? 'e.g. this looks like the existing unit — please check the serial on site' : 'e.g. please attach the nameplate photo'}
              />
            </label>
            {isNew && strongDup ? <p className="mt-200 text-300 text-destructive">A likely duplicate exists — approve only if this is a different physical unit.</p> : null}
            {error ? <p role="alert" className="mt-200 text-300 text-destructive">{error}</p> : null}
            <div className="mt-400 flex flex-wrap gap-200">
              <Button onClick={() => void act('APPROVED')} disabled={!!busy}>
                <CheckCircle2 aria-hidden className="icon-size-200" /> {busy === 'APPROVED' ? 'Approving…' : 'Approve'}
              </Button>
              <Button variant="secondary" onClick={() => void act('RETURNED')} disabled={!!busy}>
                <CornerUpLeft aria-hidden className="icon-size-200" /> Return for correction
              </Button>
              <Button variant="danger" onClick={() => void act('REJECTED')} disabled={!!busy}>
                <XCircle aria-hidden className="icon-size-200" /> Reject
              </Button>
            </div>
          </div>
        ) : r.status === 'RETURNED' ? (
          <div className="border-t border-border p-500 text-300">
            Returned to {r.requestedBy}: “{r.decisionNote}”.{' '}
            <a className="text-primary underline" href={href({ page: 'requests', requestCode: r.requestCode })}>Open as requester →</a>
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="Request timeline" hint="Every step, who did it and when" />
        <div className="p-500">
          <RequestTimeline request={r} events={audit} />
        </div>
      </Card>
    </div>
  );
}

function RaciTable() {
  const { approvers } = useAtlas();
  const areas = [...new Set(approvers.map((a) => a.area))].sort();
  const groups = Object.keys(GROUP_LABELS) as (keyof typeof GROUP_LABELS)[];
  return (
    <Card className="mt-500">
      <CardHeader title="Who approves what" hint="Approver and delegate by attribute group and area, with SLA — no single point of failure" />
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-border">
            <tr>
              <Th>Attribute group</Th>
              {areas.map((a) => <Th key={a}>{a}</Th>)}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g} className="border-b border-border last:border-0">
                <Td className="font-medium">{GROUP_LABELS[g]}</Td>
                {areas.map((a) => {
                  const x = approvers.find((p) => p.attributeGroup === g && p.area === a);
                  return (
                    <Td key={a}>
                      {x ? (
                        <>
                          {x.approver}
                          <p className="text-200 text-muted-foreground">delegate {x.delegate ?? '—'} · {x.slaHours} h SLA</p>
                        </>
                      ) : '—'}
                    </Td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
