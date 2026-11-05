import type {
  ApproverAssignmentRecord,
  AttributeGroup,
  AuditEventRecord,
  AuditEventType,
  BusinessRuleRecord,
  ChangeRequestRecord,
  EquipmentRecord,
  EvidenceRecord,
  RequestSource,
  RuleViolationRecord,
} from '@rayfin-app/shared';

import { getRayfinClient } from '@/lib/rayfin-client';

import { fieldDef } from './fields';
import type { Violation } from './rules';
import { buildSeedBundle } from './seed-data';

/** App-owned records (requests, approvals, rules, audit) live in the app's SQL database. */

async function db() {
  return (await getRayfinClient()).data;
}

async function all<T>(
  page: (after?: string) => Promise<{ items: T[]; hasNextPage: boolean; endCursor?: string | null }>
): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  for (let guard = 0; guard < 200; guard++) {
    const p = await page(cursor);
    out.push(...p.items);
    if (!p.hasNextPage || !p.endCursor) break;
    cursor = p.endCursor;
  }
  return out;
}

async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

const REQUEST_FIELDS = [
  'id', 'requestCode', 'requestType', 'equipmentNumber', 'equipmentClass', 'facility', 'area',
  'fieldName', 'oldValue', 'newValue', 'reason', 'attributeGroup', 'source', 'status',
  'requestedBy', 'submittedAt', 'assignedApprover', 'decidedBy', 'decidedAt', 'decisionNote',
  'evolveBatch', 'sentToSapAt', 'syncedAt', 'revision', 'proposedRecord', 'sapMessage',
] as const;

export async function listRequests(): Promise<ChangeRequestRecord[]> {
  const d = await db();
  const rows = await all((after) => {
    let q = d.ChangeRequest.select([...REQUEST_FIELDS]).orderBy({ submittedAt: 'desc' }).first(500);
    if (after) q = q.after(after);
    return q.executePaginated();
  });
  return (rows as unknown as ChangeRequestRecord[]).map(fixRequestDates);
}

function fixRequestDates(r: ChangeRequestRecord): ChangeRequestRecord {
  const d = (v?: Date | string | null) => (v ? new Date(v) : undefined);
  return {
    ...r,
    oldValue: r.oldValue ?? undefined,
    proposedRecord: r.proposedRecord ?? undefined,
    sapMessage: r.sapMessage ?? undefined,
    revision: r.revision ?? 1,
    submittedAt: new Date(r.submittedAt),
    decidedAt: d(r.decidedAt),
    sentToSapAt: d(r.sentToSapAt),
    syncedAt: d(r.syncedAt),
  };
}

export async function listRules(): Promise<BusinessRuleRecord[]> {
  const d = await db();
  const rows = await d.BusinessRule.select([
    'id', 'ruleCode', 'equipmentClass', 'columnName', 'checkType', 'expectedValue',
    'description', 'severity', 'owner', 'active',
  ])
    .orderBy({ ruleCode: 'asc' })
    .first(1000)
    .execute();
  return rows as unknown as BusinessRuleRecord[];
}

export async function listApprovers(): Promise<ApproverAssignmentRecord[]> {
  const d = await db();
  const rows = await d.ApproverAssignment.select(['id', 'attributeGroup', 'area', 'approver', 'delegate', 'slaHours'])
    .orderBy({ area: 'asc' })
    .first(1000)
    .execute();
  return rows as unknown as ApproverAssignmentRecord[];
}

export async function listAudit(): Promise<AuditEventRecord[]> {
  const d = await db();
  const rows = await all((after) => {
    let q = d.AuditEvent.select(['id', 'eventType', 'equipmentNumber', 'requestCode', 'actor', 'details', 'occurredAt'])
      .orderBy({ occurredAt: 'desc' })
      .first(500);
    if (after) q = q.after(after);
    return q.executePaginated();
  });
  return (rows as unknown as AuditEventRecord[]).map((a) => ({ ...a, occurredAt: new Date(a.occurredAt) }));
}

export async function listViolations(): Promise<RuleViolationRecord[]> {
  const d = await db();
  const rows = await all((after) => {
    let q = d.RuleViolation.select(['id', 'runId', 'runDate', 'rule_id', 'ruleCode', 'equipmentNumber', 'equipmentClass', 'violation', 'severity'])
      .orderBy({ runDate: 'desc' })
      .first(1000);
    if (after) q = q.after(after);
    return q.executePaginated();
  });
  return (rows as unknown as RuleViolationRecord[]).map((v) => ({ ...v, runDate: new Date(v.runDate) }));
}

