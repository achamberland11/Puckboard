import { CACHE_KEY, loadPlayers, loadGoalies, loadRosterBirthDates, loadSkaterRealtime, removeCacheKeys } from "./api.js";
import {
  addGoalerValueFields,
  addPlayerValueFields,
  addCategoryRanks,
  computeAverageGVI,
  computeRotoValues,
  computeGoalieRotoValues,
  computeTiers,
  SKATER_RANK_CONFIG,
  GOALIE_RANK_CONFIG,
} from "./stats.js";
import {
  renderPlayers,
  resetHidden,
  resetHighlight,
  isHidden,
  toggleCompare,
  getCompareIds,
  clearCompare,
  onCompareChange,
  getVisibleRotoCategories,
  getVisibleGoalieRotoCategories,
  onColumnVisibilityChange,
} from "./table.js";
import { openCompareModal } from "./compare.js";
import { getWeight, setWeight, resetWeights, onWeightsChange } from "./weights.js";

const positionSelect = document.getElementById("positionFilter");
const defaultPosition = "All";
positionSelect.value = defaultPosition;
let allPlayers = [];
let goalies = [];

const seasonSelect = document.getElementById("seasonFilter");
const defaultSeason = "20262027";
seasonSelect.value = defaultSeason;

const searchInput = document.getElementById("searchInput");

let season = defaultSeason;
let positionFilter = defaultPosition;

const Position = {
  ALL: "All",
  F: "F",
  C: "C",
  LW: "LW",
  RW: "RW",
  D: "D",
  G: "G",
  REMOVED: "Removed",
};

const seasons = ["20262027", "20252026", "20242025", "20232024", "20222023", "20212022"];
const seasonDataPlayer = {};
const seasonDataGoaler = {};

function filterByPosition(players, position) {
  switch (position) {
    case Position.ALL:
      return players;
    case Position.F:
      return players.filter(
        (p) =>
          p.Position.includes("C") ||
          p.Position.includes("L") ||
          p.Position.includes("R"),
      );
    case Position.C:
      return players.filter((p) => p.Position.includes("C"));
    case Position.LW:
      return players.filter((p) => p.Position.includes("L"));
    case Position.RW:
      return players.filter((p) => p.Position.includes("R"));
    case Position.D:
      return players.filter((p) => p.Position.includes("D"));
    case Position.G:
      return goalies;
    default:
      return players;
  }
}

function filterBySearch(players, query) {
  const q = query.trim().toLowerCase();
  if (!q) return players;
  return players.filter((p) => {
    const name = (p.Joueurs || p.Gardiens || "").toLowerCase();
    const team = (p.Team || "").toLowerCase();
    return name.includes(q) || team.includes(q);
  });
}

function computeAge(birthDate, season) {
  if (!birthDate) return 0;
  const birth = new Date(birthDate);
  if (isNaN(birth)) return 0;
  const start = new Date(Number(season.slice(0, 4)), 9, 1);
  let age = start.getFullYear() - birth.getFullYear();
  const monthDiff = start.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && start.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function render() {
  const removedView = positionFilter === Position.REMOVED;
  let filtered;
  if (removedView) {
    const distinct = new Map();
    for (const p of [...allPlayers, ...goalies]) {
      if (isHidden(p.ID)) distinct.set(p.ID, p);
    }
    filtered = filterBySearch([...distinct.values()], searchInput.value);
  } else {
    filtered = filterBySearch(
      filterByPosition(allPlayers, positionFilter),
      searchInput.value,
    );
  }
  renderPlayers(filtered, { showHidden: removedView });
}

const WEIGHT_GROUPS = [
  { title: "Skaters", cats: ["G", "A", "P", "PPP", "+/-", "S", "BLK", "HITS"] },
  { title: "Goalers", cats: ["W", "SV%", "GAA", "SA"] },
];

const WEIGHT_HINTS = {
  G: "Goals.",
  A: "Assists.",
  P: "Points (goals + assists).",
  PPP: "Power play points.",
  "+/-": "Plus/minus.",
  S: "Shots (counted in the Z-scores and value indexes when the column is displayed).",
  BLK: "Blocked shots (counted in the Z-scores and value indexes when the column is displayed).",
  HITS: "Hits (counted in the Z-scores and value indexes when the column is displayed).",
  W: "Wins.",
  "SV%": "Save percentage.",
  GAA: "Goals against average (lower is better).",
  SA: "Shots against (higher is better, counted when the column is displayed).",
  Age: "Age factor in GVI/RVI: peaks at prime age (24 skaters, 25 goalies). 0 = off; raise to weight prime age more.",
};

function buildWeightInput(cat) {
  const label = document.createElement("label");
  label.className = "weight-input";

  const name = document.createElement("span");
  name.textContent = cat;
  const hint = WEIGHT_HINTS[cat];
  name.title = hint
    ? `${cat}: ${hint} Weight applied to the Z-scores and value indexes.`
    : `Weight of ${cat} applied to the Z-scores and value indexes.`;
  label.appendChild(name);

  const input = document.createElement("input");
  input.type = "number";
  input.step = "0.1";
  input.min = "0";
  label.appendChild(input);

  let timer = null;

  function sync() {
    input.value = getWeight(cat);
  }

  function commit() {
    clearTimeout(timer);
    const raw = input.value;
    if (raw === "") return sync();
    const v = Number(raw);
    if (!Number.isFinite(v) || v < 0) return sync();
    if (v !== getWeight(cat)) setWeight(cat, v);
    else sync();
  }

  input.addEventListener("change", commit);
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const raw = input.value;
    if (raw === "") return;
    const v = Number(raw);
    if (!Number.isFinite(v) || v < 0) return;
    timer = setTimeout(() => {
      if (v !== getWeight(cat)) setWeight(cat, v);
    }, 250);
  });
  input.addEventListener("focus", () => input.select());

  label.sync = sync;
  return label;
}

