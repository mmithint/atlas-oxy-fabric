import { CheckCircle2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { cn } from '@/lib/utils';

import { PhotoButton } from '../components';
import { findDuplicateCandidates } from '../duplicates';
import { addEvidencePhoto, submitNewRecord, type ProposedEquipment } from '../repo';
import { href } from '../Shell';
import { useAtlas } from '../store';
import { Badge, Button, Card, CardHeader, PageTitle, Tag, Td, Th } from '../ui';

const SUBTYPES = {
  HEATER: ['LINE HEATER', 'HEATER TREATER', 'REBOILER', 'STACK PACK'],
  COMPRESSOR: ['RECIP COMPRESSOR'],
} as const;

export function NewEquipment() {
  const { goldEquipment, requests, approvers, actor, refreshApp } = useAtlas();
  const facilities = useMemo(() => [...new Set(goldEquipment.map((e) => e.facility))].sort(), [goldEquipment]);
  const [cls, setCls] = useState<'HEATER' | 'COMPRESSOR'>('HEATER');
  const [f, setF] = useState({ subtype: 'LINE HEATER', facility: facilities[0] ?? '', pidTag: '', manufacturer: '', model: '', serial: '', heatDuty: '', fired: 'FIRED', hp: '', engine: '' });
  const [differentUnit, setDifferentUnit] = useState(false);
  const [dupNote, setDupNote] = useState('');
  const [reason, setReason] = useState('');
  const [photo, setPhoto] = useState<{ dataUrl: string; name: string } | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const site = goldEquipment.find((e) => e.facility === f.facility && e.equipmentClass === cls) ?? goldEquipment.find((e) => e.facility === f.facility);
  const area = site?.area ?? '';
  const floc = site ? site.floc.replace(/-(CMP|HTR)$/, cls === 'HEATER' ? '-HTR' : '-CMP') : '';

  const candidates = useMemo(
    () => findDuplicateCandidates({ equipmentClass: cls, facility: f.facility, pidTag: f.pidTag, serialNumber: f.serial, manufacturer: f.manufacturer, model: f.model }, goldEquipment),
    [cls, f.facility, f.pidTag, f.serial, f.manufacturer, f.model, goldEquipment]
  );
  const strong = candidates.filter((c) => c.strength === 'strong');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async () => {
    const missing = [['P&ID tag', f.pidTag], ['Manufacturer', f.manufacturer], ['Model', f.model], ['Serial no.', f.serial]].filter(([, v]) => !v.trim()).map(([k]) => k);
    if (missing.length) return setError(`Fill in: ${missing.join(', ')}.`);
    if (strong.length && !differentUnit) return setError('A likely duplicate exists. Open it instead, or confirm this is a different physical unit.');
    if (strong.length && dupNote.trim().length < 5) return setError('Explain why this is a different unit.');
    if (reason.trim().length < 5) return setError('Add a reason (e.g. new install, found during walkdown).');
    const proposed: ProposedEquipment = {
      equipmentClass: cls,
      equipmentSubtype: f.subtype,
      facility: f.facility,
      area,
      floc,
      pidTag: f.pidTag.trim().toUpperCase(),
      manufacturer: f.manufacturer.trim().toUpperCase(),
      model: f.model.trim().toUpperCase(),
      serialNumber: f.serial.trim().toUpperCase(),
      ...(cls === 'HEATER'
        ? { heatDutyMmbtu: f.heatDuty ? Number(f.heatDuty) : undefined, firedOrUnfired: f.fired as 'FIRED' | 'UNFIRED' }
        : { horsepower: f.hp ? Number(f.hp) : undefined, engineModel: f.engine.trim().toUpperCase() || undefined }),
    };
    const dup = candidates.length
      ? `${candidates.length} candidate(s) reviewed (${candidates.map((c) => c.equipment.equipmentNumber).join(', ')}).${strong.length ? ` Requester: ${dupNote.trim()}` : ''}`
      : 'No matching serial, tag or make/model found.';
    setBusy(true);
    setError(null);
    try {
      const created = await submitNewRecord({ proposed, reason: reason.trim(), duplicateNote: dup, actor, existing: requests, approvers });
      if (photo) await addEvidencePhoto({ dataUrl: photo.dataUrl, title: photo.name || 'Nameplate photo', equipmentNumber: created.equipmentNumber, requestCode: created.requestCode, actor });
      await refreshApp();
      setDone(created.requestCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const input = 'mt-100 min-h-[44px] w-full rounded-lg border border-input bg-card px-300 text-[length:var(--text-400)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  if (done) {
    return (
      <Card className="mx-auto max-w-[640px] p-600 text-center">
        <CheckCircle2 aria-hidden className="mx-auto icon-size-600 text-success" />
        <h1 className="mt-300 font-heading text-600 font-semibold">{done} submitted</h1>
        <p className="mt-200 text-300 text-muted-foreground">Routed to the Core SAP approver for {f.facility}. Once approved it appears in ATLAS straight away and goes to SAP as an equipment-create row.</p>
        <div className="mt-500 flex justify-center gap-200">
          <a href={href({ page: 'approvals', requestCode: done })} className="rounded-lg bg-primary px-400 py-200 text-300 font-medium text-primary-foreground">Open in Approvals</a>
          <Button variant="secondary" onClick={() => { setDone(null); setF((x) => ({ ...x, pidTag: '', serial: '' })); }}>Request another</Button>
        </div>
      </Card>
    );
  }

  return (
    <>
      <PageTitle eyebrow="Equipment not in SAP yet" title="Request new equipment" />
      <div className="grid grid-cols-1 gap-600 xl:grid-cols-2">
        <Card>
          <CardHeader title="1 · Describe the unit" hint="Check the nameplate; the duplicate check runs as you type" />
          <div className="grid grid-cols-1 gap-400 p-500 sm:grid-cols-2">
            <label className="text-300 font-medium">
              Equipment type
              <select className={input} value={cls} onChange={(e) => { const c = e.target.value as 'HEATER' | 'COMPRESSOR'; setCls(c); setF((x) => ({ ...x, subtype: SUBTYPES[c][0] })); }}>
                <option value="HEATER">Heater</option>
                <option value="COMPRESSOR">Compressor</option>
              </select>
            </label>
            <label className="text-300 font-medium">
              Subtype
              <select className={input} value={f.subtype} onChange={set('subtype')}>
                {SUBTYPES[cls].map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="text-300 font-medium sm:col-span-2">
              Facility
              <select className={input} value={f.facility} onChange={set('facility')}>
                {facilities.map((x) => <option key={x}>{x}</option>)}
              </select>
              <span className="mt-100 block text-200 font-normal text-muted-foreground">{area} · parent FLOC <span className="font-monospace">{floc}</span></span>
            </label>
            <label className="text-300 font-medium">P&amp;ID tag<input className={`${input} font-monospace`} value={f.pidTag} onChange={set('pidTag')} placeholder="e.g. H-230" /></label>
            <label className="text-300 font-medium">Serial no.<input className={`${input} font-monospace`} value={f.serial} onChange={set('serial')} /></label>
            <label className="text-300 font-medium">Manufacturer<input className={input} value={f.manufacturer} onChange={set('manufacturer')} /></label>
            <label className="text-300 font-medium">Model<input className={input} value={f.model} onChange={set('model')} /></label>
            {cls === 'HEATER' ? (
              <>
                <label className="text-300 font-medium">Heat duty (MMBtu/hr)<input inputMode="decimal" className={`${input} font-monospace`} value={f.heatDuty} onChange={set('heatDuty')} /></label>
                <label className="text-300 font-medium">
                  Fired / unfired
                  <select className={input} value={f.fired} onChange={set('fired')}>
                    <option>FIRED</option>
                    <option>UNFIRED</option>
                  </select>
                </label>
              </>
            ) : (
              <>
                <label className="text-300 font-medium">Rated HP<input inputMode="numeric" className={`${input} font-monospace`} value={f.hp} onChange={set('hp')} /></label>
                <label className="text-300 font-medium">Engine model<input className={input} value={f.engine} onChange={set('engine')} /></label>
              </>
            )}
            <label className="text-300 font-medium sm:col-span-2">
              Reason
              <textarea rows={2} className={`${input} py-200`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. found during walkdown, not in SAP" />
            </label>
            <div className="flex flex-wrap items-center gap-300 sm:col-span-2">
              <PhotoButton label="Add nameplate photo" onPhoto={(dataUrl, name) => setPhoto({ dataUrl, name })} disabled={busy} />
              {photo ? <img src={photo.dataUrl} alt="Nameplate" className="h-[56px] rounded-md border border-border" /> : null}
            </div>
          </div>
        </Card>

        <Card className={cn('self-start', strong.length && 'border-destructive/50')}>
          <CardHeader title="2 · Check it isn’t already in SAP" hint="Serial anywhere (moved units), P&ID tag at this facility, or same make/model here" />
          <div className="p-500">
            {!f.serial && !f.pidTag ? (
              <p className="text-300 text-muted-foreground">Enter a serial number or P&amp;ID tag to check for duplicates.</p>
            ) : candidates.length ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-border">
                      <tr>
                        <Th>Field</Th>
                        <Th>You entered</Th>
                        {candidates.slice(0, 2).map((c) => (
                          <Th key={c.equipment.equipmentNumber}>
                            <a href={href({ page: 'equipment', equipmentNumber: c.equipment.equipmentNumber })}><Tag>{c.equipment.equipmentNumber}</Tag></a>
                          </Th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        [
                          ['Facility', f.facility, 'facility'],
                          ['P&ID tag', f.pidTag.toUpperCase(), 'pidTag'],
                          ['Serial', f.serial.toUpperCase(), 'serialNumber'],
                          ['Manufacturer', f.manufacturer.toUpperCase(), 'manufacturer'],
                          ['Model', f.model.toUpperCase(), 'model'],
                        ] as const
                      ).map(([label, mine, key]) => (
                        <tr key={key} className="border-b border-border last:border-0">
                          <Td className="text-muted-foreground">{label}</Td>
                          <Td className="font-monospace">{mine || '—'}</Td>
                          {candidates.slice(0, 2).map((c) => (
                            <Td key={c.equipment.equipmentNumber} className={cn('font-monospace', c.matched.has(key) && 'font-semibold text-destructive')}>
                              {String((c.equipment as unknown as Record<string, unknown>)[key] ?? '—')}
                            </Td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="mt-300 space-y-100 text-300">
                  {candidates.map((c) => (
                    <li key={c.equipment.equipmentNumber} className="flex flex-wrap items-center gap-200">
                      <Badge tone={c.strength === 'strong' ? 'danger' : 'warning'}>{c.strength === 'strong' ? 'Likely duplicate' : 'Possible'}</Badge>
                      <a className="font-monospace text-primary underline" href={href({ page: 'equipment', equipmentNumber: c.equipment.equipmentNumber })}>{c.equipment.equipmentNumber}</a>
                      <span className="text-muted-foreground">{c.reasons.join('; ')}</span>
                    </li>
                  ))}
                </ul>
                {strong.length ? (
                  <div className="mt-400 rounded-lg border border-destructive/40 bg-destructive/5 p-400">
                    <p className="text-300 font-medium">Is this the same unit as {strong[0].equipment.equipmentNumber}?</p>
                    <div className="mt-200 flex flex-wrap gap-200">
                      <a href={href({ page: 'equipment', equipmentNumber: strong[0].equipment.equipmentNumber })} className="rounded-lg bg-primary px-400 py-200 text-300 font-medium text-primary-foreground">
                        Yes — open it and request a change instead
                      </a>
                    </div>
                    <label className="mt-300 flex items-center gap-200 text-300">
                      <input type="checkbox" className="h-[18px] w-[18px] accent-primary" checked={differentUnit} onChange={(e) => setDifferentUnit(e.target.checked)} />
                      No, this is a different physical unit
                    </label>
                    {differentUnit ? (
                      <textarea rows={2} className={`${input} py-200`} value={dupNote} onChange={(e) => setDupNote(e.target.value)} placeholder="Why it is different (e.g. both units on the pad, serial checked)" />
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-300 text-success">✓ No existing record matches this serial, tag or make/model.</p>
            )}
          </div>
          <div className="border-t border-border p-500">
            {error ? <p role="alert" className="mb-300 text-300 text-destructive">{error}</p> : null}
            <Button onClick={() => void submit()} disabled={busy}>{busy ? 'Submitting…' : 'Submit new-equipment request'}</Button>
          </div>
        </Card>
      </div>
    </>
  );
}
