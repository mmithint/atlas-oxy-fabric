import { authenticated, boolean, entity, set, text, uuid } from '@microsoft/rayfin-core';

/** Governed business rules, kept as data rather than code (EquipmentIQ rule store). */
@entity()
@authenticated('*')
export class BusinessRule {
  @uuid() id!: string;
  @text({ max: 30, unique: true }) ruleCode!: string;
  @set('COMPRESSOR', 'HEATER', 'ALL') equipmentClass!: 'COMPRESSOR' | 'HEATER' | 'ALL';
  @text({ max: 60 }) columnName!: string;
  @set('NOT_NULL', 'EQUALS', 'UNIQUE', 'PATTERN')
  checkType!: 'NOT_NULL' | 'EQUALS' | 'UNIQUE' | 'PATTERN';
  @text({ max: 100, optional: true }) expectedValue?: string;
  @text({ max: 200 }) description!: string;
  @set('CRITICAL', 'HIGH', 'MEDIUM') severity!: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  @text({ max: 100 }) owner!: string;
  @boolean() active!: boolean;
}
