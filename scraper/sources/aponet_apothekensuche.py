# sources/aponet_apothekensuche.py
import os
import re
import hashlib
import time
import random
from typing import Any, Dict, List, Optional, Set

import requests

# ==============================
# KONSTANTEN
# ==============================
BASE_URL = "https://www.aponet.de/apotheke/apothekensuche"
SOURCE = "aponet_apotheken"

SEARCH_TERM = os.getenv("APONET_PLZORT", "Gelsenkirchen")
RADIUS_KM = int(os.getenv("APONET_RADIUS", "10"))
TIMEOUT = int(os.getenv("APONET_TIMEOUT", "30"))

# Manuell aus Browser/Postman übergeben (derzeit der zuverlässige Weg)
# Beispiel:
# docker compose run --rm -e APONET_TOKEN=2168... scraper python /app/sources/aponet_apothekensuche.py
TOKEN_FROM_ENV = os.getenv("APONET_TOKEN")

HEADERS_HTML = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.7",
}

# Entspricht deinem funktionierenden Request (Postman/Browser)
HEADERS_AJAX = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": BASE_URL,
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.7",
}


# ==============================
# HILFSFUNKTIONEN
# ==============================
def _sha1(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def _facility_key(name: str, street: str, postal: str, city: str) -> str:
    raw = f"{SOURCE}|{name}|{street}|{postal}|{city}".lower()
    return _sha1(raw)


def _clean(v: Any) -> str:
    if v is None:
        return ""
    return str(v).strip()


def _try_float(v: Any) -> Optional[float]:
    if v in (None, "", []):
        return None
    try:
        return float(str(v).replace(",", ".").strip())
    except Exception:
        return None


def _is_in_gelsenkirchen(city: str, postal: str) -> bool:
    """
    Robust:
    - Stadtname enthält 'gelsenkirchen'
    - oder PLZ beginnt mit 458
    """
    c = _clean(city).lower()
    p = _clean(postal)
    return ("gelsenkirchen" in c) or p.startswith("458")


# ==============================
# TOKEN BESCHAFFUNG
# ==============================
def fetch_token(session: requests.Session) -> str:
    # 1) ENV-Fallback 
    if TOKEN_FROM_ENV:
        print(f"[aponet] Verwende APONET_TOKEN aus ENV: {TOKEN_FROM_ENV[:12]}...")
        # Seite optional laden (Cookies/Session)
        try:
            session.get(BASE_URL, headers=HEADERS_HTML, timeout=TIMEOUT)
        except Exception:
            pass
        return TOKEN_FROM_ENV.strip()

    # 2) Versuch: Token aus HTML ziehen (funktioniert evtl. nicht immer)
    r = session.get(BASE_URL, headers=HEADERS_HTML, timeout=TIMEOUT)
    r.raise_for_status()
    html = r.text

    patterns = [
        r'name="tx_aponetpharmacy_search\[token\]"\s+value="([^"]+)"',
        r'value="([a-f0-9]{64})"[^>]*name="tx_aponetpharmacy_search\[token\]"',
        r'"token"\s*:\s*"([a-f0-9]{64})"',
        r"tx_aponetpharmacy_search\[token\][^a-f0-9]*([a-f0-9]{64})",
    ]

    for pat in patterns:
        m = re.search(pat, html, flags=re.IGNORECASE)
        if m:
            token = m.group(1)
            print(f"[aponet] Token aus HTML gefunden: {token[:12]}...")
            return token

    print("[aponet] Token nicht im HTML gefunden.")
    print("[aponet] HTML-Start:", html[:300].replace("\n", " "))
    raise RuntimeError(
        "Token konnte nicht gefunden werden. "
        "Setze APONET_TOKEN als Environment-Variable (aus Browser/Postman)."
    )


# ==============================
# API REQUEST (ein Request reicht hier)
# ==============================
def _fetch_search_json(session: requests.Session, token: str, plzort: str, radius_km: int) -> Dict[str, Any]:
    params = {
        "type": "1981",
        "tx_aponetpharmacy_search[action]": "result",
        "tx_aponetpharmacy_search[controller]": "Search",
        "tx_aponetpharmacy_search[search][plzort]": plzort,
        "tx_aponetpharmacy_search[search][date]": "",
        "tx_aponetpharmacy_search[search][street]": "",
        "tx_aponetpharmacy_search[search][radius]": str(radius_km),
        "tx_aponetpharmacy_search[search][lat]": "",
        "tx_aponetpharmacy_search[search][lng]": "",
        "tx_aponetpharmacy_search[token]": token,
    }


    r = session.get(BASE_URL, params=params, headers=HEADERS_AJAX, timeout=TIMEOUT)
    r.raise_for_status()
    
    ct = (r.headers.get("Content-Type") or "").lower()
    if "json" not in ct and not r.text.strip().startswith("{"):
        print("[aponet] Antwort-Start:", r.text[:400])
        raise RuntimeError("Aponet lieferte kein JSON (Token/Header/Session-Problem).")
    
    return r.json()

    



# ==============================
# SCRAPEN
# ==============================
def scrape_all_facilities() -> List[Dict[str, Any]]:
    session = requests.Session()
    token = fetch_token(session)

    # Mehrere Zentren: Norden/Mitte/Süden (kannst du anpassen)
    search_centers = [
        ("45879", 5),
        ("45881", 5),
        ("45883", 5),
        ("45884", 5),
        ("45886", 5),
        ("45888", 5),
        ("45889", 5),
        ("45891", 5),
        ("45892", 5),
        ("45894", 5),
        ("45896", 5),
        ("45897", 5),
        ("45899", 5),
    ]

    items: List[Dict[str, Any]] = []
    seen_apo_ids: Set[str] = set()
    seen_source_keys: Set[str] = set()

    total_received = 0
    filtered_out_not_ge = 0
    duplicates_skipped = 0

    for plzort, radius in search_centers:
        data = _fetch_search_json(session, token=token, plzort=plzort, radius_km=radius)
        results = data.get("results") or {}
        apo_list = ((results.get("apotheken") or {}).get("apotheke")) or []
        total_received += len(apo_list)

        print(f"[aponet] search='{plzort}' radius={radius} empfangen={len(apo_list)}")

        for a in apo_list:
            apo_id = _clean(a.get("apo_id") or a.get("id"))
            if apo_id and apo_id in seen_apo_ids:
                duplicates_skipped += 1
                continue

            name = _clean(a.get("name"))
            street = _clean(a.get("strasse"))
            postal = _clean(a.get("plz"))
            city = _clean(a.get("ort"))

            # nur Gelsenkirchen
            if not _is_in_gelsenkirchen(city, postal):
                filtered_out_not_ge += 1
                if apo_id:
                    seen_apo_ids.add(apo_id)
                continue

            rec = {
                "source": SOURCE,
                "source_key": _facility_key(name, street, postal, city),
                "facility_name": name,
                "type": "APOTHEKE",
                "street": street,
                "postal_code": postal,
                "city": city,
                "phone": _clean(a.get("telefon")),
                "latitude": _try_float(a.get("latitude")),
                "longitude": _try_float(a.get("longitude")),
                "wheelchair_accessible": None,
            }

            if rec["source_key"] in seen_source_keys:
                duplicates_skipped += 1
                if apo_id:
                    seen_apo_ids.add(apo_id)
                continue

            seen_source_keys.add(rec["source_key"])
            if apo_id:
                seen_apo_ids.add(apo_id)

            items.append(rec)

        time.sleep(random.uniform(0.4, 0.9))  # freundlich bleiben

    print(
        f"[aponet] summary_multi: searches={len(search_centers)}, "
        f"gesamt_empfangen={total_received}, "
        f"verworfen_nicht_GE={filtered_out_not_ge}, "
        f"duplikate={duplicates_skipped}, "
        f"final_gespeichert={len(items)}"
    )

    return items


# Optionaler Alias, falls irgendwo noch scrape_all() aufgerufen wird
def scrape_all() -> List[Dict[str, Any]]:
    return scrape_all_facilities()


# ==============================
# DB PERSISTIEREN
# ==============================
UPSERT_FACILITY_RETURN_ID = """
INSERT INTO facilities
  (source, source_key, facility_name, type, street, postal_code, city, phone,
   latitude, longitude, wheelchair_accessible, last_seen_at)
VALUES
  (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, NOW())
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
  wheelchair_accessible = EXCLUDED.wheelchair_accessible,
  last_seen_at = NOW()
RETURNING id;
"""


def persist_aponet_apotheken_gelsenkirchen(conn) -> int:
    facilities = scrape_all_facilities()

    if not facilities:
        print("[aponet] Keine Apotheken (Gelsenkirchen) gefunden.")
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
            cur.fetchone()  # RETURNING id validieren
            written += 1

    # Kein commit hier erzwingen – main.py macht conn.commit()
    print(f"[aponet] ✅ Apotheken upserted: {written}")
    return written


# ==============================
# STANDALONE TEST
# ==============================
if __name__ == "__main__":
    try:
        facilities = scrape_all_facilities()
        print(f"[aponet] FINAL count={len(facilities)}")
        for f in facilities:
            print(f"- {f['facility_name']} | {f['street']} | {f['postal_code']} {f['city']}")
    except Exception as e:
        print(f"[aponet] ❌ Fehler: {e}")
        raise