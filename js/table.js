import { openPlayerCard } from "./playerCard.js";
import { TEAM_SLUGS } from "./api.js";
import { FIELD_INFO } from "./fields.js";
import { LEAGUE_CONFIG } from "./config.js";
import { TIER_RANK } from "./stats.js";

const RANK_COLS = new Set([
  "rankG",
  "rankA",
  "rankP",
  "rankPPP",
  "rankPM",
  "rankW",
  "rankSV",
  "rankGAA",
]);

const CATEGORY_RANKS = {
  G: "rankG",
  A: "rankA",
  P: "rankP",
  PPP: "rankPPP",
  "+/-": "rankPM",
  W: "rankW",
  "SV%": "rankSV",
  GAA: "rankGAA",
};

const VALUE_COLS = [
  "RVI",
  "GVI",
  "AGVI",
  "Trend",
  "Stab",
  "RotoVal",
  "RotoVal-Pos",
  "RotoVal-PosExact",
  "RotoVal-Pace",
];

const HEADER_LABELS = {
  rankG: "G Rank",
  rankA: "A Rank",
  rankP: "P Rank",
  rankPPP: "PPP Rank",
  rankPM: "+/- Rank",
  rankW: "W Rank",
  rankSV: "SV% Rank",
  rankGAA: "GAA Rank",
  S: "SOG",
  BLK: "BLK",
  HITS: "HITS",
  SA: "SA",
  RotoVal: "Z",
  "RotoVal-Pos": "ZP",
  "RotoVal-PosExact": "ZPX",
  "RotoVal-Pace": "Z82",
  PM82: "+/-82",
  Tier: "Tier",
};

const TIER_BADGE_CLASS = {
  "S++": "tier-splusplus",
  "S+": "tier-splus",
  S: "tier-s",
  A: "tier-a",
  B: "tier-b",
  C: "tier-c",
  D: "tier-d",
  E: "tier-e",
  F: "tier-f",
};

function tierSortVal(v) {
  if (v == null || v === "") return 99;
  const r = TIER_RANK.get(v);
  return r == null ? 99 : r;
}

// Pin Tier right after identity columns (name/team/position) so it stays prominent.
function orderColumns(cols) {
  if (!cols.includes("Tier")) return cols;
  const rest = cols.filter((c) => c !== "Tier");
  const anchorCandidates = ["Position", "Team", "Gardiens", "Joueurs"];
  let anchorIdx = -1;
  for (const anchor of anchorCandidates) {
    const i = rest.lastIndexOf(anchor);
    if (i > anchorIdx) anchorIdx = i;
  }
  const insertAt = anchorIdx === -1 ? 0 : anchorIdx + 1;
  return [...rest.slice(0, insertAt), "Tier", ...rest.slice(insertAt)];
}

const HIDDEN_COLUMNS_STORAGE_KEY = "nhl_stats_hidden_cols";
const DEFAULT_HIDDEN_COLUMNS = ["S", "BLK", "HITS", "SA"];

const PACE82_COLUMNS = [
  "G82",
  "A82",
  "P82",
  "PPP82",
  "PM82",
  "SOG82",
  "BLK82",
  "HITS82",
  "W82",
  "SA82",
];

const COLUMN_TOGGLES = [
  ["PPP", "PPP"],
  ["+/-", "+/-"],
  ["TOI", "TOI"],
  ["S", "Shots"],
  ["BLK", "Blocks"],
  ["HITS", "Hits"],
  ["SA", "Shots against"],
];

function loadHiddenColumns() {
  try {
    const stored = JSON.parse(
      localStorage.getItem(HIDDEN_COLUMNS_STORAGE_KEY) || "null",
    );
    if (Array.isArray(stored)) return new Set(stored);
  } catch (err) {
    console.error("Failed to load hidden columns:", err);
  }
  return new Set(DEFAULT_HIDDEN_COLUMNS);
}

const hiddenColumns = loadHiddenColumns();

function saveHiddenColumns() {
  localStorage.setItem(
    HIDDEN_COLUMNS_STORAGE_KEY,
    JSON.stringify([...hiddenColumns]),
  );
}

const visibilityListeners = new Set();

function getVisibleRotoCategories() {
  return LEAGUE_CONFIG.rotoCategories.filter((c) => !hiddenColumns.has(c));
}

function getVisibleGoalieRotoCategories() {
  return LEAGUE_CONFIG.goalieRotoCategories.filter((c) => !hiddenColumns.has(c));
}

function onColumnVisibilityChange(fn) {
  visibilityListeners.add(fn);
  return () => visibilityListeners.delete(fn);
}

const HIDDEN_STORAGE_KEY = "nhl_stats_hidden";
const hiddenPlayers = new Set(loadHidden());

