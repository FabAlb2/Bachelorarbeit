# sources/aponet_apothekensuche.py
import os
import hashlib
import random
import time
from typing import Any, Dict, List, Optional

import requests

# ==============================
# KONSTANTEN
# ==============================
URL = "https://www.aponet.de/apotheke/apothekensuche"
SOURCE = "aponet_apotheken"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; BachelorarbeitScraper/1.0)",
    "Accept": "application/json,text/html,*/*",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.7",
}

SEARCH_TERM = os.getenv("APONET_PLZORT", "gelsenkirchen")
RADIUS_KM = int(os.getenv("APONET_RADIUS", "20"))  # nimm erstmal 20 wie im Browser
TIMEOUT = 30

# ==============================
# HILFSFUNKTIONEN
# ==============================
def _sha1(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def _facility_key(name: str, street: str, postal: str, city: str) -> str:
    raw = f"{SOURCE}|{name}|{street}|{postal}|{city}".lower()
    return _sha1(raw)


def _clean(s: Optional[str]) -> str:
    return (s or "").strip()


def _try_float(x: Any) -> Optional[float]:
    if x is None:
        return None
    try:
        return float(str(x).replace(",", ".").strip())
    except Exception:
        return None


def _is_in_gelsenkirchen(city: str, postal: str) -> bool:
    c = (city or "").lower().strip()
    p = (postal or "").strip()
    return ("gelsenkirchen" in c) or p.startswith("458")


# ==============================
# 1) SCRAPEN (JSON -> Python Dicts)
# ==============================
def _fetch_page(session: requests.Session, page: int, token: Optional[str]) -> Dict[str, Any]:

    # 1) Erst normale Seite aufrufen (setzt Cookies)
    session.get(
        "https://www.aponet.de/apotheke/apothekensuche/gelsenkirchen",
        headers=HEADERS,
        timeout=TIMEOUT,
    )

    params = {
        "type": "1981",
        "tx_aponetpharmacy_search[action]": "result",
        "tx_aponetpharmacy_search[controller]": "Search",

        "tx_aponetpharmacy_search[search][plzort]": "gelsenkirchen",
        "tx_aponetpharmacy_search[search][strasse]": "-",
        "tx_aponetpharmacy_search[search][radius]": "20",
        "tx_aponetpharmacy_search[search][lat]": "",
        "tx_aponetpharmacy_search[search][lng]": "",
        "tx_aponetpharmacy_search[search][date]": "",

        "tx_aponetpharmacy_search[search][page]": str(page),
    }

    r = session.get(
        "https://www.aponet.de/apotheke/apothekensuche",
        params=params,
        headers={
            **HEADERS,
            "Referer": "https://www.aponet.de/apotheke/apothekensuche/gelsenkirchen",
        },
        timeout=TIMEOUT,
    )

    r.raise_for_status()
    return r.json()


def scrape_all_facilities(max_pages: int = 200) -> List[Dict]:
    session = requests.Session()

    token: Optional[str] = None
    items: List[Dict] = []

    total_seen = 0

    for page in range(max_pages):
        data = _fetch_page(session, page=page, token=token)

        # token beim ersten Call aus der Antwort übernehmen
        if token is None:
            token = (data.get("args") or {}).get("token")

        results = data.get("results") or {}
        statistik = results.get("statistik") or {}
        anzahl = statistik.get("anzahl")

        apo_list = ((results.get("apotheken") or {}).get("apotheke")) or []
        total_seen += len(apo_list)

        # Debug (kannst du drin lassen, ist hilfreich)
        print(f"[scraper] [APONET] page={page} statistik.anzahl={anzahl} page_len={len(apo_list)}")

        # Abbruch: keine Treffer mehr
        if not apo_list:
            break

        for a in apo_list:
            name = _clean(a.get("name"))
            street = _clean(a.get("strasse"))
            postal = _clean(a.get("plz"))
            city = _clean(a.get("ort"))

            # nur Gelsenkirchen
            if not _is_in_gelsenkirchen(city, postal):
                continue

            lat = _try_float(a.get("latitude"))
            lon = _try_float(a.get("longitude"))
            phone = _clean(a.get("telefon"))

            items.append(
                {
                    "source": SOURCE,
                    "source_key": _facility_key(name, street, postal, city),
                    "facility_name": name,
                    "type": "APOTHEKE",
                    "street": street,
                    "postal_code": postal,
                    "city": city,
                    "phone": phone,
                    "latitude": lat,
                    "longitude": lon,
                    "wheelchair_accessible": None,
                }
            )

        # freundlich sein
        time.sleep(random.uniform(0.6, 1.2))

    # (optional) kurze Zusammenfassung
    print(f"[scraper] [APONET] gesammelt={len(items)} (nach Filter), gesehen_in_pages={total_seen}")
    return items


# ==============================
# 2) PERSISTIEREN (Dicts -> DB)
# ==============================
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


def persist_aponet_apotheken_gelsenkirchen(conn) -> int:
    facilities = scrape_all_facilities()

    if not facilities:
        print("[scraper] [APONET] Keine Apotheken (Gelsenkirchen) gefunden.")
        return 0

    written = 0
    with conn.cursor() as cur:
        for fac in facilities:
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
            cur.fetchone()
            written += 1

    print(f"[scraper] [APONET] ✅ Apotheken upserted: {written}")
    return written


# ==============================
# 3) ALLEINE STARTEN (ohne main.py)
# ==============================
if __name__ == "__main__":
    # Standalone-Test OHNE DB: nur scrapen und die ersten Einträge anzeigen
    facilities = scrape_all_facilities()
    print(f"[scraper] [APONET] FINAL count={len(facilities)}")
    for f in facilities[:10]:
        print(f"- {f['facility_name']} | {f['street']} | {f['postal_code']} {f['city']}")