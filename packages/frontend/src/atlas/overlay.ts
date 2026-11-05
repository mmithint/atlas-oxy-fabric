import type { ChangeRequestRecord, EquipmentRecord } from '@rayfin-app/shared';

import { fieldDef } from './fields';

export interface FieldProvenance {
  requestCode: string;
  status: ChangeRequestRecord['status'];
  /** The value the source system (SAP view / Gold) still shows. */
  goldValue?: string;
  /** True once the (simulated) SAP refresh confirmed the value. */
  confirmed: boolean;
  decidedAt?: Date;
  decidedBy?: string;
}

/** Gold record plus approved changes that SAP / the next Gold refresh hasn't picked up yet. */
export type EffectiveEquipment = EquipmentRecord & {
  pendingFields: Record<string, FieldProvenance>;
  /** Set for approved new-equipment requests that are not in Gold yet. */
  newRecordRequest?: string;
};

const ACCEPTED: ChangeRequestRecord['status'][] = ['APPROVED', 'SENT_TO_SAP', 'SAP_LOADED', 'SYNCED'];

/**
 * Approved data is visible in ATLAS immediately, before SAP is updated
 * (workshop brainstorm session 3). The latest accepted request per field wins.
 * A failed SAP load is not applied: SAP refused the value.
 */
export function applyApprovedChanges(
  gold: EquipmentRecord[],
  requests: ChangeRequestRecord[]
): EffectiveEquipment[] {
  const latest = new Map<string, ChangeRequestRecord>();
  for (const r of requests) {
    if (r.requestType !== 'UPDATE' || !ACCEPTED.includes(r.status)) continue;
    const k = `${r.equipmentNumber}|${r.fieldName}`;
    const prev = latest.get(k);
    const t = (r.decidedAt ?? r.submittedAt).getTime();
    if (!prev || t > (prev.decidedAt ?? prev.submittedAt).getTime()) latest.set(k, r);
  }

  const out: EffectiveEquipment[] = gold.map((e) => {
    const eff: EffectiveEquipment = { ...e, pendingFields: {} };
    const rec = eff as unknown as Record<string, unknown>;
    for (const [k, r] of latest) {
      const [eqNo, field] = k.split('|');
      if (eqNo !== e.equipmentNumber) continue;
      const def = fieldDef(field);
      if (!def || !def.appliesTo.includes(e.equipmentClass)) continue;
      const goldValue = rec[field];
      const value = def.kind === 'int' || def.kind === 'decimal' ? Number(r.newValue) : r.newValue;
      if (String(goldValue ?? '') === String(value)) continue;
      rec[field] = value;
      eff.pendingFields[field] = {
        requestCode: r.requestCode,
        status: r.status,
        goldValue: goldValue === undefined || goldValue === null ? undefined : String(goldValue),
        confirmed: r.status === 'SYNCED',
        decidedAt: r.decidedAt,
        decidedBy: r.decidedBy,
      };
    }
    return eff;
  });

  // Approved new equipment shows up straight away, flagged as not yet in SAP.
  for (const r of requests) {
    if (r.requestType !== 'NEW_RECORD' || !ACCEPTED.includes(r.status) || !r.proposedRecord) continue;
    try {
      const p = JSON.parse(r.proposedRecord) as Partial<EquipmentRecord>;
      out.push({
        equipmentNumber: r.equipmentNumber,
        atlasId: r.equipmentNumber,
        equipmentClass: (p.equipmentClass ?? r.equipmentClass) as EquipmentRecord['equipmentClass'],
        equipmentSubtype: p.equipmentSubtype,
        description: `${p.equipmentSubtype ?? 'EQUIPMENT'} ${p.facility ?? ''}`.trim().toUpperCase(),
        floc: p.floc ?? '',
        facility: p.facility ?? r.facility,
        area: p.area ?? r.area,
        pidTag: p.pidTag,
        manufacturer: p.manufacturer,
        model: p.model,
        serialNumber: p.serialNumber,
        heatDutyMmbtu: p.heatDutyMmbtu,
        firedOrUnfired: p.firedOrUnfired,
        horsepower: p.horsepower,
        engineModel: p.engineModel,
        status: 'ACTIVE',
        verificationStatus: 'VERIFIED',
        sourceSystems: 'ATLAS',
        goldLoadedAt: r.decidedAt ?? r.submittedAt,
        pendingFields: {},
        newRecordRequest: r.requestCode,
      });
    } catch {
      /* malformed proposal — skip */
    }
  }
  return out;
}
