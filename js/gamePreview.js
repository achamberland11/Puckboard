import {
  loadGameLanding,
  loadTeamSummary,
  loadTeamPowerPlay,
  loadTeamPenaltyKill,
  loadStandings,
  loadClubSchedule,
  loadGameLog,
  loadPlayerLanding,
  loadMoneyPuckSkaters,
  loadMoneyPuckGoalies,
  loadDepthCharts,
} from "./api.js";
import { openPlayerCard } from "./playerCard.js";
import {
  setPlayerCardContext,
  setPlayerCardContextLoader,
} from "./playerCardContext.js";
import {
  loadSeasonStoreContext,
  seasons,
  seasonDataPlayer,
  seasonDataGoaler,
} from "./seasonStore.js";
import { tierBadgeEl } from "./tierBadge.js";
import { seasonAdvCells, seasonGoalieCells } from "./sustainability.js";

const root = document.getElementById("gameRoot");
const gameId = new URLSearchParams(window.location.search).get("id");
let gameSeason = null;

const FINAL_STATES = new Set(["OFF", "FINAL"]);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatSeason(season) {
  const s = String(season || "");
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(6, 8)}` : s;
}

function num(value, digits = 2) {
  return value == null ? "—" : Number(value).toFixed(digits);
}

function formatESTDate(dateStr, startTimeUTC) {
  const iso = startTimeUTC || (dateStr ? `${dateStr}T12:00:00Z` : null);
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatESTTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
}

function stateLabel(gameState) {
  switch (gameState) {
    case "FUT":
      return "Upcoming";
    case "PRE":
      return "Pre-game";
    case "LIVE":
    case "CRIT":
      return "Live";
    case "OFF":
    case "FINAL":
      return "Final";
    default:
      return gameState || "";
  }
}

function teamName(team) {
  const place = team.placeName?.default || "";
  const common = team.commonName?.default || "";
  return `${place} ${common}`.trim() || team.abbrev;
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function projectedGoalieFromDepth(depthCharts, team, goalieList) {
  if (!depthCharts?.teams) return null;
  const teamDepth = depthCharts.teams.find((t) => t.abbreviation === team.abbrev);
  const starterName = teamDepth?.goalies?.starter?.name;
  if (!starterName) return null;
  const starterLast = normalizeName(starterName).split(/\s+/).pop();
  return (
    (goalieList || []).find((g) => {
      const name = normalizeName(g?.name?.default || g?.name || "");
      return name.split(/\s+/).pop() === starterLast;
    }) || null
  );
}

function section(title, note) {
  const wrap = el("section", "section");
  const head = el("h2", "section-title");
  head.appendChild(document.createTextNode(title));
  if (note) head.appendChild(el("span", "muted", note));
  wrap.appendChild(head);
  return wrap;
}

function dataTable(headers, rows, className = "") {
  const table = el("table", `mini-table ${className}`.trim());
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const h of headers) headRow.appendChild(el("th", null, h));
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const cell of row) {
      if (cell instanceof Node) tr.appendChild(cell);
      else tr.appendChild(el("td", null, cell == null ? "—" : String(cell)));
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

// --- Header ---------------------------------------------------------------

function renderHeader(landing, awayRecord, homeRecord) {
  const card = el("section", "game-header card");
  const away = landing.awayTeam;
  const home = landing.homeTeam;

  const state = el("div", "game-header-state");
  const label = stateLabel(landing.gameState);
  if (landing.gameState === "LIVE" || landing.gameState === "CRIT") {
    state.appendChild(el("span", "badge live", label));
  } else {
    state.appendChild(el("span", "badge", label));
  }
  const timeText =
    landing.gameState === "FUT" || landing.gameState === "PRE"
      ? ` · ${formatESTTime(landing.startTimeUTC)} ET`
      : "";
  state.appendChild(
    document.createTextNode(
      `${timeText} · ${formatESTDate(landing.gameDate, landing.startTimeUTC)}`,
    ),
  );
  card.appendChild(state);

  const teams = el("div", "game-header-teams");
  const buildSide = (team, record, suffix) => {
    const side = el("div", `game-header-team ${suffix}`);
    const logo = document.createElement("img");
    logo.className = "game-header-logo";
    logo.src = team.logo;
    logo.alt = team.abbrev;
    side.appendChild(logo);
    const info = el("div", "game-header-info");
    info.appendChild(el("div", "game-header-name", teamName(team)));
    if (record) info.appendChild(el("div", "game-header-record", record));
    if (team.score != null) {
      info.appendChild(el("div", "game-header-score", String(team.score)));
    }
    side.appendChild(info);
    return side;
  };
  teams.appendChild(buildSide(away, awayRecord, "away"));
  teams.appendChild(el("div", "game-header-at", "@"));
  teams.appendChild(buildSide(home, homeRecord, "home"));
  card.appendChild(teams);

  const sub = el("div", "game-header-sub");
  const venue = landing.venue?.default;
  const parts = [];
  if (venue) parts.push(venue);
  if (landing.venueLocation?.default) parts.push(landing.venueLocation.default);
  const networks = [
    ...new Set((landing.tvBroadcasts || []).map((t) => t.network).filter(Boolean)),
  ];
  if (networks.length) parts.push(networks.join(", "));
  sub.textContent = parts.join(" · ");
  card.appendChild(sub);

  return card;
}

// --- Team comparison ------------------------------------------------------

function mean(values) {
  const nums = values.filter((value) => Number.isFinite(value));
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function buildRankMap(rows, keyFn, valueFn, direction = "high") {
  const items = (rows || [])
    .map((row) => ({ key: keyFn(row), value: Number(valueFn(row)) }))
    .filter((item) => item.key != null && Number.isFinite(item.value));
  items.sort((a, b) =>
    direction === "high" ? b.value - a.value : a.value - b.value,
  );

  const ranks = new Map();
  let previousValue = null;
  let previousRank = 0;
  items.forEach((item, index) => {
    const rank =
      previousValue !== null && item.value === previousValue
        ? previousRank
        : index + 1;
    ranks.set(item.key, rank);
    previousValue = item.value;
    previousRank = rank;
  });
  return ranks;
}

function splitRecord(stats, prefix) {
  if (!stats) return null;
  const wins = stats[`${prefix}Wins`];
  const losses = stats[`${prefix}Losses`];
  const otLosses = stats[`${prefix}OtLosses`];
  if (wins == null) return null;
  const games = stats[`${prefix}GamesPlayed`] ?? wins + losses + otLosses;
  const points = stats[`${prefix}Points`] ?? wins * 2 + otLosses;
  return {
    text: `${wins}-${losses}-${otLosses}`,
    pct: games > 0 ? points / (games * 2) : null,
  };
}

function buildComparisonContext({
  teamSummary,
  standings,
  powerplay,
  penaltykill,
  season,
}) {
  const standingsSeason = (standings || []).filter(
    (row) => String(row.seasonId) === String(season),
  );

  return {
    powerPlayById: new Map((powerplay || []).map((row) => [row.teamId, row])),
    penaltyKillById: new Map(
      (penaltykill || []).map((row) => [row.teamId, row]),
    ),
    standingsByAbbrev: new Map(
      standingsSeason.map((row) => [row.teamAbbrev?.default, row]),
    ),
    ppTimeAverage: mean(
      (powerplay || []).map((row) => Number(row.ppTimeOnIcePerGame)),
    ),
    pkTimeAverage: mean(
      (penaltykill || []).map((row) => Number(row.pkTimeOnIcePerGame)),
    ),
    ranks: {
      record: buildRankMap(teamSummary, (t) => t.teamId, (t) => t.pointPct),
      points: buildRankMap(teamSummary, (t) => t.teamId, (t) => t.points),
      pointPct: buildRankMap(teamSummary, (t) => t.teamId, (t) => t.pointPct),
      goalsForPerGame: buildRankMap(
        teamSummary,
        (t) => t.teamId,
        (t) => t.goalsForPerGame,
      ),
      goalsAgainstPerGame: buildRankMap(
        teamSummary,
        (t) => t.teamId,
        (t) => t.goalsAgainstPerGame,
        "low",
      ),
      shotsForPerGame: buildRankMap(
        teamSummary,
        (t) => t.teamId,
        (t) => t.shotsForPerGame,
      ),
      shotsAgainstPerGame: buildRankMap(
        teamSummary,
        (t) => t.teamId,
        (t) => t.shotsAgainstPerGame,
        "low",
      ),
      powerPlayPct: buildRankMap(
        teamSummary,
        (t) => t.teamId,
        (t) => t.powerPlayPct,
      ),
      penaltyKillPct: buildRankMap(
        teamSummary,
        (t) => t.teamId,
        (t) => t.penaltyKillPct,
      ),
      faceoffWinPct: buildRankMap(
        teamSummary,
        (t) => t.teamId,
        (t) => t.faceoffWinPct,
      ),
      teamShutouts: buildRankMap(
        teamSummary,
        (t) => t.teamId,
        (t) => t.teamShutouts,
      ),
      ppTime: buildRankMap(
        powerplay,
        (t) => t.teamId,
        (t) => t.ppTimeOnIcePerGame,
      ),
      pkTime: buildRankMap(
        penaltykill,
        (t) => t.teamId,
        (t) => t.pkTimeOnIcePerGame,
        "low",
      ),
      homeRecord: buildRankMap(
        standingsSeason,
        (s) => s.teamAbbrev?.default,
        (s) => splitRecord(s, "home")?.pct,
      ),
      roadRecord: buildRankMap(
        standingsSeason,
        (s) => s.teamAbbrev?.default,
        (s) => splitRecord(s, "road")?.pct,
      ),
    },
  };
}

function withComparisonExtras(summary, abbrev, context) {
  const powerPlay = context.powerPlayById.get(summary.teamId);
  const penaltyKill = context.penaltyKillById.get(summary.teamId);
  const standings = context.standingsByAbbrev.get(abbrev);

  const ppTime = Number(powerPlay?.ppTimeOnIcePerGame);
  const pkTime = Number(penaltyKill?.pkTimeOnIcePerGame);

  const ranks = {};
  for (const [key, map] of Object.entries(context.ranks)) {
    const rankKey =
      key === "homeRecord" || key === "roadRecord" ? abbrev : summary.teamId;
    ranks[key] = map.get(rankKey);
  }

  return {
    ...summary,
    homeRecord: splitRecord(standings, "home"),
    roadRecord: splitRecord(standings, "road"),
    ppTime: Number.isFinite(ppTime) ? ppTime : null,
    pkTime: Number.isFinite(pkTime) ? pkTime : null,
    ppTimeAverage: context.ppTimeAverage,
    pkTimeAverage: context.pkTimeAverage,
    ranks,
  };
}

const COMPARE_ROWS = [
  {
    label: "Record",
    raw: (s) => s.pointPct,
    text: (s) => `${s.wins}-${s.losses}-${s.otLosses}`,
    better: "high",
    rankKey: "record",
  },
  {
    label: "Home record",
    raw: (s) => s.homeRecord?.pct ?? null,
    text: (s) => s.homeRecord?.text ?? "—",
    better: "high",
    rankKey: "homeRecord",
    available: (away, home) => !!away.homeRecord && !!home.homeRecord,
  },
  {
    label: "Away record",
    raw: (s) => s.roadRecord?.pct ?? null,
    text: (s) => s.roadRecord?.text ?? "—",
    better: "high",
    rankKey: "roadRecord",
    available: (away, home) => !!away.roadRecord && !!home.roadRecord,
  },
  {
    label: "Points",
    raw: (s) => s.points,
    fmt: (v) => v,
    better: "high",
    rankKey: "points",
  },
  {
    label: "Points %",
    raw: (s) => s.pointPct,
    fmt: (v) => v.toFixed(3).replace(/^0/, ""),
    better: "high",
    rankKey: "pointPct",
  },
  {
    label: "Goals for / game",
    raw: (s) => s.goalsForPerGame,
    fmt: (v) => num(v),
    better: "high",
    rankKey: "goalsForPerGame",
  },
  {
    label: "Goals against / game",
    raw: (s) => s.goalsAgainstPerGame,
    fmt: (v) => num(v),
    better: "low",
    rankKey: "goalsAgainstPerGame",
  },
  {
    label: "Shots for / game",
    raw: (s) => s.shotsForPerGame,
    fmt: (v) => num(v, 1),
    better: "high",
    rankKey: "shotsForPerGame",
  },
  {
    label: "Shots allowed / game",
    raw: (s) => s.shotsAgainstPerGame,
    fmt: (v) => num(v, 1),
    better: "low",
    rankKey: "shotsAgainstPerGame",
  },
  {
    label: "Power play",
    raw: (s) => s.powerPlayPct,
    fmt: (v) => pct(v),
    better: "high",
    rankKey: "powerPlayPct",
  },
  {
    label: "PP TOI / game",
    raw: (s) => s.ppTime,
    fmt: (v) => fmtToi(v),
    better: "high",
    rankKey: "ppTime",
    note: (s) => s.ppTimeAverage,
    available: (away, home) => away.ppTime != null && home.ppTime != null,
  },
  {
    label: "Penalty kill",
    raw: (s) => s.penaltyKillPct,
    fmt: (v) => pct(v),
    better: "high",
    rankKey: "penaltyKillPct",
  },
  {
    label: "PK TOI / game",
    raw: (s) => s.pkTime,
    fmt: (v) => fmtToi(v),
    better: "low",
    rankKey: "pkTime",
    note: (s) => s.pkTimeAverage,
    available: (away, home) => away.pkTime != null && home.pkTime != null,
  },
  {
    label: "Faceoff %",
    raw: (s) => s.faceoffWinPct,
    fmt: (v) => pct(v),
    better: "high",
    rankKey: "faceoffWinPct",
  },
  {
    label: "Shutouts",
    raw: (s) => s.teamShutouts,
    fmt: (v) => v,
    better: "high",
    rankKey: "teamShutouts",
  },
];

function compareTable(away, home, awayAbbrev, homeAbbrev) {
  const table = el("table", "mini-table compare-table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.appendChild(el("th", "compare-away", awayAbbrev));
  headRow.appendChild(el("th", "compare-metric", ""));
  headRow.appendChild(el("th", "compare-home", homeAbbrev));
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const def of COMPARE_ROWS) {
    if (def.available && !def.available(away, home)) continue;

    const tr = document.createElement("tr");
    const awayVal = def.raw ? def.raw(away) : null;
    const homeVal = def.raw ? def.raw(home) : null;
    const awayText = def.text ? def.text(away) : def.fmt(awayVal);
    const homeText = def.text ? def.text(home) : def.fmt(homeVal);
    const awayRank = def.rankKey ? away.ranks?.[def.rankKey] : null;
    const homeRank = def.rankKey ? home.ranks?.[def.rankKey] : null;

    let edge = null;
    if (def.better && awayVal != null && homeVal != null && awayVal !== homeVal) {
      const awayBetter = def.better === "high" ? awayVal > homeVal : awayVal < homeVal;
      edge = awayBetter ? "away" : "home";
    }

    const awayTd = el("td", `compare-away${edge === "away" ? " edge" : ""}`, String(awayText));
    const homeTd = el("td", `compare-home${edge === "home" ? " edge" : ""}`, String(homeText));
    if (awayRank != null) {
      awayTd.appendChild(el("span", "team-tag", ` #${awayRank}`));
    }
    if (homeRank != null) {
      homeTd.appendChild(el("span", "team-tag", ` #${homeRank}`));
    }
    tr.appendChild(awayTd);

    const metricTd = el("td", "compare-metric", def.label);
    const note = def.note ? def.note(away) : null;
    if (Number.isFinite(note)) {
      metricTd.appendChild(
        el("span", "team-tag", ` · Lg avg ${fmtToi(note)}`),
      );
    }
    tr.appendChild(metricTd);
    tr.appendChild(homeTd);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

