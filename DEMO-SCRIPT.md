# ATLAS POV: demo talk track (about 15 minutes)

**Before you start**
- Click **Reset demo data** in the footer (bottom right).
- Open the app on **Overview**.
- Use the **Demo path** button (top right) as your checklist. It ticks itself off as you go.

**What to say up front:** "The data is synthetic but shaped like your compressors and heaters. There's no SAP connection. Anything marked SIMULATED is a stand-in for a step SAP or AI would do."

## Main story: one heater, end to end (about 8 minutes)

The heater is reboiler **RB-218** at Spraberry CS (SAP 10412344). It has no heat duty, which breaks rule HTR_02.

1. **Find it.** Type "RB-218" in the search box in the header and press Enter. On Equipment, the Insights panel on the left filters by status, type, verification, area and facility, and each column has its own filter box.
2. **Look at the evidence.** Open the unit. The evidence panel has a nameplate photo and a vendor data sheet; open the photo full size.
3. **Propose the change.** On the Heat duty row, click **Request change**, enter 1.50 with a reason, and leave both evidence items ticked.
   - On an iPad, **Take or attach photo** opens the camera.
4. **Review it.** Open Approvals, which opens on *Awaiting review*, and click the heater's row. The evidence sits right next to the proposed value. **Data-quality impact** shows "Clears HTR_02", and the request is routed by attribute group and area with an SLA. This is the "decide within 5 minutes" view.
5. **Approve.**
6. **Show the value straight away.** Go back to the heater. The Heat duty row now shows three values:
   - **Source:** blank (SAP characteristics)
   - **Approved in ATLAS:** 1.50
   - **SAP-confirmed:** "Approved · ready for SAP file"
7. **SAP sync, step 1.** Click **Generate SAP upload file** to download the Evolve-format CSVs.
8. **SAP sync, step 2.** Click **Simulate SAP team load**. The heater loads. CR-01032 **fails** because its P&ID tag C-110 already belongs to another unit.
   - Point out that SAP caught something the rules didn't, and that it goes back to the requester with SAP's reason.
9. **SAP sync, step 4.** Click **Simulate nightly refresh**. The reconciliation table compares the approved value with the refreshed SAP view, and the request closes. The **Request timeline** in Approvals now shows every step, with simulated steps labelled.

## Short follow-ons (pick based on time)

- **One field visit, one approval (2 minutes, Day 1 ask)**
  - In Approvals, switch the view to **Grouped by equipment**. Compressor 10412303 at Eagle Draw CTB has **4 changes** from one engine swap: engine model, engine serial, horsepower and air permit.
  - Click **Review all 4**. All four sit in one table with the new engine nameplate photo and the combined rule impact ("Clears CMP_01").
  - Point out that they're routed to two approvers (B. Clark for mechanical, A. Patel for the air permit), then **Approve 4 selected**.
  - Also show that opening any one of them shows a banner ("3 more changes are waiting on this unit"), and the request form lists what's already waiting, so nobody submits a duplicate.

- **Return and correct (2 minutes)**
  - In Approvals, open CR-01049. It was returned with "Please attach the engine nameplate photo."
  - Go to **My requests**, tick the existing engine nameplate, describe the change and resubmit.
  - The reviewer now sees revision 2 with the photo attached.
- **New equipment with a duplicate check (P1 onboarding, 2 minutes)**
  - Go to **New equipment** and choose Falcon CTB.
  - Enter serial **F-21800**. It's flagged as a likely duplicate of 10412300, and you're offered **Yes, open it** instead.
  - Change the serial to a new one and it's clear to submit.
  - After approval it appears in Equipment as "New · not in SAP yet" and goes into the equipment-create file.
- **EquipmentIQ (2 minutes)**
  - Click **Read nameplate** (simulated). The tool matches 10412341 by serial and shows each field with a confidence score.
  - It suggests "Burner: FIRED" to fill a blank.
  - **Send for review** creates a request with the photo attached; a person still approves.
- **Bulk upload, Data quality and Audit history:** use these only if someone asks.

## Be honest about scope

- **Targets (as agreed on Day 1):** approved data is visible in ATLAS straight away, well inside the *one business day* target. About *7 days* to SAP, because FLOC, equipment and characteristics each need a nightly refresh. 95% compliance is still a *proposed* target; the accuracy threshold is to be agreed.
- **What's simulated:** the SAP load, the nightly refresh and the EquipmentIQ extraction.
- **Backlog for the workshop to prioritise:**
  - Equipment moves and component swaps
  - Retirement
  - Merging duplicate records
  - Requests for new SAP characteristics
  - Offline field use
  - GIS / map layer, vendor data, work orders and regulatory integrations
