import { computeRadarZScores, TIER_RANK } from "./stats.js";
import { LEAGUE_CONFIG } from "./config.js";
import {
  loadMoneyPuckGoalies,
  loadMoneyPuckSkaters,
  loadPlayerLanding,
} from "./api.js";
import { populatePlayerCard } from "./playerCard.js";
import { seasonAdvValues, seasonGoalieValues } from "./sustainability.js";
import {
  getVisibleComparisonRadarStats,
  getVisibleComparisonStats,
} from "./table.js";
import { FIELD_INFO, SECTION_INFO } from "./fields.js";

const PLAYER_COLORS = [
  "#e74c3c",
  "#3498db",
  "#2ecc71",
  "#f39c12",
  "#9b59b6",
];

const SKATER_ADVANCED_STATS = ["ixG", "RXGF%"];
const GOALIE_ADVANCED_STATS = ["GSAx"];
const ADVANCED_STORAGE_KEY = "nhl_compare_advanced_cols";
const DEFAULT_ADVANCED_VISIBILITY = {
  ixG: true,
  "RXGF%": true,
  GSAx: true,
};
const LOWER_BETTER = new Set(["GAA", "GA", "rankGAA", "rankP"]);

function formatSeason(yyyyyyyy) {
  const s = String(yyyyyyyy);
  return s.slice(0, 4) + "-" + s.slice(6, 8);
}

function isGoalieRow(p) {
  return p.Gardiens != null;
}

function nameOf(p) {
  return p.Joueurs || p.Gardiens || "?";
}

function loadAdvancedVisibility() {
  try {
    const stored = JSON.parse(
      localStorage.getItem(ADVANCED_STORAGE_KEY) || "null",
    );
    if (stored && typeof stored === "object" && !Array.isArray(stored)) {
      return { ...DEFAULT_ADVANCED_VISIBILITY, ...stored };
    }
  } catch (err) {
    console.error("Failed to load comparison advanced columns:", err);
  }
  return { ...DEFAULT_ADVANCED_VISIBILITY };
}

function saveAdvancedVisibility(visibility) {
  try {
    localStorage.setItem(ADVANCED_STORAGE_KEY, JSON.stringify(visibility));
  } catch (err) {
    console.error("Failed to save comparison advanced columns:", err);
  }
}

function formatAdvanced(key, value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "–";
  if (key === "ixG") return n.toFixed(1);
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;
}

function enrichPool(pool, mp, goalie) {
  const byId = new Map();
  const enriched = pool.map((player) => {
    const copy = { ...player };
    if (goalie) {
      const { GSAx } = seasonGoalieValues(mp?.[player.ID]);
      if (GSAx != null) copy.GSAx = GSAx;
    } else {
      const { ixG, RXGF } = seasonAdvValues(mp?.[player.ID]);
      if (ixG != null) copy.ixG = ixG;
      if (RXGF != null) copy["RXGF%"] = RXGF;
    }
    byId.set(player.ID, copy);
    return copy;
  });
  return { enriched, byId };
}

