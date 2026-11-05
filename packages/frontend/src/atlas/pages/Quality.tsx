import { Play } from 'lucide-react';
import { useMemo, useState } from 'react';

import { saveRun, setRuleActive } from '../repo';
import { compliancePct } from '../rules';
import { href } from '../Shell';
import { useAtlas } from '../store';
import { Badge, Button, Card, CardHeader, Empty, fmtDate, Kpi, PageTitle, SEVERITY_TONE, Tag, Td, Th } from '../ui';

const CHECK_LABEL: Record<string, string> = {
  NOT_NULL: 'is not blank',
  EQUALS: 'equals',
  UNIQUE: 'is unique (0/O, 1/I, dashes normalised)',
  PATTERN: 'matches',
};

export function Quality() {
  const { equipment, rules, liveViolations, savedViolations, actor, refreshApp } = useAtlas();
  const [ruleFilter, setRuleFilter] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runs = useMemo(() => {
    const m = new Map<string, { runId: string; runDate: Date; count: number; units: Set<string> }>();
    for (const v of savedViolations) {
      const r = m.get(v.runId) ?? { runId: v.runId, runDate: v.runDate, count: 0, units: new Set<string>() };
      r.count++;
      r.units.add(v.equipmentNumber);
      m.set(v.runId, r);
    }
    return [...m.values()].sort((a, b) => b.runDate.getTime() - a.runDate.getTime());
  }, [savedViolations]);

  const pct = compliancePct(equipment.length, liveViolations);
  const shown = liveViolations.filter((v) => !ruleFilter || v.ruleCode === ruleFilter);
  const countByRule = (code: string) => liveViolations.filter((v) => v.ruleCode === code).length;

  const run = async () => {
    setBusy('run');
    setError(null);
    try {
      await saveRun(liveViolations, equipment.length, actor);
      await refreshApp();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageTitle eyebrow="EquipmentIQ rule store" title="Data quality">
        <Button onClick={() => void run()} disabled={!!busy}>
          <Play aria-hidden className="icon-size-200" /> {busy === 'run' ? 'Running…' : 'Run validation & save audit'}
        </Button>
      </PageTitle>
      {error ? <p role="alert" className="mb-400 text-300 text-destructive">{error}</p> : null}

      <div className="grid grid-cols-1 gap-400 sm:grid-cols-3">
        <Kpi label="Compliance now" value={`${pct}%`} tone={pct >= 95 ? 'success' : 'warning'} sub="Records passing every active rule (proposed target 95%)" />
        <Kpi label="Open violations" value={liveViolations.length} tone={liveViolations.length ? 'danger' : 'success'} sub={`${rules.filter((r) => r.active).length} active rules`} />
        <Kpi
          label="Last saved run"
          value={runs[0] ? runs[0].count : '—'}
          sub={runs[0] ? `${runs[0].runId} · ${fmtDate(runs[0].runDate)}` : 'No run saved yet — use the button above'}
        />
      </div>

      <Card className="mt-600">
        <CardHeader title="Business rules" hint="Rules are data, not code: stewards switch them on or off without a release. Each rule has an owner." />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-border">
              <tr>
                <Th>Rule</Th>
                <Th>Applies to</Th>
                <Th>Check</Th>
                <Th>Severity</Th>
                <Th>Owner</Th>
                <Th>Failing</Th>
                <Th>Active</Th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <Td>
                    <span className="font-monospace">{r.ruleCode}</span>
                    <p className="text-200 text-muted-foreground">{r.description}</p>
                  </Td>
                  <Td>{r.equipmentClass === 'ALL' ? 'All equipment' : r.equipmentClass === 'HEATER' ? 'Heaters' : 'Compressors'}</Td>
                  <Td className="font-monospace text-200">
                    {r.columnName} {CHECK_LABEL[r.checkType]} {r.expectedValue ?? ''}
                  </Td>
                  <Td><Badge tone={SEVERITY_TONE[r.severity]}>{r.severity}</Badge></Td>
                  <Td>{r.owner}</Td>
                  <Td>
                    {r.active ? (
                      <button className="text-primary hover:underline" onClick={() => setRuleFilter(r.ruleCode)}>
                        {countByRule(r.ruleCode)}
                      </button>
                    ) : '—'}
                  </Td>
                  <Td>
                    <label className="inline-flex items-center gap-200">
                      <input
                        type="checkbox"
                        className="accent-primary"
                        checked={r.active}
                        disabled={busy === r.id}
                        onChange={async (ev) => {
                          setBusy(r.id);
                          try {
                            await setRuleActive(r, ev.target.checked, actor);
                            await refreshApp();
                          } catch (e) {
                            setError(e instanceof Error ? e.message : String(e));
                          } finally {
                            setBusy(null);
                          }
                        }}
                      />
                      <span className="sr-only">Active</span>
                    </label>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-600 grid grid-cols-1 gap-600 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Exceptions to clean up"
            hint={ruleFilter ? `Filtered to ${ruleFilter}` : 'Every current violation, newest data first'}
            action={ruleFilter ? <Button variant="ghost" onClick={() => setRuleFilter('')}>Clear filter</Button> : undefined}
          />
          {shown.length ? (
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full">
                <thead className="sticky top-0 border-b border-border bg-card">
                  <tr>
                    <Th>Equipment</Th>
                    <Th>Rule</Th>
                    <Th>Issue</Th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((v, i) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-accent/50">
                      <Td><a href={href({ page: 'equipment', equipmentNumber: v.equipmentNumber })}><Tag>{v.equipmentNumber}</Tag></a></Td>
                      <Td><Badge tone={SEVERITY_TONE[v.severity]}>{v.ruleCode}</Badge></Td>
                      <Td>{v.violation}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No exceptions.</Empty>
          )}
        </Card>
        <Card>
          <CardHeader title="Audit runs" hint="Saved to the RuleViolation audit table" />
          {runs.length ? (
            <ul className="divide-y divide-border">
              {runs.map((r) => (
                <li key={r.runId} className="px-500 py-300 text-300">
                  <p className="font-monospace">{r.runId}</p>
                  <p className="text-200 text-muted-foreground">
                    {fmtDate(r.runDate)} · {r.count} violations on {r.units.size} records
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No saved runs yet.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
