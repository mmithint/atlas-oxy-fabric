import type { ChangeRequestRecord } from '@rayfin-app/shared';
import { ArrowLeft, CornerUpLeft, Send } from 'lucide-react';
import { useEffect, useState } from 'react';

import { EvidenceGallery, PhotoButton, RequestTimeline } from '../components';
import { DataTable, FacetPanel, ListLayout, type Column, type FacetSection, type FacetTone } from '../listkit';
import { fieldDef, parseFieldValue } from '../fields';
import { addEvidencePhoto, linkEvidence, resubmitRequest } from '../repo';
import { href } from '../Shell';
import { useAtlas } from '../store';
import { Badge, Button, Card, CardHeader, Empty, fmtDate, PageTitle, STATUS_LABEL, STATUS_TONE, Tag } from '../ui';

const savedFacets = { status: 'returned', who: '', type: '' };
type FacetKey = keyof typeof savedFacets;

const STATUS_FACETS: { key: string; label: string; tone: FacetTone; match: (r: ChangeRequestRecord) => boolean }[] = [
  { key: 'returned', label: 'Needs my correction', tone: 'warning', match: (r) => r.status === 'RETURNED' },
  { key: 'pending', label: 'Waiting for review', tone: 'neutral', match: (r) => r.status === 'PENDING' },
  { key: 'sap', label: 'On the way to SAP', tone: 'primary', match: (r) => r.status === 'APPROVED' || r.status === 'SENT_TO_SAP' || r.status === 'SAP_LOADED' },
  { key: 'failed', label: 'SAP load failed', tone: 'danger', match: (r) => r.status === 'SAP_FAILED' },
  { key: 'done', label: 'Confirmed', tone: 'success', match: (r) => r.status === 'SYNCED' },
  { key: 'rejected', label: 'Rejected', tone: 'neutral', match: (r) => r.status === 'REJECTED' },
];

/** The requester's side: fix what a reviewer (or SAP) sent back, then resubmit. */
export function Requests({ requestCode }: { requestCode?: string }) {
  const { requests } = useAtlas();
  if (requestCode) {
    const selected = requests.find((r) => r.requestCode === requestCode);
    return (
      <>
        <PageTitle eyebrow="Requester view" title={selected ? `${selected.requestCode}` : 'My requests'}>
          <a href={href({ page: 'requests' })} className="inline-flex items-center gap-100 text-300 font-medium text-primary hover:underline">
            <ArrowLeft aria-hidden className="icon-size-200" /> All my requests
          </a>
        </PageTitle>
        {selected ? <RequesterView key={`${selected.id}-${selected.status}-${selected.revision}`} r={selected} /> : <Card><Empty>Request {requestCode} wasn’t found.</Empty></Card>}
      </>
    );
  }
  return <RequestsList />;
}

function RequestsList() {
  const { requests, actor } = useAtlas();
  const [f, setF] = useState<Record<FacetKey, string>>({ ...savedFacets });
  useEffect(() => {
    Object.assign(savedFacets, f);
  }, [f]);
  const match: Record<FacetKey, (r: ChangeRequestRecord, v: string) => boolean> = {
    status: (r, v) => !!STATUS_FACETS.find((x) => x.key === v)?.match(r),
    who: (r, v) => (v === 'me' ? r.requestedBy === actor : r.requestedBy !== actor),
    type: (r, v) => (r.requestType === 'NEW_RECORD' ? 'new' : 'change') === v,
  };
  const except = (skip?: FacetKey) => requests.filter((r) => (Object.keys(f) as FacetKey[]).every((k) => k === skip || !f[k] || match[k](r, f[k])));
  const count = (k: FacetKey, v: string) => except(k).filter((r) => match[k](r, v)).length;
  const set = (k: FacetKey) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const rows = except().sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());

  const sections: FacetSection[] = [
    { title: 'Status', value: f.status, onChange: set('status'), items: STATUS_FACETS.map((x) => ({ key: x.key, label: x.label, tone: x.tone, count: count('status', x.key) })) },
    {
      title: 'Submitted by',
      value: f.who,
      onChange: set('who'),
      items: [
        { key: 'me', label: 'Me', count: count('who', 'me') },
        { key: 'others', label: 'Others (demo: you act for them)', count: count('who', 'others') },
      ],
    },
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
    { key: 'code', header: 'Request', filterText: (r) => r.requestCode, cell: (r) => <a href={href({ page: 'requests', requestCode: r.requestCode })} className="whitespace-nowrap font-monospace text-primary hover:underline">{r.requestCode}</a> },
    { key: 'eq', header: 'Equipment', className: 'whitespace-nowrap', filterText: (r) => `${r.equipmentNumber} ${r.facility}`, cell: (r) => <><Tag>{r.equipmentNumber}</Tag><p className="mt-100 text-200 text-muted-foreground">{r.facility}</p></> },
    { key: 'change', header: 'Change', className: 'min-w-[240px]', filterText: changeText, cell: (r) => <span className="font-monospace text-200">{changeText(r)}</span> },
    { key: 'note', header: 'Reviewer comment', filterText: (r) => r.decisionNote ?? '', cell: (r) => <span className="text-200">{r.decisionNote ?? '—'}</span> },
    { key: 'by', header: 'Submitted by', filterText: (r) => r.requestedBy, cell: (r) => <span className="text-200">{r.requestedBy}<br /><span className="text-muted-foreground">{fmtDate(r.submittedAt)}</span></span> },
    { key: 'rev', header: 'Rev', cell: (r) => <span className="font-monospace">{r.revision ?? 1}</span> },
    { key: 'status', header: 'Status', filterText: (r) => STATUS_LABEL[r.status], cell: (r) => <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge> },
  ];

  return (
    <>
      <PageTitle eyebrow="Requester view" title="My requests" />
      <ListLayout panel={<FacetPanel title="Insights" sections={sections} onClearAll={() => setF({ status: '', who: '', type: '' })} />}>
        <DataTable
          id="requests"
          rows={rows}
          columns={columns}
          rowKey={(r) => r.id}
          rowHref={(r) => href({ page: 'requests', requestCode: r.requestCode })}
          empty="Nothing here for these filters."
          toolbar={<span className="text-200 text-muted-foreground">For the demo you act as the requester for any request. In production this list shows only your own.</span>}
        />
      </ListLayout>
    </>
  );
}

