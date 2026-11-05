// Dev-only offline demo: an in-memory stand-in for the Rayfin client (Lakehouse + app DB).
import { fixture } from '../src/test/atlas-fixture';

type Row = Record<string, unknown>;
const f = fixture();
const tables: Record<string, Row[]> = {
  ChangeRequest: [], BusinessRule: [], RuleViolation: [], AuditEvent: [], ApproverAssignment: [], Evidence: [], EvidenceChunk: [],
};
const gold = f.equipment.map((e) => ({ ...e }));
const alias = f.aliases.map((a) => ({ ...a }));
let n = 0;

function chain(rows: () => Row[]) {
  let order: [string, string] | null = null;
  let limit = 100000;
  let filter: Record<string, { eq?: unknown }> = {};
  const api = {
    select: () => api, after: () => api,
    where: (w: Record<string, { eq?: unknown }>) => { filter = w; return api; },
    orderBy: (o: Record<string, string>) => { const [k, v] = Object.entries(o)[0]; order = [k, v]; return api; },
    first: (x: number) => { limit = x; return api; },
    execute: async () => run(),
    executePaginated: async () => ({ items: run(), hasNextPage: false, endCursor: null }),
  };
  const run = () => {
    const r = [...rows()].filter((x) => Object.entries(filter).every(([k, v]) => v.eq === undefined || x[k] === v.eq));
    if (order) { const [k, d] = order; r.sort((a, b) => (String(a[k]) < String(b[k]) ? -1 : 1) * (d === 'desc' ? -1 : 1)); }
    if (order && rows()[0] && rows()[0][order[0]] instanceof Date) {
      const [k, d] = order; r.sort((a, b) => ((a[k] as Date).getTime() - (b[k] as Date).getTime()) * (d === 'desc' ? -1 : 1));
    }
    return r.slice(0, limit).map((x) => ({ ...x }));
  };
  return api;
}

function entity(name: string) {
  const t = tables[name];
  return {
    ...chain(() => t),
    select: () => chain(() => t),
    create: async (input: Row) => { await new Promise((r) => setTimeout(r, 5)); const row = { id: `${name}-${++n}`, ...input }; t.push(row); return { ...row }; },
    update: async (where: { id: string }, patch: Row) => { const row = t.find((x) => x.id === where.id)!; Object.assign(row, patch); return { ...row }; },
    delete: async (where: { id: string }) => { const i = t.findIndex((x) => x.id === where.id); return t.splice(i, 1)[0]; },
  };
}

const client = {
  data: Object.fromEntries(Object.keys(tables).map((k) => [k, entity(k)])),
  connectors: {
    atlaslakehouse: {
      GoldEquipmentMaster: { select: () => chain(() => gold) },
      GoldEquipmentAlias: { select: () => chain(() => alias) },
    },
  },
};

export async function getRayfinClient() {
  return client as never;
}
export class MissingRayfinConfigError extends Error {}
