import {
  loadGameLanding,
  loadGameBoxscore,
  loadGamePlayByPlay,
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
  loadStartingGoalies,
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

function dailyFaceoffNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dailyFaceoffStarterForTeam(games, abbrev) {
  for (const game of games || []) {
    if (game.awayTeamAbbreviation === abbrev) {
      return {
        name: game.awayGoalieName,
        status: game.awayNewsStrengthName,
        wins: dailyFaceoffNumber(game.awayGoalieWins),
        losses: dailyFaceoffNumber(game.awayGoalieLosses),
        otLosses: dailyFaceoffNumber(game.awayGoalieOvertimeLosses),
        shutouts: dailyFaceoffNumber(game.awayGoalieShutouts),
        savePctg: dailyFaceoffNumber(game.awayGoalieSavePercentage),
        gaa: dailyFaceoffNumber(game.awayGoalieGoalsAgainstAvg),
        newsDetails: game.awayNewsDetails,
      };
    }
    if (game.homeTeamAbbreviation === abbrev) {
      return {
        name: game.homeGoalieName,
        status: game.homeNewsStrengthName,
        wins: dailyFaceoffNumber(game.homeGoalieWins),
        losses: dailyFaceoffNumber(game.homeGoalieLosses),
        otLosses: dailyFaceoffNumber(game.homeGoalieOvertimeLosses),
        shutouts: dailyFaceoffNumber(game.homeGoalieShutouts),
        savePctg: dailyFaceoffNumber(game.homeGoalieSavePercentage),
        gaa: dailyFaceoffNumber(game.homeGoalieGoalsAgainstAvg),
        newsDetails: game.homeNewsDetails,
      };
    }
  }
  return null;
}

function matchGoalieByName(goalieList, name) {
  const target = normalizeName(name);
  if (!target) return null;
  const exact = (goalieList || []).find(
    (g) => normalizeName(g?.name?.default || g?.name) === target,
  );
  if (exact) return exact;
  const targetLast = target.split(/\s+/).pop();
  return (
    (goalieList || []).find((g) => {
      const candidate = normalizeName(g?.name?.default || g?.name);
      return candidate.split(/\s+/).pop() === targetLast;
    }) || null
  );
}

function resolveProjectedGoalie(dfStarter, dfGames, fallback, goalieList) {
  if (dfGames && dfStarter?.name) {
    const matched = matchGoalieByName(goalieList, dfStarter.name);
    const base = matched || {};
    const goalie = {
      ...base,
      name: { ...(base.name || {}), default: dfStarter.name },
      confirmationStatus:
        String(dfStarter.status || "").trim() || "Unconfirmed",
      newsDetails: dfStarter.newsDetails || "",
    };
    if (dfStarter.wins != null || dfStarter.losses != null || dfStarter.otLosses != null) {
      const wins = dfStarter.wins ?? goalie.wins ?? 0;
      const losses = dfStarter.losses ?? goalie.losses ?? 0;
      const otLosses = dfStarter.otLosses ?? goalie.otLosses ?? 0;
      goalie.record = `${wins}-${losses}-${otLosses}`;
    }
    if (dfStarter.gaa != null) goalie.gaa = dfStarter.gaa;
    if (dfStarter.savePctg != null) goalie.savePctg = dfStarter.savePctg;
    if (dfStarter.shutouts != null) goalie.shutouts = dfStarter.shutouts;
    if (!goalie.headshot) {
      const matched = matchGoalieByName(goalieList, dfStarter.name);
      if (matched?.headshot) goalie.headshot = matched.headshot;
    }
    return goalie;
  }
  const goalie = fallback;
  if (goalie) {
    goalie.confirmationStatus = "Unconfirmed";
    goalie.newsDetails = "";
  }
  return goalie;
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
    available: (away, home) => away.faceoffWinPct != null && home.faceoffWinPct != null,
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
    if (def.raw && (awayVal == null || homeVal == null)) continue;
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

// --- Last five -----------------------------------------------------------

function lastFiveCompletedGames(scheduleGames, currentGameId) {
  const currentId = Number(currentGameId);
  return (scheduleGames || [])
    .filter(
      (g) =>
        g.gameType === 2 &&
        FINAL_STATES.has(g.gameState) &&
        Number(g.id) !== currentId,
    )
    .sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))
    .slice(0, 5);
}

function lastCompletedGames(scheduleGames, currentGameId, count = 10) {
  const currentId = Number(currentGameId);
  return (scheduleGames || [])
    .filter(
      (g) =>
        g.gameType === 2 &&
        FINAL_STATES.has(g.gameState) &&
        Number(g.id) !== currentId,
    )
    .sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))
    .slice(0, count);
}

function renderTeamLastGames(games, abbrev) {
  const card = el("div", "card h2h-card");
  card.appendChild(el("div", "h2h-record", abbrev));
  const rows = (games || []).map((g) => {
    const away = g.awayTeam.abbrev;
    const home = g.homeTeam.abbrev;
    return [g.gameDate, `${away} ${g.awayTeam.score} @ ${home} ${g.homeTeam.score}`];
  });
  if (!rows.length) {
    card.appendChild(el("div", "empty-state", "No games played yet."));
    return card;
  }
  const table = dataTable(["Date", "Result"], rows, "h2h-table");
  table.querySelectorAll("tbody tr").forEach((tr, i) => {
    tr.classList.add("clickable-game");
    tr.addEventListener("click", () => openGameModal((games || [])[i]?.id));
  });
  card.appendChild(table);
  return card;
}

