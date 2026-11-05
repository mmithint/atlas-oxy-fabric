import { authenticated, date, entity, int, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * Backend request table: one proposed field change. Equipment itself lives in
 * the Lakehouse gold layer, so requests key on the SAP equipment number.
 */
@entity()
@authenticated('*')
export class ChangeRequest {
  @uuid() id!: string;
  @text({ max: 20, unique: true }) requestCode!: string;
  @set('UPDATE', 'NEW_RECORD') requestType!: 'UPDATE' | 'NEW_RECORD';
  @text({ max: 20 }) equipmentNumber!: string;
  @text({ max: 20 }) equipmentClass!: string;
  @text({ max: 80 }) facility!: string;
  @text({ max: 60 }) area!: string;
  @text({ max: 60 }) fieldName!: string;
  @text({ max: 200, optional: true }) oldValue?: string;
  @text({ max: 200 }) newValue!: string;
  @text({ max: 500 }) reason!: string;
  @set('CORE_SAP', 'MECHANICAL', 'AIR_QUALITY', 'OPERATIONS')
  attributeGroup!: 'CORE_SAP' | 'MECHANICAL' | 'AIR_QUALITY' | 'OPERATIONS';
  @set('ATLAS', 'TRUECONTEXT', 'BULK_UPLOAD', 'EQUIPMENTIQ')
  source!: 'ATLAS' | 'TRUECONTEXT' | 'BULK_UPLOAD' | 'EQUIPMENTIQ';
  @set('PENDING', 'APPROVED', 'REJECTED', 'RETURNED', 'SENT_TO_SAP', 'SAP_LOADED', 'SAP_FAILED', 'SYNCED')
  status!: 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED' | 'SENT_TO_SAP' | 'SAP_LOADED' | 'SAP_FAILED' | 'SYNCED';
  /** 1 on first submission; +1 on each resubmission after a return. */
  @int({ optional: true }) revision?: number;
  /** New-equipment requests: the proposed record as JSON. */
  @text({ max: 3000, optional: true }) proposedRecord?: string;
  /** Simulated SAP load result message (failure reason, or load reference). */
  @text({ max: 300, optional: true }) sapMessage?: string;
  @text({ max: 100 }) requestedBy!: string;
  @date() submittedAt!: Date;
  @text({ max: 100, optional: true }) assignedApprover?: string;
  @text({ max: 100, optional: true }) decidedBy?: string;
  @date({ optional: true }) decidedAt?: Date;
  @text({ max: 300, optional: true }) decisionNote?: string;
  @text({ max: 30, optional: true }) evolveBatch?: string;
  @date({ optional: true }) sentToSapAt?: Date;
  @date({ optional: true }) syncedAt?: Date;
}
