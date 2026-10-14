import { seasons, seasonDataPlayer, seasonDataGoaler } from "./app.js";
import {
  loadGameLog,
  loadPlayerLanding,
  loadSkaterAdvanced,
  loadMoneyPuckSkaters,
  loadMoneyPuckGoalies,
  loadEdgeGoalieDetail,
} from "./api.js";
import {
  skaterLuckRows,
  goalieLuckRows,
  careerSkaterShot,
  careerSkaterRates,
  careerGoalieSave,
  arrowChar,
} from "./sustainability.js";
import { FIELD_INFO, SECTION_INFO } from "./fields.js";

function formatSeason(yyyyyyyy) {
  const s = String(yyyyyyyy);
  return s.slice(0, 4) + "-" + s.slice(6, 8);
}

function isGoalie(data) {
  return data.position === "G";
}

function buildHeaderSection(data, tier) {
  const header = document.createElement("div");
  header.className = "player-card-header";

  const img = document.createElement("img");
  img.className = "player-card-headshot";
  img.src = data.headshot;
  img.alt = "";
  header.appendChild(img);

  const bio = document.createElement("div");
  bio.className = "player-card-bio";

  const teamLine = document.createElement("div");
  teamLine.className = "player-card-bio-team";
  const teamLogo = document.createElement("img");
  teamLogo.src = data.teamLogo;
  teamLogo.className = "inline-icon";
  teamLine.appendChild(teamLogo);
  teamLine.appendChild(
    document.createTextNode(`#${data.sweaterNumber} · ${data.position}`),
  );

  const nameLine = document.createElement("div");
  nameLine.className = "player-card-bio-name";
  const nameText = document.createElement("span");
  nameText.textContent = `${data.firstName.default} ${data.lastName.default}`;
  nameLine.appendChild(nameText);
  if (tier != null && tier !== "") {
    const badge = document.createElement("span");
    const slug = String(tier).toLowerCase().replace(/\+/g, "plus");
    badge.className = `tier-badge tier-${slug}`;
    badge.textContent = tier;
    badge.title = FIELD_INFO.Tier || "";
    nameLine.appendChild(badge);
  }

  const detail = document.createElement("div");
  detail.className = "player-card-bio-detail";

  const heightFt = Math.floor(data.heightInInches / 12);
  const heightIn = data.heightInInches % 12;
  const lines = [
    `${heightFt}'${heightIn}" · ${data.weightInPounds} lbs · Shoots ${data.shootsCatches}`,
    `Born ${data.birthDate} · ${data.birthCity?.default || ""}${data.birthStateProvince ? ", " + data.birthStateProvince.default : ""}, ${data.birthCountry}`,
  ];
  if (data.draftDetails) {
    const d = data.draftDetails;
    lines.push(
      `Draft: ${d.year} · Round ${d.round} Pick ${d.pickInRound} (${d.teamAbbrev}) · Overall #${d.overallPick}`,
    );
  }
  detail.textContent = lines.join("\n");
  detail.classList.add("text-pre-line");

  bio.appendChild(nameLine);
  bio.appendChild(teamLine);
  bio.appendChild(detail);
  header.appendChild(bio);

  const statsContainer = document.createElement("div");
  statsContainer.textContent = "";
  statsContainer.className = "player-section-container";
  statsContainer.id = "player-stats-grid-container";
  header.appendChild(statsContainer);

  const goalie = isGoalie(data);
  if (data.featuredStats?.regularSeason?.subSeason) {
    const sub = data.featuredStats.regularSeason.subSeason;
    const labels = goalie
      ? [
        ["gamesPlayed", "GP"],
        ["wins", "W"],
        ["losses", "L"],
        ["otLosses", "OTL"],
        ["goalsAgainstAvg", "GAA"],
        ["savePctg", "SV%"],
        ["shutouts", "SO"],
      ]
      : [
        ["gamesPlayed", "GP"],
        ["goals", "G"],
        ["assists", "A"],
        ["points", "P"],
        ["plusMinus", "+/-"],
        ["powerPlayPoints", "PPP"],
      ];
    statsContainer.appendChild(
      buildStatsSection(
        `Current Season (${formatSeason(data.featuredStats.season)})`,
        sub,
        labels,
        SECTION_INFO.currentSeason,
      ),
    );
  }

  if (data.careerTotals?.regularSeason) {
    const career = data.careerTotals.regularSeason;
    const labels = goalie
      ? [
        ["gamesPlayed", "GP"],
        ["wins", "W"],
        ["losses", "L"],
        ["otLosses", "OTL"],
        ["goalsAgainstAvg", "GAA"],
        ["savePctg", "SV%"],
        ["shutouts", "SO"],
      ]
      : [
        ["gamesPlayed", "GP"],
        ["goals", "G"],
        ["assists", "A"],
        ["points", "P"],
        ["plusMinus", "+/-"],
        ["avgToi", "Avg TOI"],
      ];
    statsContainer.appendChild(
      buildStatsSection("Career (NHL Regular Season)", career, labels, SECTION_INFO.career),
    );
  }

  // if (goalie && data.careerTotals?.playoffs) {
  //   const playoffs = data.careerTotals.playoffs;
  //   const labels = [["gamesPlayed", "GP"], ["wins", "W"], ["losses", "L"], ["goalsAgainstAvg", "GAA"], ["savePctg", "SV%"], ["shutouts", "SO"]];
  //   card.appendChild(buildStatsSection("Career (Playoffs)", playoffs, labels));
  // }

  return header;
}