function renderLastTen(awayGames, homeGames, awayAbbrev, homeAbbrev) {
  const awayList = lastCompletedGames(awayGames, gameId, 10);
  const homeList = lastCompletedGames(homeGames, gameId, 10);
  if (!awayList.length && !homeList.length) return null;
  const wrap = section("Last 10");
  const grid = el("div", "preview-grid");
  grid.appendChild(renderTeamLastGames(awayList, awayAbbrev));
  grid.appendChild(renderTeamLastGames(homeList, homeAbbrev));
  wrap.appendChild(grid);
  return wrap;
}

async function computeLastFiveSummary(scheduleGames, abbrev, currentGameId) {
  const games = lastFiveCompletedGames(scheduleGames, currentGameId);
  if (!games.length) return null;

  const landings = await Promise.all(games.map((g) => loadGameLanding(g.id)));
  const usable = games
    .map((g, i) => ({ game: g, landing: landings[i] }))
    .filter((entry) => entry.landing);
  if (!usable.length) return null;

  let wins = 0;
  let losses = 0;
  let otLosses = 0;
  let gf = 0;
  let ga = 0;
  let sf = 0;
  let sa = 0;
  let ppGoals = 0;
  let ppOpp = 0;
  let pkGoalsAllowed = 0;
  let pkOpp = 0;
  let shutouts = 0;
  let homeGames = 0;
  let homeWins = 0;
  let homeLosses = 0;
  let homeOt = 0;
  let roadGames = 0;
  let roadWins = 0;
  let roadLosses = 0;
  let roadOt = 0;

  for (const { game, landing } of usable) {
    const teamIsAway = game.awayTeam?.abbrev === abbrev;
    const me = teamIsAway ? landing.awayTeam : landing.homeTeam;
    const opp = teamIsAway ? landing.homeTeam : landing.awayTeam;
    const myScore = Number(
      me?.score ?? (teamIsAway ? game.awayTeam?.score : game.homeTeam?.score),
    );
    const oppScore = Number(
      opp?.score ?? (teamIsAway ? game.homeTeam?.score : game.awayTeam?.score),
    );
    const mySog = Number(me?.sog ?? 0);
    const oppSog = Number(opp?.sog ?? 0);

    gf += myScore;
    ga += oppScore;
    sf += mySog;
    sa += oppSog;
    if (oppScore === 0) shutouts++;

    const wentOt = landing.periodDescriptor?.periodType !== "REG";
    let result = "L";
    if (myScore > oppScore) {
      wins++;
      result = "W";
    } else if (wentOt) {
      otLosses++;
      result = "OTL";
    } else {
      losses++;
    }

    if (teamIsAway) {
      roadGames++;
      if (result === "W") roadWins++;
      else if (result === "OTL") roadOt++;
      else roadLosses++;
    } else {
      homeGames++;
      if (result === "W") homeWins++;
      else if (result === "OTL") homeOt++;
      else homeLosses++;
    }

    const scoring = landing.summary?.scoring || [];
    for (const period of scoring) {
      for (const goal of period.goals || []) {
        if (goal.strength !== "pp") continue;
        if (goal.teamAbbrev?.default === abbrev) ppGoals++;
        else pkGoalsAllowed++;
      }
    }

    const penaltyPeriods = landing.summary?.penalties || [];
    for (const period of penaltyPeriods) {
      for (const penalty of period.penalties || []) {
        const committed = penalty.teamAbbrev?.default;
        if (!committed) continue;
        if (committed !== abbrev) ppOpp++;
        else pkOpp++;
      }
    }
  }

  const gp = usable.length;
  const points = wins * 2 + otLosses;
  const homeRecord =
    homeGames > 0
      ? {
          text: `${homeWins}-${homeLosses}-${homeOt}`,
          pct: (homeWins * 2 + homeOt) / (homeGames * 2),
        }
      : null;
  const roadRecord =
    roadGames > 0
      ? {
          text: `${roadWins}-${roadLosses}-${roadOt}`,
          pct: (roadWins * 2 + roadOt) / (roadGames * 2),
        }
      : null;

  return {
    wins,
    losses,
    otLosses,
    points,
    pointPct: gp > 0 ? points / (gp * 2) : null,
    goalsForPerGame: gf / gp,
    goalsAgainstPerGame: ga / gp,
    shotsForPerGame: sf / gp,
    shotsAgainstPerGame: sa / gp,
    powerPlayPct: ppOpp > 0 ? ppGoals / ppOpp : null,
    penaltyKillPct: pkOpp > 0 ? 1 - pkGoalsAllowed / pkOpp : null,
    faceoffWinPct: null,
    teamShutouts: shutouts,
    ppTime: null,
    pkTime: null,
    homeRecord,
    roadRecord,
    ppTimeAverage: null,
    pkTimeAverage: null,
    ranks: {},
  };
}

// --- Starter form (last 5) -----------------------------------------------

function parseToiMinutes(toi) {
  if (!toi) return 0;
  const parts = String(toi).split(":");
  if (parts.length === 2) {
    const minutes = Number(parts[0]);
    const seconds = Number(parts[1]);
    if (Number.isFinite(minutes) && Number.isFinite(seconds)) {
      return minutes + seconds / 60;
    }
  }
  const value = Number(toi);
  return Number.isFinite(value) ? value : 0;
}

