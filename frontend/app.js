/* ==============================
   API Endpoints
============================== */
const API_DOCTORS_URL = "/api/doctors";
const API_FACILITIES_URL = "/api/facilities";

// Für Routenberechnung
const OSRM_URL = "http://localhost:5000"; // ggf. docker: "http://osrm-routing:5000"
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

let routeLayer = null;


/* ==============================
   DOM Elemente
============================== */
const els = {
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
      },
      onEachFeature: function (feature, layer) {
        

        // dein Fix: Spiderfy beim Klicken auf Distrikt wieder schließen
        layer.on("click", function () {
          markersLayer.unspiderfy();
        });
      },
    }).addTo(map);
  });

/* ==============================
   Helfer
============================== */
function normalize(v) {
  return (v ?? "").toString().toLowerCase().trim();
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

  // Falls Ärzte/Facilities noch nicht geladen sind, ist das ok – wir suchen in dem,
  // was schon da ist.
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

  // Nominatim (Adresse)
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
  // OSRM erwartet lon,lat in der URL!
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
      normalize(d.name).includes(q) || // Arztname
      normalize(d.specialty).includes(q) || // Fachgebiet
      normalize(d.facilityName).includes(q) || // Praxisname
      normalize(d.type).includes(q) || // FacilityType
      normalize(d.city).includes(q) || // Ort
      normalize(d.street).includes(q); // Straße

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

      // Marker
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

      // Card
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

      // Marker
      if (hasCoords) {
        L.marker([f.latitude, f.longitude])
          .addTo(markersLayer)
          .bindPopup(
            `<b>${f.facilityName ?? "Unbekannte Einrichtung"}</b>` +
              `${f.type ? `<br><small>${prettyType(f.type)}</small>` : ""}` +
              `${f.street ? `<br><small>${f.street}</small>` : ""}`
          );
      }

      // Card
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
   Daten laden (je nach Auswahl)
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

    // Ärzte nur laden, wenn Checkbox an und noch nicht geladen
    if (els.checkDoctors.checked && doctors.length === 0) {
      tasks.push(loadDoctors());
    }

    // Facilities nur laden, wenn irgendein Facility-Type an ist
    if (getSelectedFacilityTypes().length > 0) {
      tasks.push(loadFacilitiesOnce());
    }

    await Promise.all(tasks);
  } catch (e) {
    // Nicht alles hart löschen – einfach Fehlermeldung und rendern
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
    // Tipp: Wenn du möchtest, dass Namen von Ärzten/Einrichtungen zuverlässig gehen,
    // kannst du hier einmalig nachladen:
    if (facilities.length === 0) {
      await loadFacilitiesOnce();
    }
    if (doctors.length === 0) {
      // Ärzte sind optional – nur laden wenn du willst:
      // await loadDoctors();
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

// Initial
render();
