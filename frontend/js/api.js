/* ==============================
   API-Endpunkte und Datenabruf
   - Holt Daten aus dem Spring-Boot-Backend
============================== */

/**
 * Endpoint für Ärztedaten.
 */
export const API_DOCTORS_URL = "/api/doctors";

/**
 * Endpoint für Einrichtungen.
 */
export const API_FACILITIES_URL = "/api/facilities";

/**
 * Endpoint für die verfügbaren Bevölkerungs-Stichtage.
 */
export const API_POP_STICHTAGE = "/api/district-population/stichtage";

/**
 * Endpoint für Bevölkerungsdaten eines bestimmten Stichtags.
 * Nutzung mit Query-Parameter: ?stichtag=YYYY-MM-DD
 */
export const API_POP_BY_DATE = "/api/district-population";


/**
 * Endpoint für die verfügbaren Bevölkerungs-Stichtage.
 */
export const API_UNEMPLOYMENT_STICHTAGE = "/api/district-unemployment/stichtage";

/**
 * Endpoint für Bevölkerungsdaten eines bestimmten Stichtags.
 * Nutzung mit Query-Parameter: ?stichtag=YYYY-MM-DD
 */
export const API_UNEMPLOYMENT_BY_DATE = "/api/district-unemployment";



/**
 * Lädt alle Ärztedaten aus dem Backend.
 */
export async function loadDoctors() {
  const res = await fetch(API_DOCTORS_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

/**
 * Lädt alle Einrichtungen aus dem Backend.
 */
export async function loadFacilities() {
  const res = await fetch(API_FACILITIES_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

/**
 * Lädt die verfügbaren Bevölkerungs-Stichtage.
 * Diese Daten werden später in das Select-Feld eingefügt.
 */
export async function loadPopulationStichtage() {
  const response = await fetch(API_POP_STICHTAGE);
  if (!response.ok) {
    throw new Error("Stichtage konnten nicht geladen werden.");
  }

  return await response.json();
}

/**
 * Lädt die Bevölkerungsdaten für einen ausgewählten Stichtag.
 */
export async function loadPopulationByDate(stichtag) {
  const response = await fetch(`${API_POP_BY_DATE}?stichtag=${encodeURIComponent(stichtag)}`);
  if (!response.ok) {
    throw new Error("Bevölkerungsdaten konnten nicht geladen werden.");
  }

  return await response.json();
}



export async function loadUnemploymentStichtage() {
  const response = await fetch(API_UNEMPLOYMENT_STICHTAGE);
  if (!response.ok) {
    throw new Error("Arbeitslosen-Stichtage konnten nicht geladen werden.");
  }

  return await response.json();
}

export async function loadUnemploymentByDate(stichtag) {
  const response = await fetch(`${API_UNEMPLOYMENT_BY_DATE}?stichtag=${encodeURIComponent(stichtag)}`);
  if (!response.ok) {
    throw new Error("Arbeitslosen-Daten konnten nicht geladen werden.");
  }

  return await response.json();
}