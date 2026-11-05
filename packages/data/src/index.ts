import { ApproverAssignment } from './ApproverAssignment.js';
import { AuditEvent } from './AuditEvent.js';
import { BusinessRule } from './BusinessRule.js';
import { ChangeRequest } from './ChangeRequest.js';
import { Evidence } from './Evidence.js';
import { EvidenceChunk } from './EvidenceChunk.js';
import { RuleViolation } from './RuleViolation.js';
import type { UniversalAppSchema } from '@rayfin-app/shared';

/**
 * ATLAS app-owned data (requests, approvals, rules, audit). Equipment master
 * data is read-only from the Lakehouse gold layer through the connector.
 * Keep in step with `UniversalAppSchema` in @rayfin-app/shared.
 */
export type { UniversalAppSchema };
export { ApproverAssignment, AuditEvent, BusinessRule, ChangeRequest, Evidence, EvidenceChunk, RuleViolation };

export const schema = [ChangeRequest, BusinessRule, RuleViolation, AuditEvent, ApproverAssignment, Evidence, EvidenceChunk];
