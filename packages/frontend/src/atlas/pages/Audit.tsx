import { useState } from 'react';

import { href } from '../Shell';
import { useAtlas } from '../store';
import { Badge, Card, CardHeader, Empty, fmtDate, PageTitle, Tag, Td, Th } from '../ui';

const TYPE: Record<string, { label: string; tone: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' }> = {
  REQUEST_SUBMITTED: { label: 'Submitted', tone: 'warning' },
  RESUBMITTED: { label: 'Resubmitted', tone: 'warning' },
  SAP_LOADED: { label: 'SAP load (simulated)', tone: 'primary' },
  SAP_FAILED: { label: 'SAP load failed (simulated)', tone: 'danger' },
  EVIDENCE_ADDED: { label: 'Evidence', tone: 'neutral' },
  IQ_EXTRACTION: { label: 'EquipmentIQ (simulated)', tone: 'primary' },
  APPROVED: { label: 'Approved', tone: 'primary' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  RETURNED: { label: 'Returned', tone: 'neutral' },
  SENT_TO_SAP: { label: 'SAP upload file', tone: 'primary' },
  SAP_SYNCED: { label: 'Confirmed (simulated refresh)', tone: 'success' },
  RULE_RUN: { label: 'Rule run', tone: 'neutral' },
  RULE_CHANGED: { label: 'Rule changed', tone: 'neutral' },
  DATA_LOADED: { label: 'Data load', tone: 'neutral' },
};

export function Audit() {
  const { audit } = useAtlas();
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const n = q.trim().toLowerCase();
  const rows = audit.filter(
    (a) => (!type || a.eventType === type) && (!n || [a.actor, a.details, a.equipmentNumber, a.requestCode].join(' ').toLowerCase().includes(n))
  );

  return (
    <>
      <PageTitle eyebrow="Append-only" title="Audit history" />
      <Card>
        <CardHeader
          title={`${rows.length} event${rows.length === 1 ? '' : 's'}`}
          hint="Who changed what, when, and why — for compliance and air-permit questions"
          action={
            <div className="flex flex-wrap gap-200">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search actor, equipment, request…"
                aria-label="Search audit"
                className="rounded-lg border border-input bg-card px-300 py-200 text-300"
              />
              <select aria-label="Event type" value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border border-input bg-card px-300 py-200 text-300">
                <option value="">All events</option>
                {Object.entries(TYPE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          }
        />
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border">
                <tr>
                  <Th>When</Th>
                  <Th>Event</Th>
                  <Th>Record</Th>
                  <Th>Details</Th>
                  <Th>By</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <Td className="whitespace-nowrap text-200 text-muted-foreground">{fmtDate(a.occurredAt)}</Td>
                    <Td><Badge tone={TYPE[a.eventType]?.tone ?? 'neutral'}>{TYPE[a.eventType]?.label ?? a.eventType}</Badge></Td>
                    <Td>
                      <div className="flex flex-col items-start gap-100">
                        {a.equipmentNumber ? <a href={href({ page: 'equipment', equipmentNumber: a.equipmentNumber })}><Tag>{a.equipmentNumber}</Tag></a> : null}
                        {a.requestCode ? <a className="font-monospace text-200 text-primary hover:underline" href={href({ page: 'approvals', requestCode: a.requestCode })}>{a.requestCode}</a> : null}
                      </div>
                    </Td>
                    <Td>{a.details}</Td>
                    <Td className="text-200">{a.actor}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No events match.</Empty>
        )}
      </Card>
    </>
  );
}
