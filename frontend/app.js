/* ==============================
   API Endpoints
============================== */
const API_DOCTORS_URL = "/api/doctors";
const API_FACILITIES_URL = "/api/facilities";
const API_POP_STICHTAGE = "/api/district-population/stichtage";
const API_POP_BY_DATE = "/api/district-population"; // ?stichtag=YYYY-MM-DD

// Für Routenberechnung
const OSRM_URL = "http://localhost:5000"; // ggf. docker: "http://osrm-routing:5000"
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

let routeLayer = null;

/* ==============================
   DOM Elemente
============================== */
const els = {
  popStichtag: document.getElementById("popStichtag"),
  statusAuswahl: document.getElementById("statusAuswahl"),
  bevoelkerungStatusRadios: document.querySelectorAll('input[name="bevoelkerungStatus"]'),

  suchfeld: document.getElementById("suchfeld"),
  checkBarriere: document.getElementById("checkBarriere"),
  checkDoctors: document.getElementById("checkDoctors"),
  routeStart: document.getElementById("routeStart"),
  routeEnd: document.getElementById("routeEnd"),
  routeBtn: document.getElementById("routeBtn"),
  routeClearBtn: document.getElementById("routeClearBtn"),
  routeInfo: document.getElementById("routeInfo"),

  // Alle Facility-Type Checkboxen (class="facilityType")
  facilityTypeChecks: document.querySelectorAll(".facilityType"),

  list: document.getElementById("list"),
  empty: document.getElementById("empty"),
  loading: document.getElementById("loading"),
  error: document.getElementById("error"),
};

/* ==============================
   Daten
============================== */
let doctors = [];
let facilities = [];
let facilitiesLoaded = false;
let currentPopulationData = [];