// --- Matchup edges --------------------------------------------------------

function buildEdges(away, home, awayAbbrev, homeAbbrev, awayGoalie, homeGoalie) {
  const edges = [];

  const awayPpVsPk = away.powerPlayPct - (1 - home.penaltyKillPct);
  const homePpVsPk = home.powerPlayPct - (1 - away.penaltyKillPct);

  edges.push({
    label: "Power play vs penalty kill",
    away: `${awayAbbrev} ${pct(away.powerPlayPct)} vs ${homeAbbrev} PK ${pct(home.penaltyKillPct)}`,
    home: `${homeAbbrev} ${pct(home.powerPlayPct)} vs ${awayAbbrev} PK ${pct(away.penaltyKillPct)}`,
    edge:
      Math.abs(awayPpVsPk - homePpVsPk) < 0.005
        ? null
        : awayPpVsPk > homePpVsPk
          ? "away"
          : "home",
  });

  const shotDiff = away.shotsForPerGame - home.shotsAgainstPerGame;
  const shotDiffHome = home.shotsForPerGame - away.shotsAgainstPerGame;
  edges.push({
    label: "Shot volume matchup",
    away: `${num(away.shotsForPerGame, 1)} SF vs ${num(home.shotsAgainstPerGame, 1)} SA`,
    home: `${num(home.shotsForPerGame, 1)} SF vs ${num(away.shotsAgainstPerGame, 1)} SA`,
    edge:
      Math.abs(shotDiff - shotDiffHome) < 0.1
        ? null
        : shotDiff > shotDiffHome
          ? "away"
          : "home",
  });

  const goalDiff = away.goalsForPerGame - home.goalsAgainstPerGame;
  const goalDiffHome = home.goalsForPerGame - away.goalsAgainstPerGame;
  edges.push({
    label: "Goals for vs goals against",
    away: `${num(away.goalsForPerGame)} GF vs ${num(home.goalsAgainstPerGame)} GA`,
    home: `${num(home.goalsForPerGame)} GF vs ${num(away.goalsAgainstPerGame)} GA`,
    edge:
      Math.abs(goalDiff - goalDiffHome) < 0.05
        ? null
        : goalDiff > goalDiffHome
          ? "away"
          : "home",
  });

  if (awayGoalie && homeGoalie && awayGoalie.savePctg != null && homeGoalie.savePctg != null) {
    edges.push({
      label: "Projected goalies (SV%)",
      away: `${awayGoalie.name.default} ${pct(awayGoalie.savePctg)}`,
      home: `${homeGoalie.name.default} ${pct(homeGoalie.savePctg)}`,
      edge:
        Math.abs(awayGoalie.savePctg - homeGoalie.savePctg) < 0.002
          ? null
          : awayGoalie.savePctg > homeGoalie.savePctg
            ? "away"
            : "home",
    });
  }

  edges.push({
    label: "Faceoffs",
    away: `${awayAbbrev} ${pct(away.faceoffWinPct)}`,
    home: `${homeAbbrev} ${pct(home.faceoffWinPct)}`,
    edge:
      Math.abs(away.faceoffWinPct - home.faceoffWinPct) < 0.005
        ? null
        : away.faceoffWinPct > home.faceoffWinPct
          ? "away"
          : "home",
  });

  return edges;
}

