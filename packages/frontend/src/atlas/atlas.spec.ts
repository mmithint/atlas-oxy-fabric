import { describe, expect, it } from 'vitest';

import { fixture } from '@/test/atlas-fixture';

import { parseCsv, validateBulk } from './bulk';
import { buildEvolveFiles, toCsv } from './evolve';
import { applyApprovedChanges } from './overlay';
import { compliancePct, evaluateRules, normaliseSerial } from './rules';

describe('business rules', () => {
  const f = fixture();
  const v = evaluateRules(f.equipment, f.rules);

  it('flags heaters missing heat duty and fired status', () => {
    expect(v.filter((x) => x.ruleCode === 'HTR_02')).toHaveLength(4);
    // 3 blank + 1 UNFIRED
    expect(v.filter((x) => x.ruleCode === 'HTR_01')).toHaveLength(4);
  });

  it('finds the duplicate serial on both units', () => {
    const dup = v.filter((x) => x.ruleCode === 'ALL_01');
    expect(dup.map((x) => x.equipmentNumber).sort()).toEqual(['10412301', '10412314']);
  });

  it('normalises O/0 and dashes when matching serials', () => {
    expect(normaliseSerial('f-2O18')).toBe(normaliseSerial('F2018'));
  });

  it('flags free-text P&ID tags with the pattern rule', () => {
    expect(v.some((x) => x.ruleCode === 'ALL_03' && x.violation.includes('COMP 3 UNIT'))).toBe(true);
  });

  it('skips inactive rules', () => {
    const off = f.rules.map((r) => ({ ...r, active: false }));
    expect(evaluateRules(f.equipment, off)).toHaveLength(0);
  });

  it('computes compliance as share of clean records', () => {
    expect(compliancePct(4, [{ equipmentNumber: 'a' }, { equipmentNumber: 'a' }])).toBe(75);
  });
});

describe('approved changes overlay', () => {
  it('shows approved values before SAP and improves compliance', () => {
    const f = fixture();
    const before = evaluateRules(f.equipment, f.rules).length;
    const pending = f.requests.find((r) => r.requestCode === 'CR-01041')!;
    const approved = { ...pending, status: 'APPROVED' as const, decidedAt: new Date() };
    const eff = applyApprovedChanges(f.equipment, [approved]);
    const unit = eff.find((e) => e.equipmentNumber === approved.equipmentNumber)!;
    expect(unit.heatDutyMmbtu).toBe(1.75);
    expect(unit.pendingFields.heatDutyMmbtu.requestCode).toBe('CR-01041');
    expect(evaluateRules(eff, f.rules).length).toBe(before - 1);
  });

  it('ignores pending and rejected requests', () => {
    const f = fixture();
    const eff = applyApprovedChanges(f.equipment, f.requests.filter((r) => r.status === 'PENDING' || r.status === 'REJECTED'));
    expect(eff.every((e) => Object.keys(e.pendingFields).length === 0)).toBe(true);
  });
});

describe('Evolve export', () => {
  it('splits equipment fields and characteristics and leaves ATLAS-only fields out', () => {
    const f = fixture();
    const base = f.requests[0];
    const reqs = [
      { ...base, id: '1', requestCode: 'CR-1', fieldName: 'serialNumber', newValue: 'X1', status: 'APPROVED' as const },
      { ...base, id: '2', requestCode: 'CR-2', fieldName: 'heatDutyMmbtu', newValue: '2.5', status: 'APPROVED' as const },
      { ...base, id: '3', requestCode: 'CR-3', fieldName: 'airPermitNumber', newValue: 'AQ-1', status: 'APPROVED' as const },
    ];
    const { files, included, skipped } = buildEvolveFiles(reqs, 'EVL1');
    expect(files.map((x) => x.template)).toEqual(['EQUIPMENT_UPDATE', 'CHARACTERISTICS']);
    expect(included.map((r) => r.requestCode)).toEqual(['CR-1', 'CR-2']);
    expect(skipped.map((r) => r.requestCode)).toEqual(['CR-3']);
    expect(files[1].rows[0]).toContain('VE_HEAT_DUTY');
  });

  it('quotes CSV cells that need it', () => {
    expect(toCsv({ header: ['A'], rows: [['x, "y"']] })).toBe('A\r\n"x, ""y"""\r\n');
  });
});

