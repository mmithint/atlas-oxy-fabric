# %% [markdown]
# # ATLAS POV — Bronze → Silver → Gold
# Builds the equipment master for the ATLAS Fabric App from the Bronze CSVs in
# `Files/atlas/bronze/`. **All data is synthetic** (POV sample data, not Oxy data).
#
# * **Bronze** – raw CSVs as delivered by each source (SAP view via Databricks, TrueContext, GIS, Intelex/Axe, identity xref)
# * **Silver** – cleansed, typed, characteristics pivoted, latest verification per unit
# * **Gold** – `gold_equipment_master` (one wide row per unit) and `gold_equipment_alias` (identity cross-reference)
#
# Attach the `ATLAS_LH` Lakehouse as the notebook's default lakehouse, then Run all.

# %%
BRONZE_DIR = "/lakehouse/default/Files/atlas/bronze"
WRITE_TO_LAKEHOUSE = True

# %%
import pandas as pd
from datetime import datetime, timezone

def read_bronze(name):
    return pd.read_csv(f"{BRONZE_DIR}/{name}.csv", dtype=str, keep_default_na=False, encoding="utf-8")

bronze = {n: read_bronze(n) for n in [
    "sap_equipment", "sap_characteristics", "equipment_xref",
    "truecontext_verifications", "gis_locations", "air_permits",
]}
for n, df in bronze.items():
    print(f"bronze_{n}: {len(df)} rows")

# %% [markdown]
# ## Silver — cleanse and conform

# %%
def clean(s):
    s = s.astype(str).str.strip()
    return s.where(s != "", None)

def upper_clean(s):
    s = clean(s)
    return s.where(s.isna(), s.str.upper())

eq = bronze["sap_equipment"].copy()
silver_equipment = pd.DataFrame({
    "equipment_number": clean(eq["EQUNR"]),
    "atlas_id": clean(eq["SORTFELD"]),
    "equipment_class": upper_clean(eq["EQUIP_CLASS"]),
    "equipment_subtype": upper_clean(eq["EQ_SUBTYPE"]),
    "description": upper_clean(eq["EQKTX"]),
    "floc": upper_clean(eq["TPLNR"]),
    "facility": clean(eq["FACILITY_NAME"]),
    "area": clean(eq["AREA"]),
    "manufacturer": upper_clean(eq["HERST"]),
    "model": upper_clean(eq["TYPBZ"]),
    "serial_number": upper_clean(eq["SERGE"]),
    "pid_tag": upper_clean(eq["TIDNR"]),
    "status": eq["USER_STATUS"].str.strip().map({"ACTV": "ACTIVE"}).fillna("INACTIVE"),
})
assert silver_equipment["equipment_number"].is_unique, "duplicate EQUNR in SAP view"

ch = bronze["sap_characteristics"].copy()
ch["ATNAM"] = upper_clean(ch["ATNAM"])
ch["ATWRT"] = clean(ch["ATWRT"])
silver_characteristics = (
    ch.dropna(subset=["ATWRT"])
      .pivot_table(index="EQUNR", columns="ATNAM", values="ATWRT", aggfunc="last")
      .reset_index()
      .rename(columns={"EQUNR": "equipment_number"})
)
for col in ["CO_ENGINE_MODEL", "CO_ENGINE_SERIAL", "CO_RATED_HP", "CO_STAGES", "VE_HEAT_DUTY", "VE_FIRED_OR_UNFIRED"]:
    if col not in silver_characteristics:
        silver_characteristics[col] = None

tc = bronze["truecontext_verifications"].copy()
tc["SUBMITTED_AT"] = pd.to_datetime(tc["SUBMITTED_AT"], utc=True)
tc = tc[tc["RESULT"] != "Did not Verify"].sort_values("SUBMITTED_AT")
silver_verification = (
    tc.groupby("EQUNR").tail(1)
      .assign(verification_status=lambda d: d["RESULT"].map({
          "Verified Correct": "VERIFIED", "Correction Required": "CORRECTION_REQUIRED"}))
      [["EQUNR", "verification_status", "SUBMITTED_AT"]]
      .rename(columns={"EQUNR": "equipment_number", "SUBMITTED_AT": "last_verified_at"})
)

