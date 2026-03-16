import { normalizeDistrictName } from "./utils.js";

export function getSelectedUnemploymentStatus() {
  return document.querySelector('input[name="unemploymentStatus"]:checked')?.value || null;
}

export function getUnemploymentValueByStatus(item, status) {
  switch (status) {
    case "arbeitslosenanteil":
      return item.arbeitslosenanteil;
    case "arbeitslosenanteilMaennlich":
      return item.arbeitslosenanteilMaennlich;
    case "arbeitslosenanteilWeiblich":
      return item.arbeitslosenanteilWeiblich;
    case "arbeitslosenanteilDeutsch":
      return item.arbeitslosenanteilDeutsch;
    case "arbeitslosenanteilNichtdeutsch":
      return item.arbeitslosenanteilNichtdeutsch;
    case "jugendarbeitslosigkeitU25":
      return item.jugendarbeitslosigkeitU25;
    default:
      return null;
  }
}

export function buildUnemploymentMap(data, status) {
  const result = new Map();

  data.forEach((item) => {
    const key = normalizeDistrictName(item.stadtteilName);
    result.set(key, getUnemploymentValueByStatus(item, status));
  });

  return result;
}

export function getUnemploymentBreaks(values, steps = 7) {
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

export function getUnemploymentColor(value, breaks) {
  if (value == null || Number.isNaN(value)) return "#cccccc";

  const colors = [
    "#fff5eb",
    "#fee6ce",
    "#fdd0a2",
    "#fdae6b",
    "#fd8d3c",
    "#e6550d",
    "#a63603",
  ];

  for (let i = 0; i < breaks.length; i++) {
    if (value <= breaks[i]) return colors[i];
  }

  return colors[colors.length - 1];
}