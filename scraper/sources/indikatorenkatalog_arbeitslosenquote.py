import csv
from datetime import date, datetime
from decimal import Decimal
from typing import Any


CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS district_unemployment (
    id BIGSERIAL PRIMARY KEY,
    stichtag DATE NOT NULL,
    stadtteil_id INTEGER NOT NULL,
    stadtteil_name VARCHAR(255) NOT NULL,
    arbeitslosenanteil NUMERIC(6,2),
    arbeitslosenanteil_maennlich NUMERIC(6,2),
    arbeitslosenanteil_weiblich NUMERIC(6,2),
    arbeitslosenanteil_deutsch NUMERIC(6,2),
    arbeitslosenanteil_nichtdeutsch NUMERIC(6,2),
    jugendarbeitslosigkeit_u25 NUMERIC(6,2),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_district_unemployment UNIQUE (stichtag, stadtteil_id)
);
"""

CREATE_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_district_unemployment_stichtag
ON district_unemployment (stichtag);
"""

UPSERT_SQL = """
INSERT INTO district_unemployment (
    stichtag,
    stadtteil_id,
    stadtteil_name,
    arbeitslosenanteil,
    arbeitslosenanteil_maennlich,
    arbeitslosenanteil_weiblich,
    arbeitslosenanteil_deutsch,
    arbeitslosenanteil_nichtdeutsch,
    jugendarbeitslosigkeit_u25,
    updated_at
)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
ON CONFLICT (stichtag, stadtteil_id)
DO UPDATE SET
    stadtteil_name = EXCLUDED.stadtteil_name,
    arbeitslosenanteil = EXCLUDED.arbeitslosenanteil,
    arbeitslosenanteil_maennlich = EXCLUDED.arbeitslosenanteil_maennlich,
    arbeitslosenanteil_weiblich = EXCLUDED.arbeitslosenanteil_weiblich,
    arbeitslosenanteil_deutsch = EXCLUDED.arbeitslosenanteil_deutsch,
    arbeitslosenanteil_nichtdeutsch = EXCLUDED.arbeitslosenanteil_nichtdeutsch,
    jugendarbeitslosigkeit_u25 = EXCLUDED.jugendarbeitslosigkeit_u25,
    updated_at = NOW();
"""


def ensure_schema(conn) -> None:
    with conn.cursor() as cur:
        cur.execute(CREATE_TABLE_SQL)
        cur.execute(CREATE_INDEX_SQL)


def parse_date(value: Any) -> date | None:
    if value is None:
        return None

    value = str(value).strip()
    if value == "":
        return None

    if isinstance(value, datetime):
        return value.date()

    if isinstance(value, date):
        return value

    return date.fromisoformat(value)


def to_decimal(value: Any) -> Decimal | None:
    if value is None:
        return None

    value = str(value).strip()
    if value == "":
        return None

    value = value.replace(",", ".")
    return Decimal(value)


def is_stadtteil(raum_id: int) -> bool:
    return 10 <= raum_id <= 52


def persist_unemployment_from_csv(conn, csv_path: str) -> int:
    ensure_schema(conn)

    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f, delimiter=";")
        rows = list(reader)

    if len(rows) < 9:
        raise ValueError("CSV-Datei hat zu wenige Zeilen.")

    # Zeile 8 enthält die eigentlichen Spaltennamen
    header = rows[7]

    headers = {}
    for idx, col in enumerate(header):
        col_name = str(col).strip()
        if col_name:
            headers[col_name] = idx

    required = [
        "Stichtag",
        "Raum_ID",
        "Raum_Name",
        "Arbeitslosenanteil",
        "Arbeitslosenanteil, männlich",
        "Arbeitslosenanteil, weiblich",
        "Arbeitslosenanteil, deutsch",
        "Arbeitslosenanteil, nichtdeutsch",
        "Jugendarbeitslosigkeit unter 25 Jahre",
    ]

    missing = [col for col in required if col not in headers]
    if missing:
        raise ValueError(f"Fehlende Spalten in CSV-Datei: {missing}")

    written = 0

    with conn.cursor() as cur:
        for row in rows[8:]:
            if not row:
                continue

            # Zeilen ggf. auf Header-Länge auffüllen
            if len(row) < len(header):
                row = row + [""] * (len(header) - len(row))

            stichtag_raw = row[headers["Stichtag"]]
            raum_id_raw = row[headers["Raum_ID"]]
            raum_name_raw = row[headers["Raum_Name"]]

            if str(stichtag_raw).strip() == "" or str(raum_id_raw).strip() == "":
                continue

            raum_id = int(str(raum_id_raw).strip())
            if not is_stadtteil(raum_id):
                continue

            stichtag = parse_date(stichtag_raw)
            stadtteil_name = str(raum_name_raw).strip()

            arbeitslosenanteil = to_decimal(row[headers["Arbeitslosenanteil"]])
            arbeitslosenanteil_maennlich = to_decimal(row[headers["Arbeitslosenanteil, männlich"]])
            arbeitslosenanteil_weiblich = to_decimal(row[headers["Arbeitslosenanteil, weiblich"]])
            arbeitslosenanteil_deutsch = to_decimal(row[headers["Arbeitslosenanteil, deutsch"]])
            arbeitslosenanteil_nichtdeutsch = to_decimal(row[headers["Arbeitslosenanteil, nichtdeutsch"]])
            jugendarbeitslosigkeit_u25 = to_decimal(row[headers["Jugendarbeitslosigkeit unter 25 Jahre"]])

            cur.execute(
                UPSERT_SQL,
                (
                    stichtag,
                    raum_id,
                    stadtteil_name,
                    arbeitslosenanteil,
                    arbeitslosenanteil_maennlich,
                    arbeitslosenanteil_weiblich,
                    arbeitslosenanteil_deutsch,
                    arbeitslosenanteil_nichtdeutsch,
                    jugendarbeitslosigkeit_u25,
                ),
            )
            written += 1

    return written