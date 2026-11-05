import type { ChangeRequestRecord, EquipmentAliasRecord, EquipmentRecord } from '@rayfin-app/shared';

import { buildSeedBundle } from '@/atlas/seed-data';

/** In-memory stand-ins for the Lakehouse and app database, for UI tests. */
export function fixture() {
  const b = buildSeedBundle(new Date('2026-11-03T12:00:00Z'));
  const loaded = new Date('2026-11-03T06:00:00Z');
  const equipment: EquipmentRecord[] = b.equipment.map(({ key: _k, ...e }) => {
    void _k;
    return { ...e, sourceSystems: 'SAP;PI', goldLoadedAt: loaded };
  });
  const keyToNo = new Map(b.equipment.map((e) => [e.key, e.equipmentNumber]));
  const aliases: EquipmentAliasRecord[] = b.aliases.map((a) => ({ equipmentNumber: keyToNo.get(a.key)!, system: a.system, aliasValue: a.aliasValue }));
  const requests: ChangeRequestRecord[] = b.requests.map(({ key: _k, ...r }, i) => {
    void _k;
    return { ...r, id: `r${i}` };
  });
  const rules = b.rules.map((r, i) => ({ ...r, id: `rule${i}` }));
  const approvers = b.approvers.map((a, i) => ({ ...a, id: `a${i}` }));
  return { equipment, aliases, requests, rules, approvers };
}
