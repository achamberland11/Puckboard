const STORAGE_KEY = "nhl_stats_value_weights";

export const DEFAULT_WEIGHTS = {
  G: 1,
  A: 1,
  P: 1,
  PPP: 1,
  "+/-": 1,
  S: 1,
  BLK: 1,
  HITS: 1,
  W: 1,
  "SV%": 1,
  GAA: 1,
  SA: 1,
  GA: 1,
  SV: 1,
  SO: 1,
  Age: 0.5,
};

const weightsListeners = new Set();

function loadWeights() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch (err) {
    console.error("Failed to load value weights:", err);
  }
  const merged = { ...DEFAULT_WEIGHTS };
  if (stored && typeof stored === "object") {
    for (const key of Object.keys(DEFAULT_WEIGHTS)) {
      const v = Number(stored[key]);
      if (Number.isFinite(v)) merged[key] = v;
    }
  }
  return merged;
}

let weights = loadWeights();

function saveWeights() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(weights));
}

function notify() {
  for (const fn of weightsListeners) fn(getWeights());
}

export function getWeights() {
  return { ...weights };
}

export function getWeight(cat) {
  const v = Number(weights[cat]);
  return Number.isFinite(v) ? v : (DEFAULT_WEIGHTS[cat] ?? 1);
}

export function setWeight(cat, value) {
  weights[cat] = value;
  saveWeights();
  notify();
}

export function resetWeights() {
  weights = { ...DEFAULT_WEIGHTS };
  saveWeights();
  notify();
}

export function onWeightsChange(fn) {
  weightsListeners.add(fn);
  return () => weightsListeners.delete(fn);
}