export async function logAudit(
  eventType: AuditEventType,
  actor: string,
  details: string,
  refs: { equipmentNumber?: string; requestCode?: string } = {},
  occurredAt: Date = new Date()
) {
  const d = await db();
  await d.AuditEvent.create({ eventType, actor, details: details.slice(0, 400), occurredAt, ...refs });
}

/* ---------------------------- Seeding --------------------------------- */

let seeding: Promise<boolean> | undefined;

/** Idempotent: seeds rules, RACI and sample requests the first time the app opens. */
export function seedIfEmpty(actor: string): Promise<boolean> {
  if (!seeding) {
    seeding = doSeed(actor).catch((e) => {
      seeding = undefined;
      throw e;
    });
  }
  return seeding;
}

async function doSeed(actor: string): Promise<boolean> {
  const d = await db();
  const existing = await d.BusinessRule.select(['id']).first(1).execute();
  if (existing.length > 0) return false;

  const bundle = buildSeedBundle(new Date());
  await inBatches(bundle.rules, 6, (r) => d.BusinessRule.create(r));
  await inBatches(bundle.approvers, 6, (a) => d.ApproverAssignment.create(a));
  await inBatches(bundle.requests, 5, (r) => {
    const { key: _key, ...rest } = r;
    void _key;
    const approver = bundle.approvers.find((a) => a.attributeGroup === r.attributeGroup && a.area === r.area);
    return d.ChangeRequest.create({ ...rest, revision: 1, assignedApprover: approver?.approver });
  });
  const keyToNo = new Map(bundle.equipment.map((e) => [e.key, e.equipmentNumber]));
  const now = Date.now();
  await inBatches(bundle.evidence, 6, (ev) =>
    d.Evidence.create({
      equipmentNumber: keyToNo.get(ev.key),
      requestCode: ev.requestCode,
      kind: ev.kind,
      source: ev.source,
      title: ev.title,
      caption: ev.caption,
      url: ev.url,
      mimeType: ev.mimeType,
      chunkCount: 0,
      addedBy: ev.addedBy,
      addedAt: new Date(now - ev.hoursAgo * 3_600_000),
    })
  );
  // Back-filled timeline so seeded requests have a history.
  const events: Parameters<typeof logAudit>[] = [];
  for (const r of bundle.requests) {
    const refs = { equipmentNumber: r.equipmentNumber, requestCode: r.requestCode };
    events.push(['REQUEST_SUBMITTED', r.requestedBy, `${r.fieldName}: "${r.oldValue ?? 'blank'}" → "${r.newValue}". ${r.reason}`, refs, r.submittedAt]);
    if (r.decidedAt && r.decidedBy) {
      const t = r.status === 'REJECTED' ? 'REJECTED' : r.status === 'RETURNED' ? 'RETURNED' : 'APPROVED';
      events.push([t, r.decidedBy, `${t === 'APPROVED' ? 'Approved' : t === 'REJECTED' ? 'Rejected' : 'Returned for correction'} ${r.requestCode}${r.decisionNote ? `: ${r.decisionNote}` : ''}`, refs, r.decidedAt]);
    }
    if (r.sentToSapAt) events.push(['SENT_TO_SAP', 'SAP sync', `Included in Evolve batch ${r.evolveBatch}`, refs, r.sentToSapAt]);
    if (r.syncedAt) events.push(['SAP_SYNCED', 'Nightly refresh', `Confirmed: ${r.fieldName} = ${r.newValue}`, refs, r.syncedAt]);
  }
  await inBatches(events, 6, (e) => logAudit(...e));
  await logAudit('DATA_LOADED', actor, `Demo workspace initialised: ${bundle.rules.length} business rules, ${bundle.approvers.length} approver assignments, ${bundle.requests.length} sample requests.`);
  return true;
}

