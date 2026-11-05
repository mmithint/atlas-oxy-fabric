import type { EquipmentRecord } from '@rayfin-app/shared';

import { normaliseSerial } from './rules';

export interface DuplicateCandidate {
  equipment: EquipmentRecord;
  score: number;
  strength: 'strong' | 'possible';
  reasons: string[];
  matched: Set<string>;
}

export interface ProposedIdentity {
  equipmentClass: string;
  facility: string;
  pidTag?: string;
  serialNumber?: string;
  manufacturer?: string;
  model?: string;
}

const norm = (v?: string) => (v ?? '').toUpperCase().replace(/[\s-]/g, '');

/**
 * Ranks existing records that could be the same physical unit. Mirrors the
 * brownfield matching order from the workshop deck: serial at this site,
 * serial anywhere (moved?), tag at this facility, then class/model here.
 */
export function findDuplicateCandidates(p: ProposedIdentity, equipment: EquipmentRecord[], limit = 5): DuplicateCandidate[] {
  const out: DuplicateCandidate[] = [];
  const serial = p.serialNumber ? normaliseSerial(p.serialNumber) : '';
  const tag = norm(p.pidTag);
  for (const e of equipment) {
    let score = 0;
    const reasons: string[] = [];
    const matched = new Set<string>();
    const sameSite = e.facility === p.facility;
    if (serial && e.serialNumber && normaliseSerial(e.serialNumber) === serial) {
      score += sameSite ? 100 : 80;
      reasons.push(sameSite ? 'Same serial number at this facility' : `Same serial number at ${e.facility} — moved equipment?`);
      matched.add('serialNumber');
    }
    if (tag && sameSite && norm(e.pidTag) === tag) {
      score += 60;
      reasons.push('Same P&ID tag at this facility');
      matched.add('pidTag');
    }
    if (sameSite && e.equipmentClass === p.equipmentClass) {
      score += 10;
      matched.add('facility');
      if (p.model && norm(e.model) === norm(p.model) && p.manufacturer && norm(e.manufacturer) === norm(p.manufacturer)) {
        score += 15;
        reasons.push('Same make and model at this facility');
        matched.add('model');
        matched.add('manufacturer');
      }
    }
    if (score >= 25) out.push({ equipment: e, score, strength: score >= 60 ? 'strong' : 'possible', reasons, matched });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
