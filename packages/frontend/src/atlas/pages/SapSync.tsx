import type { ChangeRequestRecord } from '@rayfin-app/shared';
import { CornerUpLeft, Download, RefreshCcw, Truck } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

import { buildEvolveFiles, newBatchId, toCsv, type EvolveFile } from '../evolve';
import { fieldDef, formatValue } from '../fields';
import { markSentToSap, markSynced, returnSapFailure, simulateSapLoad } from '../repo';
import { href } from '../Shell';
import { useAtlas } from '../store';
import { Badge, Button, Card, CardHeader, Empty, fmtDate, PageTitle, Simulated, Tag, Td, Th } from '../ui';

function download(file: EvolveFile) {
  const blob = new Blob([toCsv(file)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const sapBound = (r: ChangeRequestRecord) => r.requestType === 'NEW_RECORD' || !!fieldDef(r.fieldName)?.sap;
const changeText = (r: ChangeRequestRecord) => (r.requestType === 'NEW_RECORD' ? `create: ${r.newValue}` : `${r.fieldName}: ${r.oldValue ?? '∅'} → ${r.newValue}`);

export function SapSync() {
  const { requests, goldEquipment, actor, refreshApp } = useAtlas();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFiles, setLastFiles] = useState<EvolveFile[]>([]);

  const ready = requests.filter((r) => r.status === 'APPROVED' && sapBound(r));
  const inFile = requests.filter((r) => r.status === 'SENT_TO_SAP');
  const failed = requests.filter((r) => r.status === 'SAP_FAILED');
  const loaded = requests.filter((r) => r.status === 'SAP_LOADED');
  const confirmed = requests.filter((r) => r.status === 'SYNCED' && sapBound(r)).slice(0, 8);
  const previewBatch = useMemo(() => newBatchId(), []);
  const preview = useMemo(() => buildEvolveFiles(ready, previewBatch), [ready, previewBatch]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await refreshApp();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const goldValue = (r: ChangeRequestRecord) => {
    const e = goldEquipment.find((x) => x.equipmentNumber === r.equipmentNumber);
    return e ? formatValue((e as unknown as Record<string, unknown>)[r.fieldName]) : '';
  };

  return (
    <>
      <PageTitle eyebrow="Approved → SAP upload file → SAP load → confirmation" title="SAP sync" />
      <Card className="mb-600">
        <ol className="grid grid-cols-1 divide-y divide-border md:grid-cols-4 md:divide-x md:divide-y-0">
          {(
            [
              ['1', 'SAP upload file', 'Approved changes in the Evolve template layout', null],
              ['2', 'SAP team loads', 'Human in the loop; some rows can fail', <Simulated key="s" />],
              ['3', 'Failures go back', 'With SAP’s reason, to the requester', null],
              ['4', 'Refresh confirms', 'Nightly SAP view matches → request closes', <Simulated key="s" />],
            ] as [string, string, string, ReactNode][]
          ).map(([n, t, s, tag]) => (
            <li key={n} className="flex gap-300 p-500">
              <span className="grid h-[28px] w-[28px] shrink-0 place-items-center rounded-full bg-primary/15 font-heading text-400 font-semibold text-primary">{n}</span>
              <div>
                <p className="flex flex-wrap items-center gap-200 font-medium">{t} {tag}</p>
                <p className="text-200 text-muted-foreground">{s}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="border-t border-border px-500 py-300 text-200 text-muted-foreground">
          There is no SAP connection in this POV. The file is real; the SAP load and the refresh are simulated and labelled so. No timing target is measured here.
        </p>
      </Card>
      {error ? <p role="alert" className="mb-400 text-300 text-destructive">{error}</p> : null}

      <Card>
        <CardHeader
          title={`1 · Ready for the SAP upload file (${ready.length})`}
          hint="Only SAP-held attributes and new equipment. ATLAS-only attributes close on approval."
          action={
            <Button
              onClick={() =>
                void run('gen', async () => {
                  const batch = newBatchId();
                  const { files, included } = buildEvolveFiles(ready, batch);
                  files.forEach(download);
                  setLastFiles(files);
                  await markSentToSap(included, batch, actor);
                })
              }
              disabled={!ready.length || !!busy}
            >
              <Download aria-hidden className="icon-size-200" /> {busy === 'gen' ? 'Generating…' : 'Generate SAP upload file'}
            </Button>
          }
        />
        {preview.files.length ? preview.files.map((f) => <FilePreview key={f.name} file={f} />) : <Empty>Nothing approved is waiting. Approve a request to see it here.</Empty>}
        {lastFiles.length ? (
          <p className="border-t border-border px-500 py-300 text-200 text-muted-foreground">
            Downloaded {lastFiles.map((f) => f.name).join(', ')}. Column layout is a placeholder until the SAP team’s Evolve templates are confirmed.
          </p>
        ) : null}
      </Card>

      <div className="mt-600 grid grid-cols-1 gap-600 xl:grid-cols-2">
        <Card>
          <CardHeader
            title={`2 · In the upload file, waiting for SAP (${inFile.length})`}
            action={
              <Button variant="secondary" onClick={() => void run('load', () => simulateSapLoad(inFile, goldEquipment, actor))} disabled={!inFile.length || !!busy}>
                <Truck aria-hidden className="icon-size-200" /> {busy === 'load' ? 'Loading…' : 'Simulate SAP team load'}
              </Button>
            }
          />
          {inFile.length ? <ReqTable rows={inFile.map((r) => ({ r, extra: `${r.evolveBatch ?? ''} · ${fmtDate(r.sentToSapAt)}` }))} /> : <Empty>No file waiting for SAP.</Empty>}
        </Card>

        <Card className={failed.length ? 'border-destructive/50' : undefined}>
          <CardHeader title={`3 · SAP load failed (${failed.length})`} hint="Fix at the source: back to the requester with SAP’s reason" action={failed.length ? <Simulated /> : undefined} />
          {failed.length ? (
            <ul className="divide-y divide-border">
              {failed.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-300 px-500 py-300 text-300">
                  <div className="min-w-0">
                    <a className="font-monospace text-primary hover:underline" href={href({ page: 'approvals', requestCode: r.requestCode })}>{r.requestCode}</a>{' '}
                    <Tag>{r.equipmentNumber}</Tag>
                    <p className="mt-100 font-monospace text-200">{changeText(r)}</p>
                    <p className="mt-100 text-destructive">{r.sapMessage}</p>
                  </div>
                  <Button variant="secondary" onClick={() => void run(r.id, () => returnSapFailure(r, actor))} disabled={!!busy}>
                    <CornerUpLeft aria-hidden className="icon-size-200" /> Return to requester
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No failed loads.</Empty>
          )}
        </Card>
      </div>

      <Card className="mt-600">
        <CardHeader
          title={`4 · Loaded by SAP — awaiting confirmation (${loaded.length})`}
          hint="Reconciliation: the approved value is compared with the refreshed SAP view. A match closes the request."
          action={
            <Button variant="secondary" onClick={() => void run('sync', () => markSynced(loaded, actor))} disabled={!loaded.length || !!busy}>
              <RefreshCcw aria-hidden className="icon-size-200" /> {busy === 'sync' ? 'Refreshing…' : 'Simulate nightly refresh'}
            </Button>
          }
        />
        {loaded.length ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border">
                <tr>
                  <Th>Request</Th>
                  <Th>Equipment</Th>
                  <Th>Field</Th>
                  <Th>Approved in ATLAS</Th>
                  <Th>Source view today</Th>
                  <Th>Reconciliation</Th>
                </tr>
              </thead>
              <tbody>
                {loaded.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <Td><a className="font-monospace text-primary hover:underline" href={href({ page: 'approvals', requestCode: r.requestCode })}>{r.requestCode}</a></Td>
                    <Td><Tag>{r.equipmentNumber}</Tag></Td>
                    <Td>{r.requestType === 'NEW_RECORD' ? 'New record' : fieldDef(r.fieldName)?.label}</Td>
                    <Td className="font-monospace font-semibold text-primary">{r.newValue}</Td>
                    <Td className="font-monospace text-muted-foreground">{r.requestType === 'NEW_RECORD' ? 'not present' : goldValue(r) || 'blank'}</Td>
                    <Td><Badge tone="warning">Waiting for next refresh</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Nothing waiting for confirmation.</Empty>
        )}
      </Card>

      <Card className="mt-600">
        <CardHeader title="Recently confirmed" />
        {confirmed.length ? <ReqTable rows={confirmed.map((r) => ({ r, extra: fmtDate(r.syncedAt) }))} /> : <Empty>No confirmed SAP changes yet.</Empty>}
      </Card>
    </>
  );
}

function FilePreview({ file }: { file: EvolveFile }) {
  return (
    <div className="border-b border-border last:border-0">
      <p className="flex flex-wrap items-center gap-200 px-500 pt-400 text-300 font-medium">
        <span className="font-monospace">{file.name}</span>
        <Badge>{file.rows.length} row{file.rows.length === 1 ? '' : 's'}</Badge>
      </p>
      <div className="overflow-x-auto p-400">
        <table className="w-full rounded-lg border border-border font-monospace">
          <thead className="bg-muted">
            <tr>{file.header.map((h) => <Th key={h}>{h}</Th>)}</tr>
          </thead>
          <tbody>
            {file.rows.map((r, i) => (
              <tr key={i} className="border-t border-border">
                {r.map((c, j) => <Td key={j} className="whitespace-nowrap text-200">{c}</Td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReqTable({ rows }: { rows: { r: ChangeRequestRecord; extra?: string }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-border">
          <tr>
            <Th>Request</Th>
            <Th>Equipment</Th>
            <Th>Change</Th>
            <Th>When</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ r, extra }) => (
            <tr key={r.id} className="border-b border-border last:border-0">
              <Td><a className="font-monospace text-primary hover:underline" href={href({ page: 'approvals', requestCode: r.requestCode })}>{r.requestCode}</a></Td>
              <Td><Tag>{r.equipmentNumber}</Tag></Td>
              <Td className="font-monospace text-200">{changeText(r)}</Td>
              <Td className="text-200 text-muted-foreground">{extra}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
