import os
import time
import hashlib
from typing import Any, Dict, Iterable, Optional, Tuple, List

import requests
import psycopg
from psycopg.rows import dict_row

# ============================================================
# 1) Konfiguration: DB-Zugangsdaten über ENV (Docker-friendly)
# ============================================================
DB_HOST = os.getenv("DB_HOST", "db")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_NAME = os.getenv("DB_NAME", "bachelor")
DB_USER = os.getenv("DB_USER", "bachelor")
DB_PASSWORD = os.getenv("DB_PASSWORD", "bachelor")

SOURCE = "kvwl"

# ============================================================
# 2) KVWL HTTP Calls: Search und Detail
# ============================================================
SEARCH_URL = "https://www.kvwl.de/DocSearchService/DocSearchService/searchDocs"
DETAIL_URL = "https://www.kvwl.de/DocSearchService/DocSearchService/getDoctor"

HEADERS = {
    "Content-Type": "application/json;charset=UTF-8",
    "Accept": "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0 (compatible; BachelorarbeitScraper/1.0)",
}


def kvwl_search(payload: Dict[str, Any]) -> Dict[str, Any]:
    r = requests.post(SEARCH_URL, json=payload, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()


def kvwl_get_doctor(doc_id: str) -> Dict[str, Any]:
    r = requests.post(DETAIL_URL, json={"Id": doc_id}, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()


# ============================================================
# 3) DB-Startup-Helper: warten bis Postgres erreichbar ist
# ============================================================
def wait_for_db(max_tries: int = 30, sleep_s: float = 1.0) -> None:
    for i in range(max_tries):
        try:
            with psycopg.connect(
                host=DB_HOST,
                port=DB_PORT,
                dbname=DB_NAME,
                user=DB_USER,
                password=DB_PASSWORD,
            ) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1;")
            print("[scraper] DB is ready.")
            return
        except Exception as e:
            print(f"[scraper] waiting for DB ({i+1}/{max_tries})... {e}")
            time.sleep(sleep_s)
    raise RuntimeError("DB did not become ready in time.")


# ============================================================
# 4) Iterator: alle Arzt-Ids paginiert einsammeln
# ============================================================
def iter_doctor_ids(lat: float, lon: float, page_size: int = 20) -> Iterable[str]:
    page_id = 0

    while True:
        payload = {
            "PageId": page_id,
            "PageSize": page_size,
            "Latitude": lat,
            "Longitude": lon,
            "ExpertiseAreaStructureId": "",
            "DocNamePattern": "",
            "ApplicableQualificationId": "",
            "DocGender": "",
            "SpecialServiceId": "",
            "LanguageId": "",
            "BarrierFreeAttributeFilter": {"ids": []},
        }

        data = kvwl_search(payload)
        abstracts = (((data.get("DoctorAbstracts") or {}).get("DoctorAbstract")) or [])
        if not abstracts:
            return

        for a in abstracts:
            doc_id = a.get("Id")
            if doc_id:
                yield str(doc_id)

        if len(abstracts) < page_size:
            return

        page_id += 1
        time.sleep(0.2)


# ============================================================
# 5) Mapping Helper
# ============================================================
def safe_str(v: Any) -> str:
    return str(v).strip() if v is not None else ""


def sha1(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def pick_practice_name(detail: Dict[str, Any]) -> str:
    practice = detail.get("Practice") or {}
    return safe_str(practice.get("practiceName")) or "Unbekannte Praxis"


def pick_type_for_facility(detail: Dict[str, Any]) -> str:
    # Du wolltest erstmal kein Enum. Für Facility nehmen wir einfach ARZTPRAXIS.
    return "ARZTPRAXIS"


def pick_specialty(detail: Dict[str, Any]) -> Optional[str]:
    expertise = (detail.get("ExpertiseAreas") or {}).get("ExpertiseArea") or []
    if expertise:
        name = expertise[0].get("name")
        if name:
            return safe_str(name)
    return None


def pick_doctor_name(detail: Dict[str, Any]) -> str:
    first = safe_str(detail.get("FirstName"))
    last = safe_str(detail.get("LastName"))
    full = f"{first} {last}".strip()
    return full or "Unbekannt"


def pick_wheelchair(detail: Dict[str, Any]) -> Optional[bool]:
    attrs = (detail.get("BarrierFreeAttributes") or {}).get("BarrierFreeAttribute") or []
    if not attrs:
        return None
    return True


def extract_location(detail: Dict[str, Any]) -> Tuple[Optional[float], Optional[float], str, str, str]:
    loc = detail.get("Location") or {}
    coords = loc.get("Coordinates") or {}
    lat = coords.get("Latitude")
    lon = coords.get("Longitude")
    street = safe_str(loc.get("Street"))
    postal = safe_str(loc.get("PostalCode"))
    city = safe_str(loc.get("City"))
    return lat, lon, street, postal, city


def pick_phone(detail: Dict[str, Any]) -> str:
    return safe_str(detail.get("Phone"))


def compute_facility_source_key(street: str, postal: str, city: str, lat: Optional[float], lon: Optional[float]) -> str:
    """
    Facility = Standort/Praxis.
    Best case: Adresse ist vorhanden (bei dir ja: Street/PostalCode/City).
    Fallback: falls Adresse fehlt -> lat/lon.
    """
    if street and postal and city:
        raw = f"{SOURCE}|{street}|{postal}|{city}".lower()
    else:
        raw = f"{SOURCE}|{lat}|{lon}".lower()
    return sha1(raw)


# ============================================================
# 6) SQL: Facility upsert + Doctors replace
# ============================================================
UPSERT_FACILITY_RETURN_ID = """
INSERT INTO facilities
  (source, source_key, facility_name, type, street, postal_code, city, phone, latitude, longitude, wheelchair_accessible)
VALUES
  (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
ON CONFLICT (source, source_key)
DO UPDATE SET
  facility_name = EXCLUDED.facility_name,
  type = EXCLUDED.type,
  street = EXCLUDED.street,
  postal_code = EXCLUDED.postal_code,
  city = EXCLUDED.city,
  phone = EXCLUDED.phone,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  wheelchair_accessible = EXCLUDED.wheelchair_accessible
RETURNING id;
"""

DELETE_DOCTORS_FOR_FACILITY = "DELETE FROM doctors WHERE facility_id = %s;"

INSERT_DOCTORS = """
INSERT INTO doctors (facility_id, source, source_key, first_name, last_name, name, specialty)
VALUES (%s, %s, %s, %s, %s, %s, %s);
"""



# ============================================================
# 7) Main
# ============================================================
def main():
    wait_for_db()

    # Basis-Koordinaten (deine 45881 Suche)
    base_lat = 51.5285024259591
    base_lon = 7.07863180952606

    # 1) Scrape: Wir sammeln alle Arzt-Details, gruppieren nach Facility (Adresse)
    facilities: Dict[str, Dict[str, Any]] = {}

    for doc_id in iter_doctor_ids(base_lat, base_lon, page_size=20):
        detail = kvwl_get_doctor(doc_id)

        # Facility-Daten (Standort)
        lat, lon, street, postal, city = extract_location(detail)
        facility_key = compute_facility_source_key(street, postal, city, lat, lon)

        if facility_key not in facilities:
            facilities[facility_key] = {
                "source": SOURCE,
                "source_key": facility_key,
                "facility_name": pick_practice_name(detail),
                "type": pick_type_for_facility(detail),
                "street": street,
                "postal_code": postal,
                "city": city,
                "phone": pick_phone(detail),
                "latitude": lat,
                "longitude": lon,
                "wheelchair_accessible": pick_wheelchair(detail),
                # doctors als dict, um doppelte IDs zu vermeiden
                "doctors": {},
            }

        # Doctor-Daten (Arzt)
        doctor_id = safe_str(detail.get("Id") or doc_id)  # KVWL Arzt-ID
        first = safe_str(detail.get("FirstName"))
        last = safe_str(detail.get("LastName"))
        name = pick_doctor_name(detail)
        specialty = pick_specialty(detail)

        facilities[facility_key]["doctors"][doctor_id] = {
            "source": SOURCE,
            "source_key": doctor_id,   # Arzt ID als source_key in doctors
            "first_name": first,
            "last_name": last,
            "name": name,
            "specialty": specialty,
        }

        time.sleep(0.2)

    print(f"[scraper] Facilities gruppiert: {len(facilities)}")

    # 2) Persist: Facility upsert + Doctors replace (delete + bulk insert)
    with psycopg.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        row_factory=dict_row,
    ) as conn:
        with conn.cursor() as cur:
            facilities_written = 0
            doctors_written = 0

            for fac in facilities.values():
                # 2.1 Facility upsert → facility_id bekommen
                cur.execute(
                    UPSERT_FACILITY_RETURN_ID,
                    (
                        fac["source"],
                        fac["source_key"],
                        fac["facility_name"],
                        fac["type"],
                        fac["street"],
                        fac["postal_code"],
                        fac["city"],
                        fac["phone"],
                        fac["latitude"],
                        fac["longitude"],
                        fac["wheelchair_accessible"],
                    ),
                )
                facility_id = cur.fetchone()["id"]
                facilities_written += 1

                # 2.2 Doctors dieser Facility ersetzen
                cur.execute(DELETE_DOCTORS_FOR_FACILITY, (facility_id,))

                rows = []
                for d in fac["doctors"].values():
                    rows.append(
                        (
                            facility_id,
                            d["source"],
                            d["source_key"],
                            d["first_name"],
                            d["last_name"],
                            d["name"],
                            d["specialty"],
                        )
                    )

                if rows:
                    cur.executemany(INSERT_DOCTORS, rows)
                    doctors_written += len(rows)

            conn.commit()

    print(f"[scraper] ✅ Facilities upserted: {facilities_written}")
    print(f"[scraper] ✅ Doctors inserted: {doctors_written}")


if __name__ == "__main__":
    main()
