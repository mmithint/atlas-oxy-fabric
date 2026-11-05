import { authenticated, entity, int, set, text, uuid } from '@microsoft/rayfin-core';

/** RACI: who approves which attribute group in which area, with a delegate. */
@entity()
@authenticated('*')
export class ApproverAssignment {
  @uuid() id!: string;
  @set('CORE_SAP', 'MECHANICAL', 'AIR_QUALITY', 'OPERATIONS')
  attributeGroup!: 'CORE_SAP' | 'MECHANICAL' | 'AIR_QUALITY' | 'OPERATIONS';
  @text({ max: 60 }) area!: string;
  @text({ max: 100 }) approver!: string;
  @text({ max: 100, optional: true }) delegate?: string;
  @int() slaHours!: number;
}
