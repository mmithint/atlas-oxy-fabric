import type { AttributeGroup, EquipmentClass, EquipmentRecord } from '@rayfin-app/shared';

export type EditableField = keyof Pick<
  EquipmentRecord,
  | 'pidTag'
  | 'serialNumber'
  | 'manufacturer'
  | 'model'
  | 'engineModel'
  | 'engineSerial'
  | 'horsepower'
  | 'stages'
  | 'heatDutyMmbtu'
  | 'firedOrUnfired'
  | 'airPermitNumber'
  | 'piTagRoute'
  | 'latitude'
  | 'longitude'
>;

export type FieldKind = 'text' | 'int' | 'decimal' | 'enum';

/** Where an approved value goes in SAP, if anywhere. */
export type SapTarget =
  | { template: 'EQUIPMENT_UPDATE'; sapField: string }
  | { template: 'CHARACTERISTICS'; characteristic: string; sapClass: string };

export interface FieldDef {
  key: EditableField;
  label: string;
  group: AttributeGroup;
  kind: FieldKind;
  options?: readonly string[];
  appliesTo: readonly EquipmentClass[];
  /** null = ATLAS-only attribute; never sent to SAP. */
  sap: SapTarget | null;
  unit?: string;
}

export const FIELD_DEFS: readonly FieldDef[] = [
  { key: 'pidTag', label: 'P&ID tag', group: 'CORE_SAP', kind: 'text', appliesTo: ['COMPRESSOR', 'HEATER'], sap: { template: 'EQUIPMENT_UPDATE', sapField: 'TIDNR' } },
  { key: 'serialNumber', label: 'Manufacturer serial no.', group: 'CORE_SAP', kind: 'text', appliesTo: ['COMPRESSOR', 'HEATER'], sap: { template: 'EQUIPMENT_UPDATE', sapField: 'SERGE' } },
  { key: 'manufacturer', label: 'Manufacturer', group: 'CORE_SAP', kind: 'text', appliesTo: ['COMPRESSOR', 'HEATER'], sap: { template: 'EQUIPMENT_UPDATE', sapField: 'HERST' } },
  { key: 'model', label: 'Model', group: 'CORE_SAP', kind: 'text', appliesTo: ['COMPRESSOR', 'HEATER'], sap: { template: 'EQUIPMENT_UPDATE', sapField: 'TYPBZ' } },
  { key: 'engineModel', label: 'Engine model', group: 'MECHANICAL', kind: 'text', appliesTo: ['COMPRESSOR'], sap: { template: 'CHARACTERISTICS', characteristic: 'CO_ENGINE_MODEL', sapClass: 'COMPRESSOR' } },
  { key: 'engineSerial', label: 'Engine serial no.', group: 'MECHANICAL', kind: 'text', appliesTo: ['COMPRESSOR'], sap: { template: 'CHARACTERISTICS', characteristic: 'CO_ENGINE_SERIAL', sapClass: 'COMPRESSOR' } },
  { key: 'horsepower', label: 'Rated horsepower', group: 'MECHANICAL', kind: 'int', unit: 'hp', appliesTo: ['COMPRESSOR'], sap: { template: 'CHARACTERISTICS', characteristic: 'CO_RATED_HP', sapClass: 'COMPRESSOR' } },
  { key: 'stages', label: 'Number of stages', group: 'MECHANICAL', kind: 'int', appliesTo: ['COMPRESSOR'], sap: { template: 'CHARACTERISTICS', characteristic: 'CO_STAGES', sapClass: 'COMPRESSOR' } },
  { key: 'heatDutyMmbtu', label: 'Heat duty', group: 'AIR_QUALITY', kind: 'decimal', unit: 'MMBtu/hr', appliesTo: ['HEATER'], sap: { template: 'CHARACTERISTICS', characteristic: 'VE_HEAT_DUTY', sapClass: 'VESSEL' } },
  { key: 'firedOrUnfired', label: 'Fired / unfired', group: 'AIR_QUALITY', kind: 'enum', options: ['FIRED', 'UNFIRED'], appliesTo: ['HEATER'], sap: { template: 'CHARACTERISTICS', characteristic: 'VE_FIRED_OR_UNFIRED', sapClass: 'VESSEL' } },
  { key: 'airPermitNumber', label: 'Air permit no.', group: 'AIR_QUALITY', kind: 'text', appliesTo: ['COMPRESSOR', 'HEATER'], sap: null },
  { key: 'piTagRoute', label: 'PI / SCADA tag route', group: 'OPERATIONS', kind: 'text', appliesTo: ['COMPRESSOR', 'HEATER'], sap: null },
  { key: 'latitude', label: 'Latitude', group: 'OPERATIONS', kind: 'decimal', appliesTo: ['COMPRESSOR', 'HEATER'], sap: null },
  { key: 'longitude', label: 'Longitude', group: 'OPERATIONS', kind: 'decimal', appliesTo: ['COMPRESSOR', 'HEATER'], sap: null },
];

export const GROUP_LABELS: Record<AttributeGroup, string> = {
  CORE_SAP: 'Core SAP',
  MECHANICAL: 'Mechanical',
  AIR_QUALITY: 'Air quality',
  OPERATIONS: 'Operations',
};

/** Where the source (Gold) value of an attribute comes from. */
export function sourceSystemFor(def: FieldDef): string {
  if (def.sap?.template === 'EQUIPMENT_UPDATE') return 'SAP equipment';
  if (def.sap?.template === 'CHARACTERISTICS') return 'SAP characteristics';
  if (def.key === 'airPermitNumber') return 'Intelex / Axe';
  if (def.key === 'piTagRoute') return 'PI tag cross-reference';
  return 'GIS';
}

export function fieldDef(key: string): FieldDef | undefined {
  return FIELD_DEFS.find((f) => f.key === key);
}

export function fieldsFor(cls: EquipmentClass): FieldDef[] {
  return FIELD_DEFS.filter((f) => f.appliesTo.includes(cls));
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  return String(value);
}

/** Validate and coerce a typed-in value. Returns an error message or the coerced value. */
export function parseFieldValue(
  def: FieldDef,
  raw: string
): { ok: true; value: string | number } | { ok: false; error: string } {
  const v = raw.trim();
  if (!v) return { ok: false, error: 'Enter a value.' };
  if (v.length > 200) return { ok: false, error: 'Keep it under 200 characters.' };
  switch (def.kind) {
    case 'int': {
      if (!/^\d+$/.test(v)) return { ok: false, error: 'Whole numbers only.' };
      return { ok: true, value: Number(v) };
    }
    case 'decimal': {
      if (!/^-?\d+(\.\d+)?$/.test(v)) return { ok: false, error: 'Numbers only.' };
      return { ok: true, value: v };
    }
    case 'enum': {
      const upper = v.toUpperCase();
      if (!def.options?.includes(upper))
        return { ok: false, error: `Choose one of ${def.options?.join(', ')}.` };
      return { ok: true, value: upper };
    }
    default:
      return { ok: true, value: v };
  }
}