function RequesterView({ r }: { r: ChangeRequestRecord }) {
  const { evidence, audit, actor, refreshApp } = useAtlas();
  const def = fieldDef(r.fieldName);
  const [value, setValue] = useState(r.newValue);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<{ dataUrl: string; name: string } | undefined>();
  const unitEvidence = evidence.filter((x) => x.equipmentNumber === r.equipmentNumber && x.requestCode !== r.requestCode);
  const [attach, setAttach] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const myEvidence = evidence.filter((x) => x.requestCode === r.requestCode);
  const returned = r.status === 'RETURNED';

  const resubmit = async () => {
    let newValue = value.trim();
    if (def) {
      const parsed = parseFieldValue(def, newValue);
      if (!parsed.ok) return setError(parsed.error);
      newValue = String(parsed.value);
    }
    if (note.trim().length < 3) return setError('Say what you changed so the reviewer can see it.');
    setBusy(true);
    setError(null);
    try {
      for (const ev of unitEvidence.filter((x) => attach.has(x.id))) await linkEvidence(ev, r.requestCode, actor);
      if (photo) await addEvidencePhoto({ dataUrl: photo.dataUrl, title: photo.name || 'Field photo', equipmentNumber: r.equipmentNumber, requestCode: r.requestCode, actor });
      await resubmitRequest(r, newValue, note.trim(), actor);
      await refreshApp();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-600">
      <Card>
        <CardHeader
          title={`${r.requestCode} · ${r.requestType === 'NEW_RECORD' ? 'New equipment' : def?.label ?? r.fieldName}`}
          hint={`${r.facility} · submitted ${fmtDate(r.submittedAt)} · revision ${r.revision ?? 1}`}
          action={<Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>}
        />
        <div className="grid grid-cols-1 gap-500 p-500 lg:grid-cols-2">
          <div className="space-y-400">
            <div className="text-300">
              <a href={href({ page: 'equipment', equipmentNumber: r.equipmentNumber })}><Tag>{r.equipmentNumber}</Tag></a>{' '}
              <span className="font-monospace">{r.fieldName}: {r.oldValue ?? 'blank'} → {r.newValue}</span>
            </div>
            {returned ? (
              <div className="rounded-lg border border-warning/50 bg-warning/10 p-400">
                <p className="flex items-center gap-200 text-300 font-semibold text-warning">
                  <CornerUpLeft aria-hidden className="icon-size-200" /> Returned by {r.decidedBy}
                </p>
                <p className="mt-100 text-300">“{r.decisionNote}”</p>
              </div>
            ) : (
              <p className="text-300 text-muted-foreground">{r.decisionNote ? `Reviewer: “${r.decisionNote}”` : 'Nothing to do — waiting on others.'}</p>
            )}
            <div>
              <p className="text-200 font-semibold uppercase tracking-wider text-muted-foreground">Evidence on this request</p>
              <div className="mt-200"><EvidenceGallery items={myEvidence} empty="None yet." /></div>
            </div>
          </div>

          {returned ? (
            <div className="space-y-400">
              <p className="font-heading text-500 font-semibold">Correct and resubmit</p>
              {def ? (
                <label className="block text-300 font-medium">
                  Value{def.unit ? ` (${def.unit})` : ''}
                  <input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="mt-100 min-h-[44px] w-full rounded-lg border border-input bg-card px-300 font-monospace text-[length:var(--text-400)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
              ) : null}
              <label className="block text-300 font-medium">
                What you changed
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. attached the engine nameplate photo"
                  className="mt-100 w-full rounded-lg border border-input bg-card px-300 py-200 text-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              {unitEvidence.length ? (
                <fieldset>
                  <legend className="text-300 font-medium">Attach existing evidence for this unit</legend>
                  {unitEvidence.map((x) => (
                    <label key={x.id} className="mt-100 flex min-h-[36px] items-center gap-200 text-300">
                      <input
                        type="checkbox"
                        className="h-[18px] w-[18px] accent-primary"
                        checked={attach.has(x.id)}
                        onChange={(e) => {
                          const s = new Set(attach);
                          if (e.target.checked) s.add(x.id);
                          else s.delete(x.id);
                          setAttach(s);
                        }}
                      />
                      {x.title} <span className="text-200 text-muted-foreground">· {x.caption}</span>
                    </label>
                  ))}
                </fieldset>
              ) : null}
              <div className="flex flex-wrap items-center gap-300">
                <PhotoButton onPhoto={(dataUrl, name) => setPhoto({ dataUrl, name })} disabled={busy} />
                {photo ? <img src={photo.dataUrl} alt="New photo" className="h-[56px] rounded-md border border-border" /> : null}
              </div>
              {error ? <p role="alert" className="text-300 text-destructive">{error}</p> : null}
              <Button onClick={() => void resubmit()} disabled={busy}>
                <Send aria-hidden className="icon-size-200" /> {busy ? 'Resubmitting…' : 'Resubmit for review'}
              </Button>
            </div>
          ) : null}
        </div>
      </Card>
      <Card>
        <CardHeader title="Request timeline" />
        <div className="p-500"><RequestTimeline request={r} events={audit} /></div>
      </Card>
    </div>
  );
}
