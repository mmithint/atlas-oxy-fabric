import { useCssTheme, VegaVisual, type VisualizationSpec } from '@microsoft/fabric-visuals';
import type { DataTable } from '@microsoft/fabric-visuals-core';
import { useMemo } from 'react';

import { href } from '../Shell';
import { compliancePct } from '../rules';
import { useAtlas } from '../store';
import { Badge, Card, CardHeader, Empty, fmtAge, Kpi, PageTitle, SOURCE_LABEL, Tag, Td, Th, ageHours } from '../ui';

const violationsByRuleSpec: VisualizationSpec = {
  mark: { type: 'bar', cornerRadiusEnd: 3 },
  encoding: {
    y: { field: 'rule', type: 'nominal', sort: '-x', title: null },
    x: { field: 'records', type: 'quantitative', title: 'Records failing', axis: { tickMinStep: 1, format: 'd' } },
    color: {
      field: 'severity',
      type: 'nominal',
      scale: { domain: ['CRITICAL', 'HIGH', 'MEDIUM'], range: ['#c2410c', '#d99a3a', '#8a9099'] },
      legend: { orient: 'bottom', title: null },
    },
    tooltip: [
      { field: 'rule', type: 'nominal', title: 'Rule' },
      { field: 'records', type: 'quantitative', title: 'Records' },
    ],
  },
};

const verificationSpec: VisualizationSpec = {
  mark: { type: 'bar' },
  encoding: {
    x: { field: 'equipmentClass', type: 'nominal', title: null, axis: { labelAngle: 0 } },
    y: { field: 'share', type: 'quantitative', stack: 'zero', title: '% of records', scale: { domain: [0, 100] } },
    color: {
      field: 'status',
      type: 'nominal',
      scale: { domain: ['Verified', 'Correction required', 'Not verified'], range: ['#2f7d4f', '#d99a3a', '#a7adb4'] },
      legend: { orient: 'bottom', title: null },
    },
    tooltip: [
      { field: 'equipmentClass', type: 'nominal', title: 'Class' },
      { field: 'status', type: 'nominal', title: 'Status' },
      { field: 'count', type: 'quantitative', title: 'Records' },
      { field: 'share', type: 'quantitative', title: '% of class' },
    ],
  },
};