async function computeGoalieLastFive(goalie, season, currentGameId) {
  if (!goalie?.playerId) return null;
  const log = await loadGameLog(goalie.playerId, season);
  const currentId = Number(currentGameId);
  const recent = (log?.gameLog || [])
    .filter(
      (game) =>
        game.decision != null &&
        (!Number.isFinite(currentId) || Number(game.gameId) <= currentId),
    )
    .sort((a, b) => String(b.gameDate).localeCompare(String(a.gameDate)))
    .slice(0, 5);
  if (!recent.length) return null;

  let wins = 0;
  let losses = 0;
  let otLosses = 0;
  let goalsAgainst = 0;
  let shotsAgainst = 0;
  let toiMinutes = 0;
  let shutouts = 0;

  for (const game of recent) {
    if (game.decision === "W") wins++;
    else if (game.decision === "L") losses++;
    else if (
      game.decision === "O" ||
      game.decision === "OT" ||
      game.decision === "SO" ||
      game.decision === "OTL"
    )
      otLosses++;

    goalsAgainst += Number(game.goalsAgainst || 0);
    shotsAgainst += Number(game.shotsAgainst || 0);
    toiMinutes += parseToiMinutes(game.toi);
    if (Number(game.goalsAgainst) === 0) shutouts += 1;
  }

  const saves = shotsAgainst - goalsAgainst;
  const savePct =
    shotsAgainst > 0 ? saves / shotsAgainst : null;
  const gaa =
    toiMinutes > 0
      ? (goalsAgainst / toiMinutes) * 60
      : recent.length
        ? goalsAgainst / recent.length
        : null;

  return {
    name: goalie?.name?.default || goalie?.name || "—",
    gp: recent.length,
    record: `${wins}-${losses}-${otLosses}`,
    goalsAgainst,
    shotsAgainst,
    saves,
    savePct,
    gaa,
    shutouts,
  };
}

