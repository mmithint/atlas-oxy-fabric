# ATLAS POV: setup

ATLAS is a Fabric App (Rayfin) for the Oxy equipment POV. It covers compressors and heaters, using **synthetic sample data**. No SAP access or Oxy data is needed.

```
Bronze CSVs ──► Fabric notebook ──► Lakehouse Gold tables ──► atlasLakehouse connector (read-only)
                                                                     │
                       App database (Rayfin data): requests, approvals, rules, rule runs, audit
                                                                     │
                                ATLAS app ──► Evolve CSV files (for the SAP team to load)
```

## 1. Install (once)

From `D:\Fabric apps\OXY-Fabric` in PowerShell:

```powershell
npx npm@11 install
```

> npm 10 fails on this template with `Cannot read properties of null (reading 'edgesOut')`. Use npm 11 through `npx`, as shown above.

## 2. Build the Lakehouse (about 10 minutes)

**Automated (already done for POC Workspace):** `node lakehouse/provision.mjs` does this whole step through the Fabric REST APIs. It creates `ATLAS_LH`, uploads the CSVs, creates and runs the `ATLAS_Medallion` notebook, and prints the `connector add` command. It is safe to re-run. To target a different workspace or tenant, set `ATLAS_WORKSPACE` or `ATLAS_TENANT`.

**Manual alternative:**

1. In **POC Workspace**, create a Lakehouse named `ATLAS_LH`.
2. Under **Files**, create `atlas/bronze`, then upload every CSV from `lakehouse/bronze/`:
   - `sap_equipment.csv`
   - `sap_characteristics.csv`
   - `equipment_xref.csv`
   - `truecontext_verifications.csv`
   - `gis_locations.csv`
   - `air_permits.csv`
3. In the workspace, choose **Import → Notebook** and select `lakehouse/notebook/atlas_medallion.ipynb`.
4. Open the notebook, attach `ATLAS_LH` as its **default lakehouse**, then choose **Run all**.
   The last cell should print `Compressors: 26 | Heaters: 22`.
5. Open the Lakehouse **SQL analytics endpoint** and check that it lists `gold_equipment_master` (48 rows) and `gold_equipment_alias` (263 rows).
   New tables can take a minute to appear. Use **Refresh** if they don't show yet.

To regenerate the CSVs: `npm run bronze:generate`.

## 3. Connect the app to the Lakehouse

```powershell
npx rayfin login
npx rayfin connector search "ATLAS_LH" --type fabric-sqlanalytics --all-workspaces --json
```

From the search result, copy the `workspaceId` and `itemId` into this command:

```powershell
npx rayfin connector add --type fabric-sqlanalytics --workspace-id <workspaceId> --item-id <itemId> --name atlaslakehouse --operations read
```

- Keep the name **`atlaslakehouse`** (the CLI lowercases connector names), because the app code uses it.
- **Do not add `--yes`.** The entity files in `rayfin/connectors/atlaslakehouse/` were written by hand, and `--yes` replaces them with a placeholder. A backup copy is in `lakehouse/connector-entities-backup/`.
- `connector add` writes `rayfin/connectors/atlaslakehouse/metadata.json`. Check that file's column types and nullability against `GoldEquipmentMaster.ts` and `GoldEquipmentAlias.ts`. If anything differs, update the entity files.
- The connector uses `auth.type: application` by default. If reads fail with a permission error, either give the app access to `ATLAS_LH`, or change `auth.type` to `delegated` in `rayfin/rayfin.yml`.

Inspect the connected data:

```powershell
npx rayfin connector inspect --name atlaslakehouse --entity GoldEquipmentMaster --rows 1
```

## 4. Run and deploy

```powershell
npm run dev          # creates the backend in Fabric if needed, then starts http://localhost:5173
npx rayfin up --yes  # deploys (--yes reuses the existing oxy-fabric item); the app and applies the schema (static site, data, connector)
npx rayfin up status
```

The first time the app opens, it seeds the app database with:

- 11 business rules
- 12 approver assignments
- 15 sample change requests

Use **Reset demo data** at the bottom of the left sidebar to go back to that starting state after a rehearsal. This doesn't touch the Lakehouse.

## Offline fallback

```powershell
npm run demo:offline
```

This runs the same UI entirely in the browser, with in-memory sample data. It needs no Fabric, no login and no Lakehouse. Use it if the network or Fabric isn't cooperating on the day.

## Where things live

| Path | What |
| --- | --- |
| `lakehouse/bronze/` | Synthetic source extracts (SAP view, characteristics, identity xref, TrueContext, GIS, air permits) |
| `lakehouse/notebook/atlas_medallion.ipynb` | Bronze → Silver → Gold notebook (pandas, writes Delta) |
| `rayfin/connectors/atlaslakehouse/` | Read-only connector entities for the Gold tables |
| `packages/data/src/` | App-owned tables: ChangeRequest, BusinessRule, RuleViolation, AuditEvent, ApproverAssignment |
| `packages/frontend/src/atlas/` | App code: pages, rule engine, Evolve export, bulk upload, overlay of approved changes |
| `packages/frontend/.harness/` | Offline demo harness |