/** Rehearsal helper: wipes app-owned rows and re-seeds. Lakehouse data is untouched. */
export async function resetDemo(actor: string): Promise<void> {
  const d = await db();
  const wipe = async (ids: { id: string }[], del: (id: string) => Promise<unknown>) => inBatches(ids, 8, (x) => del(x.id));
  const [v, r, a, ru, ap, ev, ch] = await Promise.all([
    all((after) => { let q = d.RuleViolation.select(['id']).first(1000); if (after) q = q.after(after); return q.executePaginated(); }),
    all((after) => { let q = d.ChangeRequest.select(['id']).first(1000); if (after) q = q.after(after); return q.executePaginated(); }),
    all((after) => { let q = d.AuditEvent.select(['id']).first(1000); if (after) q = q.after(after); return q.executePaginated(); }),
    d.BusinessRule.select(['id']).first(1000).execute(),
    d.ApproverAssignment.select(['id']).first(1000).execute(),
    all((after) => { let q = d.Evidence.select(['id']).first(1000); if (after) q = q.after(after); return q.executePaginated(); }),
    all((after) => { let q = d.EvidenceChunk.select(['id']).first(1000); if (after) q = q.after(after); return q.executePaginated(); }),
  ]);
  await wipe(ch as { id: string }[], (id) => d.EvidenceChunk.delete({ id }));
  await wipe(ev as { id: string }[], (id) => d.Evidence.delete({ id }));
  await wipe(v as { id: string }[], (id) => d.RuleViolation.delete({ id }));
  await wipe(r as { id: string }[], (id) => d.ChangeRequest.delete({ id }));
  await wipe(a as { id: string }[], (id) => d.AuditEvent.delete({ id }));
  await wipe(ru as { id: string }[], (id) => d.BusinessRule.delete({ id }));
  await wipe(ap as { id: string }[], (id) => d.ApproverAssignment.delete({ id }));
  seeding = undefined;
  await seedIfEmpty(actor);
}

/* ------------------------- Request workflow --------------------------- */

export function nextRequestCode(existing: ChangeRequestRecord[]): string {
  const max = existing.reduce((m, r) => Math.max(m, Number(r.requestCode.replace(/\D/g, '')) || 0), 1000);
  return `CR-${String(max + 1).padStart(5, '0')}`;
}

export function approverFor(
  approvers: ApproverAssignmentRecord[],
  group: AttributeGroup,
  area: string
): ApproverAssignmentRecord | undefined {
  return approvers.find((a) => a.attributeGroup === group && a.area === area);
}

export async function submitRequest(input: {
  equipment: EquipmentRecord;
  fieldName: string;
  oldValue?: string;
  newValue: string;
  reason: string;
  source: RequestSource;
  requestedBy: string;
  existing: ChangeRequestRecord[];
  approvers: ApproverAssignmentRecord[];
}): Promise<ChangeRequestRecord> {
  const def = fieldDef(input.fieldName);
  if (!def) throw new Error(`Unknown field ${input.fieldName}`);
  const code = nextRequestCode(input.existing);
  const approver = approverFor(input.approvers, def.group, input.equipment.area);
  const d = await db();
  const created = await d.ChangeRequest.create({
    requestCode: code,
    requestType: 'UPDATE',
    equipmentNumber: input.equipment.equipmentNumber,
    equipmentClass: input.equipment.equipmentClass,
    facility: input.equipment.facility,
    area: input.equipment.area,
    fieldName: input.fieldName,
    oldValue: input.oldValue,
    newValue: input.newValue,
    reason: input.reason,
    attributeGroup: def.group,
    source: input.source,
    status: 'PENDING',
    requestedBy: input.requestedBy,
    submittedAt: new Date(),
    assignedApprover: approver?.approver,
  });
  await logAudit(
    'REQUEST_SUBMITTED',
    input.requestedBy,
    `${def.label}: "${input.oldValue ?? 'blank'}" → "${input.newValue}". Routed to ${approver?.approver ?? 'unassigned'}.`,
    { equipmentNumber: input.equipment.equipmentNumber, requestCode: code }
  );
  return fixRequestDates(created as unknown as ChangeRequestRecord);
}