function renderStarterForm(awayStats, homeStats, awayAbbrev, homeAbbrev) {
  if (!awayStats || !homeStats) return null;

  const wrap = section(
    "Starter form (last 5)",
    `${awayStats.name} vs ${homeStats.name}`,
  );
  const card = el("div", "card");
  const table = el("table", "mini-table compare-table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.appendChild(el("th", "compare-metric", ""));
  headRow.appendChild(el("th", "compare-away", awayAbbrev));
  headRow.appendChild(el("th", "compare-home", homeAbbrev));
  thead.appendChild(headRow);
  table.appendChild(thead);

  const fmt = (value, formatter) =>
    value == null ? "—" : formatter(value);

  const rows = [
    ["Games", awayStats.gp, homeStats.gp, (value) => value],
    ["Record", awayStats.record, homeStats.record, (value) => value],
    ["GA", awayStats.goalsAgainst, homeStats.goalsAgainst, (value) => value],
    ["SA", awayStats.shotsAgainst, homeStats.shotsAgainst, (value) => value],
    ["Saves", awayStats.saves, homeStats.saves, (value) => value],
    ["SV%", awayStats.savePct, homeStats.savePct, (value) => pct(value)],
    ["GAA", awayStats.gaa, homeStats.gaa, (value) => num(value)],
    ["SO", awayStats.shutouts, homeStats.shutouts, (value) => value],
  ];

  const tbody = document.createElement("tbody");
  for (const [label, awayValue, homeValue, formatter] of rows) {
    const tr = document.createElement("tr");
    tr.appendChild(el("td", "compare-metric", label));
    tr.appendChild(
      el("td", "compare-away", fmt(awayValue, formatter)),
    );
    tr.appendChild(
      el("td", "compare-home", fmt(homeValue, formatter)),
    );
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  card.appendChild(table);
  wrap.appendChild(card);
  return wrap;
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
  const wrap = section("Matchup edges");
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
  const tagRow = el("div", "goalie-tag-row");
  tagRow.appendChild(el("div", "goalie-tag", tag));
  if (goalie) {
    const status = goalie.confirmationStatus || "Unconfirmed";
    const statusKey = status.toLowerCase().replace(/\s+/g, "-");
    const badge = el("span", `badge goalie-status ${statusKey}`, status);
    badge.title =
      String(goalie.newsDetails || "").trim() || `Daily Faceoff: ${status}`;
    tagRow.appendChild(badge);
  }
  card.appendChild(tagRow);

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
      ["GAA", goalie.gaa == null ? "—" : num(goalie.gaa)],
      ["SV%", goalie.savePctg == null ? "—" : pct(goalie.savePctg)],
      ["SO", goalie.shutouts ?? "—"],
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
  const wrap = section("Head-to-head", `Season series ${awayAbbrev} vs ${homeAbbrev}`);

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
  const table = dataTable(["Date", "Result"], rows, "h2h-table");
  const gameIds = meetings.map((g) => g.id);
  table.querySelectorAll("tbody tr").forEach((tr, i) => {
    tr.classList.add("clickable-game");
    tr.addEventListener("click", () => openGameModal(gameIds[i]));
  });
  card.appendChild(table);
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

  const wrap = section("Hot players", "Leaders over the last 5 games");
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

  const wrap = section("Top players");
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

  const wrap = section("Goalies");
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
    "Regular season · min 5 GP",
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

function isRecapEligible(gameState) {
  return !["FUT", "PRE"].includes(gameState);
}

function openGameModal(gameId) {
  if (!gameId) return;
  const existing = document.querySelector(".game-modal-overlay");
  if (existing) existing.remove();

  const overlay = el("div", "game-modal-overlay");
  const card = el("div", "game-modal-card");
  const closeBtn = el("button", "game-modal-close", "×");
  closeBtn.type = "button";
  const frame = document.createElement("iframe");
  frame.className = "game-modal-frame";
  frame.src = `game.html?id=${encodeURIComponent(gameId)}`;
  frame.title = "Game preview";

  const close = () => {
    overlay.remove();
    document.body.style.overflow = "";
  };
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  const onKey = (e) => {
    if (e.key === "Escape") {
      close();
      document.removeEventListener("keydown", onKey);
    }
  };
  document.addEventListener("keydown", onKey);

  card.appendChild(closeBtn);
  card.appendChild(frame);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";
}

function ordinalPeriod(n, type) {
  if (type && type !== "REG") return type === "OT" ? "OT" : type;
  if (n === 1) return "1st Period";
  if (n === 2) return "2nd Period";
  if (n === 3) return "3rd Period";
  return `Period ${n}`;
}

function renderViewTabs(recapContainer, previewContainer, defaultView) {
  const tabs = el("div", "view-tabs");
  const recapBtn = el("button", "button", "Recap");
  const previewBtn = el("button", "button", "Head-to-Head");
  recapBtn.type = "button";
  previewBtn.type = "button";

  const activate = (view) => {
    recapBtn.classList.toggle("active", view === "recap");
    previewBtn.classList.toggle("active", view === "preview");
    recapContainer.classList.toggle("hidden", view !== "recap");
    previewContainer.classList.toggle("hidden", view !== "preview");
  };
  recapBtn.addEventListener("click", () => activate("recap"));
  previewBtn.addEventListener("click", () => activate("preview"));
  tabs.appendChild(recapBtn);
  tabs.appendChild(previewBtn);
  activate(defaultView);
  return tabs;
}

function fmtPct(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function aggregateBoxscore(players) {
  const list = players || [];
  const sum = (key) => list.reduce((acc, p) => acc + (Number(p[key]) || 0), 0);
  return {
    hits: sum("hits"),
    blocked: sum("blockedShots"),
    giveaways: sum("giveaways"),
    takeaways: sum("takeaways"),
    pim: sum("pim"),
    sog: sum("sog"),
  };
}

function renderGameStats(landing, away, home, boxscore, playByPlay) {
  const wrap = section("Game stats");
  const card = el("div", "card");
  const awayStats = boxscore?.playerByGameStats?.awayTeam || {};
  const homeStats = boxscore?.playerByGameStats?.homeTeam || {};
  const awayAgg = aggregateBoxscore([
    ...(awayStats.forwards || []),
    ...(awayStats.defense || []),
    ...(awayStats.goalies || []),
  ]);
  const homeAgg = aggregateBoxscore([
    ...(homeStats.forwards || []),
    ...(homeStats.defense || []),
    ...(homeStats.goalies || []),
  ]);

  // faceoffs from play-by-play
  const roster = playByPlay?.rosterSpots || [];
  const teamOfPlayer = new Map(roster.map((p) => [p.playerId, p.teamId]));
  const awayTeamId = away.id;
  const homeTeamId = home.id;
  let awayFoWins = 0;
  let homeFoWins = 0;
  for (const ev of playByPlay?.plays || []) {
    if (ev.typeDescKey !== "faceoff") continue;
    const winnerTeam = teamOfPlayer.get(ev.details?.winningPlayerId);
    if (winnerTeam === awayTeamId) awayFoWins++;
    else if (winnerTeam === homeTeamId) homeFoWins++;
  }
  const foTotal = awayFoWins + homeFoWins;
  const awayFoPct = foTotal > 0 ? awayFoWins / foTotal : null;
  const homeFoPct = foTotal > 0 ? homeFoWins / foTotal : null;

  // PP efficiency
  const scoring = landing.summary?.scoring || [];
  let awayPPG = 0;
  let homePPG = 0;
  for (const period of scoring) {
    for (const goal of period.goals || []) {
      if (goal.strength !== "pp") continue;
      if (goal.teamAbbrev?.default === away.abbrev) awayPPG++;
      else if (goal.teamAbbrev?.default === home.abbrev) homePPG++;
    }
  }
  const penalties = landing.summary?.penalties || [];
  let awayPPO = 0;
  let homePPO = 0;
  for (const period of penalties) {
    for (const pen of period.penalties || []) {
      const committed = pen.teamAbbrev?.default;
      if (committed === home.abbrev) awayPPO++;
      else if (committed === away.abbrev) homePPO++;
    }
  }
  const awayPPEff = awayPPO > 0 ? awayPPG / awayPPO : null;
  const homePPEff = homePPO > 0 ? homePPG / homePPO : null;

  const awaySog = landing.awayTeam?.sog ?? boxscore?.awayTeam?.sog ?? awayAgg.sog;
  const homeSog = landing.homeTeam?.sog ?? boxscore?.homeTeam?.sog ?? homeAgg.sog;

  const rows = [
    ["Shots on goal", awaySog, homeSog],
    ["Face-off %", fmtPct(awayFoPct), fmtPct(homeFoPct)],
    ["PP efficiency", fmtPct(awayPPEff), fmtPct(homePPEff)],
    ["PK minutes (PIM)", awayAgg.pim, homeAgg.pim],
    ["Hits", awayAgg.hits, homeAgg.hits],
    ["Blocked shots", awayAgg.blocked, homeAgg.blocked],
    ["Giveaways", awayAgg.giveaways, homeAgg.giveaways],
    ["Takeaways", awayAgg.takeaways, homeAgg.takeaways],
  ];
  card.appendChild(dataTable(["Stat", away.abbrev, home.abbrev], rows, "h2h-table"));
  wrap.appendChild(card);
  return wrap;
}

function renderSummary(landing, away, home) {
  const wrap = section("Summary");
  const scoring = landing.summary?.scoring || [];
  if (!scoring.length) {
    wrap.appendChild(el("div", "card empty-state", "No scoring events yet."));
    return wrap;
  }
  const card = el("div", "card");
  for (const period of scoring) {
    card.appendChild(
      el("div", "summary-period", ordinalPeriod(period.periodDescriptor?.number, period.periodDescriptor?.periodType)),
    );
    for (const goal of period.goals || []) {
      const row = el("div", "summary-goal");
      if (goal.headshot) {
        const img = document.createElement("img");
        img.src = goal.headshot;
        img.alt = "";
        img.className = "summary-headshot";
        img.loading = "lazy";
        row.appendChild(img);
      } else {
        row.appendChild(el("div", "summary-headshot"));
      }
      const body = el("div", "summary-goal-body");
      const scorer = el("div", "summary-scorer");
      scorer.textContent = `${goal.name?.default || ""} (${goal.goalsToDate ?? 0})`;
      body.appendChild(scorer);
      const assists = goal.assists || [];
      if (assists.length) {
        const a = el("div", "summary-assists");
        a.textContent = assists
          .map((x) => `${x.name?.default || ""} (${x.assistsToDate ?? 0})`)
          .join(", ");
        body.appendChild(a);
      }
      row.appendChild(body);

      const meta = el("div", "summary-meta");
      meta.appendChild(el("span", "summary-time", goal.timeInPeriod || ""));
      meta.appendChild(
        el("span", "summary-score", `${goal.awayScore}-${goal.homeScore}`),
      );
      const badges = el("div", "summary-badges");
      if (goal.strength === "pp")
        badges.appendChild(el("span", "summary-badge pp", "PP"));
      else if (goal.strength === "sh")
        badges.appendChild(el("span", "summary-badge pk", "PK"));
      if (goal.goalModifier === "empty-net")
        badges.appendChild(el("span", "summary-badge en", "EN"));
      meta.appendChild(badges);
      row.appendChild(meta);
      card.appendChild(row);
    }
  }
  wrap.appendChild(card);
  return wrap;
}

function playerHeadshotMap(playByPlay) {
  const map = new Map();
  for (const spot of playByPlay?.rosterSpots || []) {
    map.set(spot.playerId, spot.headshot);
  }
  return map;
}

function sortSkaters(a, b) {
  return (
    (b.points || 0) - (a.points || 0) ||
    (b.goals || 0) - (a.goals || 0) ||
    (b.assists || 0) - (a.assists || 0) ||
    (b.sog || 0) - (a.sog || 0) ||
    String(a.name?.default || "").localeCompare(String(b.name?.default || ""))
  );
}

function renderGameSheet(boxscore, playByPlay, away, home) {
  const wrap = section("Game sheet");
  const card = el("div", "card");
  const headshots = playerHeadshotMap(playByPlay);
  const teams = [
    { key: "away", label: away.abbrev, data: boxscore?.playerByGameStats?.awayTeam },
    { key: "home", label: home.abbrev, data: boxscore?.playerByGameStats?.homeTeam },
  ];

  const tabs = el("div", "view-tabs");
  const body = el("div", "game-sheet-body");
  const renderTeam = (team) => {
    body.innerHTML = "";
    if (!team?.data) {
      body.appendChild(el("div", "empty-state", "No player data available."));
      return;
    }
    const groups = [
      ["Forwards", team.data.forwards || []],
      ["Defensemen", team.data.defense || []],
      ["Goalies", team.data.goalies || []],
    ];
    for (const [label, players] of groups) {
      if (!players.length) continue;
      body.appendChild(el("h3", "game-sheet-group", label));
      if (label === "Goalies") {
        const sorted = [...players].sort(
          (a, b) => (b.saves || 0) - (a.saves || 0) || String(a.name?.default || "").localeCompare(String(b.name?.default || "")),
        );
        const rows = sorted.map((p) => {
          const cell = el("div", "player-cell");
          const hs = headshots.get(p.playerId);
          if (hs) {
            const img = document.createElement("img");
            img.src = hs;
            img.alt = "";
            img.loading = "lazy";
            cell.appendChild(img);
          }
          cell.appendChild(el("span", null, `${p.name?.default || ""} #${p.sweaterNumber}`));
          const svPct = p.savePctg != null ? (Number(p.savePctg) * 100).toFixed(1) + "%" : "—";
          return [cell, p.shotsAgainst ?? "—", p.saves ?? "—", svPct, p.goalsAgainst ?? "—", p.toi || "—", p.decision || "—"];
        });
        body.appendChild(dataTable(["Player", "SA", "SV", "SV%", "GA", "TOI", "Dec"], rows, "h2h-table"));
      } else {
        const sorted = [...players].sort(sortSkaters);
        const rows = sorted.map((p) => {
          const cell = el("div", "player-cell");
          const hs = headshots.get(p.playerId);
          if (hs) {
            const img = document.createElement("img");
            img.src = hs;
            img.alt = "";
            img.loading = "lazy";
            cell.appendChild(img);
          }
          cell.appendChild(el("span", null, `${p.name?.default || ""} #${p.sweaterNumber}`));
          const plusMinus = p.plusMinus > 0 ? `+${p.plusMinus}` : p.plusMinus;
          return [cell, p.goals ?? 0, p.assists ?? 0, p.points ?? 0, plusMinus, p.sog ?? 0, p.hits ?? 0, p.toi || "—"];
        });
        body.appendChild(dataTable(["Player", "G", "A", "Pts", "+/-", "SOG", "Hits", "TOI"], rows, "h2h-table"));
      }
    }
  };

  teams.forEach((t, i) => {
    const btn = el("button", "button", t.label);
    btn.type = "button";
    if (i === 0) btn.classList.add("active");
    btn.addEventListener("click", () => {
      tabs.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderTeam(t);
    });
    tabs.appendChild(btn);
  });
  card.appendChild(tabs);
  card.appendChild(body);
  renderTeam(teams[0]);
  wrap.appendChild(card);
  return wrap;
}

function describePlayEvent(ev, playerMap, teamMap) {
  const details = ev.details || {};
  const playerName = (id) => {
    const p = playerMap.get(id);
    return p ? `${p.firstName?.default || ""} ${p.lastName?.default || ""}`.trim() : (id ? `#${id}` : "");
  };
  const teamAbbrev = (teamId) => teamMap.get(teamId) || "";
  const owner = teamAbbrev(details.eventOwnerTeamId || ev.eventOwnerTeamId);

  switch (ev.typeDescKey) {
    case "goal": {
      const scorer = playerName(details.scoringPlayerId);
      const assists = [details.assist1PlayerId, details.assist2PlayerId].filter(Boolean).map(playerName);
      const assistText = assists.length ? ` (${assists.join(", ")})` : "";
      const strength = details.strength ? details.strength.toUpperCase() : "";
      const en = details.goalModifier === "empty-net" ? " EN" : "";
      return `${owner} GOAL - ${scorer}${assistText} ${details.awayScore}-${details.homeScore}${strength ? " [" + strength + "]" : ""}${en}`;
    }
    case "shot-on-goal":
      return `${owner} Shot on goal - ${playerName(details.shootingPlayerId)}`;
    case "missed-shot":
      return `${owner} Missed shot - ${playerName(details.shootingPlayerId)}${details.reason ? " (" + details.reason + ")" : ""}`;
    case "blocked-shot":
      return `${owner} Blocked shot - ${playerName(details.shootingPlayerId)} blocked by ${playerName(details.blockingPlayerId)}`;
    case "penalty":
      return `${owner} Penalty - ${playerName(details.committedByPlayerId)} (${details.descKey || "penalty"}${details.duration ? ", " + details.duration + " min" : ""})`;
    case "hit":
      return `${owner} Hit - ${playerName(details.hittingPlayerId)} on ${playerName(details.hitteePlayerId)}`;
    case "giveaway":
      return `${owner} Giveaway - ${playerName(details.playerId)}`;
    case "takeaway":
      return `${owner} Takeaway - ${playerName(details.playerId)}`;
    case "faceoff": {
      const w = playerName(details.winningPlayerId);
      const l = playerName(details.losingPlayerId);
      return `${owner} Faceoff - ${w} won vs ${l}${details.zoneCode ? " (" + details.zoneCode + ")" : ""}`;
    }
    case "stoppage":
      return `${owner} Stoppage - ${details.reason || ""}`.trim();
    case "period-end":
      return `End of ${ordinalPeriod(ev.periodDescriptor?.number, ev.periodDescriptor?.periodType)}`;
    case "period-start":
      return `Start of ${ordinalPeriod(ev.periodDescriptor?.number, ev.periodDescriptor?.periodType)}`;
    case "game-end":
      return "Game end";
    default:
      return `${owner} ${ev.typeDescKey}`;
  }
}

function renderPlayByPlay(playByPlay, landing) {
  const wrap = section("Play-by-play");
  const plays = playByPlay?.plays || [];
  if (!plays.length) {
    wrap.appendChild(el("div", "card empty-state", "No play-by-play available."));
    return wrap;
  }
  const card = el("div", "card");
  const playerMap = new Map((playByPlay.rosterSpots || []).map((p) => [p.playerId, p]));
  const teamMap = new Map();
  if (landing?.awayTeam) teamMap.set(landing.awayTeam.id, landing.awayTeam.abbrev);
  if (landing?.homeTeam) teamMap.set(landing.homeTeam.id, landing.homeTeam.abbrev);

  const FILTERS = [
    { key: "everything", label: "Everything" },
    { key: "goals", label: "Goals" },
    { key: "shotattempts", label: "Shot attempts" },
    { key: "sog", label: "SOG" },
    { key: "penalties", label: "Penalties" },
    { key: "hits", label: "Hits" },
    { key: "faceoffs", label: "Faceoffs" },
    { key: "giveaways", label: "Giveaways" },
    { key: "takeaways", label: "Takeaways" },
    { key: "other", label: "Other" },
  ];
  const NON_EVERYTHING = FILTERS.map((f) => f.key).filter((k) => k !== "everything");

  function categoryOf(ev) {
    switch (ev.typeDescKey) {
      case "goal":
        return "goals";
      case "shot-on-goal":
        return "sog"; // also shot attempt
      case "missed-shot":
      case "blocked-shot":
        return "shotattempts";
      case "penalty":
        return "penalties";
      case "hit":
        return "hits";
      case "faceoff":
        return "faceoffs";
      case "giveaway":
        return "giveaways";
      case "takeaway":
        return "takeaways";
      default:
        return "other";
    }
  }

  // filter state
  const activeFilters = new Set(["everything"]);
  const collapsedPeriods = new Set();

  const filterBar = el("div", "pbp-filters");
  const filterButtons = new Map();
  for (const f of FILTERS) {
    const btn = el("button", "button", f.label);
    btn.type = "button";
    if (f.key === "everything") btn.classList.add("active");
    btn.addEventListener("click", () => {
      if (f.key === "everything") {
        activeFilters.clear();
        activeFilters.add("everything");
      } else {
        if (activeFilters.has("everything")) {
          activeFilters.clear();
          activeFilters.add(f.key);
        } else if (activeFilters.has(f.key)) {
          activeFilters.delete(f.key);
          if (activeFilters.size === 0) activeFilters.add("everything");
        } else {
          activeFilters.add(f.key);
          // if all non-everything selected, collapse to everything
          if (NON_EVERYTHING.every((k) => activeFilters.has(k))) {
            activeFilters.clear();
            activeFilters.add("everything");
          }
        }
      }
      syncFilterButtons();
      applyFilters();
    });
    filterButtons.set(f.key, btn);
    filterBar.appendChild(btn);
  }
  card.appendChild(filterBar);

  function syncFilterButtons() {
    for (const f of FILTERS) {
      const btn = filterButtons.get(f.key);
      btn.classList.toggle("active", activeFilters.has(f.key));
    }
  }

  // period blocks
  const periodBlocks = new Map(); // periodKey -> { header, events }
  let currentPeriod = null;
  let currentEvents = null;
  for (const ev of plays) {
    const pd = ev.periodDescriptor || {};
    const periodKey = `${pd.number}-${pd.periodType}`;
    if (periodKey !== currentPeriod) {
      currentPeriod = periodKey;
      const header = el("button", "pbp-period-header", ordinalPeriod(pd.number, pd.periodType));
      header.type = "button";
      const chevron = el("span", "pbp-chevron", "▾");
      header.appendChild(chevron);
      const eventsWrap = el("div", "pbp-period-events");
      header.addEventListener("click", () => {
        if (collapsedPeriods.has(periodKey)) collapsedPeriods.delete(periodKey);
        else collapsedPeriods.add(periodKey);
        eventsWrap.classList.toggle("collapsed", collapsedPeriods.has(periodKey));
        chevron.textContent = collapsedPeriods.has(periodKey) ? "▸" : "▾";
      });
      card.appendChild(header);
      card.appendChild(eventsWrap);
      periodBlocks.set(periodKey, { header, eventsWrap });
      currentEvents = eventsWrap;
    }
    const row = el("div", "pbp-event");
    const cat = categoryOf(ev);
    row.dataset.category = cat;
    // shot-on-goal belongs to both shotattempts and sog
    if (ev.typeDescKey === "shot-on-goal") row.dataset.category = "sog shotattempts";
    row.appendChild(el("span", "pbp-time", ev.timeInPeriod || ""));
    row.appendChild(el("span", "pbp-desc", describePlayEvent(ev, playerMap, teamMap)));
    currentEvents.appendChild(row);
  }

  function applyFilters() {
    const everything = activeFilters.has("everything");
    for (const row of card.querySelectorAll(".pbp-event")) {
      const cats = (row.dataset.category || "").split(/\s+/);
      const visible = everything || cats.some((c) => activeFilters.has(c));
      row.classList.toggle("hidden", !visible);
    }
    // hide period blocks with no visible events
    for (const { eventsWrap } of periodBlocks.values()) {
      const hasVisible = Array.from(eventsWrap.querySelectorAll(".pbp-event")).some(
        (r) => !r.classList.contains("hidden"),
      );
      eventsWrap.classList.toggle("pbp-period-empty", !hasVisible);
      const header = eventsWrap.previousElementSibling;
      if (header) header.classList.toggle("pbp-period-empty", !hasVisible);
    }
  }

  applyFilters();
  wrap.appendChild(card);
  return wrap;
}

function renderRecap(landing, away, home, boxscore, playByPlay) {
  const container = el("div", "game-view game-view-recap");
  container.appendChild(renderGameStats(landing, away, home, boxscore, playByPlay));
  container.appendChild(renderSummary(landing, away, home));
  container.appendChild(renderGameSheet(boxscore, playByPlay, away, home));
  container.appendChild(renderPlayByPlay(playByPlay, landing));
  return container;
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

  document.title = `${
    landing.gameState === "FUT" || landing.gameState === "PRE"
      ? "Game Preview"
      : "Game View"
  } — Le Puckboard`;

  const awayRecord = matchup.goalieComparison?.awayTeam?.teamTotals?.record;
  const homeRecord = matchup.goalieComparison?.homeTeam?.teamTotals?.record;

  root.innerHTML = "";
  root.appendChild(renderHeader(landing, awayRecord, homeRecord));

  const eligible = isRecapEligible(landing.gameState);
  const previewContainer = el("div", "game-view game-view-preview");
  const recapContainer = eligible ? el("div", "game-view game-view-recap") : null;

  const [
    teamSummary,
    awaySchedule,
    homeSchedule,
    standings,
    powerplay,
    penaltykill,
    depthCharts,
    startingGoalies,
  ] = await Promise.all([
    loadTeamSummary(landing.season),
    loadClubSchedule(away.abbrev),
    loadClubSchedule(home.abbrev),
    loadStandings(),
    loadTeamPowerPlay(landing.season),
    loadTeamPenaltyKill(landing.season),
    loadDepthCharts(),
    loadStartingGoalies(landing.gameDate),
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
  const fallbackGoalie = (team) => {
    const teamDepth = depthCharts?.teams?.find(
      (t) => t.abbreviation === team.abbrev,
    );
    const starterName = teamDepth?.goalies?.starter?.name;
    return starterName ? { name: { default: starterName } } : null;
  };
  const awayDfStarter = dailyFaceoffStarterForTeam(
    startingGoalies,
    away.abbrev,
  );
  const homeDfStarter = dailyFaceoffStarterForTeam(
    startingGoalies,
    home.abbrev,
  );
  let awayGoalie = resolveProjectedGoalie(
    awayDfStarter,
    startingGoalies,
    projectedGoalieFromDepth(depthCharts, away, awayGoalieList) ||
      awayLeaders[0] ||
      fallbackGoalie(away),
    awayGoalieList,
  );
  let homeGoalie = resolveProjectedGoalie(
    homeDfStarter,
    startingGoalies,
    projectedGoalieFromDepth(depthCharts, home, homeGoalieList) ||
      homeLeaders[0] ||
      fallbackGoalie(home),
    homeGoalieList,
  );
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
      `${formatSeason(landing.season)}`,
    );
    const card = el("div", "card");
    card.appendChild(
      compareTable(awayCompare, homeCompare, away.abbrev, home.abbrev),
    );
    compare.appendChild(card);
    previewContainer.appendChild(compare);

    const [awayLast5, homeLast5] = await Promise.all([
      computeLastFiveSummary(awaySchedule?.games, away.abbrev, gameId),
      computeLastFiveSummary(homeSchedule?.games, home.abbrev, gameId),
    ]);
    if (awayLast5 && homeLast5) {
      const lastFive = section("Last five");
      const lastFiveCard = el("div", "card");
      lastFiveCard.appendChild(
        compareTable(awayLast5, homeLast5, away.abbrev, home.abbrev),
      );
      lastFive.appendChild(lastFiveCard);
      previewContainer.appendChild(lastFive);
    }

    const lastTen = renderLastTen(
      awaySchedule?.games,
      homeSchedule?.games,
      away.abbrev,
      home.abbrev,
    );
    if (lastTen) previewContainer.appendChild(lastTen);

    previewContainer.appendChild(
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
    const goalieWrap = section(
      "Projected starters",
      "Daily Faceoff · verify before puck drop",
    );
    const goalieGrid = el("div", "preview-grid");
  goalieGrid.appendChild(
    goalieCard(awayGoalie, away, `${away.abbrev} — starter`, landing.gameDate),
  );
  goalieGrid.appendChild(
    goalieCard(homeGoalie, home, `${home.abbrev} — starter`, landing.gameDate),
  );
    goalieWrap.appendChild(goalieGrid);
    previewContainer.appendChild(goalieWrap);
  }

  const [awayGoalieForm, homeGoalieForm] = await Promise.all([
    computeGoalieLastFive(awayGoalie, landing.season, gameId),
    computeGoalieLastFive(homeGoalie, landing.season, gameId),
  ]);
  const starterForm = renderStarterForm(
    awayGoalieForm,
    homeGoalieForm,
    away.abbrev,
    home.abbrev,
  );
  if (starterForm) previewContainer.appendChild(starterForm);

  previewContainer.appendChild(renderH2H(awaySchedule?.games, away.abbrev, home.abbrev));

  const hot = renderHotPlayers(matchup, away.abbrev, home.abbrev);
  if (hot) previewContainer.appendChild(hot);

  const career = renderCareerVsOpponent(matchup, away, home);
  if (career) previewContainer.appendChild(career);

  const top = renderTopPlayers(matchup, away, home);
  if (top) previewContainer.appendChild(top);

  const goalieTables = renderGoalieTables(matchup, away, home);
  if (goalieTables) previewContainer.appendChild(goalieTables);

  if (eligible) {
    const [boxscore, playByPlay] = await Promise.all([
      loadGameBoxscore(gameId),
      loadGamePlayByPlay(gameId),
    ]);
    recapContainer.appendChild(
      renderRecap(landing, away, home, boxscore, playByPlay),
    );
  }

  if (eligible && recapContainer) {
    const tabs = renderViewTabs(recapContainer, previewContainer, "recap");
    root.appendChild(tabs);
  }
  const content = el("div", "game-content");
  content.appendChild(previewContainer);
  if (recapContainer) content.appendChild(recapContainer);
  root.appendChild(content);

  if (eligible && recapContainer) {
    // default handled in renderViewTabs
  } else {
    previewContainer.classList.remove("hidden");
  }

  // Tiers, GVI and MoneyPuck advanced columns fill in progressively.
  enrichPreview();
}

main();
