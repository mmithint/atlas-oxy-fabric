/**
 * Provisions the ATLAS POV Lakehouse end to end through the Fabric REST APIs:
 *   1. finds the workspace, creates Lakehouse ATLAS_LH (if missing)
 *   2. uploads lakehouse/bronze/*.csv to Files/atlas/bronze in OneLake
 *   3. creates/updates notebook ATLAS_Medallion bound to ATLAS_LH
 *   4. runs it and waits for the Gold tables
 *
 *   node lakehouse/provision.mjs            (opens a browser sign-in once)
 *   env: ATLAS_WORKSPACE (default "POC Workspace"), ATLAS_TENANT, ATLAS_SKIP_RUN=1
 */
import { InteractiveBrowserCredential } from '@azure/identity';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const WS_NAME = process.env.ATLAS_WORKSPACE ?? 'POC Workspace';
const LH_NAME = 'ATLAS_LH';
const NB_NAME = 'ATLAS_Medallion';
const API = 'https://api.fabric.microsoft.com/v1';

const cred = new InteractiveBrowserCredential({
  tenantId: process.env.ATLAS_TENANT ?? 'organizations',
  redirectUri: 'http://localhost',
});
const tok = async (scope) => (await cred.getToken(scope)).token;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fabric(method, path, body) {
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await tok('https://api.fabric.microsoft.com/.default')}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok && res.status !== 202) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 500)}`);
  return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : undefined };
}

async function waitLro(r, label) {
  const loc = r.headers.get('location');
  if (r.status !== 202 || !loc) return r.json;
  for (let i = 0; i < 120; i++) {
    await sleep(Number(r.headers.get('retry-after') ?? 3) * 1000);
    const s = await fabric('GET', loc);
    const st = s.json?.status;
    if (st === 'Succeeded') {
      try { return (await fabric('GET', `${loc}/result`)).json; } catch { return s.json; }
    }
    if (st === 'Failed') throw new Error(`${label} failed: ${JSON.stringify(s.json?.error ?? s.json)}`);
  }
  throw new Error(`${label} timed out`);
}

async function main() {
  console.log(`Signing in…`);
  const workspaces = (await fabric('GET', '/workspaces')).json.value;
  const ws = workspaces.find((w) => w.displayName === WS_NAME);
  if (!ws) throw new Error(`Workspace "${WS_NAME}" not found. Available: ${workspaces.map((w) => w.displayName).join(', ')}`);
  console.log(`Workspace ${ws.displayName} (${ws.id})`);

  // 1. Lakehouse
  let lh = (await fabric('GET', `/workspaces/${ws.id}/lakehouses`)).json.value.find((x) => x.displayName === LH_NAME);
  if (!lh) {
    console.log(`Creating Lakehouse ${LH_NAME}…`);
    const r = await fabric('POST', `/workspaces/${ws.id}/lakehouses`, { displayName: LH_NAME, description: 'ATLAS POV sample data (synthetic)' });
    lh = (await waitLro(r, 'Create lakehouse')) ?? undefined;
    for (let i = 0; !lh?.id && i < 20; i++) {
      await sleep(3000);
      lh = (await fabric('GET', `/workspaces/${ws.id}/lakehouses`)).json.value.find((x) => x.displayName === LH_NAME);
    }
  }
  console.log(`Lakehouse ${LH_NAME} (${lh.id})`);

  // 2. Upload Bronze CSVs to OneLake
  const storage = await tok('https://storage.azure.com/.default');
  const base = `https://onelake.dfs.fabric.microsoft.com/${ws.id}/${lh.id}/Files/atlas/bronze`;
  const h = { Authorization: `Bearer ${storage}`, 'x-ms-version': '2023-11-03' };
  for (const name of readdirSync(join(here, 'bronze')).filter((f) => f.endsWith('.csv'))) {
    const data = readFileSync(join(here, 'bronze', name));
    const url = `${base}/${encodeURIComponent(name)}`;
    let r = await fetch(`${url}?resource=file`, { method: 'PUT', headers: h });
    if (!r.ok) throw new Error(`create ${name}: ${r.status} ${await r.text()}`);
    r = await fetch(`${url}?action=append&position=0`, { method: 'PATCH', headers: { ...h, 'Content-Type': 'application/octet-stream' }, body: data });
    if (!r.ok) throw new Error(`append ${name}: ${r.status} ${await r.text()}`);
    r = await fetch(`${url}?action=flush&position=${data.length}`, { method: 'PATCH', headers: h });
    if (!r.ok) throw new Error(`flush ${name}: ${r.status} ${await r.text()}`);
    console.log(`  uploaded Files/atlas/bronze/${name} (${data.length} bytes)`);
  }

  // 3. Notebook bound to the Lakehouse
  const nb = JSON.parse(readFileSync(join(here, 'notebook', 'atlas_medallion.ipynb'), 'utf8'));
  nb.metadata = {
    ...nb.metadata,
    dependencies: {
      lakehouse: { default_lakehouse: lh.id, default_lakehouse_name: LH_NAME, default_lakehouse_workspace_id: ws.id },
    },
  };
  const definition = {
    format: 'ipynb',
    parts: [{ path: 'notebook-content.ipynb', payload: Buffer.from(JSON.stringify(nb)).toString('base64'), payloadType: 'InlineBase64' }],
  };
  let note = (await fabric('GET', `/workspaces/${ws.id}/notebooks`)).json.value.find((x) => x.displayName === NB_NAME);
  if (note) {
    console.log(`Updating notebook ${NB_NAME}…`);
    await waitLro(await fabric('POST', `/workspaces/${ws.id}/notebooks/${note.id}/updateDefinition`, { definition }), 'Update notebook');
  } else {
    console.log(`Creating notebook ${NB_NAME}…`);
    note = await waitLro(await fabric('POST', `/workspaces/${ws.id}/notebooks`, { displayName: NB_NAME, definition }), 'Create notebook');
    for (let i = 0; !note?.id && i < 20; i++) {
      await sleep(3000);
      note = (await fabric('GET', `/workspaces/${ws.id}/notebooks`)).json.value.find((x) => x.displayName === NB_NAME);
    }
  }
  console.log(`Notebook ${NB_NAME} (${note.id})`);

  // 4. Run it
  if (process.env.ATLAS_SKIP_RUN !== '1') {
    console.log('Running notebook (Spark start-up can take a few minutes)…');
    const r = await fabric('POST', `/workspaces/${ws.id}/items/${note.id}/jobs/instances?jobType=RunNotebook`, {});
    const loc = r.headers.get('location');
    for (let i = 0; i < 240; i++) {
      await sleep(10_000);
      const s = (await fabric('GET', loc)).json;
      process.stdout.write(`  ${s.status}\n`);
      if (s.status === 'Completed') break;
      if (['Failed', 'Cancelled', 'Deduped'].includes(s.status)) throw new Error(`Notebook run ${s.status}: ${JSON.stringify(s.failureReason ?? s)}`);
    }
  }

  const tables = (await fabric('GET', `/workspaces/${ws.id}/lakehouses/${lh.id}/tables`)).json?.data ?? [];
  console.log(`Tables: ${tables.map((t) => t.name).join(', ') || '(none listed yet)'}`);
  console.log('\nNext:');
  console.log(`npx rayfin connector add --type fabric-sqlanalytics --workspace-id ${ws.id} --item-id ${lh.id} --name atlasLakehouse --operations read`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
