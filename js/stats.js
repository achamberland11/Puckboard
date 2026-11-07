import { LEAGUE_CONFIG, VALUE_WEIGHTS } from "./config.js";
import { getWeight } from "./weights.js";

////// Pace projection
const PACE_KEYS = {
  G: "G82",
  A: "A82",
  P: "P82",
  PPP: "PPP82",
  "+/-": "PM82",
  S: "SOG82",
  BLK: "BLK82",
  HITS: "HITS82",
  W: "W82",
  SA: "SA82",
};

function computePaceValues(items, cats) {
  const paceKeys = Object.values(PACE_KEYS);
  for (const p of items) {
    for (const key of paceKeys) delete p[key];
    const gp = Math.max(Number(p.GP) || 0, 1);
    for (const cat of cats) {
      const key = PACE_KEYS[cat];
      if (!key) continue;
      const v = Number(p[cat]) || 0;
      p[key] = Math.round((v / gp) * LEAGUE_CONFIG.paceGames);
    }
  }
}

function paceKeyFor(cat) {
  return PACE_KEYS[cat] || cat;
}

////// Value indexes (weighted pace z-scores)
// Age curve: Gaussian peaking at prime age (24 skaters / 25 goalies),
// declining for both older players and pre-prime prospects.
// Standardized across the pool like every other z-term, so the Age
// weight blends in on the same scale. Higher is better.
const AGE_CURVE_SIGMA = 4;

function ageCurveValue(age, peak) {
  const d = age - peak;
  return Math.exp(-(d * d) / (2 * AGE_CURVE_SIGMA * AGE_CURVE_SIGMA));
}

function ageCurveScore(pool, peak) {
  const entries = [];
  for (const p of pool) {
    const v = Number(p.Age);
    entries.push([p, Number.isFinite(v) ? ageCurveValue(v, peak) : null]);
  }
  const vals = entries.map(([, v]) => v).filter((v) => v != null);
  const m = mean(vals);
  const sd = stdev(vals);
  const map = new Map();
  for (const [p, v] of entries) {
    map.set(p, v == null || sd === 0 ? 0 : (v - m) / sd);
  }
  return map;
}

function linearSlope(vals) {
  const n = vals.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = mean(vals);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (vals[i] - meanY);
    den += (i - meanX) * (i - meanX);
  }
  return den === 0 ? 0 : num / den;
}

function weightedComposite(p, cats, zMaps, ageMap) {
  let total = 0;
  for (let i = 0; i < cats.length; i++) {
    total += getWeight(cats[i]) * zMaps[i].get(p);
  }
  total += getWeight("Age") * ageMap.get(p);
  return Math.round(total * 100) / 100;
}

function assignValueIndex(pool, cats, inverted, targetKey, peak) {
  const paceCats = cats.map((c) => paceKeyFor(c));
  const zMaps = categoryZ(paceCats, inverted, pool);
  const ageMap = ageCurveScore(pool, peak);
  for (const p of pool) p[targetKey] = weightedComposite(p, cats, zMaps, ageMap);
}

function groupValueIndex(data, groupFn, cats, inverted, targetKey, minGP, peak) {
  const groups = new Map();
  for (const p of eligible(data, minGP)) {
    const g = groupFn(p);
    if (g == null) continue;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(p);
  }
  for (const group of groups.values()) {
    assignValueIndex(group, cats, inverted, targetKey, peak);
  }
}

function minGPFor(data) {
  if (!Array.isArray(data) || data.length === 0) return 1;
  const gps = data.map((p) => Number(p.GP) || 0).filter((v) => v > 0);
  if (gps.length === 0) return 1;
  const avg = gps.reduce((s, v) => s + v, 0) / gps.length;
  return Math.max(1, Math.ceil(avg * 0.1));
}

function addPlayerValueFields(data, cats = LEAGUE_CONFIG.skaterCategories) {
  if (!Array.isArray(data) || data.length === 0) return data;
  const cfg = LEAGUE_CONFIG;
  const minGP = minGPFor(data);
  const pool = eligible(data, minGP);
  computePaceValues(data, cats);

  const inverted = cats.map(() => false);
  assignValueIndex(pool, cats, inverted, "GVI", VALUE_WEIGHTS.skaterAgePeak);
  groupValueIndex(
    data,
    (p) => (isForward(p) ? "F" : "D"),
    cats,
    inverted,
    "RVI",
    minGP,
    VALUE_WEIGHTS.skaterAgePeak,
  );
  return data;
}

