/* ==============================
   Allgemeine Hilfsfunktionen
   - Formatierung
   - Normalisierung
   - UI-Helfer
============================== */

/**
 * Lesbare Bezeichnungen für Facility-Typen.
 * Wird z. B. für Karten-Popups und Listenanzeige genutzt.
 */
export const TYPE_LABELS = {
  ARZTPRAXIS: "Arztpraxis",
  APOTHEKE: "Apotheke",
  PFLEGE: "Pflege",
  KRANKENHAUS: "Krankenhaus",
  SANITAETSHAUS: "Sanitätshaus",
  AMBULANTER_PFLEGEDIENST: "Ambulanter Pflegedienst",
  KURZZEITPFLEGEHEIM: "Kurzzeitpflegeheim",
  STATIONAERE_PFLEGE: "Stationäre Pflege",
  KURZZEITPFLEGE: "Kurzzeitpflege",
  THERAPIE: "Therapie",
  BERATUNGSSTELLE: "Beratungsstelle",
  SONSTIGES: "Sonstiges",
};

/**
 * Wandelt einen internen Facility-Typ in eine lesbare Bezeichnung um.
 */
export function prettyType(t) {
  return TYPE_LABELS[t] ?? t ?? "—";
}

/**
 * Normalisiert allgemeine Texte für Vergleiche:
 * - in String umwandeln
 * - kleinschreiben
 * - Leerzeichen am Anfang/Ende entfernen
 */
export function normalize(v) {
  return (v ?? "").toString().toLowerCase().trim();
}

/**
 * Normalisiert Stadtteilnamen für einen sicheren Vergleich
 * zwischen Backend-Daten und GeoJSON-Namen.
 */
export function normalizeDistrictName(name) {
  return (name ?? "").toString().trim().toLowerCase();
}

/**
 * Prüft verschiedene "true"-Darstellungen.
 * Nützlich, wenn Daten aus APIs mal boolean, mal String oder Zahl sind.
 */
export function isTrue(v) {
  return v === true || v === "true" || v === 1 || v === "1";
}

/**
 * Zeigt oder versteckt den Ladehinweis.
 */
export function setLoading(els, on) {
  els.loading.hidden = !on;
}

/**
 * Zeigt eine Fehlermeldung an oder blendet sie aus.
 */
export function setError(els, msg) {
  els.error.hidden = !msg;
  els.error.textContent = msg || "";
}

/**
 * Formatiert Meter als Kilometer im deutschen Zahlenformat.
 */
export function formatKm(m) {
  const km = m / 1000;
  return (km < 10 ? km.toFixed(2) : km.toFixed(1)).replace(".", ",") + " km";
}

/**
 * Formatiert Sekunden als gut lesbare Dauer.
 * Beispiel: "12 min" oder "1 h 25 min"
 */
export function formatDuration(seconds) {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;

  const h = Math.floor(mins / 60);
  const rest = mins % 60;
  return `${h} h ${rest} min`;
}

/**
 * Formatiert Bevölkerungszahlen mit deutschem Tausenderpunkt.
 * Beispiel: 12345 -> "12.345"
 */
export function formatPopulationNumber(value) {
  if (value == null || Number.isNaN(value)) return "keine Daten";
  return new Intl.NumberFormat("de-DE").format(value);
}

/**
 * Liefert die lesbare Bezeichnung für die ausgewählte Bevölkerungs-Kategorie.
 */
export function getPopulationStatusLabel(status) {
  switch (status) {
    case "alle":
      return "alle";
    case "deutsch":
      return "deutsch";
    case "deutschMit2Sta":
      return "deutsch mit 2. Staatsbürgerschaft";
    case "nichtdeutsch":
      return "nicht deutsch";
    default:
      return "unbekannt";
  }
}