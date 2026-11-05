import { Download, FileUp } from 'lucide-react';
import { useMemo, useState } from 'react';

import { buildTemplate, validateBulk, type BulkRow } from '../bulk';
import { fieldDef } from '../fields';
import { submitRequest } from '../repo';
import { href } from '../Shell';
import { useAtlas } from '../store';
import { Badge, Button, Card, CardHeader, Empty, PageTitle, Tag, Td, Th } from '../ui';

export function Bulk() {
  const { equipment, requests, approvers, actor, refreshApp } = useAtlas();
  const [facility, setFacility] = useState('');
  const [cls, setCls] = useState('');
  const [onlyBlank, setOnlyBlank] = useState(true);
  const [rows, setRows] = useState<BulkRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const facilities = useMemo(() => [...new Set(equipment.map((e) => e.facility))].sort(), [equipment]);
  const subset = equipment.filter((e) => (!facility || e.facility === facility) && (!cls || e.equipmentClass === cls));
  const openKeys = useMemo(
    () => new Set(requests.filter((r) => r.status === 'PENDING' || r.status === 'RETURNED').map((r) => `${r.equipmentNumber}|${r.fieldName}`)),
    [requests]
  );

  const downloadTemplate = () => {
    const csv = buildTemplate(subset, onlyBlank);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `ATLAS_bulk_template_${(facility || 'all').replace(/\W+/g, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setResult(null);
    setError(null);
    if (file.size > 2_000_000) {
      setError('Keep uploads under 2 MB.');
      return;
    }
    const parsed = validateBulk(await file.text(), equipment, openKeys);
    setFileName(file.name);
    setRows(parsed);
    setSelected(new Set(parsed.filter((r) => r.status === 'ready').map((r) => r.line)));
  };

  const submit = async () => {
    if (!rows) return;
    setBusy(true);
    setError(null);
    const chosen = rows.filter((r) => r.status === 'ready' && selected.has(r.line));
    let existing = requests;
    try {
      for (const r of chosen) {
        const created = await submitRequest({
          equipment: r.equipment!,
          fieldName: r.field,
          oldValue: r.oldValue,
          newValue: r.newValue,
          reason: `${r.reason} (bulk file ${fileName}, line ${r.line})`.slice(0, 500),
          source: 'BULK_UPLOAD',
          requestedBy: actor,
          existing,
          approvers,
        });
        existing = [created, ...existing];
      }
      await refreshApp();
      setResult(`${chosen.length} request${chosen.length === 1 ? '' : 's'} submitted and routed to approvers.`);
      setRows(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const select = 'rounded-lg border border-input bg-card px-300 py-200 text-300';
  const counts = rows ? { ready: rows.filter((r) => r.status === 'ready').length, error: rows.filter((r) => r.status === 'error').length, skip: rows.filter((r) => r.status === 'skip').length } : null;

  return (
    <>
      <PageTitle eyebrow="Many changes at once" title="Bulk upload" />
      <div className="grid grid-cols-1 gap-600 xl:grid-cols-2">
        <Card>
          <CardHeader title="1 · Download a pre-filled template" hint="Pick a subset; the file comes back with current values so people only fill NEW_VALUE." />
          <div className="flex flex-wrap items-center gap-300 p-500">
            <select aria-label="Facility" className={select} value={facility} onChange={(e) => setFacility(e.target.value)}>
              <option value="">All facilities</option>
              {facilities.map((f) => <option key={f}>{f}</option>)}
            </select>
            <select aria-label="Type" className={select} value={cls} onChange={(e) => setCls(e.target.value)}>
              <option value="">All types</option>
              <option value="COMPRESSOR">Compressors</option>
              <option value="HEATER">Heaters</option>
            </select>
            <label className="flex items-center gap-200 text-300">
              <input type="checkbox" className="accent-primary" checked={onlyBlank} onChange={(e) => setOnlyBlank(e.target.checked)} />
              Only blank attributes
            </label>
            <Button onClick={downloadTemplate} disabled={!subset.length}>
              <Download aria-hidden className="icon-size-200" /> Template ({subset.length} records)
            </Button>
          </div>
        </Card>
        <Card>
          <CardHeader title="2 · Upload the completed file" hint="Every row is checked against the attribute rules before anything is submitted." />
          <div className="p-500">
            <label className="flex cursor-pointer items-center justify-center gap-300 rounded-xl border-2 border-dashed border-border px-500 py-700 text-300 text-muted-foreground hover:border-primary hover:text-foreground">
              <FileUp aria-hidden className="icon-size-300" />
              <span>{fileName ? `Replace ${fileName}` : 'Choose a CSV file'}</span>
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
            </label>
          </div>
        </Card>
      </div>

      {result ? <p className="mt-400 text-300 text-success">{result} <a className="text-primary hover:underline" href={href({ page: 'approvals' })}>Open approvals →</a></p> : null}
      {error ? <p role="alert" className="mt-400 text-300 text-destructive">{error}</p> : null}

      {rows ? (
        <Card className="mt-600">
          <CardHeader
            title="3 · Review before submitting"
            hint={counts ? `${counts.ready} ready · ${counts.error} with errors · ${counts.skip} skipped` : undefined}
            action={
              <Button onClick={() => void submit()} disabled={busy || !selected.size}>
                {busy ? 'Submitting…' : `Submit ${selected.size} request${selected.size === 1 ? '' : 's'}`}
              </Button>
            }
          />
          {rows.length ? (
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full">
                <thead className="sticky top-0 border-b border-border bg-card">
                  <tr>
                    <Th>Include</Th>
                    <Th>Line</Th>
                    <Th>Equipment</Th>
                    <Th>Attribute</Th>
                    <Th>Change</Th>
                    <Th>Check</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.line} className="border-b border-border last:border-0">
                      <Td>
                        <input
                          type="checkbox"
                          aria-label={`Include line ${r.line}`}
                          className="accent-primary"
                          disabled={r.status !== 'ready'}
                          checked={selected.has(r.line)}
                          onChange={(e) => {
                            const s = new Set(selected);
                            if (e.target.checked) s.add(r.line);
                            else s.delete(r.line);
                            setSelected(s);
                          }}
                        />
                      </Td>
                      <Td className="font-monospace text-200">{r.line}</Td>
                      <Td>{r.equipmentNumber ? <Tag>{r.equipmentNumber}</Tag> : '—'}</Td>
                      <Td>{fieldDef(r.field)?.label ?? r.field}</Td>
                      <Td className="font-monospace text-200">{r.oldValue ?? '∅'} → {r.newValue || '∅'}</Td>
                      <Td>
                        {r.status === 'ready' ? <Badge tone="success">Ready</Badge> : r.status === 'skip' ? <Badge>{r.message}</Badge> : <Badge tone="danger">{r.message}</Badge>}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>The file has no data rows.</Empty>
          )}
        </Card>
      ) : null}
    </>
  );
}
