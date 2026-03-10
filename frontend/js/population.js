import { normalizeDistrictName } from "./utils.js";

/* ==============================
   Bevölkerungslogik
   - ausgewählte Kategorie ermitteln
   - Werte aus DTOs lesen
   - Stadtteilwerte aufbauen
   - Farbklassen vorbereiten
============================== */

/**
 * Liest den aktuell ausgewählten Radio-Button
 * für die Bevölkerungs-Kategorie aus.
 *
 * Rückgabe z. B.:
 * - "alle"
 * - "deutsch"
 * - "deutschMit2Sta"
 * - "nichtdeutsch"
 * - null, falls nichts ausgewählt ist
 */
export function getSelectedBevoelkerungStatus() {
  return document.querySelector('input[name="bevoelkerungStatus"]:checked')?.value || null;
}

/**
 * Liest aus einem Bevölkerungs-Datensatz den Wert,
 * der zur aktuell gewählten Kategorie gehört.
 */
export function getPopulationValueByStatus(item, status) {
  switch (status) {
    case "gesamt":
      return item.gesamt;
    case "deutsch":
      return item.deutsch;
    case "deutschMit2Sta":
      return item.deutschMit2Sta;
    case "nichtdeutsch":
      return item.nichtdeutsch;
    default:
      return null;
  }
}

/**
 * Baut aus den geladenen Bevölkerungsdaten eine Map:
 * Schlüssel = normalisierter Stadtteilname
 * Wert      = Bevölkerungszahl der gewählten Kategorie
 *
 * Beispiel:
 * "buer" -> 12345
 * "altstadt" -> 8765
 */
export function buildPopulationMap(data, status) {
  const result = new Map();

  data.forEach((item) => {
    const key = normalizeDistrictName(item.stadtteilName);
    result.set(key, getPopulationValueByStatus(item, status));

    
  });

  return result;
}

/**
 * Berechnet Klassengrenzen für die Choroplethen-Karte.
 *
 * Standardmäßig werden 7 Stufen erzeugt.
 * Die Werte werden sortiert und dann gleichmäßig in Klassen aufgeteilt.
 */
export function getPopulationBreaks(values, steps = 7) {
  const sorted = values
    .filter((v) => typeof v === "number" && !Number.isNaN(v))
    .sort((a, b) => a - b);

  if (sorted.length === 0) return [];

  const breaks = [];

  for (let i = 1; i < steps; i++) {
    const index = Math.floor((sorted.length * i) / steps);
    breaks.push(sorted[Math.min(index, sorted.length - 1)]);
  }

  return breaks;
}

/**
 * Ordnet einem Bevölkerungswert anhand der Klassengrenzen eine Farbe zu.
 * Je höher der Wert, desto dunkler die Farbe.
 */
export function getPopulationColor(value, breaks) {
  if (value == null || Number.isNaN(value)) return "#cccccc";

  const colors = [
    "#f7fbff",
    "#deebf7",
    "#c6dbef",
    "#9ecae1",
    "#6baed6",
    "#4292c6",
    "#08519c",
  ];

  for (let i = 0; i < breaks.length; i++) {
    if (value <= breaks[i]) return colors[i];
  }

  return colors[colors.length - 1];
}

