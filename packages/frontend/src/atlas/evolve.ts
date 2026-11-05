import type { ChangeRequestRecord } from '@rayfin-app/shared';

import { fieldDef } from './fields';

/**
 * Builds SAP upload files in the shape of the SAP team's Evolve loader
 * templates. Column layout is a POV placeholder — confirm against the real
 * templates before anything is loaded.
 */

export interface EvolveFile {
  name: string;
  template: 'EQUIPMENT_UPDATE' | 'CHARACTERISTICS' | 'EQUIPMENT_CREATE';
  header: string[];
  rows: string[][];
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(file: Pick<EvolveFile, 'header' | 'rows'>): string {
  return [file.header, ...file.rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function buildEvolveFiles(
  requests: ChangeRequestRecord[],
  batchId: string
): { files: EvolveFile[]; included: ChangeRequestRecord[]; skipped: ChangeRequestRecord[] } {
  const equipmentRows: string[][] = [];
  const createRows: string[][] = [];
  const charRows: string[][] = [];
  const included: ChangeRequestRecord[] = [];
  const skipped: ChangeRequestRecord[] = [];

  for (const r of requests) {
    if (r.requestType === 'NEW_RECORD' && r.proposedRecord) {
      const p = JSON.parse(r.proposedRecord) as Record<string, string | number | undefined>;
      included.push(r);
      createRows.push([batchId, r.equipmentNumber, String(p.floc ?? ''), String(p.equipmentClass ?? ''), String(p.equipmentSubtype ?? ''), String(p.manufacturer ?? ''), String(p.model ?? ''), String(p.serialNumber ?? ''), String(p.pidTag ?? ''), r.requestCode, r.decidedBy ?? '']);
      continue;
    }
    const def = fieldDef(r.fieldName);
    if (r.requestType !== 'UPDATE' || !def?.sap) {
      skipped.push(r);
      continue;
    }
    included.push(r);
    if (def.sap.template === 'EQUIPMENT_UPDATE') {
      equipmentRows.push([batchId, r.equipmentNumber, def.sap.sapField, r.oldValue ?? '', r.newValue, r.requestCode, r.decidedBy ?? '']);
    } else {
      charRows.push([batchId, r.equipmentNumber, def.sap.sapClass, def.sap.characteristic, r.oldValue ?? '', r.newValue, r.requestCode, r.decidedBy ?? '']);
    }
  }

  const files: EvolveFile[] = [];
  if (createRows.length)
    files.push({
      name: `EVOLVE_EQUIPMENT_CREATE_${batchId}.csv`,
      template: 'EQUIPMENT_CREATE',
      header: ['BATCH_ID', 'ATLAS_TEMP_ID', 'TPLNR', 'EQUIP_CLASS', 'EQ_SUBTYPE', 'HERST', 'TYPBZ', 'SERGE', 'TIDNR', 'ATLAS_REQUEST', 'APPROVED_BY'],
      rows: createRows,
    });
  if (equipmentRows.length)
    files.push({
      name: `EVOLVE_EQUIPMENT_UPDATE_${batchId}.csv`,
      template: 'EQUIPMENT_UPDATE',
      header: ['BATCH_ID', 'EQUNR', 'SAP_FIELD', 'OLD_VALUE', 'NEW_VALUE', 'ATLAS_REQUEST', 'APPROVED_BY'],
      rows: equipmentRows,
    });
  if (charRows.length)
    files.push({
      name: `EVOLVE_CHARACTERISTICS_${batchId}.csv`,
      template: 'CHARACTERISTICS',
      header: ['BATCH_ID', 'EQUNR', 'CLASS', 'CHARACTERISTIC', 'OLD_VALUE', 'NEW_VALUE', 'ATLAS_REQUEST', 'APPROVED_BY'],
      rows: charRows,
    });
  return { files, included, skipped };
}

export function newBatchId(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `EVL${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}`;
}
