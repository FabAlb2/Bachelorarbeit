import {
  loadDoctors,
  loadFacilities,
  loadPopulationStichtage,
  loadPopulationByDate,
} from "./api.js";

import {
  createMap,
  loadDistrictLayer,
  resetDistrictLayerStyle,
  updateDistrictPopulationLayer,
} from "./map.js";

import {
  getSelectedBevoelkerungStatus,
  buildPopulationMap,
} from "./population.js";

import {
  prettyType,
  normalize,
  isTrue,
  setLoading,
  setError,
  formatKm,
  formatDuration,
} from "./utils.js";

/* ==============================
   Konstanten
============================== */
const OSRM_URL = "http://localhost:5000";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

/* ==============================
   DOM Elemente
============================== */
const els = {
  popStichtag: document.getElementById("popStichtag"),
  statusAuswahl: document.getElementById("statusAuswahl"),
  bevoelkerungStatusRadios: document.querySelectorAll('input[name="bevoelkerungStatus"]'),
  resetPopulationBtn: document.getElementById("resetPopulationBtn"),
  popPanel: document.getElementById("popPanel"),

  suchfeld: document.getElementById("suchfeld"),
  checkBarriere: document.getElementById("checkBarriere"),
  checkDoctors: document.getElementById("checkDoctors"),
  routeStart: document.getElementById("routeStart"),
  routeEnd: document.getElementById("routeEnd"),
  routeBtn: document.getElementById("routeBtn"),
  routeClearBtn: document.getElementById("routeClearBtn"),
  routeInfo: document.getElementById("routeInfo"),
  resetFiltersBtn: document.getElementById("resetFiltersBtn"),

  facilityTypeChecks: document.querySelectorAll(".facilityType"),

  list: document.getElementById("list"),
  empty: document.getElementById("empty"),
  loading: document.getElementById("loading"),
  error: document.getElementById("error"),
};

/* ==============================
   State
============================== */
let doctors = [];
let facilities = [];
let facilitiesLoaded = false;
let currentPopulationData = [];
let routeLayer = null;
let districtLayer = null;

/* ==============================
   Karte
============================== */
const { map, markersLayer } = createMap();

/* ==============================
   Bevölkerung
============================== */
async function fillPopulationStichtageSelect() {
  const stichtage = await loadPopulationStichtage();

  els.popStichtag.innerHTML = '<option value="">Datum auswählen</option>';

  stichtage.forEach((datum) => {
    const option = document.createElement("option");
    option.value = datum;
    option.textContent = formatDateForDisplay(datum);
    els.popStichtag.appendChild(option);
  });
}

/* ==============================
   Helfer
============================== */
function getSelectedFacilityTypes() {
  return Array.from(els.facilityTypeChecks || [])
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);
}

function anythingSelected() {
  return !!els.checkDoctors?.checked || getSelectedFacilityTypes().length > 0;
}

function clearRoute() {
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }
  if (els.routeInfo) {
    els.routeInfo.hidden = true;
    els.routeInfo.innerHTML = "";
  }
}

