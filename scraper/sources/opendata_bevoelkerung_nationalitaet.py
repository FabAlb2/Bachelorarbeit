# sources/opendata_bevoelkerung_nationalitaet.py
import csv
import datetime
from typing import Optional



CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS district_population (
  id BIGSERIAL PRIMARY KEY,

  stichtag DATE NOT NULL,

  stadtbezirk_id INT,
  stadtbezirk_name TEXT,

  stadtteil_id INT NOT NULL,
  stadtteil_name TEXT NOT NULL,

  deutsch INT,
  deutsch_mit_2_sta INT,
  nichtdeutsch INT,

  gesamt INT GENERATED ALWAYS AS (
    COALESCE(deutsch,0) + COALESCE(nichtdeutsch,0)
  ) STORED,

  UNIQUE (stichtag, stadtteil_id)
);
"""



UPSERT_POP_SQL = """
INSERT INTO district_population
(stichtag, stadtbezirk_id, stadtbezirk_name, stadtteil_id, stadtteil_name,
 deutsch, deutsch_mit_2_sta, nichtdeutsch)
VALUES
(%s,%s,%s,%s,%s,%s,%s,%s)
ON CONFLICT (stichtag, stadtteil_id)
DO UPDATE SET
  stadtbezirk_id = EXCLUDED.stadtbezirk_id,
  stadtbezirk_name = EXCLUDED.stadtbezirk_name,
  stadtteil_name = EXCLUDED.stadtteil_name,
  deutsch = EXCLUDED.deutsch,
  deutsch_mit_2_sta = EXCLUDED.deutsch_mit_2_sta,
  nichtdeutsch = EXCLUDED.nichtdeutsch;
"""

def _parse_int(v: Optional[str]) -> Optional[int]:
    if v is None:
        return None
    s = v.strip().strip('"')
    if s == "" or s == "*":
        return None
    return int(s)

def _parse_date(v: str) -> datetime.date:
    s = (v or "").strip().strip('"')
    # Format: 31.12.2025
    return datetime.datetime.strptime(s, "%d.%m.%Y").date()

def persist_population_from_csv(conn, csv_path: str) -> int:
    """
    Liest die OpenData-CSV (Bevölkerung Nationalität) und upserted nach district_population.
    Erwartet delimiter=';' und Spalten wie in deiner Datei.
    """
    written = 0
    
    with conn.cursor() as cur:
        cur.execute(CREATE_TABLE_SQL)

    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        with conn.cursor() as cur:
            for row in reader:
                stichtag = _parse_date(row["Stichtag"])
                stadtbezirk_id = _parse_int(row.get("Stadtbezirk_ID"))
                stadtbezirk_name = (row.get("Stadtbezirk_Name") or "").strip().strip('"')

                stadtteil_id = _parse_int(row.get("Stadtteil_ID"))
                stadtteil_name = (row.get("Stadtteil_Name") or "").strip().strip('"')

                deutsch = _parse_int(row.get("deutsch"))
                deutsch_mit_2_sta = _parse_int(row.get("davon deutsch mit 2. StA"))
                nichtdeutsch = _parse_int(row.get("nichtdeutsch"))

                if stadtteil_id is None:
                    continue

                cur.execute(
                    UPSERT_POP_SQL,
                    (
                        stichtag,
                        stadtbezirk_id,
                        stadtbezirk_name,
                        stadtteil_id,
                        stadtteil_name,
                        deutsch,
                        deutsch_mit_2_sta,
                        nichtdeutsch,
                    ),
                )
                written += 1

    print(f"[opendata] ✅ district_population upserted: {written}")
    return written