function renderEdges(edges, awayAbbrev, homeAbbrev) {
  const wrap = section("Matchup edges", "who has the advantage today");
  const card = el("div", "card edges-card");
  for (const edge of edges) {
    const row = el("div", "edge-row");
    const away = el(
      "div",
      `edge-side away${edge.edge === "away" ? " advantage" : ""}`,
      edge.away,
    );
    const label = el("div", "edge-label", edge.label);
    const home = el(
      "div",
      `edge-side home${edge.edge === "home" ? " advantage" : ""}`,
      edge.home,
    );
    row.appendChild(away);
    row.appendChild(label);
    row.appendChild(home);
    card.appendChild(row);
  }
  wrap.appendChild(card);
  return wrap;
}

// --- Goalies --------------------------------------------------------------

function goalieCard(goalie, team, tag, gameDate) {
  const card = el("div", "card goalie-card");
  card.appendChild(el("div", "goalie-tag", tag));

  const top = el("div", "goalie-top");
  if (goalie?.headshot) {
    const img = document.createElement("img");
    img.className = "goalie-headshot";
    img.src = goalie.headshot;
    img.alt = "";
    top.appendChild(img);
  }
  const info = el("div", "goalie-info");
  const nameEl = el("div", "goalie-name");
  if (goalie) {
    nameEl.appendChild(
      playerLink(goalie.name.default, goalie.playerId, { kind: "goalie" }),
    );
    addTierSlot(nameEl, goalie.playerId, "goalie");
  } else {
    nameEl.textContent = "TBD";
  }
  info.appendChild(nameEl);
  info.appendChild(el("div", "goalie-team", teamName(team)));
  top.appendChild(info);
  card.appendChild(top);

  if (goalie) {
    const stats = el("div", "goalie-stats");
    for (const [label, value] of [
      ["Record", goalie.record || "—"],
      ["GAA", num(goalie.gaa)],
      ["SV%", pct(goalie.savePctg)],
      ["SO", goalie.shutouts],
    ]) {
      const stat = el("div", "goalie-stat");
      stat.appendChild(el("span", "goalie-stat-value", String(value)));
      stat.appendChild(el("span", "goalie-stat-label", label));
      stats.appendChild(stat);
    }
    card.appendChild(stats);
  }

  const date = gameDate || new Date().toISOString().slice(0, 10);
  const link = el("a", "goalie-link", "Confirm starter on Daily Faceoff →");
  link.href = `https://www.dailyfaceoff.com/starting-goalies/${date}`;
  link.target = "_blank";
  link.rel = "noopener";
  card.appendChild(link);
  return card;
}