function addGoalerValueFields(
  data,
  cats = LEAGUE_CONFIG.goalieCategories,
) {
  if (!Array.isArray(data) || data.length === 0) return data;
  const cfg = LEAGUE_CONFIG;
  const minGP = minGPFor(data);
  const pool = eligible(data, minGP);
  computePaceValues(data, cats);

  const inverted = cats.map((c) => c === "GAA" || c === "GA");
  assignValueIndex(pool, cats, inverted, "GVI", VALUE_WEIGHTS.goalieAgePeak);
  assignValueIndex(pool, cats, inverted, "RVI", VALUE_WEIGHTS.goalieAgePeak);
  return data;
}

function computeAverageGVI(seasonData) {
  const series = new Map();
  for (const season of Object.keys(seasonData)) {
    for (const player of seasonData[season]) {
      const name = player.Joueurs || player.Gardiens;
      if (!series.has(name)) series.set(name, []);
      series.get(name).push({ season, gvi: Number(player.GVI) || 0 });
    }
  }

  const avgMap = new Map();
  const trendMap = new Map();
  const stabMap = new Map();
  for (const [name, list] of series) {
    list.sort((a, b) => (a.season < b.season ? -1 : 1));
    const vals = list.map((s) => s.gvi);
    const m = mean(vals);
    avgMap.set(name, Math.round(m * 100) / 100);
    trendMap.set(name, Math.round(linearSlope(vals) * 100) / 100);
    const sd = stdev(vals);
    const cv = m === 0 ? 0 : sd / Math.abs(m);
    stabMap.set(name, Math.round((1 / (1 + cv)) * 100) / 100);
  }
  return { avgMap, trendMap, stabMap };
}

const SKATER_RANK_CONFIG = [
  { key: "G", rankKey: "rankG", ascending: false },
  { key: "A", rankKey: "rankA", ascending: false },
  { key: "P", rankKey: "rankP", ascending: false },
  { key: "PPP", rankKey: "rankPPP", ascending: false },
  { key: "+/-", rankKey: "rankPM", ascending: false },
];

const GOALIE_RANK_CONFIG = [
  { key: "W", rankKey: "rankW", ascending: false },
  { key: "SV%", rankKey: "rankSV", ascending: false },
  { key: "GAA", rankKey: "rankGAA", ascending: true },
  { key: "GA", rankKey: "rankGA", ascending: true },
  { key: "SV", rankKey: "rankSaves", ascending: false },
  { key: "SO", rankKey: "rankSO", ascending: false },
];

function addCategoryRanks(data, config) {
  if (!Array.isArray(data) || data.length === 0) return data;
  const poolSize = data.length;

  for (const { key, rankKey, ascending } of config) {
    const sorted = [...data].sort((a, b) => {
      const av = Number(a[key]);
      const bv = Number(b[key]);
      const aSafe = Number.isFinite(av) ? av : ascending ? Infinity : -Infinity;
      const bSafe = Number.isFinite(bv) ? bv : ascending ? Infinity : -Infinity;
      return ascending ? aSafe - bSafe : bSafe - aSafe;
    });
    const rankMap = new Map();
    sorted.forEach((player, i) => rankMap.set(player, i + 1));
    for (const player of data) player[rankKey] = rankMap.get(player);
  }

  for (const player of data) player.poolSize = poolSize;
  return data;
}

////// Roto value (Z-score)
function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((sum, v) => sum + v, 0) / arr.length;
}

function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(
    arr.reduce((sum, v) => sum + (v - m) * (v - m), 0) / arr.length,
  );
}

function eligible(data, minGP) {
  return data.filter((p) => (Number(p.GP) || 0) >= minGP);
}

function categoryZ(cats, inverted, pool) {
  return cats.map((cat, i) => {
    const vals = [];
    for (const p of pool) {
      const v = Number(p[cat]);
      if (Number.isFinite(v)) vals.push(v);
    }
    const m = mean(vals);
    const sd = stdev(vals);
    const zMap = new Map();
    for (const p of pool) {
      const v = Number(p[cat]);
      if (!Number.isFinite(v)) {
        zMap.set(p, 0);
        continue;
      }
      const z = sd === 0 ? 0 : (v - m) / sd;
      zMap.set(p, inverted[i] ? -z : z);
    }
    return zMap;
  });
}

function assignRoto(pool, cats, inverted, targetKey, weightList) {
  const zMaps = categoryZ(cats, inverted, pool);
  for (const p of pool) {
    let total = 0;
    for (let i = 0; i < cats.length; i++) {
      total +=
        (weightList ? weightList[i] : getWeight(cats[i])) * zMaps[i].get(p);
    }
    p[targetKey] = Math.round(total * 100) / 100;
  }
}