function buildStatsSection(title, stats, labels, sectionTip = "") {
  const section = document.createElement("div");
  section.className = "player-card-section";

  const titleEl = document.createElement("div");
  titleEl.className = "player-card-section-title";
  titleEl.textContent = title;
  titleEl.title = sectionTip;
  section.appendChild(titleEl);

  const grid = document.createElement("div");
  grid.className = "player-card-stats-grid";

  labels.forEach(([key, label]) => {
    if (stats[key] == null) return;
    const stat = document.createElement("div");
    stat.className = "player-card-stat";
    const lbl = document.createElement("div");
    lbl.className = "player-card-stat-label";
    lbl.textContent = label;
    lbl.title = FIELD_INFO[label] || "";
    const val = document.createElement("div");
    val.className = "player-card-stat-value";
    val.textContent =
      typeof stats[key] === "number" && key.includes("Pctg")
        ? (stats[key] * 100).toFixed(1) + "%"
        : stats[key];
    stat.appendChild(lbl);
    stat.appendChild(val);
    grid.appendChild(stat);
  });

  section.appendChild(grid);
  return section;
}

function buildSeasonsStatsSection(playerID, seasons, seasonData, goalie) {
  if (!seasons || seasons.length === 0) return null;
  const section = document.createElement("div");
  section.className = "player-card-section";

  const title = document.createElement("div");
  title.className = "player-card-section-title";
  title.textContent = "Seasons Stats";
  title.title = SECTION_INFO.seasons;
  section.appendChild(title);

  const table = document.createElement("table");
  table.className = "player-card-stats-table";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const headers = goalie
    ? ["Season", "Team", "GP", "W", "SV%", "GAA", "GVI", "Tier"]
    : ["Season", "Team", "GP", "G", "A", "P", "PPP", "+/-", "TOI", "GVI", "Tier"];
  headers.forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    const info = FIELD_INFO[h];
    if (info) th.title = info;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const season of seasons) {
    const tr = document.createElement("tr");
    let cells;
    const player = seasonData[season]?.find((player) => player.ID === playerID);
    if (!player) continue;

    if (goalie) {
      cells = [
        formatSeason(season),
        player.Team,
        player.GP,
        player.W,
        player["SV%"],
        player.GAA,
        player.GVI,
        player.Tier,
      ];
    } else {
      cells = [
        formatSeason(season),
        player.Team,
        player.GP,
        player.G,
        player.A,
        player.P,
        player.PPP,
        player["+/-"],
        player.TOI,
        player.GVI,
        player.Tier,
      ];
    }
    cells.forEach((c) => {
      const td = document.createElement("td");
      td.textContent = c;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  };
  table.appendChild(tbody);
  section.appendChild(table);
  return section;
}

function buildLast5Section(last5, goalie) {
  if (!last5 || last5.length === 0) return null;
  const section = document.createElement("div");
  section.className = "player-card-section";

  const title = document.createElement("div");
  title.className = "player-card-section-title";
  title.textContent = "Last 5 Games";
  title.title = SECTION_INFO.last5;
  section.appendChild(title);

  const table = document.createElement("table");
  table.className = "player-card-stats-table";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const headers = goalie
    ? ["Date", "Opp", "W/L", "SV%", "GAA", "TOI"]
    : ["Date", "Opp", "G", "A", "P", "PPG", "+/-", "TOI"];
  headers.forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    const info = FIELD_INFO[h];
    if (info) th.title = info;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  last5.slice(0, 5).forEach((game) => {
    const tr = document.createElement("tr");
    let cells;
    if (goalie) {
      cells = [
        game.gameDate,
        game.opponentAbbrev,
        game.decision,
        game.savePctg != null ? (game.savePctg * 100).toFixed(1) + "%" : "-",
        game.goalsAgainstAvg?.toFixed(2) || "-",
        game.toi || "-",
      ];
    } else {
      const pts = (game.goals || 0) + (game.assists || 0);
      cells = [
        game.gameDate,
        game.opponentAbbrev,
        game.goals ?? "-",
        game.assists ?? "-",
        pts,
        game.powerPlayGoals,
        game.plusMinus ?? "-",
        game.toi || "-",
      ];
    }
    cells.forEach((c) => {
      const td = document.createElement("td");
      td.textContent = c;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  section.appendChild(table);
  return section;
}

const GAME_KEYS = {
  G: "goals",
  A: "assists",
  P: "points",
  PPP: "powerPlayPoints",
  "+/-": "plusMinus",
};

function rawGameValue(game, stat, goalie) {
  if (goalie) {
    if (stat === "W") return game.decision === "W" ? 1 : 0;
    if (stat === "GAA") return game.goalsAgainst ?? null;
    if (stat === "SV%") return game.savePctg != null ? game.savePctg * 100 : null;
    return null;
  }
  const val = game[GAME_KEYS[stat]];
  return val ?? 0;
}

function cumulativeGameValue(games, stat, goalie) {
  let sum = 0;
  let wins = 0;
  let goalsAgainst = 0;
  let shotsAgainst = 0;
  return games.map((game, i) => {
    if (goalie) {
      if (stat === "W") {
        if (game.decision === "W") wins += 1;
        return wins;
      }
      if (stat === "GAA") {
        goalsAgainst += game.goalsAgainst || 0;
        return goalsAgainst / (i + 1);
      }
      if (stat === "SV%") {
        goalsAgainst += game.goalsAgainst || 0;
        shotsAgainst += game.shotsAgainst || 0;
        return shotsAgainst > 0
          ? ((shotsAgainst - goalsAgainst) / shotsAgainst) * 100
          : null;
      }
      return null;
    }
    sum += game[GAME_KEYS[stat]] || 0;
    return sum;
  });
}

function buildGraphSection(playerID, seasons, seasonData, goalie) {
  if (!seasons || seasons.length === 0) return null;

  const colorMap = {
    GP: "#95a5a6",
    G: "#e74c3c",
    A: "#3498db",
    P: "#2ecc71",
    PPP: "#f39c12",
    "+/-": "#9b59b6",
    GVI: "#1abc9c",
    W: "#2ecc71",
    GAA: "#e74c3c",
    "SV%": "#3498db",
  };

  const playedSeasons = seasons.filter((s) =>
    seasonData[s]?.some((p) => p.ID === playerID),
  );

  const section = document.createElement("div");
  section.className = "player-card-section";

  const header = document.createElement("div");
  header.className = "player-card-section-header";

  const title = document.createElement("div");
  title.className = "player-card-section-title";
  title.textContent = "Stat Progression";
  title.title = SECTION_INFO.progression;
  header.appendChild(title);

  const seasonSelect = document.createElement("select");
  seasonSelect.className = "selector";
  const careerOption = document.createElement("option");
  careerOption.value = "";
  careerOption.textContent = "Career";
  seasonSelect.appendChild(careerOption);
  playedSeasons.forEach((s) => {
    const option = document.createElement("option");
    option.value = s;
    option.textContent = formatSeason(s);
    seasonSelect.appendChild(option);
  });
  const modeBtn = document.createElement("button");
  modeBtn.className = "button";
  modeBtn.type = "button";
  modeBtn.textContent = "Cumulative";
  modeBtn.hidden = true;
  modeBtn.title = "Switch between cumulative totals and per-game values.";
  header.appendChild(modeBtn);
  header.appendChild(seasonSelect);
  section.appendChild(header);

  const container = document.createElement("div");
  container.className = "chart-container";
  section.appendChild(container);

  let chart = null;
  let seasonView = "cumulative";
  let seasonGames = null;

  function replaceChart(data, message) {
    if (chart) {
      chart.destroy();
      chart = null;
    }
    container.textContent = "";
    if (message) {
      const loading = document.createElement("div");
      loading.className = "player-card-loading";
      loading.textContent = message;
      container.appendChild(loading);
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.className = "chart-canvas";
    container.appendChild(canvas);
    requestAnimationFrame(() => {
      chart = new window.Chart(canvas, {
        type: "line",
        data,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom", labels: { boxWidth: 12, padding: 8 } } },
          scales: {
            x: { ticks: { maxRotation: 0 } },
          },
        },
      });
    });
  }

  function renderCareerChart() {
    const reversed = [...seasons].reverse();
    const labels = reversed.map((s) => s.slice(0, 4) + "-" + s.slice(6));

    const stats = goalie
      ? ["GP", "W", "GAA", "SV%", "GVI"]
      : ["GP", "G", "A", "P", "PPP", "+/-", "GVI"];

    const datasets = stats.map((stat) => ({
      label: stat,
      data: reversed.map((s) => {
        const player = seasonData[s]?.find((p) => p.ID === playerID);
        if (!player) return null;
        let val = player[stat];
        if (stat === "SV%" && val != null) val = val * 100;
        return val;
      }),
      borderColor: colorMap[stat] || "#000000",
      tension: 0,
      fill: false,
    }));

    replaceChart({ labels, datasets });
  }

  function seasonDatasets(games, mode) {
    const stats = goalie ? ["W", "GAA", "SV%"] : ["G", "A", "P", "PPP", "+/-"];

    return stats.map((stat) => {
      const color = colorMap[stat] || "#000000";
      const cumulative = mode === "cumulative";
      return cumulative
        ? {
            label: stat,
            data: cumulativeGameValue(games, stat, goalie),
            borderColor: color,
            tension: 0,
            fill: false,
          }
        : {
            label: `${stat} (game)`,
            data: games.map((g) => rawGameValue(g, stat, goalie)),
            borderColor: color,
            borderDash: [4, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0,
            fill: false,
          };
    });
  }

  async function renderSeasonChart(season) {
    if (!seasonGames) {
      const gameLog = await loadGameLog(playerID, season);
      if (!gameLog?.gameLog) {
        replaceChart({ labels: [], datasets: [] }, "Failed to load game log.");
        return;
      }
      seasonGames = [...gameLog.gameLog].reverse();
    }

    const labels = seasonGames.map((_, i) => i + 1);
    const datasets = seasonDatasets(seasonGames, seasonView);
    replaceChart({ labels, datasets });
  }

  renderCareerChart();

  seasonSelect.addEventListener("change", () => {
    if (seasonSelect.value === "") {
      modeBtn.hidden = true;
      renderCareerChart();
    } else {
      modeBtn.hidden = false;
      seasonView = "cumulative";
      modeBtn.textContent = "Cumulative";
      replaceChart({ labels: [], datasets: [] }, "Loading...");
      renderSeasonChart(seasonSelect.value);
    }
  });

  modeBtn.addEventListener("click", () => {
    if (!seasonGames) return;
    seasonView = seasonView === "cumulative" ? "pergame" : "cumulative";
    modeBtn.textContent = seasonView === "cumulative" ? "Cumulative" : "Per game";
    renderSeasonChart(seasonSelect.value);
  });

  return section;
}

function findCardSeason(playerID, goalie) {
  // Most recent season available on the site where the player has a row.
  const data = goalie ? seasonDataGoaler : seasonDataPlayer;
  for (const s of seasons) {
    if (data[s]?.some((p) => p.ID === playerID)) return s;
  }
  return null;
}

function signalCell(row) {
  const td = document.createElement("td");
  const dot = document.createElement("span");
  dot.className = `luck-dot luck-${row.tone}${row.small ? " hollow" : ""}`;
  dot.title = row.small ? "Small sample (<10 GP) — expect swing" : "";
  td.appendChild(dot);
  const arrow = document.createElement("span");
  arrow.textContent = arrowChar(row.dir);
  arrow.className = `luck-arrow luck-${row.tone}`;
  td.appendChild(arrow);
  if (row.small) {
    const ss = document.createElement("span");
    ss.className = "luck-ss";
    ss.textContent = "SS";
    ss.title = "Small sample (<10 GP) — expect swing";
    td.appendChild(ss);
  }
  if (row.note) {
    const note = document.createElement("span");
    note.className = "luck-note";
    note.textContent = row.note;
    td.appendChild(note);
  }
  return td;
}

function renderLuckRows(tbody, rows) {
  tbody.textContent = "";
  for (const row of rows) {
    const tr = document.createElement("tr");
    const label = document.createElement("td");
    label.textContent = row.label;
    const info = FIELD_INFO[row.label];
    if (info) label.title = info;
    const now = document.createElement("td");
    now.textContent = row.now;
    const ref = document.createElement("td");
    ref.textContent = row.ref;
    tr.appendChild(label);
    tr.appendChild(now);
    tr.appendChild(ref);
    tr.appendChild(signalCell(row));
    tbody.appendChild(tr);
  }
}

async function fillAdvancedSection(tbody, playerID, tablePlayer, goalie) {
  const season = findCardSeason(playerID, goalie);
  if (!season || !tablePlayer) {
    tbody.textContent = "";
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4;
    td.textContent = "No season data.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  try {
    if (goalie) {
      const [mpMap, edge] = await Promise.all([
        loadMoneyPuckGoalies(season),
        loadEdgeGoalieDetail(playerID, season),
      ]);
      const career = careerGoalieSave(seasonDataGoaler, seasons, playerID);
      renderLuckRows(
        tbody,
        goalieLuckRows({
          row: tablePlayer,
          mp: mpMap[playerID],
          edge,
          career,
        }),
      );
    } else {
      // Phase 1: current season only — renders immediately.
      const [advMap, mpMap] = await Promise.all([
        loadSkaterAdvanced(season),
        loadMoneyPuckSkaters(season),
      ]);
      const isDefence =
        Array.isArray(tablePlayer.Position) &&
        tablePlayer.Position.includes("D");
      const career = careerSkaterShot(
        seasonDataPlayer,
        seasons,
        playerID,
        isDefence,
      );
      const render = (extra = {}) => {
        Object.assign(career, extra);
        renderLuckRows(
          tbody,
          skaterLuckRows({
            row: tablePlayer,
            adv: advMap.get(playerID) || {},
            mp: mpMap[playerID],
            career,
            isDefence,
          }),
        );
      };
      render();
      // Phase 2: history for seasons the player actually played — upgrades
      // the c-avg benchmarks on IPP/OISH%/PDO. Never blocks the section:
      // failures keep the phase-1 rows.
      const played = seasons.filter(
        (s) =>
          s !== season &&
          seasonDataPlayer[s]?.some((p) => p.ID === playerID),
      );
      if (played.length > 0) {
        try {
          const [advH, mpH] = await Promise.all([
            Promise.all(played.map((s) => loadSkaterAdvanced(s))),
            Promise.all(played.map((s) => loadMoneyPuckSkaters(s))),
          ]);
          render(
            careerSkaterRates(
              [advMap, ...advH],
              [mpMap, ...mpH],
              [season, ...played],
              playerID,
            ),
          );
        } catch (err) {
          console.error("Failed to load career rates:", err);
        }
      }
    }
  } catch (err) {
    console.error("Failed to load advanced stats:", err);
    tbody.textContent = "";
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4;
    td.textContent = "Failed to load advanced stats.";
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
}

function buildAdvancedSection(playerID, tablePlayer, goalie) {
  const section = document.createElement("div");
  section.className = "player-card-section";

  const title = document.createElement("div");
  title.className = "player-card-section-title";
  title.textContent = "Advanced — Luck Check";
  title.title = SECTION_INFO.advanced;
  section.appendChild(title);

  const legend = document.createElement("div");
  legend.className = "luck-legend";
  legend.textContent =
    "● outlook: green holds or bounces back · red fades · ▲▼ vs benchmark · SS = under 10 GP";
  section.appendChild(legend);

  const table = document.createElement("table");
  table.className = "player-card-stats-table";
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const h of ["Metric", "Current", "Benchmark", "Signal"]) {
    const th = document.createElement("th");
    th.textContent = h;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const loadingRow = document.createElement("tr");
  const loadingCell = document.createElement("td");
  loadingCell.colSpan = 4;
  loadingCell.textContent = "Loading…";
  loadingRow.appendChild(loadingCell);
  tbody.appendChild(loadingRow);
  table.appendChild(tbody);
  section.appendChild(table);

  fillAdvancedSection(tbody, playerID, tablePlayer, goalie);
  return section;
}

function buildAwardsSection(awards) {  if (!awards || awards.length === 0) return null;
  const section = document.createElement("div");
  section.className = "player-card-section";

  const title = document.createElement("div");
  title.className = "player-card-section-title";
  title.textContent = "Awards";
  title.title = SECTION_INFO.awards;
  section.appendChild(title);

  const list = document.createElement("ul");
  list.className = "player-card-awards-list";
  awards.forEach((award) => {
    const li = document.createElement("li");
    const seasons = award.seasons
      .map((s) => formatSeason(s.seasonId))
      .join(", ");
    li.textContent = `${award.trophy.default}${seasons ? " (" + seasons + ")" : ""}`;
    list.appendChild(li);
  });
  section.appendChild(list);
  return section;
}

function closeCard(overlay, keyHandler) {
  document.removeEventListener("keydown", keyHandler);
  overlay.remove();
}

export async function populatePlayerCard(card, player, onClose) {
  const loading = document.createElement("div");
  loading.className = "player-card-loading";
  loading.textContent = "Loading...";
  card.appendChild(loading);

  const data = await loadPlayerLanding(player.ID);
  if (!data) {
    loading.textContent = "Failed to load player data.";
    return;
  }

  card.textContent = "";

  const closeBtn = document.createElement("button");
  closeBtn.className = "player-card-close";
  closeBtn.textContent = "\u00d7";
  closeBtn.addEventListener("click", () => onClose());
  card.appendChild(closeBtn);

  card.appendChild(buildHeaderSection(data, player.Tier));

  const playerBody = document.createElement("div");
  playerBody.textContent = "";
  playerBody.className = "player-card-body";
  card.appendChild(playerBody);

  const statsContainer = document.createElement("div");
  statsContainer.textContent = "";
  statsContainer.className = "player-section-container";
  playerBody.appendChild(statsContainer);

  const goalie = isGoalie(data);

  const seasonsSection = buildSeasonsStatsSection(
    data.playerId,
    seasons,
    goalie ? seasonDataGoaler : seasonDataPlayer,
    goalie,
  );
  if (seasonsSection) statsContainer.appendChild(seasonsSection);

  const last5Section = buildLast5Section(data.last5Games, goalie);
  if (last5Section) statsContainer.appendChild(last5Section);

  const awardsSection = buildAwardsSection(data.awards);
  if (awardsSection) statsContainer.appendChild(awardsSection);

  const graphContainer = document.createElement("div");
  graphContainer.textContent = "";
  graphContainer.className = "player-section-container graph-container";
  playerBody.appendChild(graphContainer);

  const graphSection = buildGraphSection(
    data.playerId,
    seasons,
    goalie ? seasonDataGoaler : seasonDataPlayer,
    goalie,
  );
  if (graphSection) graphContainer.appendChild(graphSection);

  const advancedSection = buildAdvancedSection(data.playerId, player, goalie);
  if (advancedSection) graphContainer.appendChild(advancedSection);

  const slug =
    `${data.firstName.default} ${data.lastName.default}`
      .toLowerCase()
      .replace(/\s+/g, "-") +
    "-" +
    data.playerId;
  const nhlLink = document.createElement("a");
  nhlLink.className = "player-card-nhl-link";
  nhlLink.href = `https://www.nhl.com/player/${slug}`;
  nhlLink.target = "_blank";
  nhlLink.title = "Open player's NHL.com page (new tab)";
  nhlLink.textContent = "View on NHL.com \u2192";
  card.appendChild(nhlLink);
}

export async function openPlayerCard(player) {
  const overlay = document.createElement("div");
  overlay.className = "player-card-overlay";

  const card = document.createElement("div");
  card.className = "player-card";

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const keyHandler = (e) => {
    if (e.key === "Escape") closeCard(overlay, keyHandler);
  };
  document.addEventListener("keydown", keyHandler);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeCard(overlay, keyHandler);
  });

  await populatePlayerCard(card, player, () => closeCard(overlay, keyHandler));
}
