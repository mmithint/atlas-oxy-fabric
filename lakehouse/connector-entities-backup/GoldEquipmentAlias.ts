import { entity, text, role } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

/**
 * Lakehouse `gold_equipment_alias` (read-only, SQL analytics endpoint).
 * Pre-authored from the notebook's explicit Delta schema. After
 * `rayfin connector add`, check it against `metadata.json` (types, nullability)
 * and regenerate if they differ.
 */
@role('authenticated', ['read'])
@entity()
export class GoldEquipmentAlias extends Source({ schema: 'dbo', table: 'gold_equipment_alias', primaryKey: [] }) {
  @text({ column: 'equipment_number', max: 8000 }) equipmentNumber!: string;
  @text({ max: 8000 }) system!: string;
  @text({ column: 'alias_value', max: 8000 }) aliasValue!: string;
}
