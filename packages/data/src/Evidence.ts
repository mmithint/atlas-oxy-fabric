import { authenticated, date, entity, int, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * Evidence attached to equipment and/or a change request: nameplate photos,
 * vendor data sheets. Sample evidence points at bundled files (`url`);
 * photos taken in the app are stored in EvidenceChunk rows.
 */
@entity()
@authenticated('*')
export class Evidence {
  @uuid() id!: string;
  @text({ max: 20, optional: true }) equipmentNumber?: string;
  @text({ max: 20, optional: true }) requestCode?: string;
  @set('PHOTO', 'DOCUMENT') kind!: 'PHOTO' | 'DOCUMENT';
  @set('FIELD_PHOTO', 'VENDOR_SHEET', 'EQUIPMENTIQ', 'UPLOAD')
  source!: 'FIELD_PHOTO' | 'VENDOR_SHEET' | 'EQUIPMENTIQ' | 'UPLOAD';
  @text({ max: 120 }) title!: string;
  @text({ max: 300, optional: true }) caption?: string;
  @text({ max: 300, optional: true }) url?: string;
  @text({ max: 60 }) mimeType!: string;
  @int() chunkCount!: number;
  @text({ max: 100 }) addedBy!: string;
  @date() addedAt!: Date;
}
