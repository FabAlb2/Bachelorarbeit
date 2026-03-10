import {
  normalizeDistrictName,
  formatPopulationNumber,
  getPopulationStatusLabel,
} from "./utils.js";

import {
  getPopulationBreaks,
  getPopulationColor,
} from "./population.js";

/* ==============================
   Kartenlogik
   - Leaflet-Karte erstellen
   - GeoJSON der Stadtteile laden
   - Stadtteile zurücksetzen
   - Stadtteile nach Bevölkerungsdaten einfärben
============================== */

/**
 * Erstellt die Leaflet-Karte inklusive OSM-Hintergrundkarte
 * und Marker-Cluster-Layer.
 *
 * Rückgabe:
 * - map
 * - markersLayer
 */
export function createMap() {
  const map = L.map("map").setView([51.5177, 7.0857], 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap-Mitwirkende",
  }).addTo(map);

  const markersLayer = L.markerClusterGroup({
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    maxClusterRadius: 5,
  });

  map.addLayer(markersLayer);

  return { map, markersLayer };
}

/**
 * Lädt das GeoJSON mit den Verwaltungsgrenzen / Stadtteilen
 * und fügt es der Karte hinzu.
 *
 * Beim Klick auf einen Stadtteil werden geöffnete Marker-Cluster
 * wieder geschlossen.
 */
export async function loadDistrictLayer(map, markersLayer, setError) {
  try {
    const res = await fetch("/Verwaltungsgrenzen_geojson.json");
    const data = await res.json();

    const districtLayer = L.geoJSON(data, {
      style: {
        color: "#0044cc",
        weight: 2,
        fillOpacity: 0.1,
        fillColor: "#ffffff",
      },
      onEachFeature: function (_feature, layer) {
        layer.on("click", function () {
          markersLayer.unspiderfy();
        });
      },
    }).addTo(map);

    return districtLayer;
  } catch (err) {
    console.error("GeoJSON konnte nicht geladen werden:", err);
    setError("Verwaltungsgrenzen konnten nicht geladen werden.");
    return null;
  }
}

/**
 * Setzt den Stadtteil-Layer auf das Standard-Design zurück.
 * Wird verwendet, wenn keine Bevölkerungsdarstellung aktiv ist.
 */
export function resetDistrictLayerStyle(districtLayer) {
  if (!districtLayer) return;

  districtLayer.eachLayer((layer) => {
    const feature = layer.feature;
    const name =
      feature?.properties?.stadtteil_name ||
      feature?.properties?.name ||
      "Unbekannt";

    layer.setStyle({
      color: "#0044cc",
      weight: 2,
      fillOpacity: 0.1,
      fillColor: "#ffffff",
    });

    layer.bindPopup(`<b>${name}</b>`);
  });
}

/**
 * Färbt alle Stadtteile entsprechend der ausgewählten Bevölkerungsdaten ein.
 *
 * Vorgehen:
 * 1. Werte aus der Map sammeln
 * 2. Klassengrenzen berechnen
 * 3. Für jeden Stadtteil den passenden Wert suchen
 * 4. Style und Popup setzen
 */
export function updateDistrictPopulationLayer(districtLayer, populationMap, status) {
  if (!districtLayer) return;

  const values = Array.from(populationMap.values()).filter((v) => typeof v === "number");
  const breaks = getPopulationBreaks(values, 7);

  districtLayer.eachLayer((layer) => {
    const feature = layer.feature;
    const stadtteilName = feature?.properties?.stadtteil_name;

    // Der Stadtteilname aus dem GeoJSON wird normalisiert,
    // damit er sicher mit dem Schlüssel aus der Population-Map zusammenpasst.
    const key = normalizeDistrictName(stadtteilName);
    const value = populationMap.get(key);

    layer.setStyle({
      color: "#0044cc",
      weight: 2,
      fillOpacity: 0.8,
      fillColor: getPopulationColor(value, breaks),
    });

    layer.bindPopup(`
      <b>${stadtteilName ?? "Unbekannt"}</b><br>
      Kategorie: ${getPopulationStatusLabel(status)}<br>
      Anzahl: ${formatPopulationNumber(value)}
    `);
  });
}