gis = bronze["gis_locations"].rename(columns={"EQUNR": "equipment_number"})
gis["latitude"] = pd.to_numeric(gis["LATITUDE"], errors="coerce")
gis["longitude"] = pd.to_numeric(gis["LONGITUDE"], errors="coerce")
gis = gis[["equipment_number", "latitude", "longitude"]]

permits = bronze["air_permits"]
permits = permits[permits["PERMIT_STATUS"].str.upper() == "ACTIVE"]
permits = permits.rename(columns={"EQUNR": "equipment_number", "PERMIT_NUMBER": "air_permit_number"})[
    ["equipment_number", "air_permit_number"]].drop_duplicates("equipment_number", keep="last")

xref = bronze["equipment_xref"].rename(columns={"EQUNR": "equipment_number", "SYSTEM": "system", "ALIAS": "alias_value"})
xref["system"] = upper_clean(xref["system"])
xref["alias_value"] = clean(xref["alias_value"])
silver_alias = xref.dropna(subset=["alias_value"]).drop_duplicates()

print("silver_equipment", len(silver_equipment), "| silver_characteristics", len(silver_characteristics),
      "| silver_verification", len(silver_verification), "| silver_alias", len(silver_alias))

# %% [markdown]
# ## Gold — equipment master and identity cross-reference

# %%
loaded_at = datetime.now(timezone.utc).replace(microsecond=0)

pi_route = (silver_alias[silver_alias["system"] == "PI"]
            .drop_duplicates("equipment_number", keep="first")
            .rename(columns={"alias_value": "pi_tag_route"})[["equipment_number", "pi_tag_route"]])

g = (silver_equipment
     .merge(silver_characteristics, on="equipment_number", how="left")
     .merge(pi_route, on="equipment_number", how="left")
     .merge(permits, on="equipment_number", how="left")
     .merge(gis, on="equipment_number", how="left")
     .merge(silver_verification, on="equipment_number", how="left"))

def to_int(s):
    return pd.to_numeric(s, errors="coerce").astype("Int64")

gold_equipment_master = pd.DataFrame({
    "equipment_number": g["equipment_number"],
    "atlas_id": g["atlas_id"],
    "equipment_class": g["equipment_class"],
    "equipment_subtype": g["equipment_subtype"],
    "description": g["description"],
    "floc": g["floc"],
    "facility": g["facility"],
    "area": g["area"],
    "pid_tag": g["pid_tag"],
    "pi_tag_route": g["pi_tag_route"],
    "manufacturer": g["manufacturer"],
    "model": g["model"],
    "serial_number": g["serial_number"],
    "engine_model": upper_clean(g["CO_ENGINE_MODEL"].fillna("")),
    "engine_serial": upper_clean(g["CO_ENGINE_SERIAL"].fillna("")),
    "horsepower": to_int(g["CO_RATED_HP"]),
    "stages": to_int(g["CO_STAGES"]),
    "heat_duty_mmbtu": pd.to_numeric(g["VE_HEAT_DUTY"], errors="coerce"),
    "fired_or_unfired": upper_clean(g["VE_FIRED_OR_UNFIRED"].fillna("")),
    "air_permit_number": g["air_permit_number"],
    "latitude": g["latitude"],
    "longitude": g["longitude"],
    "status": g["status"],
    "verification_status": g["verification_status"].fillna("NOT_VERIFIED"),
    "last_verified_at": g["last_verified_at"],
})
gold_equipment_master["source_systems"] = (
    "SAP"
    + g["pi_tag_route"].notna().map({True: ";PI", False: ""})
    + g["air_permit_number"].notna().map({True: ";INTELEX", False: ""})
    + g["latitude"].notna().map({True: ";GIS", False: ""})
    + g["verification_status"].notna().map({True: ";TRUECONTEXT", False: ""})
)
gold_equipment_master["gold_loaded_at"] = pd.Timestamp(loaded_at)

