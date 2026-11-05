/**
 * Writes the synthetic Bronze CSVs for the ATLAS POV Lakehouse.
 * Each file stands in for one source system. All values are invented.
 *
 *   npx tsx lakehouse/generate-bronze.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSeedBundle } from '../packages/frontend/src/atlas/seed-data';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'bronze');
mkdirSync(out, { recursive: true });

// Fixed "as of" date so the files are reproducible.
const asOf = new Date('2026-11-03T06:00:00Z');
const { equipment, aliases } = buildSeedBundle(asOf);

function cell(v: unknown): string {
  if (v === undefined || v === null) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function write(name: string, header: string[], rows: unknown[][]) {
  const text = [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
  writeFileSync(join(out, name), text);
  console.log(`${name}: ${rows.length} rows`);
}

// Messy-on-purpose source formatting, cleaned up in Silver.
const messy = (s: string | undefined, i: number) =>
  s === undefined ? undefined : i % 6 === 0 ? `  ${s.toLowerCase()} ` : s;

// 1) SAP equipment view (Databricks ODS: OPSODS.Equipment)
write(
  'sap_equipment.csv',
  ['EQUNR', 'EQKTX', 'EQUIP_CLASS', 'EQ_SUBTYPE', 'TPLNR', 'FACILITY_NAME', 'AREA', 'HERST', 'TYPBZ', 'SERGE', 'TIDNR', 'SORTFELD', 'USER_STATUS', 'CHANGED_ON'],
  equipment.map((e, i) => [
    e.equipmentNumber,
    e.description,
    e.equipmentClass,
    e.equipmentSubtype,
    e.floc,
    e.facility,
    e.area,
    messy(e.manufacturer, i),
    e.model,
    e.serialNumber,
    e.pidTag,
    e.atlasId,
    e.status === 'ACTIVE' ? 'ACTV' : 'INAC',
    new Date(asOf.getTime() - (i + 3) * 86_400_000).toISOString().slice(0, 10),
  ])
);

// 2) SAP class characteristics (long format, one row per characteristic)
const charRows: unknown[][] = [];
for (const e of equipment) {
  const push = (cls: string, name: string, v: unknown) => {
    if (v !== undefined && v !== null) charRows.push([e.equipmentNumber, cls, name, v]);
  };
  if (e.equipmentClass === 'COMPRESSOR') {
    push('COMPRESSOR', 'CO_ENGINE_MODEL', e.engineModel);
    push('COMPRESSOR', 'CO_ENGINE_SERIAL', e.engineSerial);
    push('COMPRESSOR', 'CO_RATED_HP', e.horsepower);
    push('COMPRESSOR', 'CO_STAGES', e.stages);
  } else {
    push('VESSEL', 'VE_HEAT_DUTY', e.heatDutyMmbtu);
    push('VESSEL', 'VE_FIRED_OR_UNFIRED', e.firedOrUnfired);
  }
}
write('sap_characteristics.csv', ['EQUNR', 'CLASS', 'ATNAM', 'ATWRT'], charRows);

// 3) Identity cross-reference maintained from field verification (P&ID, PI, field names, Fexus, supply chain)
const keyToEq = new Map(equipment.map((e) => [e.key, e.equipmentNumber]));
write(
  'equipment_xref.csv',
  ['EQUNR', 'SYSTEM', 'ALIAS'],
  aliases.filter((a) => a.aliasValue !== '—').map((a) => [keyToEq.get(a.key), a.system, a.aliasValue])
);

// 4) TrueContext field verifications (several submissions per unit; latest wins)
const tcRows: unknown[][] = [];
let sub = 50_000;
equipment.forEach((e, i) => {
  if (!e.lastVerifiedAt) return;
  const older = new Date(e.lastVerifiedAt.getTime() - 120 * 86_400_000);
  if (i % 2 === 0) tcRows.push([`TC-${sub++}`, e.equipmentNumber, 'Did not Verify', 'Field Tech', older.toISOString()]);
  const result = e.verificationStatus === 'CORRECTION_REQUIRED' ? 'Correction Required' : 'Verified Correct';
  tcRows.push([`TC-${sub++}`, e.equipmentNumber, result, 'Field Tech', e.lastVerifiedAt.toISOString()]);
});
write('truecontext_verifications.csv', ['SUBMISSION_ID', 'EQUNR', 'RESULT', 'SUBMITTED_BY', 'SUBMITTED_AT'], tcRows);

// 5) GIS locations
write(
  'gis_locations.csv',
  ['EQUNR', 'LATITUDE', 'LONGITUDE'],
  equipment.filter((e) => e.latitude !== undefined).map((e) => [e.equipmentNumber, e.latitude, e.longitude])
);

// 6) Air permits (Intelex / Axe extract)
write(
  'air_permits.csv',
  ['EQUNR', 'PERMIT_NUMBER', 'PERMIT_STATUS'],
  equipment.filter((e) => e.airPermitNumber).map((e) => [e.equipmentNumber, e.airPermitNumber, 'ACTIVE'])
);
