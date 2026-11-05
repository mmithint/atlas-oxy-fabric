import type {
  ConnectorConfig,
  ConnectorsRuntime,
} from '@microsoft/rayfin-connectors';

import type { AtlasLakehouseSchema } from '../../../../rayfin/connectors/atlaslakehouse/schema';

/**
 * `atlaslakehouse` must match the connector `name` in rayfin/rayfin.yml
 * (the CLI lowercases connector names).
 *
 * The schema is imported as a type only. The runtime config lists field names
 * instead of the decorated entity classes: those classes live outside the
 * frontend package, so the bundler would ship their Stage-3 decorators
 * untransformed and the deployed bundle would not parse.
 */
export type AppConnectorsSchema = { atlaslakehouse: AtlasLakehouseSchema };

const MASTER_FIELDS = [
  'equipmentNumber', 'atlasId', 'equipmentClass', 'equipmentSubtype', 'description', 'floc',
  'facility', 'area', 'pidTag', 'piTagRoute', 'manufacturer', 'model', 'serialNumber',
  'engineModel', 'engineSerial', 'horsepower', 'stages', 'heatDutyMmbtu', 'firedOrUnfired',
  'airPermitNumber', 'latitude', 'longitude', 'status', 'verificationStatus', 'lastVerifiedAt',
  'sourceSystems', 'goldLoadedAt',
];

export const connectorConfigs = {
  atlaslakehouse: {
    connector: 'fabric-sqlanalytics',
    operations: ['read'],
    entities: {
      GoldEquipmentMaster: MASTER_FIELDS,
      GoldEquipmentAlias: ['equipmentNumber', 'system', 'aliasValue'],
    },
  },
} satisfies Record<string, ConnectorConfig>;

export const connectorRuntimes: ConnectorsRuntime = {};
