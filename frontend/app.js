const API_URL = "/api/facilities";

const els = {
  suchfeld: document.getElementById("suchfeld"),
  checkBarriere: document.getElementById("checkBarriere"),
  reloadBtn: document.getElementById("reloadBtn"),
  list: document.getElementById("list"),
  empty: document.getElementById("empty"),
  loading: document.getElementById("loading"),
  error: document.getElementById("error"),
};

let facilities = [];

/* ---------------- Karte ---------------- */

const map = L.map("map").setView([51.5177, 7.0857], 12);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap-Mitwirkende",
}).addTo(map);

const markersLayer = L.layerGroup().addTo(map);

/* ---------------- Helfer ---------------- */

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

/* ---------------- Filter & Render ---------------- */

function getFilteredFacilities() {
  const q = normalize(els.suchfeld.value);
  const onlyAcc = els.checkBarriere.checked;

  return facilities.filter(f => {
    const matchesText =
      !q ||
      normalize(f.name).includes(q) ||
      normalize(f.type).includes(q);

    const matchesAcc =
      !onlyAcc || isTrue(f.wheelchairAccessible);

    return matchesText && matchesAcc;
  });
}

function render() {
  const filtered = getFilteredFacilities();

  els.list.innerHTML = "";
  markersLayer.clearLayers();

  if (filtered.length === 0) {
    els.empty.hidden = false;
    return;
  }
  els.empty.hidden = true;

  for (const f of filtered) {
    /* Marker */
    if (f.latitude != null && f.longitude != null) {
      L.marker([f.latitude, f.longitude])
        .addTo(markersLayer)
        .bindPopup(`<b>${f.name}</b><br>${f.type ?? ""}`);
    }

    /* Liste */
    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <div class="card-title">${f.name ?? "Ohne Name"}</div>
      <div>${f.type ?? ""}</div>
      <div>${isTrue(f.wheelchairAccessible) ? "♿ barrierefrei" : ""}</div>
    `;

    card.onclick = () => {
      if (f.latitude && f.longitude) {
        map.setView([f.latitude, f.longitude], 14);
      }
    };

    els.list.appendChild(card);
  }
}

/* ---------------- Daten laden ---------------- */

async function loadFacilities() {
  setError("");
  setLoading(true);

  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    facilities = await res.json();
  } catch (e) {
    facilities = [];
    setError("Daten konnten nicht geladen werden");
  } finally {
    setLoading(false);
    render();
  }
}

/* ---------------- Events ---------------- */

els.suchfeld.addEventListener("input", render);
els.checkBarriere.addEventListener("change", render);
els.reloadBtn.addEventListener("click", loadFacilities);

/* Start */
loadFacilities();