describe('bulk upload', () => {
  it('parses quoted CSV', () => {
    expect(parseCsv('a,b\r\n"1,2","say ""hi"""\n')).toEqual([['a', 'b'], ['1,2', 'say "hi"']]);
  });

  it('validates rows against equipment and field rules', () => {
    const f = fixture();
    const csv = [
      'EQUIPMENT_NUMBER,FIELD,CURRENT_VALUE,NEW_VALUE,REASON',
      '10412328,heatDutyMmbtu,,2.2,from data sheet',
      '10412328,heatDutyMmbtu,,abc,',
      '99999999,model,,X,',
      '10412300,heatDutyMmbtu,,1,',
      '10412300,model,,,',
      '10412328,firedOrUnfired,,fired,',
    ].join('\n');
    const rows = validateBulk(csv, f.equipment, new Set());
    expect(rows.map((r) => r.status)).toEqual(['ready', 'error', 'error', 'error', 'skip', 'skip']);
  });

  it('rejects attributes that already have an open request', () => {
    const f = fixture();
    const csv = 'EQUIPMENT_NUMBER,FIELD,NEW_VALUE\n10412328,heatDutyMmbtu,2.2\n';
    const rows = validateBulk(csv, f.equipment, new Set(['10412328|heatDutyMmbtu']));
    expect(rows[0].status).toBe('error');
  });
});

describe('governed workflow additions', () => {
  it('ranks a same-serial unit at the facility as a likely duplicate', async () => {
    const { findDuplicateCandidates } = await import('./duplicates');
    const f = fixture();
    const c = findDuplicateCandidates({ equipmentClass: 'COMPRESSOR', facility: 'Falcon CTB', serialNumber: 'f-218O0', pidTag: 'H-230' }, f.equipment);
    expect(c[0].equipment.equipmentNumber).toBe('10412300');
    expect(c[0].strength).toBe('strong');
  });

  it('finds no duplicate for a genuinely new serial and tag', async () => {
    const { findDuplicateCandidates } = await import('./duplicates');
    const f = fixture();
    expect(findDuplicateCandidates({ equipmentClass: 'HEATER', facility: 'Falcon CTB', serialNumber: 'ZZ-1', pidTag: 'H-999' }, f.equipment).filter((x) => x.strength === 'strong')).toHaveLength(0);
  });

  it('simulated SAP load rejects a technical ID already used elsewhere', async () => {
    const { simulatedSapResult } = await import('./repo');
    const f = fixture();
    const r = f.requests.find((x) => x.requestCode === 'CR-01032')!;
    const res = simulatedSapResult(r, f.equipment);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('10412310');
    const ok = simulatedSapResult(f.requests.find((x) => x.requestCode === 'CR-01031')!, f.equipment);
    expect(ok.ok).toBe(true);
  });

  it('does not apply a value SAP rejected, and adds approved new equipment', () => {
    const f = fixture();
    const base = f.requests.find((x) => x.requestCode === 'CR-01041')!;
    const failed = { ...base, status: 'SAP_FAILED' as const, decidedAt: new Date() };
    expect(applyApprovedChanges(f.equipment, [failed]).find((e) => e.equipmentNumber === base.equipmentNumber)!.heatDutyMmbtu).toBeUndefined();
    const newReq = {
      ...base,
      id: 'n1',
      requestCode: 'CR-09999',
      requestType: 'NEW_RECORD' as const,
      equipmentNumber: 'NEW-0001',
      fieldName: 'NEW_RECORD',
      status: 'APPROVED' as const,
      proposedRecord: JSON.stringify({ equipmentClass: 'HEATER', equipmentSubtype: 'LINE HEATER', facility: 'Falcon CTB', area: 'x', floc: 'F', pidTag: 'H-230', manufacturer: 'A', model: 'B', serialNumber: 'S1' }),
    };
    const eff = applyApprovedChanges(f.equipment, [newReq]);
    expect(eff).toHaveLength(f.equipment.length + 1);
    expect(eff.at(-1)!.newRecordRequest).toBe('CR-09999');
    const { files } = buildEvolveFiles([newReq], 'B1');
    expect(files[0].template).toBe('EQUIPMENT_CREATE');
  });
});