async function resolveToPoint(inputText) {
  const q = (inputText ?? "").trim();
  if (!q) throw new Error("Bitte Start und Ziel ausfüllen.");

  if (q.toLowerCase() === "mein standort") {
    const pos = await new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("Standort nicht verfügbar."));
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
      });
    });
    return { lat: pos.coords.latitude, lon: pos.coords.longitude, label: "Mein Standort" };
  }

  const nq = normalize(q);

  const inDoctors =
    doctors.find((d) => normalize(d.name) === nq) ||
    doctors.find((d) => normalize(d.name).includes(nq));

  if (inDoctors && inDoctors.latitude != null && inDoctors.longitude != null) {
    return { lat: inDoctors.latitude, lon: inDoctors.longitude, label: inDoctors.name };
  }

  const inFacilities =
    facilities.find((f) => normalize(f.facilityName) === nq) ||
    facilities.find((f) => normalize(f.facilityName).includes(nq));

  if (inFacilities && inFacilities.latitude != null && inFacilities.longitude != null) {
    return { lat: inFacilities.latitude, lon: inFacilities.longitude, label: inFacilities.facilityName };
  }

  const url = `${NOMINATIM_URL}?format=json&q=${encodeURIComponent(q + ", Gelsenkirchen")}&limit=1`;

  const res = await fetch(url, { headers: { "Accept-Language": "de" } });
  if (!res.ok) throw new Error("Adresse konnte nicht gesucht werden.");
  const results = await res.json();
  if (!results?.length) throw new Error(`Nichts gefunden für: "${q}"`);

  return {
    lat: parseFloat(results[0].lat),
    lon: parseFloat(results[0].lon),
    label: results[0].display_name ?? q,
  };
}