function groupRoto(data, groupFn, cats, inverted, targetKey, minGP, weightList) {
  const groups = new Map();
  for (const p of eligible(data, minGP)) {
    const g = groupFn(p);
    if (g == null) continue;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(p);
  }
  for (const group of groups.values()) {
    assignRoto(group, cats, inverted, targetKey, weightList);
  }
}

function computeZScores(players, cats, inverted) {
  const pool = eligible(players, minGPFor(players));
  const zMaps = categoryZ(cats, inverted, pool);
  const result = new Map();
  for (const p of pool) {
    const perCat = {};
    for (let i = 0; i < cats.length; i++) {
      perCat[cats[i]] = Math.round(zMaps[i].get(p) * 100) / 100;
    }
    result.set(p, perCat);
  }
  return result;
}

function computeGoalieZScores(goalies, cats, inverted) {
  const pool = eligible(goalies, minGPFor(goalies));
  const zMaps = categoryZ(cats, inverted, pool);
  const result = new Map();
  for (const p of pool) {
    const perCat = {};
    for (let i = 0; i < cats.length; i++) {
      perCat[cats[i]] = Math.round(zMaps[i].get(p) * 100) / 100;
    }
    result.set(p, perCat);
  }
  return result;
}

function zScoresFor(pool, cats, inverted) {
  const zMaps = categoryZ(cats, inverted, pool);
  const result = new Map();
  for (const p of pool) {
    const perCat = {};
    for (let i = 0; i < cats.length; i++) {
      perCat[cats[i]] = Math.round(zMaps[i].get(p) * 100) / 100;
    }
    result.set(p, perCat);
  }
  return result;
}

function isForward(p) {
  return !(p.Position && p.Position.includes("D"));
}

function positionCode(p) {
  for (const code of ["C", "L", "R", "D"]) {
    if (p.Position && p.Position.includes(code)) return code;
  }
  return null;
}

function computeRadarZScores(players, leaguePool, mode, cats, inverted, minGP) {
  if (mode === "selected") {
    return zScoresFor(eligible(players, minGP), cats, inverted);
  }
  if (mode === "league") {
    return zScoresFor(eligible(leaguePool, minGP), cats, inverted);
  }

  if (mode === "group") {
    const groupZ = zScoresFor(
      eligible(leaguePool.filter(isForward), minGP),
      cats,
      inverted,
    );
    const defenceZ = zScoresFor(
      eligible(leaguePool.filter((p) => !isForward(p)), minGP),
      cats,
      inverted,
    );
    const result = new Map();
    for (const p of players) {
      const zMap = isForward(p) ? groupZ : defenceZ;
      const z = zMap.get(p);
      if (z) result.set(p, z);
    }
    return result;
  }

  const positionZ = new Map();
  for (const code of ["C", "L", "R", "D"]) {
    positionZ.set(
      code,
      zScoresFor(
        eligible(leaguePool.filter((p) => positionCode(p) === code), minGP),
        cats,
        inverted,
      ),
    );
  }
  const result = new Map();
  for (const p of players) {
    const zMap = positionZ.get(positionCode(p));
    if (!zMap) continue;
    const z = zMap.get(p);
    if (z) result.set(p, z);
  }
  return result;
}

function computeRotoValues(players, cats = LEAGUE_CONFIG.rotoCategories) {
  const cfg = LEAGUE_CONFIG;
  const minGP = minGPFor(players);
  const inverted = cats.map(() => false);
  const pool = eligible(players, minGP);
  computePaceValues(players, cats);

  const weightList = cats.map((c) => getWeight(c));
  assignRoto(pool, cats, inverted, "RotoVal", weightList);
  groupRoto(
    players,
    (p) => (p.Position && p.Position.includes("D") ? "D" : "F"),
    cats,
    inverted,
    "RotoVal-Pos",
    minGP,
    weightList,
  );
  groupRoto(
    players,
    (p) => {
      for (const code of ["C", "L", "R", "D"]) {
        if (p.Position && p.Position.includes(code)) return code;
      }
      return null;
    },
    cats,
    inverted,
    "RotoVal-PosExact",
    minGP,
    weightList,
  );

  const included = new Set(cats);
  const paceCats = [];
  const paceWeights = [];
  for (const [stat, key] of Object.entries(PACE_KEYS)) {
    if (!included.has(stat)) continue;
    paceCats.push(key);
    paceWeights.push(getWeight(stat));
  }
  assignRoto(
    pool,
    paceCats,
    paceCats.map(() => false),
    "RotoVal-Pace",
    paceWeights,
  );
}

