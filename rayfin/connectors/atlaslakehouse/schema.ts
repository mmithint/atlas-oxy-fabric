import type { GraphQLBackedConnector } from '@microsoft/rayfin-connector-fabric-graphql';
import type { ConnectorConfig } from '@microsoft/rayfin-connectors';

import { GoldEquipmentAlias } from './GoldEquipmentAlias.js';
import { GoldEquipmentMaster } from './GoldEquipmentMaster.js';

export { GoldEquipmentAlias } from './GoldEquipmentAlias.js';
export { GoldEquipmentMaster } from './GoldEquipmentMaster.js';

// Lakehouse SQL endpoints are read-only.
export const connectorConfig = {
  connector: 'fabric-sqlanalytics',
  operations: ['read'],
  entities: { GoldEquipmentMaster, GoldEquipmentAlias },
} as const satisfies ConnectorConfig;

export type AtlasLakehouseSchema = GraphQLBackedConnector<
  { GoldEquipmentMaster: typeof GoldEquipmentMaster; GoldEquipmentAlias: typeof GoldEquipmentAlias },
  typeof connectorConfig
>;
