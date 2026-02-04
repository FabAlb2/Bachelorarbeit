import os
import time
import hashlib
from typing import Any, Dict, Iterable, Optional, Tuple, List
from sources.gelsenkirchen_gesundheitskarte import persist_gelsenkirchen_gesundheitskarte

import requests
import psycopg
from psycopg.rows import dict_row

# ============================================================
# 1) Konfiguration: DB-Zugangsdaten über ENV (Docker-friendly).
# In Docker (docker-compose) werden diese Werte typischerweise
# als Environment-Variablen gesetzt.
# ============================================================
DB_HOST = os.getenv("DB_HOST", "db")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_NAME = os.getenv("DB_NAME", "bachelor")
DB_USER = os.getenv("DB_USER", "bachelor")
DB_PASSWORD = os.getenv("DB_PASSWORD", "bachelor")


# Datenquelle-Label (für Multi-Scraper später)
SOURCE = "kvwl"


# ============================================================
# 2) KVWL HTTP Calls: Search und Detail
# KVWL bietet (zumindest für diese Seite) JSON-Endpunkte:
# - searchDocs: liefert eine Liste von "Abstracts" mit Arzt-Ids (paginierbar)
# - getDoctor: liefert Detailinformationen für eine Arzt-Id
#
# HEADERS: Damit Requests nicht sofort blockiert werden, setzen
# wir u.a. Content-Type und einen User-Agent.
# ============================================================
SEARCH_URL = "https://www.kvwl.de/DocSearchService/DocSearchService/searchDocs"
DETAIL_URL = "https://www.kvwl.de/DocSearchService/DocSearchService/getDoctor"

HEADERS = {
    "Content-Type": "application/json;charset=UTF-8",
    "Accept": "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0 (compatible; BachelorarbeitScraper/1.0)",
}


