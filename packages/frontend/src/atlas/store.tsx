import type {
  ApproverAssignmentRecord,
  AuditEventRecord,
  BusinessRuleRecord,
  ChangeRequestRecord,
  EquipmentAliasRecord,
  EquipmentRecord,
  EvidenceRecord,
  RuleViolationRecord,
} from '@rayfin-app/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '@/hooks/auth.context';

import { applyApprovedChanges, type EffectiveEquipment } from './overlay';
import {
  listApprovers,
  listAudit,
  listEvidence,
  listRequests,
  listRules,
  listViolations,
  seedIfEmpty,
} from './repo';
import { evaluateRules, type Violation } from './rules';
import { loadAliases, loadEquipment } from './source';

export type LoadState =
  | { kind: 'loading'; step: string }
  | { kind: 'error'; where: 'lakehouse' | 'app'; message: string }
  | { kind: 'ready' };

export interface AtlasData {
  state: LoadState;
  actor: string;
  goldEquipment: EquipmentRecord[];
  equipment: EffectiveEquipment[];
  aliases: EquipmentAliasRecord[];
  requests: ChangeRequestRecord[];
  rules: BusinessRuleRecord[];
  approvers: ApproverAssignmentRecord[];
  audit: AuditEventRecord[];
  savedViolations: RuleViolationRecord[];
  evidence: EvidenceRecord[];
  /** Live evaluation of active rules over the effective (gold + approved) records. */
  liveViolations: Violation[];
  refreshApp: () => Promise<void>;
  reloadAll: () => Promise<void>;
}

const Ctx = createContext<AtlasData | undefined>(undefined);

function describe(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  return m.length > 300 ? `${m.slice(0, 300)}…` : m;
}

export function AtlasProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const actor = session?.user?.email ?? 'demo.user';

  const [state, setState] = useState<LoadState>({ kind: 'loading', step: 'Reading Gold equipment from the Lakehouse…' });
  const [goldEquipment, setGold] = useState<EquipmentRecord[]>([]);
  const [aliases, setAliases] = useState<EquipmentAliasRecord[]>([]);
  const [requests, setRequests] = useState<ChangeRequestRecord[]>([]);
  const [rules, setRules] = useState<BusinessRuleRecord[]>([]);
  const [approvers, setApprovers] = useState<ApproverAssignmentRecord[]>([]);
  const [audit, setAudit] = useState<AuditEventRecord[]>([]);
  const [savedViolations, setSaved] = useState<RuleViolationRecord[]>([]);
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);

  const refreshApp = useCallback(async () => {
    const [r, ru, ap, au, v, ev] = await Promise.all([
      listRequests(),
      listRules(),
      listApprovers(),
      listAudit(),
      listViolations(),
      listEvidence(),
    ]);
    setEvidence(ev);
    setRequests(r);
    setRules(ru);
    setApprovers(ap);
    setAudit(au);
    setSaved(v);
  }, []);

  const load = useCallback(async () => {
    try {
      const [eq, al] = await Promise.all([loadEquipment(), loadAliases()]);
      setGold(eq);
      setAliases(al);
    } catch (e) {
      setState({ kind: 'error', where: 'lakehouse', message: describe(e) });
      return;
    }
    try {
      setState({ kind: 'loading', step: 'Loading requests, rules and approvals…' });
      await seedIfEmpty(actor);
      await refreshApp();
      setState({ kind: 'ready' });
    } catch (e) {
      setState({ kind: 'error', where: 'app', message: describe(e) });
    }
  }, [actor, refreshApp]);

  const reloadAll = useCallback(async () => {
    setState({ kind: 'loading', step: 'Reading Gold equipment from the Lakehouse…' });
    await load();
  }, [load]);

  useEffect(() => {
    // State is only set after the async Lakehouse/app reads resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const equipment = useMemo(() => applyApprovedChanges(goldEquipment, requests), [goldEquipment, requests]);
  const liveViolations = useMemo(() => evaluateRules(equipment, rules), [equipment, rules]);

  const value = useMemo<AtlasData>(
    () => ({
      state,
      actor,
      goldEquipment,
      equipment,
      aliases,
      requests,
      rules,
      approvers,
      audit,
      savedViolations,
      evidence,
      liveViolations,
      refreshApp,
      reloadAll,
    }),
    [state, actor, goldEquipment, equipment, aliases, requests, rules, approvers, audit, savedViolations, evidence, liveViolations, refreshApp, reloadAll]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAtlas(): AtlasData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAtlas must be used inside AtlasProvider');
  return v;
}
