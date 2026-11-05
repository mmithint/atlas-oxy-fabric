import type { ChangeRequestRecord, EvidenceRecord } from '@rayfin-app/shared';
import { ArrowLeft, Search, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { EvidenceGallery, PhotoButton, ValueTrail } from '../components';
import { DataTable, FacetPanel, ListLayout, type Column, type FacetSection } from '../listkit';
import { fieldDef, fieldsFor, formatValue, GROUP_LABELS, parseFieldValue, type FieldDef } from '../fields';
import { addEvidencePhoto, linkEvidence, submitRequest } from '../repo';
import { href } from '../Shell';
import { useAtlas } from '../store';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Empty,
  fmtDate,
  PageTitle,
  SEVERITY_TONE,
  SOURCE_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  Tag,
} from '../ui';

const VERIFY: Record<string, { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  VERIFIED: { label: 'Verified', tone: 'success' },
  CORRECTION_REQUIRED: { label: 'Correction required', tone: 'warning' },
  NOT_VERIFIED: { label: 'Not verified', tone: 'neutral' },
};

/** List filters survive opening a record and coming back (in-memory UI state only). */
const savedFilters = { q: '', status: '', cls: '', area: '', facility: '', verify: '' };
type FacetKey = 'status' | 'cls' | 'area' | 'facility' | 'verify';

export function EquipmentPage({ equipmentNumber, q }: { equipmentNumber?: string; q?: string }) {
  return equipmentNumber ? <EquipmentDetail equipmentNumber={equipmentNumber} /> : <EquipmentList key={q ?? ''} initialQ={q} />;
}

