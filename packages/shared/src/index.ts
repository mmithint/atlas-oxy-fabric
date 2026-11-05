/**
 * Browser-safe contracts shared by the data registration package and frontend.
 *
 * Keep each record shape aligned with its decorated runtime entity in
 * `@rayfin-app/data`. This package must stay isomorphic, so do not import the
 * decorated classes here.
 */

export type EquipmentClass = 'COMPRESSOR' | 'HEATER';
export type VerificationStatus = 'VERIFIED' | 'CORRECTION_REQUIRED' | 'NOT_VERIFIED';
export type AttributeGroup = 'CORE_SAP' | 'MECHANICAL' | 'AIR_QUALITY' | 'OPERATIONS';
export type RequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'SENT_TO_SAP'
  | 'SAP_LOADED'
  | 'SAP_FAILED'
  | 'SYNCED';
export type RequestSource = 'ATLAS' | 'TRUECONTEXT' | 'BULK_UPLOAD' | 'EQUIPMENTIQ';
export type AliasSystem = 'SAP' | 'PID' | 'PI' | 'FIELD' | 'FEXUS' | 'SUPPLY_CHAIN';
export type RuleCheckType = 'NOT_NULL' | 'EQUALS' | 'UNIQUE' | 'PATTERN';
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM';
export type AuditEventType =
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

/** Gold-layer equipment master row, read from the Lakehouse (not an app entity). */
export interface EquipmentRecord {
  equipmentNumber: string;
  atlasId: string;
  equipmentClass: EquipmentClass;
  equipmentSubtype?: string;
  description: string;
  floc: string;
  facility: string;
  area: string;
  pidTag?: string;
  piTagRoute?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  engineModel?: string;
  engineSerial?: string;
  horsepower?: number;
  stages?: number;
  heatDutyMmbtu?: number;
  firedOrUnfired?: 'FIRED' | 'UNFIRED';
  airPermitNumber?: string;
  latitude?: number;
  longitude?: number;
  status: 'ACTIVE' | 'INACTIVE';
  verificationStatus: VerificationStatus;
  lastVerifiedAt?: Date;
  sourceSystems: string;
  goldLoadedAt: Date;
}

/** Gold-layer identity cross-reference row (what each system calls the unit). */
export interface EquipmentAliasRecord {
  equipmentNumber: string;
  system: AliasSystem;
  aliasValue: string;
}

export interface ChangeRequestRecord {
  id: string;
  requestCode: string;
  requestType: 'UPDATE' | 'NEW_RECORD';
  equipmentNumber: string;
  equipmentClass: string;
  facility: string;
  area: string;
  fieldName: string;
  oldValue?: string;
  newValue: string;
  reason: string;
  attributeGroup: AttributeGroup;
  source: RequestSource;
  status: RequestStatus;
  requestedBy: string;
  submittedAt: Date;
  assignedApprover?: string;
  decidedBy?: string;
  decidedAt?: Date;
  decisionNote?: string;
  evolveBatch?: string;
  sentToSapAt?: Date;
  syncedAt?: Date;
  revision?: number;
  proposedRecord?: string;
  sapMessage?: string;
}

export interface EvidenceRecord {
  id: string;
  equipmentNumber?: string;
  requestCode?: string;
  kind: 'PHOTO' | 'DOCUMENT';
  source: 'FIELD_PHOTO' | 'VENDOR_SHEET' | 'EQUIPMENTIQ' | 'UPLOAD';
  title: string;
  caption?: string;
  url?: string;
  mimeType: string;
  chunkCount: number;
  addedBy: string;
  addedAt: Date;
}

export interface EvidenceChunkRecord {
  id: string;
  evidence_id: string;
  seq: number;
  data: string;
}

export interface BusinessRuleRecord {
  id: string;
  ruleCode: string;
  equipmentClass: EquipmentClass | 'ALL';
  columnName: string;
  checkType: RuleCheckType;
  expectedValue?: string;
  description: string;
  severity: Severity;
  owner: string;
  active: boolean;
}

export interface RuleViolationRecord {
  id: string;
  runId: string;
  runDate: Date;
  rule_id: string;
  rule?: BusinessRuleRecord;
  ruleCode: string;
  equipmentNumber: string;
  equipmentClass: string;
  violation: string;
  severity: Severity;
}

export interface AuditEventRecord {
  id: string;
  eventType: AuditEventType;
  equipmentNumber?: string;
  requestCode?: string;
  actor: string;
  details: string;
  occurredAt: Date;
}

export interface ApproverAssignmentRecord {
  id: string;
  attributeGroup: AttributeGroup;
  area: string;
  approver: string;
  delegate?: string;
  slaHours: number;
}

export type UniversalAppSchema = {
  ChangeRequest: ChangeRequestRecord;
  BusinessRule: BusinessRuleRecord;
  RuleViolation: RuleViolationRecord;
  AuditEvent: AuditEventRecord;
  ApproverAssignment: ApproverAssignmentRecord;
  Evidence: EvidenceRecord;
  EvidenceChunk: EvidenceChunkRecord;
};