function buildWeightsPanel() {
  const wrap = document.createElement("div");
  wrap.className = "weights-wrap";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "button";
  btn.textContent = "Weights";
  btn.title = "Adjust how much each category counts in the Z-scores and value indexes. Reset restores the defaults.";

  const panel = document.createElement("div");
  panel.className = "weights-panel";
  panel.hidden = true;

  function toggle(open) {
    panel.hidden = !open;
    btn.classList.toggle("active", open);
    if (open) {
      for (const row of panel.querySelectorAll(".weight-input")) row.sync();
    }
  }

  for (const group of WEIGHT_GROUPS) {
    const section = document.createElement("div");
    section.className = "weights-section";

    const title = document.createElement("div");
    title.className = "weights-section-title";
    title.textContent = group.title;
    section.appendChild(title);

    for (const cat of group.cats) section.appendChild(buildWeightInput(cat));
    panel.appendChild(section);
  }

  const bothSection = document.createElement("div");
  bothSection.className = "weights-section";
  const bothTitle = document.createElement("div");
  bothTitle.className = "weights-section-title";
  bothTitle.textContent = "Both";
  bothSection.appendChild(bothTitle);
  bothSection.appendChild(buildWeightInput("Age"));
  panel.appendChild(bothSection);

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "button";
  resetBtn.textContent = "Reset to defaults";
  resetBtn.title = "Restore the default weights.";
  resetBtn.addEventListener("click", () => {
    resetWeights();
    for (const row of panel.querySelectorAll(".weight-input")) row.sync();
  });
  panel.appendChild(resetBtn);

  btn.addEventListener("click", () => toggle(panel.hidden));
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target) && !panel.hidden) toggle(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) toggle(false);
  });

  wrap.appendChild(btn);
  wrap.appendChild(panel);
  return wrap;
}

