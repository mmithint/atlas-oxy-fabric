import { authenticated, entity, int, one, text, uuid } from '@microsoft/rayfin-core';

import { Evidence } from './Evidence.js';

/** Base64 pieces of an uploaded photo (kept under 4000 chars per row for MSSQL). */
@entity()
@authenticated('*')
export class EvidenceChunk {
  @uuid() id!: string;
  @uuid() evidence_id!: string;
  @one(() => Evidence) evidence?: Evidence;
  @int() seq!: number;
  @text({ max: 4000 }) data!: string;
}