sap_alias = silver_equipment[["equipment_number"]].assign(system="SAP", alias_value=silver_equipment["equipment_number"])
gold_equipment_alias = (pd.concat([sap_alias, silver_alias], ignore_index=True)
                        .drop_duplicates()
                        .sort_values(["equipment_number", "system", "alias_value"])
                        .reset_index(drop=True))

print("gold_equipment_master", len(gold_equipment_master), "| gold_equipment_alias", len(gold_equipment_alias))
gold_equipment_master.head(3)

# %% [markdown]
# ## Write Delta tables
# Explicit schemas keep the SQL analytics endpoint types stable for the app connector.

# %%
from pyspark.sql.types import (StructType, StructField, StringType, IntegerType,
                               DoubleType, TimestampType)

MASTER_SCHEMA = StructType([
    StructField("equipment_number", StringType(), False),
    StructField("atlas_id", StringType(), True),
    StructField("equipment_class", StringType(), False),
    StructField("equipment_subtype", StringType(), True),
    StructField("description", StringType(), True),
    StructField("floc", StringType(), True),
    StructField("facility", StringType(), True),
    StructField("area", StringType(), True),
    StructField("pid_tag", StringType(), True),
    StructField("pi_tag_route", StringType(), True),
    StructField("manufacturer", StringType(), True),
    StructField("model", StringType(), True),
    StructField("serial_number", StringType(), True),
    StructField("engine_model", StringType(), True),
    StructField("engine_serial", StringType(), True),
    StructField("horsepower", IntegerType(), True),
    StructField("stages", IntegerType(), True),
    StructField("heat_duty_mmbtu", DoubleType(), True),
    StructField("fired_or_unfired", StringType(), True),
    StructField("air_permit_number", StringType(), True),
    StructField("latitude", DoubleType(), True),
    StructField("longitude", DoubleType(), True),
    StructField("status", StringType(), False),
    StructField("verification_status", StringType(), False),
    StructField("last_verified_at", TimestampType(), True),
    StructField("source_systems", StringType(), True),
    StructField("gold_loaded_at", TimestampType(), False),
])
ALIAS_SCHEMA = StructType([
    StructField("equipment_number", StringType(), False),
    StructField("system", StringType(), False),
    StructField("alias_value", StringType(), False),
])

def to_rows(df, schema):
    rows = []
    for rec in df.to_dict("records"):
        row = []
        for f in schema.fields:
            v = rec.get(f.name)
            if v is None or (not isinstance(v, str) and pd.isna(v)):
                v = None
            elif isinstance(f.dataType, IntegerType):
                v = int(v)
            elif isinstance(f.dataType, DoubleType):
                v = float(v)
            elif isinstance(f.dataType, TimestampType):
                v = pd.Timestamp(v).to_pydatetime().replace(tzinfo=None)
            row.append(v)
        rows.append(tuple(row))
    return rows

def save(df, name, schema, mode="overwrite"):
    sdf = spark.createDataFrame(to_rows(df, schema), schema)
    sdf.write.format("delta").mode(mode).option("overwriteSchema", "true").saveAsTable(name)
    print(f"wrote {name}: {sdf.count()} rows")

if WRITE_TO_LAKEHOUSE:
    # Silver (kept for lineage / troubleshooting)
    silver_equipment_s = StructType([StructField(c, StringType(), True) for c in silver_equipment.columns])
    save(silver_equipment, "silver_equipment", silver_equipment_s)
    save(silver_alias, "silver_equipment_alias", ALIAS_SCHEMA)
    # Gold (what the ATLAS app reads)
    save(gold_equipment_master, "gold_equipment_master", MASTER_SCHEMA)
    save(gold_equipment_alias, "gold_equipment_alias", ALIAS_SCHEMA)

# %% [markdown]
# ## Quick checks

# %%
print("Compressors:", (gold_equipment_master["equipment_class"] == "COMPRESSOR").sum(),
      "| Heaters:", (gold_equipment_master["equipment_class"] == "HEATER").sum())
print("Heaters missing heat duty:",
      ((gold_equipment_master["equipment_class"] == "HEATER") & gold_equipment_master["heat_duty_mmbtu"].isna()).sum())
print("Not verified:", (gold_equipment_master["verification_status"] == "NOT_VERIFIED").sum())