function buildTableSection(players, title, tip = "", options = {}) {
  const {
    advancedVisibility = DEFAULT_ADVANCED_VISIBILITY,
    advancedLoading = false,
  } = options;

  const section = document.createElement("div");
  section.className = "compare-section";

  const titleEl = document.createElement("div");
  titleEl.className = "compare-section-title";
  titleEl.textContent = title;
  titleEl.title = tip;
  section.appendChild(titleEl);

  const goalie = isGoalieRow(players[0]);
  const optionalRows = getVisibleComparisonStats(goalie);
  const advancedRows = (
    goalie ? GOALIE_ADVANCED_STATS : SKATER_ADVANCED_STATS
  ).filter((key) => advancedVisibility[key] !== false);

  const rows = goalie
    ? [
        ["Tier"], ["GP"], ["W"],
        ...optionalRows.map((key) => [key]),
        ...advancedRows.map((key) => [key]),
        ["Age"], ["GVI"], ["AGVI"], ["Trend"], ["Stab"],
        ["Z", "RotoVal"], ["Z82", "RotoVal-Pace"], ["Rank", "rankGAA"],
      ]
    : [
        ["Tier"], ["GP"], ["G"], ["A"], ["P"],
        ...optionalRows.map((key) => [key]),
        ...advancedRows.map((key) => [key]),
        ["Age"], ["GVI"], ["RVI"], ["AGVI"], ["Trend"], ["Stab"],
        ["Z", "RotoVal"], ["ZP", "RotoVal-Pos"],
        ["ZPX", "RotoVal-PosExact"], ["Z82", "RotoVal-Pace"], ["Rank", "rankP"],
      ];
  const advancedKeySet = new Set(advancedRows);

  const table = document.createElement("table");
  table.className = "compare-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  const thLabel = document.createElement("th");
  thLabel.textContent = title;
  thLabel.title = tip;
  headRow.appendChild(thLabel);
  players.forEach((p, i) => {
    const th = document.createElement("th");
    th.textContent = nameOf(p);
    th.style.color = PLAYER_COLORS[i % PLAYER_COLORS.length];
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach(([label, key = label]) => {
    const tr = document.createElement("tr");
    const tdLabel = document.createElement("td");
    tdLabel.textContent = label;
    tdLabel.className = "compare-row-label";
    tdLabel.title = FIELD_INFO[key] || FIELD_INFO[label] || "";
    tr.appendChild(tdLabel);

    let bestIdx = null;
    let bestVal = null;
    const isTierRow = key === "Tier";
    const vals = players.map((p) => {
      const raw = p[key];
      if (raw == null || raw === "") return null;
      if (isTierRow) {
        const r = TIER_RANK.get(raw);
        return r == null ? null : r;
      }
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    });

    vals.forEach((v, i) => {
      if (v == null) return;
      if (bestIdx == null) {
        bestIdx = i;
        bestVal = v;
        return;
      }
      const lowerBetter = LOWER_BETTER.has(key) || isTierRow;
      if (lowerBetter ? v < bestVal : v > bestVal) {
        bestIdx = i;
        bestVal = v;
      }
    });

    vals.forEach((raw, i) => {
      const td = document.createElement("td");
      const player = players[i];
      const val = player[key];
      if (val == null || val === "") {
        td.textContent =
          advancedLoading && advancedKeySet.has(key) ? "…" : "–";
      } else if (key === "rankGAA" || key === "rankP") {
        td.textContent = `${val}/${player.poolSize}`;
      } else if (advancedKeySet.has(key)) {
        td.textContent = formatAdvanced(key, val);
      } else {
        td.textContent = val;
      }
      if (i === bestIdx && raw != null) td.classList.add("compare-best");
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  section.appendChild(table);
  return section;
}

function buildChartContainer(players, leaguePool, mode, cats) {
  const goalie = isGoalieRow(players[0]);
  const inverted = cats.map((c) => c === "GAA" || c === "GA");
  const minGP = goalie ? LEAGUE_CONFIG.goalieMinGP : LEAGUE_CONFIG.minGP;
  const zScores = computeRadarZScores(
    players,
    leaguePool,
    mode,
    cats,
    inverted,
    minGP,
  );

  const container = document.createElement("div");
  container.className = "compare-chart-container";
  const canvas = document.createElement("canvas");
  container.appendChild(canvas);

  const datasets = players
    .filter((p) => zScores.has(p))
    .map((p, i) => ({
      label: nameOf(p),
      data: cats.map((c) => zScores.get(p)[c] ?? 0),
      borderColor: PLAYER_COLORS[i % PLAYER_COLORS.length],
      backgroundColor: PLAYER_COLORS[i % PLAYER_COLORS.length] + "33",
      pointRadius: 3,
    }));

  requestAnimationFrame(() => {
    if (!canvas.isConnected) return;
    const chart = new window.Chart(canvas, {
      type: "radar",
      data: { labels: cats, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { boxWidth: 12, padding: 8 } } },
        scales: {
          r: {
            ticks: { display: false },
            suggestedMin: -3,
            suggestedMax: 3,
          },
        },
      },
    });
    container.chart = chart;
  });

  return container;
}

function fillBio(bio, data) {
  bio.textContent = "";
  bio.appendChild(createBioText(data));
}

function createBioText(data) {
  const frag = document.createDocumentFragment();
  const teamLogo = document.createElement("img");
  teamLogo.className = "inline-icon";
  teamLogo.src = data.teamLogo;
  teamLogo.alt = "";
  frag.appendChild(teamLogo);

  const heightFt = Math.floor(data.heightInInches / 12);
  const heightIn = data.heightInInches % 12;
  const parts = [
    `#${data.sweaterNumber}`,
    data.position,
    `${heightFt}'${heightIn}"`,
    `${data.weightInPounds} lbs`,
  ].filter(Boolean);
  frag.appendChild(document.createTextNode(parts.join(" · ")));
  return frag;
}

function buildPlayerList(players, onOpenCard, onRemove) {
  const list = document.createElement("div");
  list.className = "compare-player-list";

  const items = new Map();
  players.forEach((p) => {
    const item = document.createElement("div");
    item.className = "compare-player-item";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "compare-player-remove";
    removeBtn.textContent = "\u00d7";
    removeBtn.title = "Remove from comparison";
    removeBtn.addEventListener("click", () => {
      if (onRemove) onRemove(p);
    });

    const headshot = document.createElement("img");
    headshot.className = "compare-player-headshot";
    headshot.alt = "";
    headshot.hidden = true;

    const info = document.createElement("div");
    info.className = "compare-player-info";

    const name = document.createElement("span");
    name.className = "compare-player-name";
    name.textContent = nameOf(p);
    name.title = "Open player card";
    name.addEventListener("click", () => onOpenCard(p));

    const bio = document.createElement("div");
    bio.className = "compare-player-bio";
    bio.textContent = `${p.Team || ""}${p.Position?.length ? " · " + p.Position.join("/") : ""}`;

    info.appendChild(name);
    info.appendChild(bio);
    item.appendChild(removeBtn);
    item.appendChild(headshot);
    item.appendChild(info);
    list.appendChild(item);
    items.set(p.ID, { headshot, bio });
  });

  Promise.all(
    players.map(async (p) => {
      const data = await loadPlayerLanding(p.ID);
      if (!data) return;
      const el = items.get(p.ID);
      if (!el) return;
      el.headshot.hidden = false;
      el.headshot.src = data.headshot;
      fillBio(el.bio, data);
    }),
  );

  return list;
}

function buildAdvancedControls(goalie, visibility, onChange) {
  const row = document.createElement("div");
  row.className = "compare-advanced-controls";

  const label = document.createElement("span");
  label.className = "compare-advanced-label";
  label.textContent = "Advanced";
  row.appendChild(label);

  const stats = goalie ? GOALIE_ADVANCED_STATS : SKATER_ADVANCED_STATS;
  for (const key of stats) {
    const chip = document.createElement("label");
    chip.className = "toggle-label";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = visibility[key] !== false;
    input.title = FIELD_INFO[key] || "";
    input.dataset.key = key;
    input.addEventListener("change", () => {
      visibility[key] = input.checked;
      onChange();
    });

    const span = document.createElement("span");
    span.textContent = key;

    chip.appendChild(input);
    chip.appendChild(span);
    row.appendChild(chip);
  }

  return row;
}

function buildRadarLoadingSection() {
  const section = document.createElement("div");
  section.className = "compare-section";

  const titleEl = document.createElement("div");
  titleEl.className = "compare-section-title";
  titleEl.textContent = "Z-Score Radar";
  titleEl.title = SECTION_INFO.radar;
  section.appendChild(titleEl);

  const note = document.createElement("div");
  note.className = "compare-radar-loading";
  note.textContent = "Loading advanced stats…";
  section.appendChild(note);

  return section;
}

function buildRadarSection(
  players,
  onOpenCard,
  onRemove,
  leaguePool,
  cats,
  initialMode = "league",
) {
  const section = document.createElement("div");
  section.className = "compare-section";

  const goalie = isGoalieRow(players[0]);

  const header = document.createElement("div");
  header.className = "compare-radar-header";

  const titleEl = document.createElement("div");
  titleEl.className = "compare-section-title";
  titleEl.textContent = "Z-Score Radar";
  titleEl.title = SECTION_INFO.radar;
  header.appendChild(titleEl);

  const modeSelect = document.createElement("select");
  modeSelect.className = "selector";
  modeSelect.title = "Reference pool used to compute the z-scores.";
  const modes = [["selected", "vs compared players"]];
  if (!goalie) {
    modes.push(["group", "vs same group"]);
    modes.push(["position", "vs same position"]);
  }
  modes.push(["league", "vs all players"]);
  for (const [value, label] of modes) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    modeSelect.appendChild(opt);
  }
  const allowedModes = new Set(modes.map(([value]) => value));
  modeSelect.value = allowedModes.has(initialMode) ? initialMode : "league";

  header.appendChild(modeSelect);
  section.appendChild(header);

  const row = document.createElement("div");
  row.className = "compare-radar-row";
  row.appendChild(
    buildChartContainer(players, leaguePool, modeSelect.value, cats),
  );
  row.appendChild(buildPlayerList(players, onOpenCard, onRemove));
  section.appendChild(row);

  modeSelect.addEventListener("change", () => {
    const oldContainer = row.querySelector(".compare-chart-container");
    if (!oldContainer) return;
    if (oldContainer.chart) oldContainer.chart.destroy();
    oldContainer.replaceWith(
      buildChartContainer(players, leaguePool, modeSelect.value, cats),
    );
  });

  return section;
}

export function openCompareModal(
  players,
  season,
  onRemovePlayer,
  leaguePool = players,
  skaterCats = LEAGUE_CONFIG.skaterCategories,
  goalieCats = LEAGUE_CONFIG.goalieCategories,
) {
  const overlay = document.createElement("div");
  overlay.className = "player-card-overlay";

  const goalie = isGoalieRow(players[0]);
  const advancedVisibility = loadAdvancedVisibility();
  let remaining = players.slice();
  let activePanel = null;
  let radarMode = "league";
  let enrichedPool = leaguePool;
  let enrichedById = new Map();
  let advancedLoaded = false;
  let loadStarted = false;
  let closed = false;

  const viewPlayers = () =>
    remaining.map((p) => enrichedById.get(p.ID) || p);

  const enabledAdvanced = () =>
    (goalie ? GOALIE_ADVANCED_STATS : SKATER_ADVANCED_STATS).filter(
      (key) => advancedVisibility[key] !== false,
    );

  const radarAdvanced = () => {
    if (!advancedLoaded) return [];
    const current = viewPlayers();
    return enabledAdvanced().filter((key) =>
      current.some((p) => Number.isFinite(Number(p[key]))),
    );
  };

  const radarCats = () => {
    const cats = [];
    const add = (keys) => {
      for (const key of keys) {
        if (!cats.includes(key)) cats.push(key);
      }
    };
    add(goalie ? goalieCats : skaterCats);
    add(getVisibleComparisonRadarStats(goalie));
    add(radarAdvanced());
    return cats;
  };

  const tableTitle = () =>
    `${season ? formatSeason(season) + " " : ""}Stats`;

  const orderedPlayers = () =>
    viewPlayers()
      .slice()
      .sort((a, b) => {
        const ka = goalie ? a.rankGAA : a.rankP;
        const kb = goalie ? b.rankGAA : b.rankP;
        return (ka ?? Infinity) - (kb ?? Infinity);
      });

  const renderSections = () => {
    const body = overlay.querySelector(".compare-body");
    if (!body) return;

    const scrollTop = body.scrollTop;
    const modeSelect = body.querySelector(".compare-radar-header select");
    if (modeSelect) radarMode = modeSelect.value;

    const oldChart = body.querySelector(".compare-chart-container");
    if (oldChart?.chart) oldChart.chart.destroy();

    body.textContent = "";
    const ordered = orderedPlayers();
    body.appendChild(
      buildTableSection(ordered, tableTitle(), SECTION_INFO.stats, {
        advancedVisibility,
        advancedLoading: !advancedLoaded,
      }),
    );

    if (advancedLoaded) {
      body.appendChild(
        buildRadarSection(
          ordered,
          openPlayerPanel,
          removePlayer,
          enrichedPool,
          radarCats(),
          radarMode,
        ),
      );
    } else {
      body.appendChild(buildRadarLoadingSection());
    }

    body.scrollTop = scrollTop;
  };

  const closePlayerPanel = () => {
    if (activePanel) {
      activePanel.remove();
      activePanel = null;
      overlay.classList.remove("compare-with-panel");
    }
  };

  const closeModal = () => {
    if (closed) return;
    closed = true;
    closePlayerPanel();
    const chart = overlay.querySelector(".compare-chart-container");
    if (chart?.chart) chart.chart.destroy();
    document.removeEventListener("keydown", keyHandler);
    overlay.remove();
  };

  const keyHandler = (e) => {
    if (e.key !== "Escape") return;
    if (activePanel) {
      closePlayerPanel();
    } else {
      closeModal();
    }
  };

  const openPlayerPanel = (player) => {
    closePlayerPanel();
    const panel = document.createElement("div");
    panel.className = "player-card-panel";
    overlay.appendChild(panel);
    overlay.classList.add("compare-with-panel");
    activePanel = panel;
    populatePlayerCard(panel, player, closePlayerPanel);
  };

  const removePlayer = (player) => {
    if (onRemovePlayer) onRemovePlayer(player.ID);
    remaining = remaining.filter((p) => p.ID !== player.ID);
    if (remaining.length < 2) {
      closeModal();
      return;
    }
    closePlayerPanel();
    renderSections();
  };

  function renderCard() {
    overlay.innerHTML = "";

    const card = document.createElement("div");
    card.className = "compare-card";

    const closeBtn = document.createElement("button");
    closeBtn.className = "player-card-close";
    closeBtn.textContent = "\u00d7";
    closeBtn.addEventListener("click", closeModal);
    card.appendChild(closeBtn);

    const title = document.createElement("div");
    title.className = "compare-title";
    title.textContent = "Player Comparison";
    title.title = SECTION_INFO.comparison;
    card.appendChild(title);

    card.appendChild(
      buildAdvancedControls(goalie, advancedVisibility, () => {
        saveAdvancedVisibility(advancedVisibility);
        renderSections();
      }),
    );

    const body = document.createElement("div");
    body.className = "compare-body";
    card.appendChild(body);

    overlay.appendChild(card);
    renderSections();
  }

  async function loadAdvanced() {
    if (loadStarted) return;
    loadStarted = true;
    if (!season) {
      advancedLoaded = true;
      renderSections();
      return;
    }

    try {
      const mp = goalie
        ? await loadMoneyPuckGoalies(season)
        : await loadMoneyPuckSkaters(season);
      if (closed || !overlay.isConnected) return;
      const { enriched, byId } = enrichPool(leaguePool, mp, goalie);
      enrichedPool = enriched;
      enrichedById = byId;
      advancedLoaded = true;
      renderSections();
    } catch (err) {
      console.error("Failed to load comparison advanced stats:", err);
      if (closed || !overlay.isConnected) return;
      advancedLoaded = true;
      renderSections();
    }
  }

  document.addEventListener("keydown", keyHandler);
  renderCard();
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  loadAdvanced();
}