export async function decideRequest(
  req: ChangeRequestRecord,
  decision: 'APPROVED' | 'REJECTED' | 'RETURNED',
  actor: string,
  note: string
) {
  const d = await db();
  const def = fieldDef(req.fieldName);
  const ataOnly = decision === 'APPROVED' && req.requestType === 'UPDATE' && !!def && !def.sap;
  await d.ChangeRequest.update(
    { id: req.id },
    {
      // ATLAS-only attributes never go to SAP, so an approval completes them.
      status: ataOnly ? 'SYNCED' : decision,
      decidedBy: actor,
      decidedAt: new Date(),
      decisionNote: note || undefined,
      ...(ataOnly ? { syncedAt: new Date(), sapMessage: 'ATLAS-only attribute — no SAP load required' } : {}),
    }
  );
  const verb = decision === 'APPROVED' ? 'Approved' : decision === 'REJECTED' ? 'Rejected' : 'Returned for correction';
  await logAudit(
    decision,
    actor,
    `${verb} ${req.requestCode}${note ? `: ${note}` : ''}${ataOnly ? ' (ATLAS-only attribute, no SAP load needed)' : ''}`,
    { equipmentNumber: req.equipmentNumber, requestCode: req.requestCode }
  );
}

export async function markSentToSap(reqs: ChangeRequestRecord[], batch: string, actor: string) {
  const d = await db();
  const now = new Date();
  await inBatches(reqs, 6, (r) => d.ChangeRequest.update({ id: r.id }, { status: 'SENT_TO_SAP', evolveBatch: batch, sentToSapAt: now }));
  for (const r of reqs) {
    await logAudit('SENT_TO_SAP', actor, `Added to SAP upload file ${batch}`, { equipmentNumber: r.equipmentNumber, requestCode: r.requestCode });
  }
}

export async function markSynced(reqs: ChangeRequestRecord[], actor: string) {
  const d = await db();
  const now = new Date();
  await inBatches(reqs, 6, (r) => d.ChangeRequest.update({ id: r.id }, { status: 'SYNCED', syncedAt: now }));
  for (const r of reqs) {
    await logAudit('SAP_SYNCED', 'Nightly refresh (simulated)', `Refreshed SAP view shows ${r.fieldName} = ${r.newValue}; request closed automatically.`, { equipmentNumber: r.equipmentNumber, requestCode: r.requestCode });
  }
  void actor;
}

/**
 * Simulated SAP team load of an Evolve batch. A row is rejected when SAP
 * would refuse it — here: a technical ID (P&ID tag) or serial already used by
 * another equipment record. Everything else loads.
 */
export function simulatedSapResult(
  r: ChangeRequestRecord,
  gold: EquipmentRecord[]
): { ok: true; message: string } | { ok: false; message: string } {
  if (r.requestType === 'UPDATE' && (r.fieldName === 'pidTag' || r.fieldName === 'serialNumber')) {
    const clash = gold.find(
      (e) => e.equipmentNumber !== r.equipmentNumber && String((e as unknown as Record<string, unknown>)[r.fieldName] ?? '') === r.newValue
    );
    if (clash) {
      const what = r.fieldName === 'pidTag' ? 'Technical ID (TIDNR)' : 'Serial number (SERGE)';
      return { ok: false, message: `${what} ${r.newValue} is already used by equipment ${clash.equipmentNumber}.` };
    }
  }
  return { ok: true, message: `Loaded in SAP batch ${r.evolveBatch ?? ''}`.trim() };
}

export async function simulateSapLoad(reqs: ChangeRequestRecord[], gold: EquipmentRecord[], actor: string) {
  const d = await db();
  for (const r of reqs) {
    const res = simulatedSapResult(r, gold);
    await d.ChangeRequest.update({ id: r.id }, { status: res.ok ? 'SAP_LOADED' : 'SAP_FAILED', sapMessage: res.message.slice(0, 300) });
    await logAudit(res.ok ? 'SAP_LOADED' : 'SAP_FAILED', 'SAP team (simulated)', res.message, { equipmentNumber: r.equipmentNumber, requestCode: r.requestCode });
  }
  void actor;
}

/** SAP rejected the row: send it back to the requester with SAP's reason. */
export async function returnSapFailure(r: ChangeRequestRecord, actor: string) {
  const d = await db();
  const note = `SAP rejected the load: ${r.sapMessage ?? 'see SAP log'}`.slice(0, 300);
  await d.ChangeRequest.update({ id: r.id }, { status: 'RETURNED', decisionNote: note, decidedBy: actor, decidedAt: new Date() });
  await logAudit('RETURNED', actor, `Returned for correction after SAP failure — ${note}`, { equipmentNumber: r.equipmentNumber, requestCode: r.requestCode });
}

