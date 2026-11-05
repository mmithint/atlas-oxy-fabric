import { authenticated, date, entity, set, text, uuid } from '@microsoft/rayfin-core';

/** Append-only history of everything that happened to equipment data. */
@entity()
@authenticated('*')
export class AuditEvent {
  @uuid() id!: string;
  @set('REQUEST_SUBMITTED', 'RESUBMITTED', 'APPROVED', 'REJECTED', 'RETURNED', 'SENT_TO_SAP', 'SAP_LOADED', 'SAP_FAILED', 'SAP_SYNCED', 'EVIDENCE_ADDED', 'IQ_EXTRACTION', 'RULE_RUN', 'RULE_CHANGED', 'DATA_LOADED')
  eventType!:
    | 'REQUEST_SUBMITTED'
    | 'RESUBMITTED'
    | 'SAP_LOADED'
    | 'SAP_FAILED'
    | 'EVIDENCE_ADDED'
    | 'IQ_EXTRACTION'
    | 'APPROVED'
    | 'REJECTED'
    | 'RETURNED'
    | 'SENT_TO_SAP'
    | 'SAP_SYNCED'
    | 'RULE_RUN'
    | 'RULE_CHANGED'
    | 'DATA_LOADED';
  @text({ max: 20, optional: true }) equipmentNumber?: string;
  @text({ max: 20, optional: true }) requestCode?: string;
  @text({ max: 100 }) actor!: string;
  @text({ max: 400 }) details!: string;
  @date() occurredAt!: Date;
}
