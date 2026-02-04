# sources/gelsenkirchen_gesundheitskarte.py
import json
import re
import hashlib
import html as html_lib
from typing import List, Dict, Optional, Tuple

import requests
from bs4 import BeautifulSoup

# ==============================
# KONSTANTEN
# ==============================
URL = "https://www.gelsenkirchen.de/de/soziales/gesundheit/gesundheitskarte.aspx"
SOURCE = "gelsenkirchen_gesundheitskarte"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; BachelorarbeitScraper/1.0)"
}

# ==============================
# HILFSFUNKTIONEN
# ==============================
def _sha1(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


# Stabiler Key pro Einrichtung. Wichtig: Name + Adresse, damit sich mehrere
# Einrichtungen am selben Ort nicht überschreiben.
def _facility_key(name: str, street: str, postal: str, city: str) -> str:

    raw = f"{SOURCE}|{name}|{street}|{postal}|{city}".lower()
    return _sha1(raw)




def _fetch_html(url: str) -> str:
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.text



# data-gemap-marker enthält i.d.R. ein JSON-ähnliches Objekt, häufig HTML-escaped
# und oft mit einfachen Quotes. Beispiel (vereinfacht):
# "{'lat':51.49,'lng':7.11,'address':'Bochumer Straße 242, 45886 Gelsenkirchen'}"
# Man macht daraus ein echtes Dict.
def _parse_marker(marker_raw: Optional[str]) -> Optional[Dict]:

    if not marker_raw:
        return None

    s = html_lib.unescape(marker_raw).strip()
    s = s.replace("'", '"')  # single → double quotes

    try:
        return json.loads(s)
    except Exception:
        return None



# Erwartet z.B. "Bochumer Straße 242, 45886 Gelsenkirchen"
# -> (street, postal, city)
def _split_address(addr: Optional[str]) -> Tuple[str, str, str]:

    if not addr:
        return "", "", ""

    parts = [p.strip() for p in addr.split(",")]
    street = parts[0] if len(parts) > 0 else ""
    postal_city = parts[1] if len(parts) > 1 else ""

    m = re.match(r"^(\d{5})\s+(.+)$", postal_city)
    if not m:
        return street, "", ""

    return street, m.group(1), m.group(2)



# Mappt die Kategorien der Seite auf deine FacilityType(Enum)-Werte.
# Wichtig: Rückgabe MUSS mit deinem Backend-Enum kompatibel sein,
# sonst knallt der facilities_type_check.
def _to_internal_type(label: str) -> str:

    s = (label or "").strip().lower()

    mapping = {
        "ambulanter dienst": "AMBULANTER_PFLEGEDIENST",
        "ambulanter pflegedienst": "AMBULANTER_PFLEGEDIENST",
        "kurzzeitpflege": "KURZZEITPFLEGE",
        "krankenhaus": "KRANKENHAUS",
        "sanitätshaus": "SANITAETSHAUS",
        "therapie": "THERAPIE",
        "beratungsstelle": "BERATUNGSSTELLE",
    }

    return mapping.get(s, "SONSTIGES")


# ==============================
# 1) SCRAPEN (HTML -> Python Dicts)
# ==============================
def scrape_all_facilities() -> List[Dict]:
    html = _fetch_html(URL)
    soup = BeautifulSoup(html, "html.parser")

    # Robust: wir nehmen alle Zeilen, die marker data haben
    rows = soup.select('tr[data-gemap-marker]')
    items: List[Dict] = []

    for tr in rows:
        marker = _parse_marker(tr.get("data-gemap-marker"))
        lat = marker.get("lat") if marker else None
        lon = marker.get("lng") if marker else None
        addr = marker.get("address") if marker else None

        street, postal, city = _split_address(addr)

        # Spalten: [0]=Name(+Telefon), [1]=Art, ...
        tds = tr.find_all("td")
        if len(tds) < 2:
            continue

        name_td = tds[0]
        art_td = tds[1]

        # Name + Telefon aus erster Spalte
        name_text_multiline = name_td.get_text("\n", strip=True)
        name = name_text_multiline.split("\n")[0].strip()

        # stabiler: für Phone-Suche lieber mit Spaces
        name_text_spaced = name_td.get_text(" ", strip=True)
        phone_match = re.search(r"(\+?\d[\d\s()/.-]{6,})", name_text_spaced)
        phone = phone_match.group(1).strip() if phone_match else ""

        # Kategorie ("Art")
        art_label = art_td.get_text(" ", strip=True)
        internal_type = _to_internal_type(art_label)

        # Debug-Hilfe: zeigt dir neue/unbekannte Kategorien
        if internal_type == "SONSTIGES":
            print(f"[scraper] [GE] Unmapped type label: '{art_label}'")

        items.append(
            {
                "source": SOURCE,
                "source_key": _facility_key(name, street, postal, city),
                "facility_name": name,
                "type": internal_type,
                "street": street,
                "postal_code": postal,
                "city": city,
                "phone": phone,
                "latitude": lat,
                "longitude": lon,
                "wheelchair_accessible": None,
            }
        )

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


def persist_gelsenkirchen_gesundheitskarte(conn) -> int:
    facilities = scrape_all_facilities()

    if not facilities:
        print("[scraper] [GE] Keine Einträge gefunden.")
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
            cur.fetchone()  # id wird erzeugt, hier nicht benötigt
            written += 1

    print(f"[scraper] [GE] ✅ Einrichtungen upserted: {written}")
    return written