// --- H2H ------------------------------------------------------------------

function renderH2H(games, awayAbbrev, homeAbbrev) {
  const wrap = section("Head-to-head", `season series ${awayAbbrev} vs ${homeAbbrev}`);

  const meetings = (games || []).filter(
    (g) =>
      g.gameType === 2 &&
      FINAL_STATES.has(g.gameState) &&
      ((g.awayTeam.abbrev === awayAbbrev && g.homeTeam.abbrev === homeAbbrev) ||
        (g.awayTeam.abbrev === homeAbbrev && g.homeTeam.abbrev === awayAbbrev)),
  );

  if (!meetings.length) {
    wrap.appendChild(
      el("div", "card empty-state", "No meetings played yet this season."),
    );
    return wrap;
  }

  let awayWins = 0;
  let homeWins = 0;
  const rows = [];
  for (const g of meetings) {
    const awayIsAway = g.awayTeam.abbrev === awayAbbrev;
    const aScore = awayIsAway ? g.awayTeam.score : g.homeTeam.score;
    const hScore = awayIsAway ? g.homeTeam.score : g.awayTeam.score;
    if (aScore > hScore) awayWins++;
    else if (hScore > aScore) homeWins++;
    const home = g.homeTeam.abbrev;
    const away = g.awayTeam.abbrev;
    rows.push([
      g.gameDate,
      `${away} ${g.awayTeam.score} @ ${home} ${g.homeTeam.score}`,
    ]);
  }

  const card = el("div", "card h2h-card");
  card.appendChild(
    el(
      "div",
      "h2h-record",
      `${awayAbbrev} ${awayWins} — ${homeWins} ${homeAbbrev}`,
    ),
  );
  card.appendChild(dataTable(["Date", "Result"], rows, "h2h-table"));
  wrap.appendChild(card);
  return wrap;
}