const TYPE_LABELS = {
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

function prettyType(t) {
  return TYPE_LABELS[t] ?? t ?? "—";
}

/* ==============================
   Karte
============================== */
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

// Verwaltungsgrenzen
fetch("/Verwaltungsgrenzen_geojson.json")
  .then((res) => res.json())
  .then((data) => {
    window.districtLayer = L.geoJSON(data, {
      style: {
        color: "#0044cc",
        weight: 2,
        fillOpacity: 0.1,
        fillColor: "#ffffff",
      },
      onEachFeature: function (feature, layer) {
        layer.on("click", function () {
          markersLayer.unspiderfy();
        });
      },
    }).addTo(map);
  })
  .catch((err) => {
    console.error("GeoJSON konnte nicht geladen werden:", err);
    setError("Verwaltungsgrenzen konnten nicht geladen werden.");
  });

/* ==============================
   Bevölkerung
============================== */
async function loadPopulationStichtage() {
  const response = await fetch(API_POP_STICHTAGE);
  if (!response.ok) {
    throw new Error("Stichtage konnten nicht geladen werden.");
  }

  const stichtage = await response.json();

  els.popStichtag.innerHTML = '<option value="">Datum auswählen</option>';

  stichtage.forEach((datum) => {
    const option = document.createElement("option");
    option.value = datum;
    option.textContent = datum;
    els.popStichtag.appendChild(option);
  });
}

async function loadPopulationByDate(stichtag) {
  const response = await fetch(`${API_POP_BY_DATE}?stichtag=${encodeURIComponent(stichtag)}`);
  if (!response.ok) {
    throw new Error("Bevölkerungsdaten konnten nicht geladen werden.");
  }

  return await response.json();
}

function getSelectedBevoelkerungStatus() {
  return document.querySelector('input[name="bevoelkerungStatus"]:checked')?.value || null;
}

function getPopulationValueByStatus(item, status) {
  switch (status) {
    case "deutsch":
      return item.deutsch;
    case "deutschMit2Sta":
      return item.deutschMit2Sta;
    case "nichtdeutsch":
      return item.nichtdeutsch;
    case "gesamt":
      return item.gesamt;
    default:
      return null;
  }
}

function getPopulationStatusLabel(status) {
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

function formatPopulationNumber(value) {
  if (value == null || Number.isNaN(value)) return "keine Daten";
  return new Intl.NumberFormat("de-DE").format(value);
}

function buildPopulationMap(data, status) {
  const result = new Map();

  data.forEach((item) => {
    const key = normalizeDistrictName(item.stadtteilName);
    result.set(key, getPopulationValueByStatus(item, status));
  });

  return result;
}


function getPopulationBreaks(values, steps = 7) {
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

function getPopulationColor(value, breaks) {
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

function updateDistrictPopulationLayer(populationMap, status) {
  if (!window.districtLayer) return;

  const values = Array.from(populationMap.values()).filter((v) => typeof v === "number");
  const breaks = getPopulationBreaks(values, 7);

  window.districtLayer.eachLayer((layer) => {
    const feature = layer.feature;

    const stadtteilName = feature?.properties?.stadtteil_name;
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



function resetDistrictLayerStyle() {
  if (!window.districtLayer) return;

  window.districtLayer.eachLayer((layer) => {
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

els.popStichtag?.addEventListener("change", async function () {
  try {
    if (this.value !== "") {
      els.statusAuswahl?.classList.remove("hidden");
      currentPopulationData = await loadPopulationByDate(this.value);

      const status = getSelectedBevoelkerungStatus();
      if (status) {
        const populationMap = buildPopulationMap(currentPopulationData, status);
        updateDistrictPopulationLayer(populationMap, status);
      }
    } else {
      els.statusAuswahl?.classList.add("hidden");
      currentPopulationData = [];

      els.bevoelkerungStatusRadios.forEach((radio) => {
        radio.checked = false;
      });

      resetDistrictLayerStyle();
    }
  } catch (e) {
    console.error(e);
    setError("Bevölkerungsdaten konnten nicht geladen werden.");
  }
});

els.bevoelkerungStatusRadios.forEach((radio) => {
  radio.addEventListener("change", function () {
    const status = getSelectedBevoelkerungStatus();
    if (!status || currentPopulationData.length === 0) return;

    const populationMap = buildPopulationMap(currentPopulationData, status);
    updateDistrictPopulationLayer(populationMap, status);
  });
});


/* ==============================
   Helfer
============================== */
function normalize(v) {
  return (v ?? "").toString().toLowerCase().trim();
}

function normalizeDistrictName(name) {
  return (name ?? "").toString().trim().toLowerCase();
}

function isTrue(v) {
  return v === true || v === "true" || v === 1 || v === "1";
}

function setLoading(on) {
  els.loading.hidden = !on;
}

function setError(msg) {
  els.error.hidden = !msg;
  els.error.textContent = msg || "";
}

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

function formatKm(m) {
  const km = m / 1000;
  return (km < 10 ? km.toFixed(2) : km.toFixed(1)).replace(".", ",") + " km";
}

function formatDuration(seconds) {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const rest = mins % 60;
  return `${h} h ${rest} min`;
}

// 1) Suche zuerst in deinen geladenen Daten (Ärzte/Einrichtungen) nach einem Namen.
// 2) Wenn nix passt: Geocoding über Nominatim (Adresse).
async function resolveToPoint(inputText) {
  const q = (inputText ?? "").trim();
  if (!q) throw new Error("Bitte Start und Ziel ausfüllen.");

  // "Mein Standort"
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

  routeLayer = L.polyline(latLngs).addTo(map);
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

/* ==============================
   Render (Liste + Marker)
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
        ${specialty ? `<div class="card-row">🩺 <b>Spezialisierung:  </b><span>${specialty}</span></div>` : ""}
        ${facilityName ? `<div class="card-row">🏥 <b>Einrichtung:  </b><span>${facilityName}</span></div>` : ""}
        ${address ? `<div class="card-row">📍 <b>Adresse:  </b><span>${address}</span></div>` : ""}
        ${phone ? `<div class="card-row">📞 <b>Tel:  </b><a href="tel:${phone.replace(/\s+/g, "")}">${phone}</a></div>` : ""}
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
        <div class="card-row">🏷️ <b>Typ:  </b><span>${prettyType(f.type)}</span></div>
        ${address ? `<div class="card-row">📍 <b>Adresse:  </b><span>${address}</span></div>` : ""}
        ${phone ? `<div class="card-row">📞 <b>Tel:  </b><a href="tel:${phone.replace(/\s+/g, "")}">${phone}</a></div>` : ""}
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
   Daten laden durch API (je nach Auswahl)
============================== */
async function loadDoctors() {
  const res = await fetch(API_DOCTORS_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  doctors = await res.json();
}

async function loadFacilitiesOnce() {
  if (facilitiesLoaded) return;

  const res = await fetch(API_FACILITIES_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  facilities = await res.json();
  facilitiesLoaded = true;
}

async function syncDataFromSelection() {
  setError("");
  setLoading(true);

  try {
    const tasks = [];

    if (els.checkDoctors.checked && doctors.length === 0) {
      tasks.push(loadDoctors());
    }

    if (getSelectedFacilityTypes().length > 0) {
      tasks.push(loadFacilitiesOnce());
    }

    await Promise.all(tasks);
  } catch (e) {
    setError("Daten konnten nicht geladen werden");
  } finally {
    setLoading(false);
    render();
  }
}

/* ==============================
   Events
============================== */
els.suchfeld.addEventListener("input", render);
els.checkBarriere.addEventListener("change", render);

// Ärzte Checkbox
els.checkDoctors.addEventListener("change", syncDataFromSelection);

// Facility-Type Checkboxen
for (const cb of els.facilityTypeChecks || []) {
  cb.addEventListener("change", syncDataFromSelection);
}

els.routeBtn?.addEventListener("click", async () => {
  setError("");
  clearRoute();
  setLoading(true);

  try {
    if (facilities.length === 0) {
      await loadFacilitiesOnce();
    }

    const start = await resolveToPoint(els.routeStart.value);
    const end = await resolveToPoint(els.routeEnd.value);

    await drawRouteOSRM(start, end);
  } catch (e) {
    console.error(e);
    setError(e.message || "Route konnte nicht berechnet werden.");
  } finally {
    setLoading(false);
  }
});

els.routeClearBtn?.addEventListener("click", () => {
  clearRoute();
});

/* ==============================
   Initialisierung
============================== */
loadPopulationStichtage().catch((e) => {
  console.error(e);
  setError("Stichtage konnten nicht geladen werden.");
});

render();