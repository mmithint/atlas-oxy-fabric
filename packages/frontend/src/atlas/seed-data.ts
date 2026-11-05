/**
 * Synthetic demo data for the ATLAS proof of value. Every name, number and
 * coordinate here is invented — nothing comes from Oxy systems. The data is
 * deliberately imperfect (missing heat duty, unfired heaters, a duplicate
 * serial, missing P&ID tags) so the business-rule engine has work to do.
 */
import type {
  AliasSystem,
  AttributeGroup,
  BusinessRuleRecord,
  ChangeRequestRecord,
  EquipmentRecord,
  RequestSource,
  RequestStatus,
} from '@rayfin-app/shared';

export type SeedEquipment = Omit<EquipmentRecord, 'sourceSystems' | 'goldLoadedAt'> & { key: string };
export type SeedAlias = { key: string; system: AliasSystem; aliasValue: string };
export type SeedRule = Omit<BusinessRuleRecord, 'id'>;
export type SeedRequest = Omit<ChangeRequestRecord, 'id'> & { key?: string };
export type SeedEvidence = {
  key: string;
  requestCode?: string;
  kind: 'PHOTO' | 'DOCUMENT';
  source: 'FIELD_PHOTO' | 'VENDOR_SHEET' | 'EQUIPMENTIQ';
  title: string;
  caption: string;
  url: string;
  mimeType: string;
  addedBy: string;
  hoursAgo: number;
};
export type SeedApprover = { attributeGroup: AttributeGroup; area: string; approver: string; delegate?: string; slaHours: number };

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const AREAS = [
  { area: 'Delaware Basin – NM', code: 'DNM', lat: 32.25, lon: -103.95 },
  { area: 'Delaware Basin – TX', code: 'DTX', lat: 31.75, lon: -103.55 },
  { area: 'Midland Basin', code: 'MID', lat: 31.95, lon: -101.95 },
] as const;

const FACILITIES = [
  { name: 'Falcon CTB', code: 'FALC', area: 0 },
  { name: 'Red Tank CS', code: 'RDTK', area: 0 },
  { name: 'Coyote Battery', code: 'COYT', area: 0 },
  { name: 'Eagle Draw CTB', code: 'EGLD', area: 1 },
  { name: 'Wolfbone CS', code: 'WLFB', area: 1 },
  { name: 'Mesa Verde CTB', code: 'MSVD', area: 2 },
  { name: 'Spraberry CS', code: 'SPRB', area: 2 },
] as const;

const COMP_MODELS = [
  { model: 'JGK/4', engine: 'CAT G3516', hp: 1380, stages: 3 },
  { model: 'JGE/2', engine: 'CAT G3508', hp: 690, stages: 2 },
  { model: 'JGT/4', engine: 'CAT G3606', hp: 1875, stages: 3 },
  { model: 'JGJ/2', engine: 'WAUKESHA L7044GSI', hp: 1680, stages: 2 },
] as const;

const HEATER_TYPES = [
  { subtype: 'LINE HEATER', mfr: 'SIVALLS', prefix: 'H', model: 'LH-48' },
  { subtype: 'HEATER TREATER', mfr: 'NATCO', prefix: 'HT', model: 'HT-6x20' },
  { subtype: 'REBOILER', mfr: 'EXTERRAN', prefix: 'RB', model: 'RB-750' },
  { subtype: 'STACK PACK', mfr: 'CIMARRON', prefix: 'SP', model: 'SP-36' },
] as const;

export interface SeedBundle {
  evidence: SeedEvidence[];
  equipment: SeedEquipment[];
  aliases: SeedAlias[];
  rules: SeedRule[];
  requests: SeedRequest[];
  approvers: SeedApprover[];
}