// --- Players --------------------------------------------------------------

// Store rows resolve after the league dataset loads; tier badges and advanced
// cells register fill-ins so the preview paints immediately.
const tierSlots = [];
const storeUpdaters = [];
const skaterMpUpdaters = [];
const goalieMpUpdaters = [];

function storeRow(id, kind = "skater") {
  if (id == null) return null;
  const data = kind === "goalie" ? seasonDataGoaler : seasonDataPlayer;
  return (data[gameSeason] || []).find((p) => p.ID === id) || null;
}

function openCard(id, opts = {}) {
  const kind = opts.kind || "skater";
  const row = storeRow(id, kind);
  const position = row?.Position || (opts.position ? [opts.position] : []);
  openPlayerCard(
    { ID: id, Position: position, Tier: row?.Tier ?? opts.tier },
    undefined,
  );
}

function playerLink(label, id, opts = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "player-link";
  btn.textContent = label;
  btn.title = `Open ${label}'s player card`;
  btn.addEventListener("click", () => openCard(id, opts));
  return btn;
}

function addTierSlot(container, id, kind = "skater") {
  if (id == null || !container) return;
  const badge = tierBadgeEl(storeRow(id, kind)?.Tier, true);
  if (badge) {
    container.appendChild(badge);
    return;
  }
  const slot = el("span", "tier-slot");
  slot.hidden = true;
  container.appendChild(slot);
  tierSlots.push({ slot, id, kind });
}

function refreshTierSlots() {
  for (let i = tierSlots.length - 1; i >= 0; i--) {
    const entry = tierSlots[i];
    const badge = tierBadgeEl(storeRow(entry.id, entry.kind)?.Tier, true);
    if (!badge) continue;
    entry.slot.replaceWith(badge);
    tierSlots.splice(i, 1);
  }
}

function playerCell(row, kind = "skater") {
  const td = document.createElement("td");
  const wrap = el("div", "player-cell");
  if (row.headshot) {
    const img = document.createElement("img");
    img.src = row.headshot;
    img.alt = "";
    img.loading = "lazy";
    wrap.appendChild(img);
  }
  const id = row.playerId ?? row.ID;
  const name =
    row.name?.default ||
    row.skaterFullName ||
    row.Joueurs ||
    row.Gardiens ||
    "";
  const holder = el("span", "player-name-wrap");
  if (id != null) {
    holder.appendChild(playerLink(name, id, { kind, position: row.position }));
  } else {
    holder.appendChild(el("span", null, name));
  }
  addTierSlot(holder, id, kind);
  wrap.appendChild(holder);
  td.appendChild(wrap);
  return td;
}

function fmtShPct(goals, shots) {
  const s = Number(shots) || 0;
  const g = Number(goals) || 0;
  return s > 0 ? `${((g / s) * 100).toFixed(1)}%` : "—";
}

function renderHotPlayers(matchup, awayAbbrev, homeAbbrev) {
  const leaders = matchup?.skaterComparison?.leaders;
  if (!leaders?.length) return null;

  const wrap = section("Hot players", "leaders over the last 5 games");
  const card = el("div", "card");

  const hotCell = (leader) => {
    const td = el("td", "hot-cell");
    if (!leader) {
      td.textContent = "—";
      return td;
    }
    const holder = el("span", "player-name-wrap");
    holder.appendChild(
      playerLink(leader.name.default, leader.playerId, {
        position: leader.positionCode,
      }),
    );
    addTierSlot(holder, leader.playerId);
    td.appendChild(holder);
    td.appendChild(el("span", "hot-value", ` (${leader.value})`));
    return td;
  };

  const rows = leaders.map((cat) => [
    cat.category,
    hotCell(cat.awayLeader),
    hotCell(cat.homeLeader),
  ]);
  card.appendChild(
    dataTable(["Category", awayAbbrev, homeAbbrev], rows, "hot-table"),
  );
  wrap.appendChild(card);
  return wrap;
}