function loadHidden() {
  try {
    const stored = JSON.parse(localStorage.getItem(HIDDEN_STORAGE_KEY) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch (err) {
    return [];
  }
}

function saveHidden() {
  localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify([...hiddenPlayers]));
}

function resetHidden() {
  hiddenPlayers.clear();
  localStorage.removeItem(HIDDEN_STORAGE_KEY);
}

function resetHighlight() {
  highlightedPlayers.clear();
}

const MAX_COMPARE = 5;
const compareIds = new Set();
const compareListeners = new Set();

const highlightedPlayers = new Set();

function notifyCompareChange() {
  for (const fn of compareListeners) fn(getCompareIds());
}

function toggleCompare(id) {
  if (compareIds.has(id)) {
    compareIds.delete(id);
  } else {
    if (compareIds.size >= MAX_COMPARE) return false;
    compareIds.add(id);
  }
  notifyCompareChange();
  return true;
}

function isCompareSelected(id) {
  return compareIds.has(id);
}

function getCompareIds() {
  return new Set(compareIds);
}

function clearCompare() {
  compareIds.clear();
  notifyCompareChange();
}

function onCompareChange(fn) {
  compareListeners.add(fn);
  return () => compareListeners.delete(fn);
}

/// Sort table
function columnIsNumeric(data, colKey) {
  if (!Array.isArray(data)) return false;
  return data.every((row) => {
    const v = row[colKey];
    return v == null || v === "" || !isNaN(Number(v));
  });
}

function applyValueBanding(td, item, col, rankMap, nbr, percentile) {
  if (item[col] == null) return;
  const num = Number(item[col]);
  if (isNaN(num)) return;
  const rank = rankMap.get(item);
  if (rank == null) return;
  if (rank >= nbr - percentile / 2) {
    td.classList.add("value-peak");
  } else if (rank >= nbr - 2 * percentile) {
    td.classList.add("value-high");
  } else if (rank >= nbr - 3 * percentile) {
    td.classList.add("value-mid");
  } else if (rank >= nbr - 4 * percentile) {
    td.classList.add("value-low");
  } else {
    td.classList.add("value-bad");
  }
}

/// Build table
function buildTable(data, options = {}) {
  const sortState = { col: null, asc: true, prevCol: null, prevAsc: true };
  const table = document.createElement("table");

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  const columns = orderColumns(
    Object.keys(data[0] || {}).filter(
      (col) => !RANK_COLS.has(col) && !hiddenColumns.has(col),
    ),
  );
  const numericMap = {};

  const thHide = document.createElement("th");
  thHide.className = "col-hide";
  thHide.title = "Hide player";
  headerRow.appendChild(thHide);

  const thNum = document.createElement("th");
  thNum.textContent = "#";
  headerRow.appendChild(thNum);

  columns.forEach((col) => {
    const th = document.createElement("th");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sort-btn";

    btn.textContent = HEADER_LABELS[col] || col;
    btn.dataset.col = col;
    const info = FIELD_INFO[col];
    if (info) btn.title = info;
    th.appendChild(btn);
    headerRow.appendChild(th);

    th.classList.add(`col-${col}`);

    th.addEventListener("click", () => {
      const colKey = btn.dataset.col;
      const isTier = colKey === "Tier";

      if (!(colKey in numericMap)) {
        numericMap[colKey] = isTier ? false : columnIsNumeric(data, colKey);
      }

      if (sortState.col === colKey) {
        sortState.asc = !sortState.asc;
      } else {
        // The previous primary sort becomes the secondary (tie-break) sort.
        sortState.prevCol = sortState.col;
        sortState.prevAsc = sortState.asc;
        sortState.col = colKey;
        // Tier: best (S++) first on first click.
        sortState.asc = isTier ? true : RANK_COLS.has(colKey) ? true : numericMap[colKey] ? false : true;
      }

      data.sort((a, b) => {
        const av = a[colKey];
        const bv = b[colKey];

        if (isTier) {
          const aBlank = av == null || av === "";
          const bBlank = bv == null || bv === "";
          if (aBlank && !bBlank) return 1;
          if (bBlank && !aBlank) return -1;
          if (aBlank && bBlank) return 0;
          const ar = tierSortVal(av);
          const br = tierSortVal(bv);
          return sortState.asc ? ar - br : br - ar;
        }

        const aVal = av == null ? "" : av;
        const bVal = bv == null ? "" : bv;

        // Blanks always sort last, regardless of direction.
        if (aVal === "" && bVal !== "") return 1;
        if (bVal === "" && aVal !== "") return -1;
        if (aVal === "" && bVal === "") return 0;

        if (numericMap[colKey]) {
          return sortState.asc
            ? Number(aVal) - Number(bVal)
            : Number(bVal) - Number(aVal);
        } else {
          return sortState.asc
            ? String(aVal).localeCompare(String(bVal))
            : String(bVal).localeCompare(String(aVal));
        }
      });
      headerRow
        .querySelectorAll("th")
        .forEach((th) => {
          th.removeAttribute("data-sorted");
          th.removeAttribute("data-sorted-secondary");
        });
      btn.parentElement.setAttribute(
        "data-sorted",
        sortState.asc ? "asc" : "desc",
      );
      if (sortState.prevCol != null && sortState.prevCol !== colKey) {
        const prevBtn = headerRow.querySelector(
          `button.sort-btn[data-col="${CSS.escape(sortState.prevCol)}"]`,
        );
        if (prevBtn) {
          prevBtn.parentElement.setAttribute(
            "data-sorted-secondary",
            sortState.prevAsc ? "asc" : "desc",
          );
        }
      }
      rebuildTbody();
    });

    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  function rebuildTbody() {
    tbody.innerHTML = "";
    let index = 0;

    const rankMaps = {};
    const nbr = {};
    const percentiles = {};
    for (const col of VALUE_COLS) {
      const sorted = [...data].sort(
        (a, b) => (Number(a[col]) || 0) - (Number(b[col]) || 0),
      );
      rankMaps[col] = new Map(sorted.map((item, i) => [item, i]));
      nbr[col] = sorted.length;
      percentiles[col] = Math.floor(sorted.length / 10);
    }

    data.forEach((item) => {
      const tr = document.createElement("tr");

      {
        const hidden = hiddenPlayers.has(item.ID);
        if (!options.showHidden) tr.classList.toggle("row-hidden", hidden);
        if (hidden) tr.classList.add("row-removed");

        const tdOptions = document.createElement("td");
        tdOptions.className = "col-options";

        const playerName = item.Joueurs || item.Gardiens;
        const slug = playerName.toLowerCase().replace(/\s+/g, "-");

        let a = document.createElement("a");
        a.textContent = "🔗";
        a.href = `https://www.nhl.com/player/${slug}-${item.ID}`;
        a.target = "_blank";
        a.title = "Open player's NHL.com page (new tab)";

        const hideBtn = document.createElement("button");
        hideBtn.type = "button";
        hideBtn.className = "hide-btn";
        if (options.showHidden) {
          hideBtn.textContent = "✔";
          hideBtn.title = "Add back to list";
          hideBtn.classList.add("restore-btn");
          hideBtn.addEventListener("click", () => {
            hiddenPlayers.delete(item.ID);
            saveHidden();
            tr.remove();
          });
        } else {
          hideBtn.textContent = "❌";
          hideBtn.title = "Hide player";
          hideBtn.addEventListener("click", () => {
            hiddenPlayers.add(item.ID);
            saveHidden();
            tr.classList.add("row-hidden");
          });
        }

        const cmpBtn = document.createElement("button");
        cmpBtn.type = "button";
        cmpBtn.textContent = "⚖️";
        cmpBtn.title = "Add to comparison";
        cmpBtn.className = "compare-btn";
        cmpBtn.classList.toggle("compare-on", isCompareSelected(item.ID));
        cmpBtn.addEventListener("click", () => {
          if (!toggleCompare(item.ID)) {
            cmpBtn.textContent = "🙅";
            setTimeout(() => (cmpBtn.textContent = "⚖️"), 900);
            return;
          }
          cmpBtn.classList.toggle("compare-on", isCompareSelected(item.ID));
          tr.classList.toggle(
            "compare-selected",
            isCompareSelected(item.ID),
          );
        });

        const hlBtn = document.createElement("button");
        hlBtn.type = "button";
        hlBtn.textContent = "⭐";
        hlBtn.title = "Highlight player";
        hlBtn.className = "highlight-btn";
        hlBtn.classList.toggle("highlight-on", highlightedPlayers.has(item.ID));
        hlBtn.addEventListener("click", () => {
          if (highlightedPlayers.has(item.ID)) {
            highlightedPlayers.delete(item.ID);
          } else {
            highlightedPlayers.add(item.ID);
          }
          hlBtn.classList.toggle(
            "highlight-on",
            highlightedPlayers.has(item.ID),
          );
          tr.classList.toggle(
            "row-highlighted",
            highlightedPlayers.has(item.ID),
          );
        });

        tdOptions.appendChild(hideBtn);
        tdOptions.appendChild(cmpBtn);
        tdOptions.appendChild(hlBtn);
        tr.appendChild(tdOptions);

        tdOptions.appendChild(a);

        if (isCompareSelected(item.ID)) tr.classList.add("compare-selected");
        if (highlightedPlayers.has(item.ID)) tr.classList.add("row-highlighted");

        if (!hidden || options.showHidden) {
          const tdNum = document.createElement("td");
          tdNum.textContent = ++index;
          tr.appendChild(tdNum);
        }
      }

      columns.forEach((col) => {
        const td = document.createElement("td");
        if (col === "Tier") {
          const v = item[col];
          if (v != null && v !== "") {
            const badge = document.createElement("span");
            badge.className = `tier-badge ${TIER_BADGE_CLASS[v] || ""}`;
            badge.textContent = v;
            td.appendChild(badge);
          } else {
            td.textContent = "";
          }
        } else if (col === "Team") {
          const slug = TEAM_SLUGS[item.Team];
          if (slug) {
            const a = document.createElement("a");
            a.className = "team-link";
            a.href = `https://www.dailyfaceoff.com/teams/${slug}/line-combinations`;
            a.target = "_blank";
            a.rel = "noopener";
            a.textContent = item.Team;
            td.appendChild(a);
          } else {
            td.textContent = item.Team == null ? "" : item.Team;
          }
        } else {
          const v = item[col];
          td.textContent = v == null ? "" : v;
          const rankKey = CATEGORY_RANKS[col];
          if (rankKey && item[rankKey] != null) {
            const rank = document.createElement("span");
            rank.className = "cell-rank";
            rank.textContent = `#${item[rankKey]}`;
            td.appendChild(rank);
          }
        }

        td.classList.add(`col-${col}`);

        if (VALUE_COLS.includes(col)) {
          applyValueBanding(td, item, col, rankMaps[col], nbr[col], percentiles[col]);
        }

        if (col === "Joueurs" || col === "Gardiens") {
          td.classList.add("cell-name");
          td.addEventListener("click", () => {
            // Side-panel navigation list: same players, same order as the
            // table (hidden players excluded, unless in the Removed view).
            const navList = data.filter(
              (p) => options.showHidden || !hiddenPlayers.has(p.ID),
            );
            openPlayerCard(item, navList);
          });
        }

        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
  }
  rebuildTbody();

  table.appendChild(tbody);
  return table;
}

function buildColumnToggleRow(columns) {
  const commit = () => {
    saveHiddenColumns();
    if (visibilityListeners.size > 0) {
      for (const fn of visibilityListeners) fn();
    } else {
      renderTable();
    }
  };

  const available = COLUMN_TOGGLES.filter(([key]) => columns.includes(key));
  const paceAvailable = PACE82_COLUMNS.some((key) => columns.includes(key));
  if (available.length === 0 && !paceAvailable) return null;

  const row = document.createElement("div");
  row.className = "column-toggle-row";

  for (const [key, label] of available) {
    const chip = document.createElement("label");
    chip.className = "toggle-label";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !hiddenColumns.has(key);
    const info = FIELD_INFO[key];
    if (info) input.title = info;
    input.addEventListener("change", () => {
      if (input.checked) {
        hiddenColumns.delete(key);
      } else {
        hiddenColumns.add(key);
      }
      commit();
    });

    const span = document.createElement("span");
    span.textContent = label;

    chip.appendChild(input);
    chip.appendChild(span);
    row.appendChild(chip);
  }

  if (paceAvailable) {
    const chip = document.createElement("label");
    chip.className = "toggle-label";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = PACE82_COLUMNS.every((key) => !hiddenColumns.has(key));
    input.title = "Show or hide the per-82 pace projection columns.";
    input.addEventListener("change", () => {
      for (const key of PACE82_COLUMNS) {
        if (input.checked) {
          hiddenColumns.delete(key);
        } else {
          hiddenColumns.add(key);
        }
      }
      commit();
    });

    const span = document.createElement("span");
    span.textContent = "Pace (82)";

    chip.appendChild(input);
    chip.appendChild(span);
    row.appendChild(chip);
  }

  return row;
}

let lastData = null;
let lastOptions = {};

function renderTable() {
  renderPlayers(lastData, lastOptions);
}

function renderPlayers(data, options) {
  const container = document.getElementById("playersContainer");
  if (!container) return console.error("Missing #playersContainer");
  lastData = data;
  lastOptions = options;
  if (!data.length) {
    container.textContent = "No player data.";
    return;
  }
  container.textContent = "";
  const columns = Object.keys(data[0] || {});
  const toggleRow = buildColumnToggleRow(columns);
  if (toggleRow) container.appendChild(toggleRow);
  container.appendChild(buildTable(data, options));
}

function isHidden(id) {
  return hiddenPlayers.has(id);
}

export {
  columnIsNumeric,
  buildTable,
  renderPlayers,
  isHidden,
  resetHidden,
  resetHighlight,
  toggleCompare,
  isCompareSelected,
  getCompareIds,
  clearCompare,
  onCompareChange,
  getVisibleRotoCategories,
  getVisibleGoalieRotoCategories,
  onColumnVisibilityChange,
  MAX_COMPARE,
};