/** Requester corrects a returned request and sends it back for review. */
export async function resubmitRequest(r: ChangeRequestRecord, newValue: string, note: string, actor: string) {
  const d = await db();
  const revision = (r.revision ?? 1) + 1;
  await d.ChangeRequest.update(
    { id: r.id },
    {
      status: 'PENDING',
      newValue,
      reason: `${note} (rev ${revision}; previously: ${r.reason})`.slice(0, 500),
      revision,
      submittedAt: new Date(),
      evolveBatch: undefined,
      sapMessage: undefined,
    }
  );
  await logAudit('RESUBMITTED', actor, `Revision ${revision}: ${r.fieldName} → "${newValue}". ${note}`, { equipmentNumber: r.equipmentNumber, requestCode: r.requestCode });
}

/* ---------------------------- Evidence -------------------------------- */

const EVIDENCE_FIELDS = ['id', 'equipmentNumber', 'requestCode', 'kind', 'source', 'title', 'caption', 'url', 'mimeType', 'chunkCount', 'addedBy', 'addedAt'] as const;

export async function listEvidence(): Promise<EvidenceRecord[]> {
  const d = await db();
  const rows = await all((after) => {
    let q = d.Evidence.select([...EVIDENCE_FIELDS]).orderBy({ addedAt: 'desc' }).first(500);
    if (after) q = q.after(after);
    return q.executePaginated();
  });
  return (rows as unknown as EvidenceRecord[]).map((e) => ({ ...e, addedAt: new Date(e.addedAt), url: e.url ?? undefined, caption: e.caption ?? undefined }));
}

const CHUNK = 3800;

/** Stores a (downscaled) photo as base64 chunks in the app database. */
export async function addEvidencePhoto(input: {
  dataUrl: string;
  title: string;
  caption?: string;
  equipmentNumber?: string;
  requestCode?: string;
  actor: string;
}): Promise<EvidenceRecord> {
  const d = await db();
  const [meta, b64] = input.dataUrl.split(',', 2);
  const mimeType = /data:([^;]+)/.exec(meta)?.[1] ?? 'image/jpeg';
  const parts: string[] = [];
  for (let i = 0; i < b64.length; i += CHUNK) parts.push(b64.slice(i, i + CHUNK));
  const ev = await d.Evidence.create({
    equipmentNumber: input.equipmentNumber,
    requestCode: input.requestCode,
    kind: 'PHOTO',
    source: 'UPLOAD',
    title: input.title.slice(0, 120),
    caption: input.caption?.slice(0, 300),
    mimeType,
    chunkCount: parts.length,
    addedBy: input.actor,
    addedAt: new Date(),
  });
  await inBatches(parts.map((data, seq) => ({ data, seq })), 6, (p) => d.EvidenceChunk.create({ evidence_id: ev.id, seq: p.seq, data: p.data }));
  await logAudit('EVIDENCE_ADDED', input.actor, `Photo "${input.title}" attached`, { equipmentNumber: input.equipmentNumber, requestCode: input.requestCode });
  return { ...(ev as unknown as EvidenceRecord), addedAt: new Date() };
}

/** Links an existing evidence item to a request (copies the row; files are shared). */
export async function linkEvidence(ev: EvidenceRecord, requestCode: string, actor: string) {
  const d = await db();
  if (ev.requestCode === requestCode) return;
  if (!ev.requestCode) {
    await d.Evidence.update({ id: ev.id }, { requestCode });
  } else {
    await d.Evidence.create({
      equipmentNumber: ev.equipmentNumber,
      requestCode,
      kind: ev.kind,
      source: ev.source,
      title: ev.title,
      caption: ev.caption,
      url: ev.url,
      mimeType: ev.mimeType,
      chunkCount: 0,
      addedBy: actor,
      addedAt: new Date(),
    });
  }
  await logAudit('EVIDENCE_ADDED', actor, `"${ev.title}" attached as evidence`, { equipmentNumber: ev.equipmentNumber, requestCode });
}

const photoCache = new Map<string, Promise<string>>();