function renderTopPlayers(matchup, away, home) {
  const skaters = matchup?.skaterSeasonStats?.skaters;
  if (!skaters?.length) return null;

  const wrap = section("Top players", "season leaders · advanced stats");
  const grid = el("div", "preview-grid");
  const headers = [
    "Player",
    "GP",
    "G",
    "A",
    "P",
    "PPP",
    "+/-",
    "SH%",
    "ixG",
    "xGF%",
    "RXGF%",
    "TOI",
    "GVI",
  ];

  const side = (team) => {
    const list = skaters
      .filter((s) => s.teamId === team.id && s.gamesPlayed != null)
      .sort((a, b) => b.points - a.points)
      .slice(0, 6);
    const card = el("div", "card table-scroll");

    const rows = list.map((p) => {
      const ppp = el("td", null, "…");
      const pm = el("td", null, p.plusMinus == null ? "—" : p.plusMinus);
      const sh = el(
        "td",
        null,
        p.shootingPctg != null ? pct(p.shootingPctg) : "—",
      );
      const ixg = el("td", null, "…");
      const xgf = el("td", null, "…");
      const rel = el("td", null, "…");
      const toi = el("td", null, p.avgTimeOnIce || "—");
      const gvi = el("td", null, "…");

      storeUpdaters.push(() => {
        const row = storeRow(p.playerId);
        if (!row) return;
        ppp.textContent = row.PPP ?? "—";
        pm.textContent = row["+/-"] ?? pm.textContent;
        sh.textContent = fmtShPct(row.G, row.S);
        toi.textContent = row.TOI || toi.textContent;
        gvi.textContent = row.GVI != null ? Number(row.GVI).toFixed(2) : "—";
      });
      skaterMpUpdaters.push((mp) => {
        const entry = mp?.[p.playerId];
        const vals = entry ? seasonAdvCells(entry) : null;
        ixg.textContent = vals?.ixg ?? "—";
        xgf.textContent = vals?.xgf ?? "—";
        rel.textContent = vals?.rel ?? "—";
      });

      return [
        playerCell(p),
        p.gamesPlayed,
        p.goals,
        p.assists,
        p.points,
        ppp,
        pm,
        sh,
        ixg,
        xgf,
        rel,
        toi,
        gvi,
      ];
    });

    card.appendChild(dataTable(headers, rows, "top-table advanced-table"));
    return card;
  };

  grid.appendChild(side(away));
  grid.appendChild(side(home));
  wrap.appendChild(grid);
  return wrap;
}

function renderGoalieTables(matchup, away, home) {
  const goalies = matchup?.goalieSeasonStats?.goalies;
  if (!goalies?.length) return null;

  const wrap = section("Goalies", "season stats · advanced");
  const grid = el("div", "preview-grid");
  const headers = [
    "Goalie",
    "GP",
    "W-L-OT",
    "SV%",
    "GAA",
    "GSAx",
    "GSAx/60",
    "SO",
    "GVI",
  ];

  const side = (team) => {
    const list = goalies
      .filter((g) => g.teamId === team.id && g.gamesPlayed != null)
      .sort((a, b) => b.gamesPlayed - a.gamesPlayed);
    const card = el("div", "card table-scroll");

    const rows = list.map((g) => {
      const gsax = el("td", null, "…");
      const gsax60 = el("td", null, "…");
      const gvi = el("td", null, "…");

      storeUpdaters.push(() => {
        const row = storeRow(g.playerId, "goalie");
        if (!row) return;
        gvi.textContent = row.GVI != null ? Number(row.GVI).toFixed(2) : "—";
      });
      goalieMpUpdaters.push((mp) => {
        const entry = mp?.[g.playerId];
        const vals = entry ? seasonGoalieCells(entry) : null;
        gsax.textContent = vals?.gsax ?? "—";
        gsax60.textContent = vals?.gsax60 ?? "—";
      });

      return [
        playerCell(g, "goalie"),
        g.gamesPlayed,
        `${g.wins}-${g.losses}-${g.otLosses}`,
        pct(g.savePctg),
        num(g.goalsAgainstAvg),
        gsax,
        gsax60,
        g.shutouts,
        gvi,
      ];
    });

    card.appendChild(dataTable(headers, rows, "goalie-table advanced-table"));
    return card;
  };

  grid.appendChild(side(away));
  grid.appendChild(side(home));
  wrap.appendChild(grid);
  return wrap;
}

// --- Career vs opponent ---------------------------------------------------

const MIN_CAREER_GP = 5;

function parseToi(toi) {
  if (!toi) return 0;
  const [minutes, seconds] = String(toi).split(":").map(Number);
  return (minutes || 0) * 60 + (seconds || 0);
}

