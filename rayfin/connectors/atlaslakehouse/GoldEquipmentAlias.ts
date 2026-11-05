import { entity, text, role } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

/**
 * Lakehouse `gold_equipment_alias` (read-only, SQL analytics endpoint).
 * Matches metadata.json from `rayfin connector add`: every column nullable,
 * no PK metadata, so the entity is keyless (read via the query chain).
 */
@role('authenticated', ['read'])
@entity()
export class GoldEquipmentAlias extends Source({ schema: 'dbo', table: 'gold_equipment_alias', primaryKey: [] }) {
  @text({ optional: true, column: 'equipment_number', max: 8000 }) equipmentNumber?: string;
  @text({ optional: true, max: 8000 }) system?: string;
  @text({ optional: true, column: 'alias_value', max: 8000 }) aliasValue?: string;
}
