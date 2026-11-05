import type { AuditEventRecord, ChangeRequestRecord, EvidenceRecord } from '@rayfin-app/shared';
import { Camera, Check, FileText, ImageIcon, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import { type FieldDef, sourceSystemFor } from './fields';
import type { FieldProvenance } from './overlay';
import { evidenceSrc } from './repo';
import { Badge, Button, fmtDate, Simulated, STAGES, stageIndex, STATUS_LABEL, STATUS_TONE } from './ui';

const EV_SOURCE: Record<EvidenceRecord['source'], string> = {
  FIELD_PHOTO: 'Field photo',
  VENDOR_SHEET: 'Vendor data sheet',
  EQUIPMENTIQ: 'EquipmentIQ',
  UPLOAD: 'Uploaded in ATLAS',
};

function useEvidenceSrc(ev: EvidenceRecord): string | undefined {
  const [src, setSrc] = useState<string | undefined>(ev.url);
  useEffect(() => {
    if (ev.url) return;
    let alive = true;
    evidenceSrc(ev)
      .then((s) => alive && setSrc(s))
      .catch(() => alive && setSrc(undefined));
    return () => {
      alive = false;
    };
  }, [ev]);
  return src;
}

/** Evidence shown large enough to decide from, with a full-size viewer. */
export function EvidenceGallery({
  items,
  large = false,
  empty = 'No evidence attached.',
}: {
  items: EvidenceRecord[];
  large?: boolean;
  empty?: string;
}) {
  const [open, setOpen] = useState<EvidenceRecord | null>(null);
  if (!items.length) return <p className="text-300 text-muted-foreground">{empty}</p>;
  return (
    <>
      <ul className={cn('grid gap-300', large ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3')}>
        {items.map((ev) => (
          <li key={ev.id}>
            <EvidenceThumb ev={ev} large={large} onOpen={() => setOpen(ev)} />
          </li>
        ))}
      </ul>
      {open ? <EvidenceViewer ev={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function EvidenceThumb({ ev, large, onOpen }: { ev: EvidenceRecord; large: boolean; onOpen: () => void }) {
  const src = useEvidenceSrc(ev);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group block w-full overflow-hidden rounded-lg border border-border bg-muted text-left transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className={cn('grid place-items-center overflow-hidden bg-foreground/5', large ? 'h-[220px]' : 'h-[110px]')}>
        {ev.kind === 'PHOTO' && src ? (
          <img src={src} alt={ev.title} className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
        ) : ev.kind === 'DOCUMENT' ? (
          <div className="flex flex-col items-center gap-100 text-muted-foreground">
            <FileText aria-hidden className="icon-size-600" />
            <span className="text-200">PDF</span>
          </div>
        ) : (
          <ImageIcon aria-hidden className="icon-size-500 text-muted-foreground" />
        )}
      </div>
      <div className="bg-card px-300 py-200">
        <p className="truncate text-300 font-medium">{ev.title}</p>
        <p className="truncate text-200 text-muted-foreground">
          {EV_SOURCE[ev.source]} · {fmtDate(ev.addedAt)}
        </p>
        {large && ev.caption ? <p className="mt-100 text-200">{ev.caption}</p> : null}
      </div>
    </button>
  );
}

function EvidenceViewer({ ev, onClose }: { ev: EvidenceRecord; onClose: () => void }) {
  const src = useEvidenceSrc(ev);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={ev.title} className="fixed inset-0 z-50 flex flex-col bg-foreground/80 p-400" onClick={onClose}>
      <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-300 pb-300 text-background" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0">
          <p className="truncate font-medium">{ev.title}</p>
          <p className="truncate text-200 opacity-80">
            {EV_SOURCE[ev.source]} · {ev.addedBy} · {fmtDate(ev.addedAt)}
            {ev.caption ? ` · ${ev.caption}` : ''}
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-200 hover:bg-background/20" aria-label="Close">
          <X aria-hidden className="icon-size-300" />
        </button>
      </div>
      <div className="mx-auto flex min-h-0 w-full max-w-[1100px] flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {!src ? (
          <p className="text-background">Loading…</p>
        ) : ev.kind === 'DOCUMENT' ? (
          <iframe title={ev.title} src={src} className="h-full w-full rounded-lg bg-background" />
        ) : (
          <img src={src} alt={ev.title} className="max-h-full max-w-full rounded-lg object-contain" />
        )}
      </div>
    </div>
  );
}

/** Downscales a camera/library photo to a JPEG data URL small enough to store. */
export async function downscalePhoto(file: File, maxSide = 1000, quality = 0.7): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('That file could not be read as an image.'));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image processing is unavailable in this browser.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** "Take or attach photo" — opens the camera on iPad/phone. */
export function PhotoButton({ onPhoto, disabled, label = 'Take or attach photo' }: { onPhoto: (dataUrl: string, name: string) => void; disabled?: boolean; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <Button variant="secondary" onClick={() => ref.current?.click()} disabled={disabled}>
        <Camera aria-hidden className="icon-size-200" /> {label}
      </Button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setError(null);
          try {
            onPhoto(await downscalePhoto(f), f.name.replace(/\.[^.]+$/, ''));
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }}
      />
      {error ? <p role="alert" className="mt-100 text-200 text-destructive">{error}</p> : null}
    </div>
  );
}

const EVENT_LABEL: Record<string, string> = {
  REQUEST_SUBMITTED: 'Submitted',
  RESUBMITTED: 'Corrected & resubmitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  RETURNED: 'Returned for correction',
  SENT_TO_SAP: 'Added to SAP upload file',
  SAP_LOADED: 'Loaded by SAP team',
  SAP_FAILED: 'SAP load failed',
  SAP_SYNCED: 'Confirmed by source refresh',
  EVIDENCE_ADDED: 'Evidence attached',
  IQ_EXTRACTION: 'EquipmentIQ extraction',
};
const SIMULATED_EVENTS = new Set(['SAP_LOADED', 'SAP_FAILED', 'SAP_SYNCED', 'IQ_EXTRACTION']);

/** Stage bar + event history for one request. */
export function RequestTimeline({ request, events }: { request: ChangeRequestRecord; events: AuditEventRecord[] }) {
  const at = stageIndex(request.status);
  const failed = request.status === 'SAP_FAILED' || request.status === 'REJECTED';
  const mine = events
    .filter((e) => e.requestCode === request.requestCode)
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  return (
    <div>
      <ol className="flex flex-wrap items-center gap-y-200" aria-label="Request stage">
        {STAGES.map((s, i) => {
          const done = i < at || (i === at && request.status === 'SYNCED');
          const current = i === at && request.status !== 'SYNCED';
          return (
            <li key={s} className="flex items-center">
              <span
                className={cn(
                  'inline-flex items-center gap-100 rounded-full px-300 py-100 text-[length:var(--text-200)] font-medium',
                  done && 'bg-success/15 text-success',
                  current && !failed && 'bg-primary text-primary-foreground',
                  current && failed && 'bg-destructive text-destructive-foreground',
                  !done && !current && 'bg-muted text-muted-foreground'
                )}
              >
                {done ? <Check aria-hidden className="icon-size-100" /> : null}
                {s}
                {(s === 'Loaded by SAP' || s === 'Confirmed') ? <span className="opacity-70">*</span> : null}
              </span>
              {i < STAGES.length - 1 ? <span aria-hidden className="mx-100 h-px w-[16px] bg-border" /> : null}
            </li>
          );
        })}
      </ol>
      <p className="mt-100 text-200 text-muted-foreground">* simulated in this POV — no SAP connection</p>
      <ol className="mt-400 space-y-300 border-l-2 border-border pl-400">
        {mine.map((e) => (
          <li key={e.id} className="relative">
            <span aria-hidden className="absolute -left-[23px] top-[6px] h-[10px] w-[10px] rounded-full border-2 border-card bg-primary" />
            <p className="flex flex-wrap items-center gap-200 text-300 font-medium">
              {EVENT_LABEL[e.eventType] ?? e.eventType}
              {SIMULATED_EVENTS.has(e.eventType) ? <Simulated /> : null}
              <span className="text-200 font-normal text-muted-foreground">
                {fmtDate(e.occurredAt)} · {e.actor}
              </span>
            </p>
            <p className="text-200 text-muted-foreground">{e.details}</p>
          </li>
        ))}
        {!mine.length ? <li className="text-300 text-muted-foreground">No history recorded.</li> : null}
      </ol>
    </div>
  );
}

/** Source value vs approved ATLAS value vs SAP-confirmed value for one attribute. */
export function ValueTrail({ def, value, provenance }: { def: FieldDef; value: string; provenance?: FieldProvenance }) {
  const unit = def.unit ? ` ${def.unit}` : '';
  const sourceValue = provenance ? provenance.goldValue : value;
  return (
    <div className="grid grid-cols-1 gap-200 sm:grid-cols-3">
      <div>
        <p className="text-100 font-semibold uppercase tracking-wider text-muted-foreground">Source · {sourceSystemFor(def)}</p>
        <p className={cn('font-monospace', provenance && 'text-muted-foreground line-through decoration-muted-foreground/50')}>
          {sourceValue ? `${sourceValue}${unit}` : <span className="text-destructive no-underline">blank</span>}
        </p>
      </div>
      <div>
        <p className="text-100 font-semibold uppercase tracking-wider text-muted-foreground">Approved in ATLAS</p>
        {provenance ? (
          <p className="font-monospace font-semibold text-primary">
            {value}
            {unit}
            <span className="ml-200 font-base text-200 font-normal text-muted-foreground">{provenance.requestCode}</span>
          </p>
        ) : (
          <p className="text-200 text-muted-foreground">— same as source</p>
        )}
      </div>
      <div>
        <p className="text-100 font-semibold uppercase tracking-wider text-muted-foreground">
          {def.sap ? 'SAP-confirmed' : 'SAP'}
        </p>
        {!def.sap ? (
          <p className="text-200 text-muted-foreground">Not held in SAP</p>
        ) : !provenance ? (
          <p className="font-monospace">{value ? `${value}${unit}` : '—'}</p>
        ) : provenance.confirmed ? (
          <p className="flex items-center gap-200 font-monospace text-success">
            {value}
            {unit} <Simulated>Simulated</Simulated>
          </p>
        ) : (
          <Badge tone={STATUS_TONE[provenance.status]}>{STATUS_LABEL[provenance.status]}</Badge>
        )}
      </div>
    </div>
  );
}
