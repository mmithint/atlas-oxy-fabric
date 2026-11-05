import type { BusinessRuleRecord, EquipmentRecord, Severity } from '@rayfin-app/shared';

export interface Violation {
  ruleId: string;
  ruleCode: string;
  equipmentNumber: string;
  equipmentClass: string;
  violation: string;
  severity: Severity;
}

export type RuleInput = Pick<
  BusinessRuleRecord,
  'id' | 'ruleCode' | 'equipmentClass' | 'columnName' | 'checkType' | 'expectedValue' | 'description' | 'severity' | 'active'
>;

function readColumn(eq: EquipmentRecord, column: string): unknown {
  return (eq as unknown as Record<string, unknown>)[column];
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

/** Normalise serials so 0/O, 1/I and dashes don't hide true duplicates. */
export function normaliseSerial(v: string): string {
  return v.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/I/g, '1');
}

/**
 * Executes the active business rules against equipment records.
 * Rules are data (BusinessRule table), not code — same pattern as the
 * compression audit notebook, so stewards can add rules without a release.
 */
export function evaluateRules(equipment: EquipmentRecord[], rules: RuleInput[]): Violation[] {
  const out: Violation[] = [];
  for (const rule of rules) {
    if (!rule.active) continue;
    const scope = equipment.filter(
      (e) => rule.equipmentClass === 'ALL' || e.equipmentClass === rule.equipmentClass
    );
    const push = (e: EquipmentRecord, detail?: string) =>
      out.push({
        ruleId: rule.id,
        ruleCode: rule.ruleCode,
        equipmentNumber: e.equipmentNumber,
        equipmentClass: e.equipmentClass,
        violation: detail ? `${rule.description} (${detail})` : rule.description,
        severity: rule.severity,
      });

    switch (rule.checkType) {
      case 'NOT_NULL':
        for (const e of scope) if (isBlank(readColumn(e, rule.columnName))) push(e);
        break;
      case 'EQUALS':
        for (const e of scope) {
          const v = readColumn(e, rule.columnName);
          if (isBlank(v) || String(v) !== rule.expectedValue)
            push(e, `found ${isBlank(v) ? 'blank' : String(v)}`);
        }
        break;
      case 'PATTERN': {
        let re: RegExp | null = null;
        try {
          re = new RegExp(rule.expectedValue ?? '');
        } catch {
          re = null;
        }
        if (!re) break;
        for (const e of scope) {
          const v = readColumn(e, rule.columnName);
          if (!isBlank(v) && !re.test(String(v))) push(e, `found ${String(v)}`);
        }
        break;
      }
      case 'UNIQUE': {
        const groups = new Map<string, EquipmentRecord[]>();
        for (const e of scope) {
          const v = readColumn(e, rule.columnName);
          if (isBlank(v)) continue;
          const key = normaliseSerial(String(v));
          groups.set(key, [...(groups.get(key) ?? []), e]);
        }
        for (const list of groups.values()) {
          if (list.length < 2) continue;
          for (const e of list) {
            const others = list.filter((o) => o.equipmentNumber !== e.equipmentNumber).map((o) => o.equipmentNumber);
            push(e, `also on ${others.join(', ')}`);
          }
        }
        break;
      }
    }
  }
  return out;
}

/** Share of equipment with zero violations (0–100). */
export function compliancePct(equipmentCount: number, violations: Pick<Violation, 'equipmentNumber'>[]): number {
  if (equipmentCount === 0) return 0;
  const bad = new Set(violations.map((v) => v.equipmentNumber)).size;
  return Math.round(((equipmentCount - bad) / equipmentCount) * 1000) / 10;
}