export function Overview() {
  const theme = useCssTheme();
  const { equipment, requests, liveViolations, rules, approvers } = useAtlas();

  const pct = compliancePct(equipment.length, liveViolations);
  const pending = requests.filter((r) => r.status === 'PENDING');
  const awaitingSap = requests.filter((r) => r.status === 'APPROVED' || r.status === 'SENT_TO_SAP');
  const compressors = equipment.filter((e) => e.equipmentClass === 'COMPRESSOR').length;

  const byRule: DataTable = useMemo(() => {
    const m = new Map<string, { rule: string; severity: string; units: Set<string> }>();
    for (const v of liveViolations) {
      const rule = rules.find((r) => r.id === v.ruleId);
      const label = `${v.ruleCode} · ${rule?.description ?? ''}`;
      const cur = m.get(label) ?? { rule: label, severity: v.severity, units: new Set<string>() };
      cur.units.add(v.equipmentNumber);
      m.set(label, cur);
    }
    return {
      columns: [
        { name: 'rule', displayName: 'Rule' },
        { name: 'records', displayName: 'Records' },
        { name: 'severity', displayName: 'Severity' },
      ],
      rows: [...m.values()].map((x) => [x.rule, x.units.size, x.severity]),
    };
  }, [liveViolations, rules]);

  const verification: DataTable = useMemo(() => {
    const label = { VERIFIED: 'Verified', CORRECTION_REQUIRED: 'Correction required', NOT_VERIFIED: 'Not verified' } as const;
    const m = new Map<string, number>();
    for (const e of equipment) {
      const k = `${e.equipmentClass}|${label[e.verificationStatus]}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return {
      columns: [
        { name: 'equipmentClass', displayName: 'Class' },
        { name: 'status', displayName: 'Status' },
        { name: 'count', displayName: 'Records' },
        { name: 'share', displayName: '% of class' },
      ],
      rows: [...m.entries()].map(([k, n]) => {
        const [c, s] = k.split('|');
        const total = equipment.filter((e) => e.equipmentClass === c).length || 1;
        return [c === 'COMPRESSOR' ? 'Compressors' : 'Heaters', s, n, Math.round((n / total) * 100)];
      }),
    };
  }, [equipment]);

  const slaFor = (group: string, area: string) =>
    approvers.find((a) => a.attributeGroup === group && a.area === area)?.slaHours ?? 48;
  const oldest = [...pending].sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime()).slice(0, 6);

  return (
    <>
      <PageTitle eyebrow="Compressors & heaters · POV scope" title="Equipment data health" />

      <div className="grid grid-cols-1 gap-400 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Equipment records" value={equipment.length} sub={`${compressors} compressors · ${equipment.length - compressors} heaters`} />
        <Kpi
          label="Business-rule compliance"
          value={`${pct}%`}
          tone={pct >= 95 ? 'success' : 'warning'}
          sub={`Proposed target 95% · ${new Set(liveViolations.map((v) => v.equipmentNumber)).size} records with issues`}
        />
        <Kpi label="Waiting for approval" value={pending.length} tone={pending.length ? 'warning' : undefined} sub="Change requests in approver inboxes" />
        <Kpi label="Approved, not yet in SAP" value={awaitingSap.length} tone="primary" sub="Visible in ATLAS now; next Evolve load" />
      </div>

      <div className="mt-600 grid grid-cols-1 gap-600 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Where the data breaks the rules" hint="Live check of active business rules against Gold + approved changes" />
          <div className="p-400">
            {byRule.rows.length ? (
              <VegaVisual spec={violationsByRuleSpec} data={byRule} theme={theme} style={{ height: 320 }} />
            ) : (
              <Empty>Every record passes the active rules.</Empty>
            )}
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Field verification" hint="Latest TrueContext result per record" />
          <div className="p-400">
            <VegaVisual spec={verificationSpec} data={verification} theme={theme} style={{ height: 320 }} />
          </div>
        </Card>
      </div>

      <Card className="mt-600">
        <CardHeader
          title="Oldest requests waiting on an approver"
          hint="Routed by attribute group and area (RACI); SLA from the approver assignment"
          action={<a className="text-300 font-medium text-primary hover:underline" href={href({ page: 'approvals' })}>Open approvals →</a>}
        />
        {oldest.length ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border">
                <tr>
                  <Th>Request</Th>
                  <Th>Equipment</Th>
                  <Th>Change</Th>
                  <Th>Source</Th>
                  <Th>Approver</Th>
                  <Th>Waiting</Th>
                </tr>
              </thead>
              <tbody>
                {oldest.map((r) => {
                  const over = ageHours(r.submittedAt) > slaFor(r.attributeGroup, r.area);
                  return (
                    <tr key={r.id} className="border-b border-border last:border-0 hover:bg-accent/50">
                      <Td>
                        <a className="font-monospace text-primary hover:underline" href={href({ page: 'approvals', requestCode: r.requestCode })}>
                          {r.requestCode}
                        </a>
                      </Td>
                      <Td>
                        <Tag>{r.equipmentNumber}</Tag>
                        <span className="ml-200 text-muted-foreground">{r.facility}</span>
                      </Td>
                      <Td className="font-monospace text-200">
                        {r.fieldName}: {r.oldValue ?? '∅'} → {r.newValue}
                      </Td>
                      <Td>{SOURCE_LABEL[r.source]}</Td>
                      <Td>{r.assignedApprover ?? '—'}</Td>
                      <Td>
                        <Badge tone={over ? 'danger' : 'neutral'}>{fmtAge(r.submittedAt)}{over ? ' · past SLA' : ''}</Badge>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No requests are waiting.</Empty>
        )}
      </Card>
    </>
  );
}