def kvwl_search(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Führt einen KVWL-Such-Request aus und gibt das JSON zurück."""
    r = requests.post(SEARCH_URL, json=payload, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()


def kvwl_get_doctor(doc_id: str) -> Dict[str, Any]:
    """Lädt KVWL-Detaildaten für eine Arzt-Id (Id Feld muss 'Id' heißen)."""
    r = requests.post(DETAIL_URL, json={"Id": doc_id}, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()

# Funktion von gelsenkirchen_gesundheitskarte.py
def run_html_sources(conn) -> None:
    
    print("[scraper] 🌐 Starte HTML-Quellen...")
    persist_gelsenkirchen_gesundheitskarte(conn)
    # Weitere Quellen können hinzugefügt werden

    print("[scraper] 🌐 HTML-Quellen abgeschlossen.")
    
    
    
    
# ============================================================
# 3) DB-Startup-Helper: warten bis Postgres erreichbar ist
# In Docker starten Container parallel. Postgres braucht meist
# ein paar Sekunden, bis er "ready" ist. Damit der Scraper nicht
# mit Connection-Errors abbricht, warten wir aktiv mit Retries.
# ============================================================
def wait_for_db(max_tries: int = 30, sleep_s: float = 1.0) -> None:
    """Blockiert bis Postgres erreichbar ist oder wir nach max_tries abbrechen."""
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
# KVWL liefert Suchergebnisse in Seiten (PageId, PageSize).
# Wir laufen so lange, bis eine Seite weniger Elemente als
# page_size enthält (oder gar keine), dann sind wir am Ende.
# ============================================================
def iter_doctor_ids(lat: float, lon: float, page_size: int = 20) -> Iterable[str]:
    """Yieldet KVWL-Arzt-Ids für eine Basis-Position (lat/lon), Seite für Seite."""
    page_id = 0

    while True:
        payload = {
            "PageId": page_id,
            "PageSize": page_size,
            "Latitude": lat,
            "Longitude": lon,
            # weitere Filter bleiben erstmal leer, damit wir möglichst viele Treffer erhalten
            "ExpertiseAreaStructureId": "",
            "DocNamePattern": "",
            "ApplicableQualificationId": "",
            "DocGender": "",
            "SpecialServiceId": "",
            "LanguageId": "",
            "BarrierFreeAttributeFilter": {"ids": []},
        }

        data = kvwl_search(payload)
        
        # KVWL packt das Array an etwas verschachtelter Stelle:
        # data["DoctorAbstracts"]["DoctorAbstract"] -> list
        abstracts = (((data.get("DoctorAbstracts") or {}).get("DoctorAbstract")) or [])
        if not abstracts:
            return

        for a in abstracts:
            doc_id = a.get("Id")
            if doc_id:
                yield str(doc_id)

        # Wenn weniger als page_size -> letzte Seite erreicht
        if len(abstracts) < page_size:
            return

        page_id += 1
        time.sleep(0.2) # kleine Pause für KVWL Seite




# ============================================================
# 5) Mapping Helper
# Die KVWL-JSON-Struktur ist nicht überall konsistent (z.B. None,
# leere Strings, verschachtelte Objekte). Diese Helfer normalisieren
# Werte und ziehen die wichtigsten Felder aus den Detaildaten.
# ============================================================


# Konvertiert in string und trimmt; None ->
def safe_str(v: Any) -> str:
    return str(v).strip() if v is not None else ""


# Stabile Hash-Funktion für Keys, damit keine ewig langen Keys gespeichert werden müssen.
def sha1(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


# Praxis-/Standort-Name (falls vorhanden), sonst Fallback.
def pick_practice_name(detail: Dict[str, Any]) -> str:
    practice = detail.get("Practice") or {}
    return safe_str(practice.get("practiceName")) or "Unbekannte Praxis"


# Facility-Typ: aktuell hardcoded, weil ich erstmal kein Enum wollte.
def pick_type_for_facility(detail: Dict[str, Any]) -> str:
    return "ARZTPRAXIS"


# Fachgebiet: nimmt aktuell das erste ExpertiseArea-Element (wenn vorhanden).
def pick_specialty(detail: Dict[str, Any]) -> Optional[str]:
    expertise = (detail.get("ExpertiseAreas") or {}).get("ExpertiseArea") or []
    if expertise:
        name = expertise[0].get("name")
        if name:
            return safe_str(name)
    return None


# Display-Name für Ärzte: Vorname + Nachname als Fallback-Logik.
def pick_doctor_name(detail: Dict[str, Any]) -> str:
    first = safe_str(detail.get("FirstName"))
    last = safe_str(detail.get("LastName"))
    full = f"{first} {last}".strip()
    return full or "Unbekannt"


# Barrierefreiheit: sehr grob. Wenn KVWL Attributes liefert -> True, sonst None.
def pick_wheelchair(detail: Dict[str, Any]) -> Optional[bool]:
    attrs = (detail.get("BarrierFreeAttributes") or {}).get("BarrierFreeAttribute") or []
    if not attrs:
        return None
    return True


# Extrahiert Koordinaten und Adresse aus dem Detailobjekt.
def extract_location(detail: Dict[str, Any]) -> Tuple[Optional[float], Optional[float], str, str, str]:
    loc = detail.get("Location") or {}
    coords = loc.get("Coordinates") or {}
    lat = coords.get("Latitude")
    lon = coords.get("Longitude")
    street = safe_str(loc.get("Street"))
    postal = safe_str(loc.get("PostalCode"))
    city = safe_str(loc.get("City"))
    return lat, lon, street, postal, city


# Telefonnummer aus dem Detailobjekt.
def pick_phone(detail: Dict[str, Any]) -> str:
    return safe_str(detail.get("Phone"))


# Berechnet einen stabilen Key für eine Facility (= Standort/Praxis).
# Idee:
# - Best case: Adresse ist vorhanden -> source|street|postal|city
#     Dadurch werden mehrere Ärzte derselben Praxis (gleiche Adresse) zusammengeführt.
# - Fallback: falls Adresse fehlt -> source|lat|lon
# 
# Der Rückgabewert ist ein SHA1-Hash, damit wir immer ein fixes, kurzes Key-Format haben.
def compute_facility_source_key(street: str, postal: str, city: str, lat: Optional[float], lon: Optional[float]) -> str:
    if street and postal and city:
        raw = f"{SOURCE}|{street}|{postal}|{city}".lower()
    else:
        raw = f"{SOURCE}|{lat}|{lon}".lower()
    return sha1(raw)


# ============================================================
# 6) SQL: Facility upsert + Doctors replace
# - UPSERT_FACILITY_RETURN_ID:
#   Schreibt facility, wenn (source, source_key) noch nicht existiert,
#   sonst Update und RETURNING id, damit wir sofort den PK haben.
#
# - DELETE_DOCTORS_FOR_FACILITY:
#   Wir ersetzen die Doctors pro Facility immer komplett.
#   Das ist simpel und robust, solange die Datenmenge klein/mittel ist.
#
# - INSERT_DOCTORS:
#   Bulk Insert per executemany()
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

        # Facility-Daten (Standort) extrahieren und einen stabilen Key berechnen
        lat, lon, street, postal, city = extract_location(detail)
        facility_key = compute_facility_source_key(street, postal, city, lat, lon)

        # 1.2 Facility neu anlegen, falls noch nicht vorhanden
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

        # Doctor-Daten (Arzt) extrahieren
        doctor_id = safe_str(detail.get("Id") or doc_id)  # KVWL Arzt-ID
        first = safe_str(detail.get("FirstName"))
        last = safe_str(detail.get("LastName"))
        name = pick_doctor_name(detail)
        specialty = pick_specialty(detail)

        # In die Facility-Gruppe schreiben (KVWL-Id ist pro Arzt eindeutig)
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
    # row_factory=dict_row sorgt dafür, dass fetchone() dicts liefert (cur.fetchone()["id"])
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

                # 2.2 Doctors dieser Facility ersetzen (löschen und neu einfügen)
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

            # 2.3 Transaktion abschließen
            conn.commit()
            
            print("[scraper] ✅ KVWL fertig – starte HTML-Quellen...")
            try:
                run_html_sources(conn)  # nutzt dieselbe Connection
                conn.commit()           # commit für HTML-Daten
            except Exception as e:
                print(f"[scraper] ❌ HTML-Quellen Fehler: {e}")

        # jetzt sind wir außerhalb der Connection → alles fertig
        print(f"[scraper] ✅ Facilities upserted: {facilities_written}")
        print(f"[scraper] ✅ Doctors inserted: {doctors_written}")
        print("[scraper] ✅ Alles fertig.")
            
            




if __name__ == "__main__":
    main()