export function buildSeedBundle(now = new Date()): SeedBundle {
  const r = rng(4040);
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(r() * arr.length)];
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

  const equipment: SeedEquipment[] = [];
  const aliases: SeedAlias[] = [];
  let eqNo = 10_412_300;

  // Compressors
  for (let i = 0; i < 26; i++) {
    const fac = FACILITIES[i % FACILITIES.length];
    const area = AREAS[fac.area];
    const m = pick(COMP_MODELS);
    const unit = 3500 + i * 7;
    const key = `C${i}`;
    const serial = `F-${(21_800 + i * 37).toString()}`;
    const rec: SeedEquipment = {
      key,
      equipmentNumber: String(eqNo++),
      atlasId: `ATL-C-${String(i + 1).padStart(4, '0')}`,
      equipmentClass: 'COMPRESSOR',
      equipmentSubtype: 'RECIP COMPRESSOR',
      description: `COMPRESSOR UNIT ${unit} ${fac.name.toUpperCase()}`,
      floc: `ORCM-${area.code}-${fac.code}-CMP`,
      facility: fac.name,
      area: area.area,
      pidTag: `C-${100 + i}`,
      piTagRoute: `${area.code}.${fac.code}.CMP${unit}`,
      manufacturer: 'ARIEL',
      model: m.model,
      serialNumber: serial,
      engineModel: m.engine,
      engineSerial: `CAT${(5_210_000 + i * 913).toString()}`,
      horsepower: m.hp,
      stages: m.stages,
      airPermitNumber: `AQ-${area.code}-${1200 + i}`,
      latitude: Number((area.lat + r() * 0.3).toFixed(5)),
      longitude: Number((area.lon + r() * 0.3).toFixed(5)),
      status: 'ACTIVE',
      verificationStatus: i % 5 === 0 ? 'NOT_VERIFIED' : i % 7 === 0 ? 'CORRECTION_REQUIRED' : 'VERIFIED',
      lastVerifiedAt: i % 5 === 0 ? undefined : daysAgo(10 + i * 3),
    };
    // Deliberate data-quality gaps
    if (i === 3) rec.engineModel = undefined;
    if (i === 8) rec.horsepower = undefined;
    if (i === 11) rec.pidTag = undefined;
    if (i === 14) rec.serialNumber = 'F-21837'; // duplicate of unit 1 (F-21837)
    if (i === 17) rec.pidTag = 'COMP 3 UNIT'; // free-text tag breaks the pattern
    if (i === 20) rec.airPermitNumber = undefined;
    if (i === 22) rec.piTagRoute = undefined;
    equipment.push(rec);
    aliases.push({ key, system: 'PID', aliasValue: rec.pidTag ?? '—' });
    aliases.push({ key, system: 'FIELD', aliasValue: `Unit ${unit}` });
    aliases.push({ key, system: 'FIELD', aliasValue: `${fac.name.split(' ')[0]} #${(i % 4) + 1}` });
    if (rec.piTagRoute) aliases.push({ key, system: 'PI', aliasValue: rec.piTagRoute });
    aliases.push({ key, system: 'SUPPLY_CHAIN', aliasValue: `SC-CMP-${70_100 + i}` });
  }

  // Heaters
  for (let i = 0; i < 22; i++) {
    const fac = FACILITIES[(i + 2) % FACILITIES.length];
    const area = AREAS[fac.area];
    const t = HEATER_TYPES[i % HEATER_TYPES.length];
    const key = `H${i}`;
    const rec: SeedEquipment = {
      key,
      equipmentNumber: String(eqNo++),
      atlasId: `ATL-H-${String(i + 1).padStart(4, '0')}`,
      equipmentClass: 'HEATER',
      equipmentSubtype: t.subtype,
      description: `${t.subtype} ${fac.name.toUpperCase()}`,
      floc: `ORCM-${area.code}-${fac.code}-HTR`,
      facility: fac.name,
      area: area.area,
      pidTag: `${t.prefix}-${200 + i}`,
      piTagRoute: `${area.code}.${fac.code}.${t.prefix}${200 + i}`,
      manufacturer: t.mfr,
      model: t.model,
      serialNumber: `${t.mfr.slice(0, 2)}${(88_000 + i * 53).toString()}`,
      heatDutyMmbtu: Number((0.5 + r() * 3.5).toFixed(2)),
      firedOrUnfired: 'FIRED',
      airPermitNumber: `AQ-${area.code}-${3400 + i}`,
      latitude: Number((area.lat + r() * 0.3).toFixed(5)),
      longitude: Number((area.lon + r() * 0.3).toFixed(5)),
      status: 'ACTIVE',
      verificationStatus: i % 3 === 0 ? 'NOT_VERIFIED' : 'VERIFIED',
      lastVerifiedAt: i % 3 === 0 ? undefined : daysAgo(5 + i * 4),
    };
    if ([2, 7, 12, 18].includes(i)) rec.heatDutyMmbtu = undefined;
    if ([4, 9, 15].includes(i)) rec.firedOrUnfired = undefined;
    if (i === 13) rec.firedOrUnfired = 'UNFIRED';
    if ([5, 16].includes(i)) rec.airPermitNumber = undefined;
    if (i === 10) rec.pidTag = undefined;
    if (i === 19) rec.manufacturer = undefined;
    equipment.push(rec);
    if (rec.pidTag) aliases.push({ key, system: 'PID', aliasValue: rec.pidTag });
    aliases.push({ key, system: 'FIELD', aliasValue: `${t.subtype.toLowerCase()} by the ${pick(['tanks', 'separator', 'LACT', 'flare'])}` });
    if (rec.piTagRoute) aliases.push({ key, system: 'PI', aliasValue: rec.piTagRoute });
    aliases.push({ key, system: 'FEXUS', aliasValue: `FX-${fac.code}-${t.prefix}${i + 1}` });
  }

  const rules: SeedRule[] = [
    { ruleCode: 'HTR_01', equipmentClass: 'HEATER', columnName: 'firedOrUnfired', checkType: 'EQUALS', expectedValue: 'FIRED', description: 'All heaters must be labeled as fired', severity: 'CRITICAL', owner: 'Air Quality', active: true },
    { ruleCode: 'HTR_02', equipmentClass: 'HEATER', columnName: 'heatDutyMmbtu', checkType: 'NOT_NULL', description: 'All heaters must have a heat duty', severity: 'CRITICAL', owner: 'Air Quality', active: true },
    { ruleCode: 'HTR_03', equipmentClass: 'HEATER', columnName: 'airPermitNumber', checkType: 'NOT_NULL', description: 'Heaters must reference an air permit', severity: 'HIGH', owner: 'Air Quality', active: true },
    { ruleCode: 'CMP_01', equipmentClass: 'COMPRESSOR', columnName: 'engineModel', checkType: 'NOT_NULL', description: 'Compressors must have an engine model', severity: 'HIGH', owner: 'Operations', active: true },
    { ruleCode: 'CMP_02', equipmentClass: 'COMPRESSOR', columnName: 'horsepower', checkType: 'NOT_NULL', description: 'Compressors must have rated horsepower', severity: 'HIGH', owner: 'Operations', active: true },
    { ruleCode: 'CMP_03', equipmentClass: 'COMPRESSOR', columnName: 'airPermitNumber', checkType: 'NOT_NULL', description: 'Compressors must reference an air permit', severity: 'HIGH', owner: 'Air Quality', active: true },
    { ruleCode: 'ALL_01', equipmentClass: 'ALL', columnName: 'serialNumber', checkType: 'UNIQUE', description: 'Serial numbers must be unique', severity: 'CRITICAL', owner: 'Data Governance', active: true },
    { ruleCode: 'ALL_02', equipmentClass: 'ALL', columnName: 'pidTag', checkType: 'NOT_NULL', description: 'Equipment must carry a P&ID tag', severity: 'HIGH', owner: 'Facilities Engineering', active: true },
    { ruleCode: 'ALL_03', equipmentClass: 'ALL', columnName: 'pidTag', checkType: 'PATTERN', expectedValue: '^[A-Z]{1,3}-\\d{3}$', description: 'P&ID tag must follow the PREFIX-### convention', severity: 'MEDIUM', owner: 'Facilities Engineering', active: true },
    { ruleCode: 'ALL_04', equipmentClass: 'ALL', columnName: 'manufacturer', checkType: 'NOT_NULL', description: 'Manufacturer is required', severity: 'MEDIUM', owner: 'Data Governance', active: true },
    { ruleCode: 'ALL_05', equipmentClass: 'ALL', columnName: 'piTagRoute', checkType: 'NOT_NULL', description: 'Equipment must map to a PI / SCADA tag route', severity: 'MEDIUM', owner: 'Operations', active: true },
  ];

  const eqByKey = new Map(equipment.map((e) => [e.key, e]));
  const req = (
    n: number,
    key: string,
    fieldName: string,
    newValue: string,
    reason: string,
    group: AttributeGroup,
    source: RequestSource,
    status: RequestStatus,
    requestedBy: string,
    ageHours: number,
    extra: Partial<SeedRequest> = {}
  ): SeedRequest => {
    const eq = eqByKey.get(key)!;
    const old = (eq as unknown as Record<string, unknown>)[fieldName];
    return {
      key,
      requestCode: `CR-${String(n).padStart(5, '0')}`,
      requestType: 'UPDATE',
      equipmentNumber: eq.equipmentNumber,
      equipmentClass: eq.equipmentClass,
      facility: eq.facility,
      area: eq.area,
      fieldName,
      oldValue: old === undefined || old === null ? undefined : String(old),
      newValue,
      reason,
      attributeGroup: group,
      source,
      status,
      requestedBy,
      submittedAt: new Date(now.getTime() - ageHours * 3_600_000),
      ...extra,
    };
  };

  const decided = (hoursAgo: number, by: string, note: string) => ({
    decidedBy: by,
    decidedAt: new Date(now.getTime() - hoursAgo * 3_600_000),
    decisionNote: note,
  });

  const requests: SeedRequest[] = [
    req(1041, 'H2', 'heatDutyMmbtu', '1.75', 'Nameplate photo from field verification shows 1.75 MMBtu/hr.', 'AIR_QUALITY', 'TRUECONTEXT', 'PENDING', 'J. Ramirez (Production Tech)', 3),
    req(1042, 'H4', 'firedOrUnfired', 'FIRED', 'Line heater is gas fired; field confirmed burner on site.', 'AIR_QUALITY', 'TRUECONTEXT', 'PENDING', 'J. Ramirez (Production Tech)', 3),
    req(1043, 'C14', 'serialNumber', 'F-22355', 'EquipmentIQ read the frame nameplate: serial F-22355. SAP shows F-21837, which already belongs to another unit.', 'CORE_SAP', 'EQUIPMENTIQ', 'PENDING', 'EquipmentIQ (AI steward)', 6),
    // One field visit after an engine swap on 10412303: four related changes, reviewed together (Day 1 ask: group by equipment, bulk approve).
    req(1044, 'C3', 'engineModel', 'CAT G3516', 'Engine swap completed by vendor last week; new engine is a G3516.', 'MECHANICAL', 'TRUECONTEXT', 'PENDING', 'M. Ortiz (Facilities Engineer)', 20),
    req(1050, 'C3', 'engineSerial', 'JEF04512', 'Engine swap: serial from the new engine nameplate.', 'MECHANICAL', 'TRUECONTEXT', 'PENDING', 'M. Ortiz (Facilities Engineer)', 20),
    req(1051, 'C3', 'horsepower', '1380', 'Engine swap: G3516 is rated 1,380 hp at site conditions.', 'MECHANICAL', 'TRUECONTEXT', 'PENDING', 'M. Ortiz (Facilities Engineer)', 20),
    req(1052, 'C3', 'airPermitNumber', 'AQ-DTX-3521', 'Engine swap needed a permit update; new permit number from the air team.', 'AIR_QUALITY', 'TRUECONTEXT', 'PENDING', 'M. Ortiz (Facilities Engineer)', 20),
    req(1045, 'C17', 'pidTag', 'C-117', 'Matches P&ID drawing for the station. Free-text tag replaced.', 'CORE_SAP', 'ATLAS', 'PENDING', 'S. Na (Facilities Engineer)', 26),
    req(1046, 'H12', 'heatDutyMmbtu', '2.40', 'Taken from the vendor data sheet for the line heater burner (attached).', 'AIR_QUALITY', 'BULK_UPLOAD', 'PENDING', 'A. Patel (Air Quality)', 30),
    req(1047, 'H16', 'airPermitNumber', 'AQ-MID-3416', 'Permit issued last month; adding to equipment record.', 'AIR_QUALITY', 'ATLAS', 'PENDING', 'A. Patel (Air Quality)', 50),
    req(1048, 'C22', 'piTagRoute', 'DNM.RDTK.CMP3654', 'Mapped PI tag route from the control room naming.', 'OPERATIONS', 'ATLAS', 'PENDING', 'R. Lee (Control Room)', 52),
    req(1049, 'C8', 'horsepower', '690', 'Rated HP from frame/engine combination.', 'MECHANICAL', 'TRUECONTEXT', 'RETURNED', 'J. Ramirez (Production Tech)', 70, decided(60, 'B. Clark', 'Please attach the engine nameplate photo.')),
    req(1031, 'H7', 'heatDutyMmbtu', '1.10', 'From burner management data sheet.', 'AIR_QUALITY', 'ATLAS', 'APPROVED', 'A. Patel (Air Quality)', 96, decided(80, 'B. Clark', 'Matches vendor sheet.')),
    req(1032, 'C11', 'pidTag', 'C-110', 'Tag read from the P&ID during walkdown.', 'CORE_SAP', 'TRUECONTEXT', 'APPROVED', 'J. Ramirez (Production Tech)', 100, decided(84, 'S. Na', 'Approved.')),
    req(1033, 'H9', 'firedOrUnfired', 'FIRED', 'Fired heater per site walkdown.', 'AIR_QUALITY', 'TRUECONTEXT', 'APPROVED', 'J. Ramirez (Production Tech)', 110, decided(90, 'A. Patel', 'Approved.')),
    req(1021, 'C20', 'airPermitNumber', 'AQ-DTX-1220', 'Permit number added.', 'AIR_QUALITY', 'ATLAS', 'SYNCED', 'A. Patel (Air Quality)', 220, { ...decided(200, 'A. Patel', 'ATLAS-only attribute.'), syncedAt: new Date(now.getTime() - 200 * 3_600_000) }),
    req(1022, 'C5', 'engineSerial', 'CAT5215000', 'Engine serial corrected from photo.', 'MECHANICAL', 'TRUECONTEXT', 'SYNCED', 'J. Ramirez (Production Tech)', 260, { ...decided(240, 'B. Clark', 'Approved.'), evolveBatch: 'EVL202610280900', sentToSapAt: new Date(now.getTime() - 230 * 3_600_000), syncedAt: new Date(now.getTime() - 210 * 3_600_000) }),
    req(1023, 'H1', 'model', 'LH-60', 'Requested model change.', 'CORE_SAP', 'ATLAS', 'REJECTED', 'R. Lee (Control Room)', 300, decided(280, 'S. Na', 'Nameplate shows LH-48; no change needed.')),
  ];

  const approvers: SeedApprover[] = [];
  for (const a of AREAS) {
    approvers.push({ attributeGroup: 'CORE_SAP', area: a.area, approver: 'S. Na', delegate: 'B. Clark', slaHours: 48 });
    approvers.push({ attributeGroup: 'MECHANICAL', area: a.area, approver: 'B. Clark', delegate: 'M. Ortiz', slaHours: 72 });
    approvers.push({ attributeGroup: 'AIR_QUALITY', area: a.area, approver: 'A. Patel', delegate: 'V. Gomez', slaHours: 48 });
    approvers.push({ attributeGroup: 'OPERATIONS', area: a.area, approver: a.code === 'MID' ? 'R. Lee' : 'D. Walker', delegate: 'B. Clark', slaHours: 24 });
  }

  // Sample evidence: bundled images/PDFs under /evidence (synthetic, labelled as samples).
  const evidence: SeedEvidence[] = [
    { key: 'H2', requestCode: 'CR-01041', kind: 'PHOTO', source: 'FIELD_PHOTO', title: 'Heater nameplate', caption: 'TrueContext submission TC-50112 · shows 1.75 MMBtu/hr', url: '/evidence/np-10412328.svg', mimeType: 'image/svg+xml', addedBy: 'J. Ramirez (Production Tech)', hoursAgo: 3 },
    { key: 'C14', requestCode: 'CR-01043', kind: 'PHOTO', source: 'EQUIPMENTIQ', title: 'Compressor frame nameplate', caption: 'Serial F-22355 read by EquipmentIQ (confidence 0.94)', url: '/evidence/np-10412314-frame.svg', mimeType: 'image/svg+xml', addedBy: 'EquipmentIQ (AI steward)', hoursAgo: 6 },
    { key: 'H12', requestCode: 'CR-01046', kind: 'DOCUMENT', source: 'VENDOR_SHEET', title: 'Line heater data sheet', caption: 'Design heat duty 2.40 MMBtu/hr', url: '/evidence/ds-10412338.pdf', mimeType: 'application/pdf', addedBy: 'A. Patel (Air Quality)', hoursAgo: 30 },
    { key: 'H18', kind: 'PHOTO', source: 'FIELD_PHOTO', title: 'Reboiler nameplate', caption: 'Site visit photo · heat duty 1.50 MMBtu/hr', url: '/evidence/np-10412344.svg', mimeType: 'image/svg+xml', addedBy: 'J. Ramirez (Production Tech)', hoursAgo: 26 },
    { key: 'H18', kind: 'DOCUMENT', source: 'VENDOR_SHEET', title: 'Reboiler data sheet', caption: 'Design heat duty 1.50 MMBtu/hr', url: '/evidence/ds-10412344.pdf', mimeType: 'application/pdf', addedBy: 'S. Na (Facilities Engineer)', hoursAgo: 25 },
    { key: 'C3', requestCode: 'CR-01044', kind: 'PHOTO', source: 'FIELD_PHOTO', title: 'New engine nameplate', caption: 'After engine swap · CAT G3516 · JEF04512 · 1380 BHP', url: '/evidence/np-10412303-engine.svg', mimeType: 'image/svg+xml', addedBy: 'M. Ortiz (Facilities Engineer)', hoursAgo: 20 },
    { key: 'C8', kind: 'PHOTO', source: 'FIELD_PHOTO', title: 'Engine nameplate', caption: 'CAT G3508 · 690 BHP', url: '/evidence/np-10412308-engine.svg', mimeType: 'image/svg+xml', addedBy: 'J. Ramirez (Production Tech)', hoursAgo: 40 },
  ];

  return { equipment, aliases, rules, requests, approvers, evidence };
}

/** The scripted EquipmentIQ scenario (simulated extraction from a sample nameplate). */
export const IQ_SAMPLE = {
  title: 'Stack pack nameplate — Eagle Draw CTB',
  url: '/evidence/np-10412341.svg',
  extracted: [
    { field: 'manufacturer', label: 'Manufacturer', value: 'CIMARRON', confidence: 0.98 },
    { field: 'model', label: 'Model', value: 'SP-36', confidence: 0.96 },
    { field: 'serialNumber', label: 'Serial no.', value: 'CI88795', confidence: 0.93 },
    { field: 'pidTag', label: 'Tag', value: 'SP-215', confidence: 0.9 },
    { field: 'heatDutyMmbtu', label: 'Heat input (MMBtu/hr)', value: '2.99', confidence: 0.88 },
    { field: 'firedOrUnfired', label: 'Burner', value: 'FIRED', confidence: 0.91 },
  ],
} as const;
