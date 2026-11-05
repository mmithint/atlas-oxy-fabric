import { entity, date, decimal, int, text, role } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

/**
 * Lakehouse `gold_equipment_master` (read-only, SQL analytics endpoint).
 * Matches metadata.json from `rayfin connector add`: every column nullable,
 * no PK metadata, so the entity is keyless (read via the query chain).
 */
@role('authenticated', ['read'])
@entity()
export class GoldEquipmentMaster extends Source({ schema: 'dbo', table: 'gold_equipment_master', primaryKey: [] }) {
  @text({ optional: true, column: 'equipment_number', max: 8000 }) equipmentNumber?: string;
  @text({ optional: true, column: 'atlas_id', max: 8000 }) atlasId?: string;
  @text({ optional: true, column: 'equipment_class', max: 8000 }) equipmentClass?: string;
  @text({ optional: true, column: 'equipment_subtype', max: 8000 }) equipmentSubtype?: string;
  @text({ optional: true, max: 8000 }) description?: string;
  @text({ optional: true, max: 8000 }) floc?: string;
  @text({ optional: true, max: 8000 }) facility?: string;
  @text({ optional: true, max: 8000 }) area?: string;
  @text({ optional: true, column: 'pid_tag', max: 8000 }) pidTag?: string;
  @text({ optional: true, column: 'pi_tag_route', max: 8000 }) piTagRoute?: string;
  @text({ optional: true, max: 8000 }) manufacturer?: string;
  @text({ optional: true, max: 8000 }) model?: string;
  @text({ optional: true, column: 'serial_number', max: 8000 }) serialNumber?: string;
  @text({ optional: true, column: 'engine_model', max: 8000 }) engineModel?: string;
  @text({ optional: true, column: 'engine_serial', max: 8000 }) engineSerial?: string;
  @int({ optional: true }) horsepower?: number;
  @int({ optional: true }) stages?: number;
  @decimal({ optional: true, column: 'heat_duty_mmbtu' }) heatDutyMmbtu?: number;
  @text({ optional: true, column: 'fired_or_unfired', max: 8000 }) firedOrUnfired?: string;
  @text({ optional: true, column: 'air_permit_number', max: 8000 }) airPermitNumber?: string;
  @decimal({ optional: true }) latitude?: number;
  @decimal({ optional: true }) longitude?: number;
  @text({ optional: true, max: 8000 }) status?: string;
  @text({ optional: true, column: 'verification_status', max: 8000 }) verificationStatus?: string;
  @date({ optional: true, column: 'last_verified_at' }) lastVerifiedAt?: Date;
  @text({ optional: true, column: 'source_systems', max: 8000 }) sourceSystems?: string;
  @date({ optional: true, column: 'gold_loaded_at' }) goldLoadedAt?: Date;
}
