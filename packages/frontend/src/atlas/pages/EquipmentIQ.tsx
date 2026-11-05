import type { EvidenceRecord } from '@rayfin-app/shared';
import { ScanLine, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';

import { cn } from '@/lib/utils';

import { fieldDef, formatValue } from '../fields';
import { linkEvidence, logAudit, submitRequest } from '../repo';
import { normaliseSerial } from '../rules';
import { IQ_SAMPLE } from '../seed-data';
import { href } from '../Shell';
import { useAtlas } from '../store';
import { Badge, Button, Card, CardHeader, PageTitle, Simulated, Tag, Td, Th } from '../ui';

type Row = { field: string; label: string; extracted: string; confidence: number; current: string; verdict: 'match' | 'fill' | 'differs' };

/** One bounded EquipmentIQ scenario: nameplate → extracted fields → match → suggested correction → human review. */
export function EquipmentIQ() {
  const { equipment, requests, approvers, actor, refreshApp } = useAtlas();
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const serial = IQ_SAMPLE.extracted.find((x) => x.field === 'serialNumber')?.value ?? '';
  const match = useMemo(() => equipment.find((e) => e.serialNumber && normaliseSerial(e.serialNumber) === normaliseSerial(serial)), [equipment, serial]);

  const rows: Row[] = useMemo(() => {
    if (!match) return [];
    const rec = match as unknown as Record<string, unknown>;
    return IQ_SAMPLE.extracted.map((x) => {
      const current = formatValue(rec[x.field]);
      const same = current !== '' && (fieldDef(x.field)?.kind === 'decimal' ? Number(current) === Number(x.value) : current.toUpperCase() === x.value.toUpperCase());
      return { field: x.field, label: x.label, extracted: x.value, confidence: x.confidence, current, verdict: same ? 'match' : current === '' ? 'fill' : 'differs' };
    });
  }, [match]);
  const suggestions = rows.filter((r) => r.verdict !== 'match' && fieldDef(r.field));
  const openKeys = new Set(requests.filter((r) => r.status === 'PENDING' || r.status === 'RETURNED').map((r) => `${r.equipmentNumber}|${r.fieldName}`));

  const extract = () => {
    setStep(1);
    setTimeout(() => {
      setStep(2);
      setPicked(new Set(suggestions.filter((s) => match && !openKeys.has(`${match.equipmentNumber}|${s.field}`)).map((s) => s.field)));
      if (match) void logAudit('IQ_EXTRACTION', 'EquipmentIQ (simulated)', `Read ${IQ_SAMPLE.extracted.length} fields from nameplate; matched ${match.equipmentNumber} by serial ${serial}.`, { equipmentNumber: match.equipmentNumber });
    }, 1200);
  };

  const createRequests = async () => {
    if (!match) return;
    setBusy(true);
    setError(null);
    try {
      let existing = requests;
      const codes: string[] = [];
      const photo: EvidenceRecord = {
        id: 'iq-sample',
        equipmentNumber: match.equipmentNumber,
        kind: 'PHOTO',
        source: 'EQUIPMENTIQ',
        title: 'Nameplate read by EquipmentIQ',
        caption: `Simulated extraction · serial ${serial}`,
        url: IQ_SAMPLE.url,
        mimeType: 'image/svg+xml',
        chunkCount: 0,
        addedBy: 'EquipmentIQ (simulated)',
        addedAt: new Date(),
        requestCode: 'pending',
      };
      for (const s of suggestions.filter((x) => picked.has(x.field))) {
        const req = await submitRequest({
          equipment: match,
          fieldName: s.field,
          oldValue: s.current || undefined,
          newValue: s.extracted,
          reason: `EquipmentIQ read "${s.extracted}" from the nameplate (confidence ${Math.round(s.confidence * 100)}%). Record shows ${s.current || 'blank'}. Simulated extraction — needs human review.`,
          source: 'EQUIPMENTIQ',
          requestedBy: 'EquipmentIQ (AI steward)',
          existing,
          approvers,
        });
        existing = [req, ...existing];
        await linkEvidence(photo, req.requestCode, actor);
        codes.push(req.requestCode);
      }
      await refreshApp();
      setCreated(codes);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageTitle eyebrow="AI data steward · one scenario" title="EquipmentIQ">
        <Simulated>Simulated extraction — no AI model connected in this POV</Simulated>
      </PageTitle>
      <p className="-mt-400 mb-600 max-w-[760px] text-300 text-muted-foreground">
        Shows the intended flow only: a field photo of a nameplate is read, matched to the right equipment record, and differences become change requests that a person approves. Nothing is written without human review.
      </p>

      <div className="grid grid-cols-1 gap-600 xl:grid-cols-[1fr_1.3fr]">
        <Card className="self-start">
          <CardHeader title="1 · Nameplate photo" hint={IQ_SAMPLE.title} />
          <div className="p-500">
            <div className="relative overflow-hidden rounded-lg border border-border">
              <img src={IQ_SAMPLE.url} alt="Sample nameplate photo" className="w-full" />
              {step === 1 ? <div aria-hidden className="absolute inset-x-0 top-0 h-[4px] animate-[scan_1.2s_linear] bg-primary shadow-[0_0_16px_var(--color-primary)]" /> : null}
            </div>
            <div className="mt-400">
              <Button onClick={extract} disabled={step === 1 || busy}>
                <ScanLine aria-hidden className="icon-size-200" /> {step === 0 ? 'Read nameplate' : step === 1 ? 'Reading…' : 'Read again'}
              </Button>
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-600">
          <Card>
            <CardHeader title="2 · Extracted fields and match" hint="Matched by serial number (0/O, 1/I and dashes normalised)" action={step >= 2 ? <Simulated /> : undefined} />
            {step < 2 ? (
              <p className="p-500 text-300 text-muted-foreground">Read the nameplate to see what EquipmentIQ extracts.</p>
            ) : !match ? (
              <p className="p-500 text-300 text-destructive">No equipment with serial {serial} — this would become a new-equipment request.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-200 px-500 pt-400 text-300">
                  <Sparkles aria-hidden className="icon-size-200 text-primary" />
                  Matched
                  <a href={href({ page: 'equipment', equipmentNumber: match.equipmentNumber })}><Tag>{match.equipmentNumber}</Tag></a>
                  <span className="font-medium">{match.description}</span>
                </div>
                <div className="overflow-x-auto p-400">
                  <table className="w-full">
                    <thead className="border-b border-border">
                      <tr>
                        <Th>Field</Th>
                        <Th>Read from photo</Th>
                        <Th>Confidence</Th>
                        <Th>Current record</Th>
                        <Th>Suggestion</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const already = openKeys.has(`${match.equipmentNumber}|${r.field}`);
                        return (
                          <tr key={r.field} className="border-b border-border last:border-0">
                            <Td>{r.label}</Td>
                            <Td className="font-monospace">{r.extracted}</Td>
                            <Td>
                              <span className={cn('font-monospace', r.confidence < 0.9 && 'text-warning')}>{Math.round(r.confidence * 100)}%</span>
                            </Td>
                            <Td className="font-monospace">{r.current || <span className="text-destructive">blank</span>}</Td>
                            <Td>
                              {r.verdict === 'match' ? (
                                <Badge tone="success">Matches</Badge>
                              ) : already ? (
                                <Badge>Open request exists</Badge>
                              ) : (
                                <label className="flex items-center gap-200 text-300">
                                  <input
                                    type="checkbox"
                                    className="h-[18px] w-[18px] accent-primary"
                                    disabled={step === 3}
                                    checked={picked.has(r.field)}
                                    onChange={(e) => {
                                      const s = new Set(picked);
                                      if (e.target.checked) s.add(r.field);
                                      else s.delete(r.field);
                                      setPicked(s);
                                    }}
                                  />
                                  {r.verdict === 'fill' ? 'Fill blank' : 'Correct value'}
                                </label>
                              )}
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>

          <Card>
            <CardHeader title="3 · Human review" hint="Suggestions become change requests with the photo attached — an approver decides" />
            <div className="p-500">
              {step === 3 ? (
                <p className="text-300">
                  Created {created.length} request{created.length === 1 ? '' : 's'}:{' '}
                  {created.map((c) => (
                    <a key={c} className="mr-200 font-monospace text-primary underline" href={href({ page: 'approvals', requestCode: c })}>{c}</a>
                  ))}
                </p>
              ) : (
                <>
                  {error ? <p role="alert" className="mb-300 text-300 text-destructive">{error}</p> : null}
                  <Button onClick={() => void createRequests()} disabled={step !== 2 || !picked.size || busy}>
                    {busy ? 'Creating…' : `Send ${picked.size} suggestion${picked.size === 1 ? '' : 's'} for review`}
                  </Button>
                </>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