(async () => {
  document.getElementById("refreshBtn").addEventListener("click", async () => {
    await removeCacheKeys([
      CACHE_KEY + "_skaters_" + seasons[0],
      CACHE_KEY + "_goalies_" + seasons[0],
      CACHE_KEY + "_skater_realtime_" + seasons[0],
    ]);
    location.reload();
  });

  const ranksToggle = document.getElementById("ranksToggle");
  ranksToggle.addEventListener("change", () => {
    document.body.classList.toggle("show-ranks", ranksToggle.checked);
  });

  // Keep the sticky table header parked below the sticky filter bar,
  // whose height varies with wrapping. ResizeObserver covers wrap,
  // zoom, and font-load shifts without a scroll listener.
  const filtersBar = document.querySelector(".filters-bar");
  if (filtersBar) {
    const setStickyOffset = () => {
      document.documentElement.style.setProperty(
        "--sticky-offset",
        `${filtersBar.offsetHeight}px`,
      );
    };
    setStickyOffset();
    if ("ResizeObserver" in window) {
      new ResizeObserver(setStickyOffset).observe(filtersBar);
    } else {
      window.addEventListener("resize", setStickyOffset);
    }
  }

  document.getElementById("resetHideBtn").addEventListener("click", () => {
    resetHidden();
    render();
  });

  document.getElementById("resetHighlightBtn").addEventListener("click", () => {
    resetHighlight();
    render();
  });

  document.getElementById("resetCompareBtn").addEventListener("click", () => {
    clearCompare();
    render();
  });

  const compareBtn = document.getElementById("compareBtn");
  const updateCompareBtn = (ids) => {
    const n = ids.size;
    compareBtn.disabled = n < 2;
    compareBtn.textContent = `Compare (${n})`;
  };
  onCompareChange(updateCompareBtn);
  updateCompareBtn(getCompareIds());

  compareBtn.addEventListener("click", () => {
    const ids = getCompareIds();
    const byId = new Map();
    for (const p of allPlayers) byId.set(p.ID, p);
    for (const g of goalies) byId.set(g.ID, g);

    const selected = [...ids].map((id) => byId.get(id)).filter(Boolean);
    const skaters = selected.filter((p) => p.Joueurs);
    const goaliesSel = selected.filter((p) => p.Gardiens);

    if (skaters.length && goaliesSel.length) {
      alert("Cannot compare skaters and goalies together.");
      return;
    }
    const sameType = skaters.length ? skaters : goaliesSel;
    if (sameType.length >= 2) {
      const leaguePool = skaters.length
        ? seasonDataPlayer[season]
        : seasonDataGoaler[season];
      openCompareModal(
        sameType,
        season,
        (id) => toggleCompare(id),
        leaguePool,
        getVisibleRotoCategories(),
        getVisibleGoalieRotoCategories(),
      );
    }
  });

  const birthDates = await loadRosterBirthDates();

  const seasonResults = await Promise.all(
    seasons.map(async (s) => {
      const [players, goalies, realtime] = await Promise.all([
        loadPlayers(s),
        loadGoalies(s),
        loadSkaterRealtime(s),
      ]);
      return { s, players, goalies, realtime };
    }),
  );

  for (const { s, players, goalies, realtime } of seasonResults) {
    const realtimeMap = new Map(realtime.map((r) => [r.playerId, r]));
    for (const player of players) {
      const rt = realtimeMap.get(player.ID);
      if (rt) {
        player.BLK = rt.blockedShots ?? 0;
        player.HITS = rt.hits ?? 0;
      }
      player.Age = computeAge(birthDates.get(player.ID), s);
    }
    for (const goalie of goalies) {
      goalie.Age = computeAge(birthDates.get(goalie.ID), s);
    }

    addPlayerValueFields(players, getVisibleRotoCategories());
    addGoalerValueFields(goalies, getVisibleGoalieRotoCategories());
    addCategoryRanks(players, SKATER_RANK_CONFIG);
    addCategoryRanks(goalies, GOALIE_RANK_CONFIG);

    seasonDataPlayer[s] = players;
    seasonDataGoaler[s] = goalies;
  }

  function recomputeValueIndexes() {
    const skaterCats = getVisibleRotoCategories();
    const goalieCats = getVisibleGoalieRotoCategories();
    for (const s of seasons) {
      addPlayerValueFields(seasonDataPlayer[s], skaterCats);
      addGoalerValueFields(seasonDataGoaler[s], goalieCats);
    }
    const skaters = computeAverageGVI(seasonDataPlayer);
    const goalies = computeAverageGVI(seasonDataGoaler);
    for (const s of seasons) {
      for (const player of seasonDataPlayer[s]) {
        player.AGVI = skaters.avgMap.get(player.Joueurs) || 0;
        player.Trend = skaters.trendMap.get(player.Joueurs) || 0;
        player.Stab = skaters.stabMap.get(player.Joueurs) || 0;
      }
      for (const goalie of seasonDataGoaler[s]) {
        goalie.AGVI = goalies.avgMap.get(goalie.Gardiens) || 0;
        goalie.Trend = goalies.trendMap.get(goalie.Gardiens) || 0;
        goalie.Stab = goalies.stabMap.get(goalie.Gardiens) || 0;
      }
    }
  }

  function applyRotoVisibility() {
    computeRotoValues(seasonDataPlayer[season], getVisibleRotoCategories());
    computeGoalieRotoValues(seasonDataGoaler[season], getVisibleGoalieRotoCategories());
  }

  function applyTiersAll() {
    for (const s of seasons) {
      computeTiers(seasonDataPlayer[s], seasonDataGoaler[s]);
    }
  }

  recomputeValueIndexes();

  for (const s of seasons) {
    computeRotoValues(seasonDataPlayer[s], getVisibleRotoCategories());
    computeGoalieRotoValues(seasonDataGoaler[s], getVisibleGoalieRotoCategories());
  }
  applyTiersAll();

  allPlayers = seasonDataPlayer[season];
  goalies = seasonDataGoaler[season];
  applyRotoVisibility();
  applyTiersAll();
  render();

  onColumnVisibilityChange(() => {
    recomputeValueIndexes();
    for (const s of seasons) {
      computeRotoValues(seasonDataPlayer[s], getVisibleRotoCategories());
      computeGoalieRotoValues(seasonDataGoaler[s], getVisibleGoalieRotoCategories());
    }
    applyTiersAll();
    render();
  });

  onWeightsChange(() => {
    recomputeValueIndexes();
    for (const s of seasons) {
      computeRotoValues(seasonDataPlayer[s], getVisibleRotoCategories());
      computeGoalieRotoValues(seasonDataGoaler[s], getVisibleGoalieRotoCategories());
    }
    applyTiersAll();
    render();
  });

  document.querySelector(".filters-bar").appendChild(buildWeightsPanel());

  seasonSelect.addEventListener("change", async () => {
    season = seasonSelect.value;

    allPlayers = seasonDataPlayer[season];
    goalies = seasonDataGoaler[season];
    applyRotoVisibility();
    applyTiersAll();

    clearCompare();
    render();
  });

  positionSelect.addEventListener("change", () => {
    positionFilter = positionSelect.value;
    render();
  });

  const clearSearchBtn = document.getElementById("clearSearchBtn");
  const updateClearBtn = () => {
    clearSearchBtn.hidden = !searchInput.value;
  };

  searchInput.addEventListener("input", () => {
    updateClearBtn();
    render();
  });

  clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    updateClearBtn();
    render();
    searchInput.focus();
  });
})();


export { seasons, seasonDataPlayer, seasonDataGoaler, getCurrentSeason };

function getCurrentSeason() {
  return season;
}