async function drawRouteOSRM(start, end) {
  const url =
    `${OSRM_URL}/route/v1/driving/` +
    `${start.lon},${start.lat};${end.lon},${end.lat}` +
    `?overview=full&geometries=geojson`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM nicht erreichbar (HTTP ${res.status}).`);
  const json = await res.json();

  const route = json.routes?.[0];
  if (!route) throw new Error("Keine Route gefunden.");

  const latLngs = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);

  routeLayer = L.polyline(latLngs, {
    color: "red",
    weight: 5
  }).addTo(map);
  map.fitBounds(routeLayer.getBounds());

  if (els.routeInfo) {
    els.routeInfo.hidden = false;
    els.routeInfo.innerHTML = `
      <b>Route</b><br/>
      Von: ${start.label}<br/>
      Nach: ${end.label}<br/>
      Distanz: ${formatKm(route.distance)}<br/>
      Zeit: ${formatDuration(route.duration)}
    `;
  }
}


function formatDateForDisplay(isoDate) {
  if (!isoDate) return "";

  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

/* ==============================
   Filter
============================== */
function getVisibleDoctors() {
  const q = normalize(els.suchfeld.value);
  const onlyAcc = els.checkBarriere.checked;

  if (!els.checkDoctors.checked) return [];

  return doctors.filter((d) => {
    const matchesText =
      !q ||
      normalize(d.name).includes(q) ||
      normalize(d.specialty).includes(q) ||
      normalize(d.facilityName).includes(q) ||
      normalize(d.type).includes(q) ||
      normalize(d.city).includes(q) ||
      normalize(d.street).includes(q);

    const matchesAcc = !onlyAcc || isTrue(d.wheelchairAccessible);
    return matchesText && matchesAcc;
  });
}

function getVisibleFacilities() {
  const q = normalize(els.suchfeld.value);
  const onlyAcc = els.checkBarriere.checked;
  const selectedTypes = getSelectedFacilityTypes();

  if (selectedTypes.length === 0) return [];

  return facilities.filter((f) => {
    const matchesType = selectedTypes.includes(f.type);
    if (!matchesType) return false;

    const matchesText =
      !q ||
      normalize(f.facilityName).includes(q) ||
      normalize(f.type).includes(q) ||
      normalize(f.city).includes(q) ||
      normalize(f.street).includes(q);

    const matchesAcc = !onlyAcc || isTrue(f.wheelchairAccessible);
    return matchesText && matchesAcc;
  });
}


/**
 * Resettet die Filter von z.B. Verteilung der Bevölkerung, aber nicht von Route
 * 
 */
function resetPopulationFilter() {
  if (els.popStichtag) {
    els.popStichtag.value = "";
  }

  if (els.statusAuswahl) {
    els.statusAuswahl.classList.add("hidden");
  }

  els.bevoelkerungStatusRadios.forEach((radio) => {
    radio.checked = false;
  });

  if (els.popPanel) {
    els.popPanel.open = false;
  }

  currentPopulationData = [];
  resetDistrictLayerStyle(districtLayer);
}

els.resetPopulationBtn?.addEventListener("click", () => {
  resetPopulationFilter();
});


/* ==============================
   Render
============================== */
function render() {
  els.list.innerHTML = "";
  markersLayer.clearLayers();

  if (!anythingSelected()) {
    els.empty.hidden = false;
    els.empty.textContent = "Zum Anzeigen einer Liste bitte etwas anwählen.";
    return;
  }

  const visibleDoctors = getVisibleDoctors();
  const visibleFacilities = getVisibleFacilities();

  const combined = [
    ...visibleDoctors.map((d) => ({ kind: "doctor", data: d })),
    ...visibleFacilities.map((f) => ({ kind: "facility", data: f })),
  ];

  if (combined.length === 0) {
    els.empty.hidden = false;
    els.empty.textContent = "Keine Treffer.";
    return;
  }

  els.empty.hidden = true;

  for (const item of combined) {
    if (item.kind === "doctor") {
      const d = item.data;
      const hasCoords = d.latitude != null && d.longitude != null;

      if (hasCoords) {
        L.marker([d.latitude, d.longitude])
          .addTo(markersLayer)
          .bindPopup(
            `<b>${d.name ?? "Unbekannter Arzt"}</b>` +
              `${d.specialty ? `<br>${d.specialty}` : ""}` +
              `${d.facilityName ? `<br><small>${d.facilityName}</small>` : ""}` +
              `${d.street ? `<br><small>${d.street}</small>` : ""}`
          );
      }

      const card = document.createElement("li");
      card.className = "card";

      const doctorName = d.name ?? "Unbekannter Arzt";
      const specialty = (d.specialty ?? "").trim();
      const facilityName = (d.facilityName ?? "").trim();

      const addressParts = [
        d.street,
        [d.postalCode, d.city].filter(Boolean).join(" "),
      ].filter(Boolean);
      const address = addressParts.join(", ");

      const phone = (d.phone ?? "").trim();

      card.innerHTML = `
        <div class="card-title">${doctorName}</div>
        ${specialty ? `<div class="card-row">🩺 <b>Spezialisierung: </b><span>${specialty}</span></div>` : ""}
        ${facilityName ? `<div class="card-row">🏥 <b>Einrichtung: </b><span>${facilityName}</span></div>` : ""}
        ${address ? `<div class="card-row">📍 <b>Adresse: </b><span>${address}</span></div>` : ""}
        ${phone ? `<div class="card-row">📞 <b>Tel: </b><a href="tel:${phone.replace(/\s+/g, "")}">${phone}</a></div>` : ""}
        ${isTrue(d.wheelchairAccessible) ? `<div class="badge">♿ barrierefrei</div>` : ""}
      `;

      card.onclick = () => {
        if (hasCoords) map.setView([d.latitude, d.longitude], 16);
      };

      els.list.appendChild(card);
    }

    if (item.kind === "facility") {
      const f = item.data;
      const hasCoords = f.latitude != null && f.longitude != null;

      if (hasCoords) {
        L.marker([f.latitude, f.longitude])
          .addTo(markersLayer)
          .bindPopup(
            `<b>${f.facilityName ?? "Unbekannte Einrichtung"}</b>` +
              `${f.type ? `<br><small>${prettyType(f.type)}</small>` : ""}` +
              `${f.street ? `<br><small>${f.street}</small>` : ""}`
          );
      }

      const card = document.createElement("li");
      card.className = "card";

      const title = f.facilityName ?? "Unbekannte Einrichtung";
      const addressParts = [
        f.street,
        [f.postalCode, f.city].filter(Boolean).join(" "),
      ].filter(Boolean);
      const address = addressParts.join(", ");
      const phone = (f.phone ?? "").trim();

      card.innerHTML = `
        <div class="card-title">${title}</div>
        <div class="card-row">🏷️ <b>Typ: </b><span>${prettyType(f.type)}</span></div>
        ${address ? `<div class="card-row">📍 <b>Adresse: </b><span>${address}</span></div>` : ""}
        ${phone ? `<div class="card-row">📞 <b>Tel: </b><a href="tel:${phone.replace(/\s+/g, "")}">${phone}</a></div>` : ""}
        ${isTrue(f.wheelchairAccessible) ? `<div class="badge">♿ barrierefrei</div>` : ""}
      `;

      card.onclick = () => {
        if (hasCoords) map.setView([f.latitude, f.longitude], 16);
      };

      els.list.appendChild(card);
    }
  }
}

/* ==============================
   Daten laden
============================== */
async function loadFacilitiesOnce() {
  if (facilitiesLoaded) return;
  facilities = await loadFacilities();
  facilitiesLoaded = true;
}

async function syncDataFromSelection() {
  setError(els, "");
  setLoading(els, true);

  try {
    const tasks = [];

    if (els.checkDoctors.checked && doctors.length === 0) {
      tasks.push(
        loadDoctors().then((data) => {
          doctors = data;
        })
      );
    }

    if (getSelectedFacilityTypes().length > 0) {
      tasks.push(loadFacilitiesOnce());
    }

    await Promise.all(tasks);
  } catch (_e) {
    setError(els, "Daten konnten nicht geladen werden");
  } finally {
    setLoading(els, false);
    render();
  }
}

/* ==============================
   Events
============================== */
els.popStichtag?.addEventListener("change", async function () {
  try {
    if (this.value !== "") {
      els.statusAuswahl?.classList.remove("hidden");
      currentPopulationData = await loadPopulationByDate(this.value);

      const status = getSelectedBevoelkerungStatus();
      if (status) {
        const populationMap = buildPopulationMap(currentPopulationData, status);
        updateDistrictPopulationLayer(districtLayer, populationMap, status);
      }
    } else {
      els.statusAuswahl?.classList.add("hidden");
      currentPopulationData = [];

      els.bevoelkerungStatusRadios.forEach((radio) => {
        radio.checked = false;
      });

      resetDistrictLayerStyle(districtLayer);
    }
  } catch (e) {
    console.error(e);
    setError(els, "Bevölkerungsdaten konnten nicht geladen werden.");
  }
});

els.bevoelkerungStatusRadios.forEach((radio) => {
  radio.addEventListener("change", function () {
    const status = getSelectedBevoelkerungStatus();
    if (!status || currentPopulationData.length === 0) return;

    const populationMap = buildPopulationMap(currentPopulationData, status);
    updateDistrictPopulationLayer(districtLayer, populationMap, status);
  });
});

els.suchfeld.addEventListener("input", render);
els.checkBarriere.addEventListener("change", render);
els.checkDoctors.addEventListener("change", syncDataFromSelection);

for (const cb of els.facilityTypeChecks || []) {
  cb.addEventListener("change", syncDataFromSelection);
}

els.routeBtn?.addEventListener("click", async () => {
  setError(els, "");
  clearRoute();
  setLoading(els, true);

  try {
    if (facilities.length === 0) {
      await loadFacilitiesOnce();
    }

    const start = await resolveToPoint(els.routeStart.value);
    const end = await resolveToPoint(els.routeEnd.value);

    await drawRouteOSRM(start, end);
  } catch (e) {
    console.error(e);
    setError(els, e.message || "Route konnte nicht berechnet werden.");
  } finally {
    setLoading(els, false);
  }
});

els.routeClearBtn?.addEventListener("click", () => {
  clearRoute();
});

/* ==============================
   Init
============================== */
async function init() {
  districtLayer = await loadDistrictLayer(map, markersLayer, (msg) => setError(els, msg));

  try {
    await fillPopulationStichtageSelect();
  } catch (e) {
    console.error(e);
    setError(els, "Stichtage konnten nicht geladen werden.");
  }

  render();
}

init();