function EquipmentList({ initialQ }: { initialQ?: string }) {
  const { equipment, aliases, liveViolations } = useAtlas();
  const [q, setQ] = useState(initialQ ?? savedFilters.q);
  const [f, setF] = useState<Record<FacetKey, string>>(() =>
    initialQ ? { status: '', cls: '', area: '', facility: '', verify: '' } : { status: savedFilters.status, cls: savedFilters.cls, area: savedFilters.area, facility: savedFilters.facility, verify: savedFilters.verify }
  );

  useEffect(() => {
    Object.assign(savedFilters, { q, ...f });
  }, [q, f]);

  const issueCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of liveViolations) m.set(v.equipmentNumber, (m.get(v.equipmentNumber) ?? 0) + 1);
    return m;
  }, [liveViolations]);
  const aliasIndex = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of aliases) m.set(a.equipmentNumber, `${m.get(a.equipmentNumber) ?? ''} ${a.aliasValue}`.toLowerCase());
    return m;
  }, [aliases]);

  type Eq = (typeof equipment)[number];
  const statusesOf = (e: Eq): string[] => {
    const out = [issueCount.get(e.equipmentNumber) ? 'issues' : 'clean'];
    if (Object.values(e.pendingFields).some((p) => !p.confirmed)) out.push('approved');
    if (e.newRecordRequest) out.push('new');
    return out;
  };
  const facetMatch: Record<FacetKey, (e: Eq, v: string) => boolean> = {
    status: (e, v) => statusesOf(e).includes(v),
    cls: (e, v) => e.equipmentClass === v,
    area: (e, v) => e.area === v,
    facility: (e, v) => e.facility === v,
    verify: (e, v) => e.verificationStatus === v,
  };
  const needle = q.trim().toLowerCase();
  const searched = equipment.filter((e) => {
    if (!needle) return true;
    const hay = [e.equipmentNumber, e.atlasId, e.description, e.serialNumber, e.pidTag, e.floc, aliasIndex.get(e.equipmentNumber)].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(needle);
  });
  /** Rows matching every facet except `skip` — so each section's counts reflect the other choices. */
  const except = (skip?: FacetKey) => searched.filter((e) => (Object.keys(f) as FacetKey[]).every((k) => k === skip || !f[k] || facetMatch[k](e, f[k])));
  const rows = except();
  const count = (k: FacetKey, v: string) => except(k).filter((e) => facetMatch[k](e, v)).length;
  const uniq = (xs: string[]) => [...new Set(xs)].sort();
  const set = (k: FacetKey) => (v: string) => setF((p) => ({ ...p, [k]: v, ...(k === 'area' ? { facility: '' } : {}) }));

  const sections: FacetSection[] = [
    {
      title: 'Record status',
      value: f.status,
      onChange: set('status'),
      items: [
        { key: 'issues', label: 'Breaks a rule', tone: 'danger' as const },
        { key: 'clean', label: 'Clean', tone: 'success' as const },
        { key: 'approved', label: 'Approved, not in SAP yet', tone: 'primary' as const },
        { key: 'new', label: 'New equipment', tone: 'info' as const },
      ].map((x) => ({ ...x, count: count('status', x.key) })),
    },
    {
      title: 'Equipment type',
      value: f.cls,
      onChange: set('cls'),
      items: [
        { key: 'COMPRESSOR', label: 'Compressors' },
        { key: 'HEATER', label: 'Heaters' },
      ].map((x) => ({ ...x, count: count('cls', x.key) })),
    },
    {
      title: 'Field verification',
      value: f.verify,
      onChange: set('verify'),
      items: Object.entries(VERIFY).map(([k, v]) => ({ key: k, label: v.label, tone: v.tone === 'neutral' ? undefined : v.tone === 'success' ? ('success' as const) : ('warning' as const), count: count('verify', k) })),
    },
    { title: 'Area', value: f.area, onChange: set('area'), items: uniq(equipment.map((e) => e.area)).map((a) => ({ key: a, label: a, count: count('area', a) })) },
    {
      title: 'Facility',
      value: f.facility,
      onChange: set('facility'),
      items: uniq(equipment.filter((e) => !f.area || e.area === f.area).map((e) => e.facility)).map((x) => ({ key: x, label: x, count: count('facility', x) })),
    },
  ];

  const columns: Column<Eq>[] = [
    {
      key: 'no',
      header: 'Equipment no.',
      filterText: (e) => e.equipmentNumber,
      cell: (e) => (
        <a href={href({ page: 'equipment', equipmentNumber: e.equipmentNumber })} className="hover:underline">
          <Tag>{e.equipmentNumber}</Tag>
        </a>
      ),
    },
    {
      key: 'desc',
      header: 'Description',
      className: 'min-w-[240px]',
      filterText: (e) => `${e.description} ${e.equipmentSubtype ?? ''}`,
      cell: (e) => (
        <>
          <span className="font-medium">{e.description}</span>
          <p className="text-200 text-muted-foreground">{e.equipmentSubtype}</p>
        </>
      ),
    },
    { key: 'fac', header: 'Facility / FLOC', className: 'whitespace-nowrap', filterText: (e) => `${e.facility} ${e.floc ?? ''}`, cell: (e) => <>{e.facility}<p className="font-monospace text-200 text-muted-foreground">{e.floc}</p></> },
    { key: 'tag', header: 'P&ID tag', className: 'whitespace-nowrap', filterText: (e) => e.pidTag ?? '', cell: (e) => <span className="font-monospace">{e.pidTag ?? <span className="text-destructive">missing</span>}</span> },
    { key: 'serial', header: 'Serial', className: 'whitespace-nowrap', filterText: (e) => e.serialNumber ?? '', cell: (e) => <span className="font-monospace">{e.serialNumber ?? '—'}</span> },
    { key: 'verify', header: 'Verification', filterText: (e) => VERIFY[e.verificationStatus].label, cell: (e) => <Badge tone={VERIFY[e.verificationStatus].tone}>{VERIFY[e.verificationStatus].label}</Badge> },
    {
      key: 'status',
      header: 'Status',
      cell: (e) => {
        const n = issueCount.get(e.equipmentNumber) ?? 0;
        const pending = Object.values(e.pendingFields).filter((p) => !p.confirmed).length;
        return (
          <div className="flex flex-wrap gap-100">
            {e.newRecordRequest ? <Badge tone="primary">New · not in SAP yet</Badge> : null}
            {n ? <Badge tone="danger">{n} rule{n > 1 ? 's' : ''}</Badge> : <Badge tone="success">Clean</Badge>}
            {pending ? <Badge tone="primary">{pending} approved, not in SAP</Badge> : null}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageTitle eyebrow="Gold equipment master + approved changes" title="Equipment">
        <a href={href({ page: 'new' })} className="text-300 font-medium text-primary hover:underline">
          + Request new equipment
        </a>
      </PageTitle>
      <ListLayout panel={<FacetPanel title="Insights" sections={sections} onClearAll={() => setF({ status: '', cls: '', area: '', facility: '', verify: '' })} />}>
        <DataTable
          id="equipment"
          rows={rows}
          columns={columns}
          rowKey={(e) => e.equipmentNumber}
          rowHref={(e) => href({ page: 'equipment', equipmentNumber: e.equipmentNumber })}
          empty="No equipment matches these filters."
          toolbar={
            <label className="relative min-w-[220px] max-w-[440px] flex-1">
              <span className="sr-only">Search</span>
              <Search aria-hidden className="pointer-events-none absolute left-300 top-1/2 icon-size-200 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search number, serial, tag or any name"
                className="h-[36px] w-full rounded-lg border border-input bg-card py-100 pl-[34px] pr-300 text-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          }
        />
      </ListLayout>
    </>
  );
}

function EquipmentDetail({ equipmentNumber }: { equipmentNumber: string }) {
  const { equipment, aliases, liveViolations, requests, approvers, evidence, actor, refreshApp } = useAtlas();
  const e = equipment.find((x) => x.equipmentNumber === equipmentNumber);
  const [editing, setEditing] = useState<FieldDef | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  if (!e) {
    return (
      <Card>
        <Empty>
          Equipment {equipmentNumber} isn’t in the Gold layer. <a className="text-primary hover:underline" href={href({ page: 'equipment' })}>Back to equipment</a>
        </Empty>
      </Card>
    );
  }

  const myAliases = aliases.filter((a) => a.equipmentNumber === e.equipmentNumber);
  const myViolations = liveViolations.filter((v) => v.equipmentNumber === e.equipmentNumber);
  const myRequests = requests.filter((r) => r.equipmentNumber === e.equipmentNumber);
  const myEvidence = dedupe(evidence.filter((x) => x.equipmentNumber === e.equipmentNumber));
  const waitingHere = myRequests.filter((r) => r.status === 'PENDING');
  const openByField = new Map(myRequests.filter((r) => r.status === 'PENDING' || r.status === 'RETURNED').map((r) => [r.fieldName, r]));
  const rec = e as unknown as Record<string, unknown>;
  const groups = Object.entries(GROUP_LABELS)
    .map(([g, label]) => ({ g, label, fields: fieldsFor(e.equipmentClass).filter((f) => f.group === g) }))
    .filter((x) => x.fields.length);

  return (
    <>
      <a href={href({ page: 'equipment' })} className="mb-400 inline-flex min-h-[40px] items-center gap-200 text-300 text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="icon-size-200" /> All equipment
      </a>
      <PageTitle eyebrow={`${e.equipmentClass} · ${e.equipmentSubtype ?? ''} · ${e.facility}`} title={e.description}>
        <div className="flex flex-wrap items-center gap-200">
          <Tag>{e.newRecordRequest ? 'ATLAS' : 'SAP'} {e.equipmentNumber}</Tag>
          {e.pidTag ? <Tag tone="muted">P&amp;ID {e.pidTag}</Tag> : null}
          <Badge tone={VERIFY[e.verificationStatus].tone}>{VERIFY[e.verificationStatus].label}{e.lastVerifiedAt ? ` · ${fmtDate(e.lastVerifiedAt, false)}` : ''}</Badge>
          {e.newRecordRequest ? <Badge tone="primary">New equipment · {e.newRecordRequest} · not in SAP yet</Badge> : null}
        </div>
      </PageTitle>

      <div className="grid grid-cols-1 gap-600 xl:grid-cols-3">
        <div className="flex flex-col gap-600 xl:col-span-2">
          {myViolations.length ? (
            <Card className="border-destructive/40">
              <CardHeader title="Business-rule issues" hint="Fix one by requesting a change on the attribute below" />
              <ul className="divide-y divide-border">
                {myViolations.map((v, i) => (
                  <li key={i} className="flex items-start gap-300 px-500 py-300 text-300">
                    <TriangleAlert aria-hidden className="mt-100 icon-size-200 shrink-0 text-destructive" />
                    <span className="flex-1">{v.violation}</span>
                    <Badge tone={SEVERITY_TONE[v.severity]}>{v.ruleCode}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {waitingHere.length ? (
            <div role="note" className="flex flex-wrap items-center justify-between gap-300 rounded-lg border border-warning/50 bg-warning/10 px-400 py-300 text-300">
              <span>
                <strong>{waitingHere.length} change{waitingHere.length === 1 ? ' is' : 's are'} already waiting for review on this unit.</strong>{' '}
                <span className="text-muted-foreground">Check them before raising a new one.</span>
              </span>
              <a href={waitingHere.length > 1 ? href({ page: 'approvals', unit: e.equipmentNumber }) : href({ page: 'approvals', requestCode: waitingHere[0].requestCode })} className="font-medium text-primary hover:underline">
                {waitingHere.length > 1 ? `Review all ${waitingHere.length}` : `Open ${waitingHere[0].requestCode}`} →
              </a>
            </div>
          ) : null}

          {groups.map(({ g, label, fields }) => (
            <Card key={g}>
              <CardHeader title={label} />
              <ul className="divide-y divide-border">
                {fields.map((f) => {
                  const open = openByField.get(f.key);
                  return (
                    <li key={f.key} className="flex flex-wrap items-start gap-400 px-500 py-400">
                      <div className="w-full sm:w-[180px]">
                        <p className="font-medium">{f.label}</p>
                        {!f.sap ? <Badge>ATLAS only</Badge> : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <ValueTrail def={f} value={formatValue(rec[f.key])} provenance={e.pendingFields[f.key]} />
                        {open ? (
                          <p className="mt-200 text-200 text-warning">
                            <a className="font-monospace underline" href={href({ page: open.status === 'RETURNED' ? 'requests' : 'approvals', requestCode: open.requestCode })}>{open.requestCode}</a>{' '}
                            {open.status === 'RETURNED' ? 'returned for correction' : 'awaiting review'}: → {open.newValue}
                          </p>
                        ) : null}
                      </div>
                      <Button variant="secondary" onClick={() => setEditing(f)} disabled={!!open || !!e.newRecordRequest}>
                        Request change
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>

        <div className="flex flex-col gap-600">
          <Card>
            <CardHeader
              title="Evidence"
              hint="Photos and documents for this unit"
              action={
                <PhotoButton
                  label="Add photo"
                  disabled={photoBusy}
                  onPhoto={async (dataUrl, name) => {
                    setPhotoBusy(true);
                    try {
                      await addEvidencePhoto({ dataUrl, title: name || 'Field photo', equipmentNumber: e.equipmentNumber, actor });
                      await refreshApp();
                    } finally {
                      setPhotoBusy(false);
                    }
                  }}
                />
              }
            />
            <div className="p-400">
              <EvidenceGallery items={myEvidence} empty="No photos or documents yet." />
            </div>
          </Card>

          <Card>
            <CardHeader title="Identity cross-reference" hint="One unit, every name it goes by" />
            <ul className="divide-y divide-border">
              {myAliases.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-300 px-500 py-300 text-300">
                  <span className="text-200 font-semibold uppercase tracking-wider text-muted-foreground">{a.system.replace('_', ' ')}</span>
                  <span className="font-monospace">{a.aliasValue}</span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-300 px-500 py-300 text-300">
                <span className="text-200 font-semibold uppercase tracking-wider text-muted-foreground">FLOC</span>
                <span className="font-monospace">{e.floc}</span>
              </li>
            </ul>
            <p className="border-t border-border px-500 py-300 text-200 text-muted-foreground">Sources: {e.sourceSystems.replace(/;/g, ' · ')}</p>
          </Card>

          <Card>
            <CardHeader title="Change history" />
            {myRequests.length ? (
              <ul className="divide-y divide-border">
                {myRequests.map((r) => (
                  <li key={r.id} className="px-500 py-300 text-300">
                    <div className="flex flex-wrap items-center justify-between gap-200">
                      <a className="font-monospace text-primary hover:underline" href={href({ page: r.status === 'RETURNED' ? 'requests' : 'approvals', requestCode: r.requestCode })}>{r.requestCode}</a>
                      <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                    </div>
                    <p className="mt-100 font-monospace text-200">{r.fieldName}: {r.oldValue ?? '∅'} → {r.newValue}</p>
                    <p className="text-200 text-muted-foreground">{SOURCE_LABEL[r.source]} · {r.requestedBy} · {fmtDate(r.submittedAt)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No change requests yet.</Empty>
            )}
          </Card>
        </div>
      </div>

      {editing ? (
        <RequestChangeDialog
          field={editing}
          currentValue={formatValue(rec[editing.key])}
          unitEvidence={myEvidence}
          waitingOnUnit={waitingHere}
          onClose={() => setEditing(null)}
          onSubmit={async (value, reason, attach, photo) => {
            const created = await submitRequest({
              equipment: e,
              fieldName: editing.key,
              oldValue: formatValue(rec[editing.key]) || undefined,
              newValue: String(value),
              reason,
              source: 'ATLAS',
              requestedBy: actor,
              existing: requests,
              approvers,
            });
            for (const ev of attach) await linkEvidence(ev, created.requestCode, actor);
            if (photo) await addEvidencePhoto({ dataUrl: photo.dataUrl, title: photo.name || 'Field photo', equipmentNumber: e.equipmentNumber, requestCode: created.requestCode, actor });
            await refreshApp();
            setEditing(null);
          }}
        />
      ) : null}
    </>
  );
}

/** Same file linked to several requests shows once on the equipment. */
function dedupe(items: EvidenceRecord[]): EvidenceRecord[] {
  const seen = new Set<string>();
  return items.filter((x) => {
    const k = x.url ?? x.id;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function RequestChangeDialog({
  field,
  currentValue,
  unitEvidence,
  waitingOnUnit,
  onClose,
  onSubmit,
}: {
  field: FieldDef;
  currentValue: string;
  unitEvidence: EvidenceRecord[];
  waitingOnUnit: ChangeRequestRecord[];
  onClose: () => void;
  onSubmit: (value: string | number, reason: string, attach: EvidenceRecord[], photo?: { dataUrl: string; name: string }) => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [attach, setAttach] = useState<Set<string>>(new Set(unitEvidence.map((x) => x.id)));
  const [photo, setPhoto] = useState<{ dataUrl: string; name: string } | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const parsed = parseFieldValue(field, value);
    if (!parsed.ok) return setError(parsed.error);
    if (String(parsed.value) === currentValue) return setError('That is already the current value.');
    if (reason.trim().length < 5) return setError('Add a short reason so the approver can decide.');
    setBusy(true);
    setError(null);
    try {
      await onSubmit(parsed.value, reason.trim().slice(0, 500), unitEvidence.filter((x) => attach.has(x.id)), photo);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const input = 'min-h-[44px] w-full rounded-lg border border-input bg-card px-300 py-200 text-[length:var(--text-400)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="req-title" className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-foreground/40 p-400" onKeyDown={(ev) => ev.key === 'Escape' && onClose()}>
      <div className="w-full max-w-[560px] rounded-xl border border-border bg-card p-600 shadow-lg">
        <h2 id="req-title" className="font-heading text-600 font-semibold">Propose change · {field.label}</h2>
        <p className="mt-100 text-300 text-muted-foreground">
          Current value: <span className="font-monospace">{currentValue || 'blank'}</span>
          {field.sap ? '' : ' · ATLAS-only attribute (not sent to SAP)'}
        </p>
        {waitingOnUnit.length ? (
          <div className="mt-300 rounded-lg border border-warning/50 bg-warning/10 px-300 py-200 text-200">
            <p className="font-semibold text-warning">Already waiting for review on this unit</p>
            <ul className="mt-100 space-y-100">
              {waitingOnUnit.map((w) => (
                <li key={w.id}>
                  <span className="font-monospace">{w.requestCode}</span> · {fieldDef(w.fieldName)?.label ?? w.fieldName} → {w.newValue} <span className="text-muted-foreground">· {w.requestedBy}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <label className="mt-500 block text-300 font-medium">
          New value{field.unit ? ` (${field.unit})` : ''}
          {field.kind === 'enum' ? (
            <select className={`${input} mt-100`} value={value} onChange={(e) => setValue(e.target.value)}>
              <option value="">Choose…</option>
              {field.options?.map((o) => <option key={o}>{o}</option>)}
            </select>
          ) : (
            <input autoFocus inputMode={field.kind === 'text' ? 'text' : 'decimal'} className={`${input} mt-100 font-monospace`} value={value} onChange={(e) => setValue(e.target.value)} />
          )}
        </label>
        <label className="mt-400 block text-300 font-medium">
          Reason
          <textarea className={`${input} mt-100`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. heat duty read from the nameplate on site" />
        </label>
        <fieldset className="mt-400">
          <legend className="text-300 font-medium">Evidence for the approver</legend>
          {unitEvidence.length ? (
            <ul className="mt-200 space-y-100">
              {unitEvidence.map((x) => (
                <li key={x.id}>
                  <label className="flex min-h-[36px] items-center gap-200 text-300">
                    <input
                      type="checkbox"
                      className="h-[18px] w-[18px] accent-primary"
                      checked={attach.has(x.id)}
                      onChange={(ev) => {
                        const s = new Set(attach);
                        if (ev.target.checked) s.add(x.id);
                        else s.delete(x.id);
                        setAttach(s);
                      }}
                    />
                    {x.title} <span className="text-200 text-muted-foreground">· {x.caption}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-200 flex flex-wrap items-center gap-300">
            <PhotoButton onPhoto={(dataUrl, name) => setPhoto({ dataUrl, name })} disabled={busy} />
            {photo ? <img src={photo.dataUrl} alt="New photo" className="h-[56px] rounded-md border border-border" /> : null}
          </div>
        </fieldset>
        {error ? <p role="alert" className="mt-300 text-300 text-destructive">{error}</p> : null}
        <div className="mt-600 flex justify-end gap-200">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={busy}>{busy ? 'Submitting…' : 'Submit for approval'}</Button>
        </div>
      </div>
    </div>
  );
}
