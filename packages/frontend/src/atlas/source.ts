import type {
  AliasSystem,
  EquipmentAliasRecord,
  EquipmentClass,
  EquipmentRecord,
  VerificationStatus,
} from '@rayfin-app/shared';

import { getRayfinClient } from '@/lib/rayfin-client';

/**
 * Reads the Gold layer from the ATLAS Lakehouse SQL endpoint through the
 * read-only `atlaslakehouse` connector.
 */

const MASTER_FIELDS = [
  'equipmentNumber',
  'atlasId',
  'equipmentClass',
  'equipmentSubtype',
  'description',
  'floc',
  'facility',
  'area',
  'pidTag',
  'piTagRoute',
  'manufacturer',
  'model',
  'serialNumber',
  'engineModel',
  'engineSerial',
  'horsepower',
  'stages',
  'heatDutyMmbtu',
  'firedOrUnfired',
  'airPermitNumber',
  'latitude',
  'longitude',
  'status',
  'verificationStatus',
  'lastVerifiedAt',
  'sourceSystems',
  'goldLoadedAt',
] as const;

type MasterRow = {
  equipmentNumber?: string | null;
  atlasId?: string | null;
  equipmentClass?: string | null;
  equipmentSubtype?: string | null;
  description?: string | null;
  floc?: string | null;
  facility?: string | null;
  area?: string | null;
  pidTag?: string | null;
  piTagRoute?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  engineModel?: string | null;
  engineSerial?: string | null;
  horsepower?: number | null;
  stages?: number | null;
  heatDutyMmbtu?: number | null;
  firedOrUnfired?: string | null;
  airPermitNumber?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status?: string | null;
  verificationStatus?: string | null;
  lastVerifiedAt?: Date | string | null;
  sourceSystems?: string | null;
  goldLoadedAt?: Date | string | null;
};

const u = <T,>(v: T | null | undefined): T | undefined => (v === null || v === '' ? undefined : v);
const toDate = (v: Date | string | null | undefined) => (v ? new Date(v) : undefined);

export function mapMasterRow(r: MasterRow): EquipmentRecord {
  return {
    equipmentNumber: r.equipmentNumber ?? '',
    atlasId: r.atlasId ?? '',
    equipmentClass: (r.equipmentClass ?? 'COMPRESSOR') as EquipmentClass,
    equipmentSubtype: u(r.equipmentSubtype),
    description: r.description ?? '',
    floc: r.floc ?? '',
    facility: r.facility ?? '',
    area: r.area ?? '',
    pidTag: u(r.pidTag),
    piTagRoute: u(r.piTagRoute),
    manufacturer: u(r.manufacturer),
    model: u(r.model),
    serialNumber: u(r.serialNumber),
    engineModel: u(r.engineModel),
    engineSerial: u(r.engineSerial),
    horsepower: u(r.horsepower),
    stages: u(r.stages),
    heatDutyMmbtu: u(r.heatDutyMmbtu),
    firedOrUnfired: u(r.firedOrUnfired) as EquipmentRecord['firedOrUnfired'],
    airPermitNumber: u(r.airPermitNumber),
    latitude: u(r.latitude),
    longitude: u(r.longitude),
    status: r.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
    verificationStatus: (r.verificationStatus ?? 'NOT_VERIFIED') as VerificationStatus,
    lastVerifiedAt: toDate(r.lastVerifiedAt),
    sourceSystems: r.sourceSystems ?? 'SAP',
    goldLoadedAt: r.goldLoadedAt ? new Date(r.goldLoadedAt) : new Date(0),
  };
}

/**
 * Lakehouse tables have no primary-key metadata, so the connector entities are
 * keyless; read them in one bounded page (POV volumes are tiny) rather than
 * relying on cursor paging.
 */
const MAX_ROWS = 50_000;

export async function loadEquipment(): Promise<EquipmentRecord[]> {
  const lh = (await getRayfinClient()).connectors.atlaslakehouse;
  const rows = await lh.GoldEquipmentMaster.select([...MASTER_FIELDS]).first(MAX_ROWS).execute();
  return (rows as unknown as MasterRow[])
    .filter((r) => r.equipmentNumber)
    .map(mapMasterRow)
    .sort((x, y) => x.equipmentNumber.localeCompare(y.equipmentNumber));
}

export async function loadAliases(): Promise<EquipmentAliasRecord[]> {
  const lh = (await getRayfinClient()).connectors.atlaslakehouse;
  const rows = await lh.GoldEquipmentAlias.select(['equipmentNumber', 'system', 'aliasValue']).first(MAX_ROWS).execute();
  const out: EquipmentAliasRecord[] = [];
  for (const r of rows as unknown as { equipmentNumber?: string | null; system?: string | null; aliasValue?: string | null }[]) {
    if (!r.equipmentNumber || !r.system || !r.aliasValue) continue;
    out.push({ equipmentNumber: r.equipmentNumber, system: r.system as AliasSystem, aliasValue: r.aliasValue });
  }
  return out;
}