function computeGoalieRotoValues(goalies, cats = LEAGUE_CONFIG.goalieRotoCategories) {
  const cfg = LEAGUE_CONFIG;
  const minGP = minGPFor(goalies);
  const inverted = cats.map((c) => c === "GAA" || c === "GA");
  const pool = eligible(goalies, minGP);
  computePaceValues(goalies, cats);

  const weightList = cats.map((c) => getWeight(c));
  assignRoto(pool, cats, inverted, "RotoVal", weightList);

  const collected = [];
  for (const c of cats) {
    if (c === "W") collected.push(["W82", false]);
    else if (c === "SA") collected.push(["SA82", false]);
    else if (c === "SV%") collected.push(["SV%", false]);
    else if (c === "GAA") collected.push(["GAA", true]);
    else if (c === "GA") collected.push(["GA", true]);
    else if (c === "SV") collected.push(["SV", false]);
    else if (c === "SO") collected.push(["SO", false]);
  }
  const paceCats = collected.map(([k]) => k);
  const paceInverted = collected.map(([, inv]) => inv);
  const paceWeights = collected.map(([k]) =>
    getWeight(k === "W82" ? "W" : k === "SA82" ? "SA" : k),
  );
  assignRoto(pool, paceCats, paceInverted, "RotoVal-Pace", paceWeights);
}

export const TIER_ORDER = ["S++", "S+", "S", "A", "B", "C", "D", "E", "F"];
export const TIER_RANK = new Map(TIER_ORDER.map((t, i) => [t, i]));
// Redraft weights: current production dominates, pace corrects for GP, history is tiebreaker.
// RVI (F vs D group) outranks ZPX (exact C/L/R/D) so F-vs-D fairness matters most.
export const TIER_WEIGHTS = { Z: 0.25, GVI: 0.28, AGVI: 0.22, ZPX: 0.1, RVI: 0.15 };
// Top-fraction cutoffs: S++ <0.005, S+ <0.015, S <0.08, A <0.20, B <0.40, C <0.60, D <0.75, E <0.85, else F.
const TIER_CUTOFFS = [0.005, 0.015, 0.08, 0.2, 0.4, 0.6, 0.75, 0.85];

function tierField(p, key) {
  const v = Number(p[key]);
  // Every z-index has pool mean 0, so a missing term counts as average.
  return Number.isFinite(v) ? v : 0;
}

function tierComposite(p) {
  const z = Number(p.RotoVal);
  const gvi = Number(p.GVI);
  if (!Number.isFinite(z) || !Number.isFinite(gvi)) return null;
  return (
    TIER_WEIGHTS.Z * z +
    TIER_WEIGHTS.GVI * gvi +
    TIER_WEIGHTS.AGVI * tierField(p, "AGVI") +
    TIER_WEIGHTS.ZPX * tierField(p, "RotoVal-PosExact") +
    TIER_WEIGHTS.RVI * tierField(p, "RVI")
  );
}

function assignTiers(pool) {
  if (!Array.isArray(pool)) return;
  const scored = [];
  for (const p of pool) {
    const c = tierComposite(p);
    if (c == null) {
      p.Tier = "";
    } else {
      scored.push([p, c]);
    }
  }
  scored.sort((a, b) => b[1] - a[1]);
  const n = scored.length;
  for (let i = 0; i < n; i++) {
    const topFrac = n === 0 ? 1 : i / n;
    let tierIdx = TIER_ORDER.length - 1;
    for (let k = 0; k < TIER_CUTOFFS.length; k++) {
      if (topFrac < TIER_CUTOFFS[k]) {
        tierIdx = k;
        break;
      }
    }
    scored[i][0].Tier = TIER_ORDER[tierIdx];
  }
}

function computeTiers(skaters, goalies) {
  // Forwards and defencemen are tiered in separate pools so D-men compete
  // against D-men (positional scarcity); goalies keep their own pool.
  const forwards = Array.isArray(skaters) ? skaters.filter(isForward) : [];
  const defence = Array.isArray(skaters)
    ? skaters.filter((p) => !isForward(p))
    : [];
  assignTiers(forwards);
  assignTiers(defence);
  assignTiers(goalies);
}

export {
  addPlayerValueFields,
  addGoalerValueFields,
  addCategoryRanks,
  SKATER_RANK_CONFIG,
  GOALIE_RANK_CONFIG,
  computeAverageGVI,
  computeRotoValues,
  computeGoalieRotoValues,
  computeZScores,
  computeGoalieZScores,
  computeRadarZScores,
  computeTiers,
  assignTiers,
  minGPFor,
};