/** Resolves an evidence item to something an <img>/<a> can show. */
export function evidenceSrc(ev: EvidenceRecord): Promise<string> {
  if (ev.url) return Promise.resolve(ev.url);
  let p = photoCache.get(ev.id);
  if (!p) {
    p = (async () => {
      const d = await db();
      const rows = (await d.EvidenceChunk.select(['seq', 'data']).where({ evidence_id: { eq: ev.id } }).first(1000).execute()) as unknown as { seq: number; data: string }[];
      rows.sort((a, b) => a.seq - b.seq);
      return `data:${ev.mimeType};base64,${rows.map((r) => r.data).join('')}`;
    })();
    photoCache.set(ev.id, p);
  }
  return p;
}

/* ------------------------- New equipment ------------------------------ */

export interface ProposedEquipment {
  equipmentClass: 'COMPRESSOR' | 'HEATER';
  equipmentSubtype: string;
  facility: string;
  area: string;
  floc: string;
  pidTag: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  heatDutyMmbtu?: number;
  firedOrUnfired?: 'FIRED' | 'UNFIRED';
  horsepower?: number;
  engineModel?: string;
}

export function nextNewEquipmentNumber(existing: ChangeRequestRecord[]): string {
  const n = existing.filter((r) => r.requestType === 'NEW_RECORD').length + 1;
  return `NEW-${String(n).padStart(4, '0')}`;
}

export async function submitNewRecord(input: {
  proposed: ProposedEquipment;
  reason: string;
  duplicateNote: string;
  actor: string;
  existing: ChangeRequestRecord[];
  approvers: ApproverAssignmentRecord[];
}): Promise<ChangeRequestRecord> {
  const d = await db();
  const code = nextRequestCode(input.existing);
  const tempNo = nextNewEquipmentNumber(input.existing);
  const approver = approverFor(input.approvers, 'CORE_SAP', input.proposed.area);
  const created = await d.ChangeRequest.create({
    requestCode: code,
    requestType: 'NEW_RECORD',
    equipmentNumber: tempNo,
    equipmentClass: input.proposed.equipmentClass,
    facility: input.proposed.facility,
    area: input.proposed.area,
    fieldName: 'NEW_RECORD',
    newValue: `${input.proposed.equipmentSubtype} ${input.proposed.pidTag} · S/N ${input.proposed.serialNumber}`.slice(0, 200),
    reason: `${input.reason} — Duplicate check: ${input.duplicateNote}`.slice(0, 500),
    attributeGroup: 'CORE_SAP',
    source: 'ATLAS',
    status: 'PENDING',
    requestedBy: input.actor,
    submittedAt: new Date(),
    assignedApprover: approver?.approver,
    revision: 1,
    proposedRecord: JSON.stringify(input.proposed).slice(0, 3000),
  });
  await logAudit('REQUEST_SUBMITTED', input.actor, `New ${input.proposed.equipmentClass.toLowerCase()} requested at ${input.proposed.facility} (${input.proposed.pidTag}). ${input.duplicateNote}`, { equipmentNumber: tempNo, requestCode: code });
  return fixRequestDates(created as unknown as ChangeRequestRecord);
}

/* ---------------------------- Rules ---------------------------------- */

export async function setRuleActive(rule: BusinessRuleRecord, active: boolean, actor: string) {
  const d = await db();
  await d.BusinessRule.update({ id: rule.id }, { active });
  await logAudit('RULE_CHANGED', actor, `${rule.ruleCode} ${active ? 'activated' : 'deactivated'}: ${rule.description}`);
}

export async function saveRun(violations: Violation[], equipmentCount: number, actor: string): Promise<string> {
  const d = await db();
  const now = new Date();
  const runId = `RUN-${now.toISOString().replace(/[-:T]/g, '').slice(0, 12)}`;
  await inBatches(violations, 8, (v) =>
    d.RuleViolation.create({
      runId,
      runDate: now,
      rule_id: v.ruleId,
      ruleCode: v.ruleCode,
      equipmentNumber: v.equipmentNumber,
      equipmentClass: v.equipmentClass,
      violation: v.violation.slice(0, 200),
      severity: v.severity,
    })
  );
  const units = new Set(violations.map((v) => v.equipmentNumber)).size;
  await logAudit('RULE_RUN', actor, `${runId}: ${violations.length} violation(s) on ${units} of ${equipmentCount} records.`);
  return runId;
}
