import type { EquipmentRecord } from '@rayfin-app/shared';

import { toCsv } from './evolve';
import { fieldDef, fieldsFor, formatValue, parseFieldValue } from './fields';

export const BULK_HEADER = ['EQUIPMENT_NUMBER', 'FIELD', 'CURRENT_VALUE', 'NEW_VALUE', 'REASON'];

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const t = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quoted) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

/** Pre-filled template: one row per editable attribute of each selected record. */
export function buildTemplate(records: EquipmentRecord[], onlyBlank: boolean): string {
  const rows: string[][] = [];
  for (const e of records) {
    const rec = e as unknown as Record<string, unknown>;
    for (const f of fieldsFor(e.equipmentClass)) {
      const v = formatValue(rec[f.key]);
      if (onlyBlank && v) continue;
      rows.push([e.equipmentNumber, f.key, v, '', '']);
    }
  }
  return toCsv({ header: BULK_HEADER, rows });
}

export interface BulkRow {
  line: number;
  equipmentNumber: string;
  field: string;
  oldValue?: string;
  newValue: string;
  reason: string;
  status: 'ready' | 'skip' | 'error';
  message?: string;
  equipment?: EquipmentRecord;
}

export function validateBulk(text: string, equipment: EquipmentRecord[], openKeys: Set<string>): BulkRow[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toUpperCase());
  const idx = (n: string) => header.indexOf(n);
  const [iEq, iField, iNew, iReason] = ['EQUIPMENT_NUMBER', 'FIELD', 'NEW_VALUE', 'REASON'].map(idx);
  if (iEq < 0 || iField < 0 || iNew < 0) {
    return [{ line: 1, equipmentNumber: '', field: '', newValue: '', reason: '', status: 'error', message: `Header must include ${BULK_HEADER.join(', ')}` }];
  }
  const byNo = new Map(equipment.map((e) => [e.equipmentNumber, e]));
  const seen = new Set<string>();
  const out: BulkRow[] = [];
  for (const [k, r] of rows.slice(1).entries()) {
    const line = k + 2;
    const equipmentNumber = (r[iEq] ?? '').trim();
    const field = (r[iField] ?? '').trim();
    const raw = (r[iNew] ?? '').trim();
    const reason = iReason >= 0 ? (r[iReason] ?? '').trim() : '';
    const base = { line, equipmentNumber, field, newValue: raw, reason };
    if (!raw) { out.push({ ...base, status: 'skip', message: 'No new value' }); continue; }
    const e = byNo.get(equipmentNumber);
    if (!e) { out.push({ ...base, status: 'error', message: 'Equipment number not in Gold' }); continue; }
    const def = fieldDef(field);
    if (!def || !def.appliesTo.includes(e.equipmentClass)) { out.push({ ...base, status: 'error', message: `“${field}” is not an editable ${e.equipmentClass.toLowerCase()} attribute` }); continue; }
    const parsed = parseFieldValue(def, raw);
    if (!parsed.ok) { out.push({ ...base, status: 'error', message: parsed.error }); continue; }
    const current = formatValue((e as unknown as Record<string, unknown>)[field]);
    const newValue = String(parsed.value);
    if (current === newValue) { out.push({ ...base, newValue, status: 'skip', message: 'Same as current value' }); continue; }
    const key = `${equipmentNumber}|${field}`;
    if (seen.has(key)) { out.push({ ...base, newValue, status: 'error', message: 'Duplicate row for this attribute in the file' }); continue; }
    seen.add(key);
    if (openKeys.has(key)) { out.push({ ...base, newValue, status: 'error', message: 'Already has an open request for this attribute' }); continue; }
    out.push({
      ...base,
      newValue,
      oldValue: current || undefined,
      reason: reason || 'Bulk upload',
      status: 'ready',
      equipment: e,
    });
  }
  return out;
}