function fmtToi(totalSeconds) {
  if (!totalSeconds) return "—";
  const total = Math.round(totalSeconds);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function dedupeByPlayer(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    if (row?.playerId == null || seen.has(row.playerId)) continue;
    seen.add(row.playerId);
    out.push(row);
  }
  return out;
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = await fn(items[index], index);
      } catch (err) {
        console.error("Career scan failed:", err);
        results[index] = null;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

async function loadCareerGames(playerId, opponentAbbrev) {
  const landing = await loadPlayerLanding(playerId);
  const seasonIds = [
    ...new Set(
      (landing?.seasonTotals || [])
        .filter((t) => t.leagueAbbrev === "NHL" && t.gameTypeId === 2)
        .map((t) => t.season),
    ),
  ];
  if (!seasonIds.length) return [];
  const logs = await mapLimit(seasonIds, 3, (s) => loadGameLog(playerId, s));
  return logs
    .flatMap((log) => log?.gameLog || [])
    .filter((game) => game.opponentAbbrev === opponentAbbrev);
}

function summarizeSkater(games) {
  let gp = 0;
  let goals = 0;
  let assists = 0;
  let points = 0;
  let shots = 0;
  let toi = 0;
  for (const game of games) {
    gp++;
    goals += game.goals || 0;
    assists += game.assists || 0;
    points += game.points ?? (game.goals || 0) + (game.assists || 0);
    shots += game.shots || 0;
    toi += parseToi(game.toi);
  }
  return {
    gp,
    goals,
    assists,
    points,
    pointsPerGame: gp ? points / gp : 0,
    toiPerGame: gp ? toi / gp : 0,
  };
}

function summarizeGoalie(games) {
  let gp = 0;
  let wins = 0;
  let losses = 0;
  let otLosses = 0;
  let shotsAgainst = 0;
  let goalsAgainst = 0;
  let toi = 0;
  for (const game of games) {
    gp++;
    if (game.decision === "W") wins++;
    else if (game.decision === "L") losses++;
    else if (game.decision === "O" || game.decision === "OT" || game.decision === "SO") {
      otLosses++;
    }
    shotsAgainst += game.shotsAgainst || 0;
    goalsAgainst += game.goalsAgainst || 0;
    toi += parseToi(game.toi);
  }
  return {
    gp,
    wins,
    losses,
    otLosses,
    savePct:
      shotsAgainst > 0
        ? ((shotsAgainst - goalsAgainst) / shotsAgainst) * 100
        : null,
    gaa: toi > 0 ? (goalsAgainst * 3600) / toi : null,
  };
}

async function runCareerScan(sides, skaters, goalies) {
  const skaterCandidates = dedupeByPlayer(skaters);
  const goalieCandidates = dedupeByPlayer(goalies);
  const total = skaterCandidates.length + goalieCandidates.length;
  let done = 0;

  const tick = () => {
    done++;
    for (const side of sides) {
      side.status.textContent = `Scanning career logs… ${done}/${total}`;
    }
  };

  const opponentFor = (candidate) => {
    const side = sides.find((s) => s.team.id === candidate.teamId);
    return side ? side.opp.abbrev : null;
  };

  const skaterResults = await mapLimit(skaterCandidates, 6, async (player) => {
    const opponent = opponentFor(player);
    if (!opponent) {
      tick();
      return null;
    }
    const games = await loadCareerGames(player.playerId, opponent);
    tick();
    return { player, opponent, summary: summarizeSkater(games) };
  });

  const goalieResults = await mapLimit(goalieCandidates, 4, async (player) => {
    const opponent = opponentFor(player);
    if (!opponent) {
      tick();
      return null;
    }
    const games = await loadCareerGames(player.playerId, opponent);
    tick();
    return { player, opponent, summary: summarizeGoalie(games) };
  });

  for (const side of sides) {
    const skaterRows = skaterResults
      .filter(Boolean)
      .filter(
        (r) =>
          r.player.teamId === side.team.id && r.summary.gp >= MIN_CAREER_GP,
      )
      .sort(
        (a, b) =>
          b.summary.pointsPerGame - a.summary.pointsPerGame ||
          b.summary.points - a.summary.points,
      )
      .slice(0, 5);

    const goalieRows = goalieResults
      .filter(Boolean)
      .filter(
        (r) =>
          r.player.teamId === side.team.id && r.summary.gp >= MIN_CAREER_GP,
      )
      .sort((a, b) => b.summary.gp - a.summary.gp);

    side.status.remove();
    side.body.textContent = "";

    if (!skaterRows.length && !goalieRows.length) {
      side.body.appendChild(
        el(
          "div",
          "empty-state",
          `No player with ${MIN_CAREER_GP}+ regular-season games vs ${side.opp.abbrev}.`,
        ),
      );
      continue;
    }

    if (skaterRows.length) {
      side.body.appendChild(
        el("div", "career-subtitle", `Skaters vs ${side.opp.abbrev}`),
      );
      side.body.appendChild(
        dataTable(
          ["Player", "GP", "G", "A", "P", "P/G", "TOI/G"],
          skaterRows.map(({ player, summary }) => [
            playerCell(player),
            summary.gp,
            summary.goals,
            summary.assists,
            summary.points,
            summary.pointsPerGame.toFixed(2),
            fmtToi(summary.toiPerGame),
          ]),
          "career-table",
        ),
      );
    }

    if (goalieRows.length) {
      side.body.appendChild(
        el("div", "career-subtitle", `Goalies vs ${side.opp.abbrev}`),
      );
      side.body.appendChild(
        dataTable(
          ["Goalie", "GP", "W-L-OT", "SV%", "GAA"],
          goalieRows.map(({ player, summary }) => [
            playerCell(player, "goalie"),
            summary.gp,
            `${summary.wins}-${summary.losses}-${summary.otLosses}`,
            summary.savePct != null ? `${summary.savePct.toFixed(1)}%` : "—",
            summary.gaa != null ? summary.gaa.toFixed(2) : "—",
          ]),
          "career-table",
        ),
      );
    }
  }

  refreshTierSlots();
}

function renderCareerVsOpponent(matchup, away, home) {
  const skaters = matchup?.skaterSeasonStats?.skaters;
  const goalies = matchup?.goalieSeasonStats?.goalies;
  if (!skaters?.length) return null;

  const wrap = section(
    "Career vs opponent",
    "regular season · min 5 GP · per-game averages",
  );
  const grid = el("div", "preview-grid");

  const sides = [
    { team: away, opp: home },
    { team: home, opp: away },
  ].map(({ team, opp }) => {
    const card = el("div", "card career-card");
    const body = el("div", "career-body");
    card.appendChild(
      el("div", "career-title", `${team.abbrev} players vs ${opp.abbrev}`),
    );
    const status = el("div", "career-status", "Scanning career logs…");
    card.appendChild(status);
    card.appendChild(body);
    grid.appendChild(card);
    return { team, opp, card, body, status };
  });

  wrap.appendChild(grid);
  runCareerScan(sides, skaters, goalies);
  return wrap;
}

// --- Bootstrap ------------------------------------------------------------

function showError(message) {
  root.innerHTML = "";
  root.appendChild(el("div", "card empty-state", message));
}

async function ensureSeasonStore() {
  const ctx = await loadSeasonStoreContext(() => gameSeason || seasons[0]);
  setPlayerCardContext(ctx);
}

setPlayerCardContextLoader(ensureSeasonStore);

async function enrichPreview() {
  try {
    await ensureSeasonStore();
    refreshTierSlots();
    for (const update of storeUpdaters) {
      try {
        update();
      } catch (err) {
        console.error(err);
      }
    }

    const [mpSkaters, mpGoalies] = await Promise.all([
      loadMoneyPuckSkaters(gameSeason),
      loadMoneyPuckGoalies(gameSeason),
    ]);
    for (const update of skaterMpUpdaters) {
      try {
        update(mpSkaters);
      } catch (err) {
        console.error(err);
      }
    }
    for (const update of goalieMpUpdaters) {
      try {
        update(mpGoalies);
      } catch (err) {
        console.error(err);
      }
    }
  } catch (err) {
    console.error("Failed to enrich game preview:", err);
  }
}

async function main() {
  if (!gameId) {
    showError("No game selected. Open a matchup from the Games page.");
    return;
  }

  const landing = await loadGameLanding(gameId);
  if (!landing || !landing.awayTeam || !landing.homeTeam) {
    showError("Could not load this game. It may not be available yet.");
    return;
  }

  const away = landing.awayTeam;
  const home = landing.homeTeam;
  const matchup = landing.matchup || {};
  gameSeason = landing.season || seasons[0];

  const awayRecord = matchup.goalieComparison?.awayTeam?.teamTotals?.record;
  const homeRecord = matchup.goalieComparison?.homeTeam?.teamTotals?.record;

  root.innerHTML = "";
  root.appendChild(renderHeader(landing, awayRecord, homeRecord));

  const [teamSummary, awaySchedule, standings, powerplay, penaltykill, depthCharts] =
    await Promise.all([
      loadTeamSummary(landing.season),
      loadClubSchedule(away.abbrev),
      loadStandings(),
      loadTeamPowerPlay(landing.season),
      loadTeamPenaltyKill(landing.season),
      loadDepthCharts(),
    ]);

  const awaySummary = teamSummary.find((t) => t.teamId === away.id);
  const homeSummary = teamSummary.find((t) => t.teamId === home.id);

  const awayGoalieList = (matchup.goalieSeasonStats?.goalies || []).filter(
    (g) => g.teamId === away.id,
  );
  const homeGoalieList = (matchup.goalieSeasonStats?.goalies || []).filter(
    (g) => g.teamId === home.id,
  );
  const awayLeaders = matchup.goalieComparison?.awayTeam?.leaders || [];
  const homeLeaders = matchup.goalieComparison?.homeTeam?.leaders || [];
  let awayGoalie =
    projectedGoalieFromDepth(depthCharts, away, awayGoalieList) ||
    awayLeaders[0];
  let homeGoalie =
    projectedGoalieFromDepth(depthCharts, home, homeGoalieList) ||
    homeLeaders[0];
  const fallbackGoalie = (team) => {
    const teamDepth = depthCharts?.teams?.find(
      (t) => t.abbreviation === team.abbrev,
    );
    const starterName = teamDepth?.goalies?.starter?.name;
    return starterName ? { name: { default: starterName } } : null;
  };
  if (!awayGoalie) awayGoalie = fallbackGoalie(away);
  if (!homeGoalie) homeGoalie = fallbackGoalie(home);
  const mergeGoalie = (goalie, leaders) => {
    if (!goalie) return goalie;
    if (!goalie.headshot) {
      const last = normalizeName(goalie.name?.default).split(/\s+/).pop();
      const match = (leaders || []).find((l) => {
        const n = normalizeName(l?.name?.default);
        return n.split(/\s+/).pop() === last;
      });
      if (match?.headshot) goalie.headshot = match.headshot;
      if (goalie.savePctg == null && match?.savePctg != null)
        goalie.savePctg = match.savePctg;
    }
    return goalie;
  };
  awayGoalie = mergeGoalie(awayGoalie, awayLeaders);
  homeGoalie = mergeGoalie(homeGoalie, homeLeaders);

  if (awaySummary && homeSummary) {
    const context = buildComparisonContext({
      teamSummary,
      standings,
      powerplay,
      penaltykill,
      season: landing.season,
    });
    const awayCompare = withComparisonExtras(awaySummary, away.abbrev, context);
    const homeCompare = withComparisonExtras(homeSummary, home.abbrev, context);

    const compare = section(
      "Team comparison",
      `${formatSeason(landing.season)} · # = NHL rank`,
    );
    const card = el("div", "card");
    card.appendChild(
      compareTable(awayCompare, homeCompare, away.abbrev, home.abbrev),
    );
    compare.appendChild(card);
    root.appendChild(compare);

    root.appendChild(
      renderEdges(
        buildEdges(
          awayCompare,
          homeCompare,
          away.abbrev,
          home.abbrev,
          awayGoalie,
          homeGoalie,
        ),
        away.abbrev,
        home.abbrev,
      ),
    );
  }

  if (awayGoalie || homeGoalie) {
    const goalieWrap = section("Projected starters", "verify before puck drop");
    const goalieGrid = el("div", "preview-grid");
  goalieGrid.appendChild(
    goalieCard(awayGoalie, away, `${away.abbrev} — starter`, landing.gameDate),
  );
  goalieGrid.appendChild(
    goalieCard(homeGoalie, home, `${home.abbrev} — starter`, landing.gameDate),
  );
    goalieWrap.appendChild(goalieGrid);
    root.appendChild(goalieWrap);
  }

  root.appendChild(renderH2H(awaySchedule?.games, away.abbrev, home.abbrev));

  const hot = renderHotPlayers(matchup, away.abbrev, home.abbrev);
  if (hot) root.appendChild(hot);

  const career = renderCareerVsOpponent(matchup, away, home);
  if (career) root.appendChild(career);

  const top = renderTopPlayers(matchup, away, home);
  if (top) root.appendChild(top);

  const goalieTables = renderGoalieTables(matchup, away, home);
  if (goalieTables) root.appendChild(goalieTables);

  // Tiers, GVI and MoneyPuck advanced columns fill in progressively.
  enrichPreview();
}

main();
