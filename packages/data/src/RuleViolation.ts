import { authenticated, date, entity, one, set, text, uuid } from '@microsoft/rayfin-core';

import { BusinessRule } from './BusinessRule.js';

/** Audit table: one row per rule failure per validation run. */
@entity()
@authenticated('*')
export class RuleViolation {
  @uuid() id!: string;
  @text({ max: 30 }) runId!: string;
  @date() runDate!: Date;
  @uuid() rule_id!: string;
  @one(() => BusinessRule) rule?: BusinessRule;
  @text({ max: 30 }) ruleCode!: string;
  @text({ max: 20 }) equipmentNumber!: string;
  @text({ max: 20 }) equipmentClass!: string;
  @text({ max: 200 }) violation!: string;
  @set('CRITICAL', 'HIGH', 'MEDIUM') severity!: 'CRITICAL' | 'HIGH' | 'MEDIUM';
}
